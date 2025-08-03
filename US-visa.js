require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const TelegramBot = require('node-telegram-bot-api');

// ==== Configuration ====
const requiredEnv = ['VISA_USERNAME', 'VISA_PASSWORD', 'REGION', 'APPOINTMENT_ID', 'TELEGRAM_BOT_TOKEN'];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`❌ Missing environment variable: ${env}`);
    process.exit(1);
  }
}

const USERNAME = process.env.VISA_USERNAME;
const PASSWORD = process.env.VISA_PASSWORD;
const REGION = process.env.REGION;
const APPOINTMENT_ID = process.env.APPOINTMENT_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID_FILE = 'chat_ids.json';

let chatIDs = new Set();
(async () => {
  try {
    const data = await fs.readFile(CHAT_ID_FILE, 'utf-8');
    chatIDs = new Set(JSON.parse(data));
  } catch {
    console.log('ℹ️ No chat_ids.json found. Starting fresh.');
  }
})();

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!chatIDs.has(chatId)) {
    chatIDs.add(chatId);
    try {
      await fs.writeFile(CHAT_ID_FILE, JSON.stringify([...chatIDs], null, 2));
      console.log(`➕ New user subscribed: ${chatId}`);
    } catch (err) {
      console.error(`❌ Failed to save chat IDs: ${err.message}`);
    }
    bot.sendMessage(chatId, '✅ You are now subscribed for visa appointment updates.');
  }
});

const sendTelegramMessage = async (message) => {
  const text = encodeURIComponent(message);
  for (const chatId of chatIDs) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${chatId}&text=${text}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.description);
      console.log(`✅ Sent to ${chatId}`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay to avoid rate limits
    } catch (err) {
      console.error(`❌ Failed for ${chatId}: ${err.message}`);
    }
  }
};

// ==== Visa Appointment Checker ====
const checkAppointment = async (retries = 3, delay = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`🔄 Attempt ${attempt} of ${retries}...`);
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true, // Use headless for production
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
      });
      const page = await browser.newPage();

      await page.goto(`https://ais.usvisa-info.com/en-${REGION}/niv/users/sign_in`, { waitUntil: 'networkidle2' });

      await page.waitForSelector('#user_email', { visible: true, timeout: 10000 });
      await page.type('#user_email', USERNAME);
      await page.type('#user_password', PASSWORD);
      await page.click('label[for="policy_confirmed"]');
      await page.click('input[name="commit"]');

      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      const paymentUrl = `https://ais.usvisa-info.com/en-${REGION}/niv/schedule/${APPOINTMENT_ID}/payment`;
      await page.goto(paymentUrl, { waitUntil: 'domcontentloaded' });

      await page.waitForSelector('h3.h4', { visible: true, timeout: 10000 });

      const appointmentInfo = await page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll('h3.h4')).find(h => h.innerText.includes('First Available Appointments'));
        if (!heading) return null;

        const table = heading.nextElementSibling;
        if (!table || !table.querySelectorAll) return null;

        const cells = table.querySelectorAll('td');
        if (cells.length < 2) return null;

        const city = cells[0].innerText.trim();
        const date = cells[1].innerText.trim();
        return `📅 First Available Appointment:\n${city} - ${date}`;
      });

      if (appointmentInfo) {
        console.log("📅 Appointment Found:\n" + appointmentInfo);
        await sendTelegramMessage("📢 Visa Update:\n" + appointmentInfo);
      } else {
        console.log("❌ No appointment info found.");
      }
      await browser.close();
      return;
    } catch (err) {
      console.error(`⚠️ Attempt ${attempt} failed: ${err.message}`);
      if (attempt === retries) {
        await sendTelegramMessage(`❌ Failed after ${retries} attempts: ${err.message}`);
      }
      if (browser) await browser.close();
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

checkAppointment();
setInterval(checkAppointment, 10 * 60 * 1000); // 10 minutes for safer polling