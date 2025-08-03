require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = require('node-fetch');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

puppeteer.use(StealthPlugin()); // ✅ Now works

// ==== Configuration ====
const USERNAME = process.env.VISA_USERNAME;
const PASSWORD = process.env.VISA_PASSWORD;
const REGION = process.env.REGION;
const APPOINTMENT_ID = process.env.APPOINTMENT_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const CHAT_ID_FILE = 'chat_ids.json';

let chatIDs = new Set();
try {
  const data = fs.readFileSync(CHAT_ID_FILE, 'utf-8');
  chatIDs = new Set(JSON.parse(data));
} catch {
  console.log('ℹ️ No chat_ids.json found. Starting fresh.');
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!chatIDs.has(chatId)) {
    chatIDs.add(chatId);
    fs.writeFileSync(CHAT_ID_FILE, JSON.stringify([...chatIDs], null, 2));
    console.log(`➕ New user subscribed: ${chatId}`);
  }
  bot.sendMessage(chatId, '✅ You are now subscribed for visa appointment updates.');
});

const sendTelegramMessage = async (message) => {
  const text = encodeURIComponent(message);
  for (const chatId of chatIDs) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${chatId}&text=${text}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.description);
      console.log(`✅ Sent to ${chatId}`);
    } catch (err) {
      console.error(`❌ Failed for ${chatId}:`, err.message);
    }
  }
};

// ==== Visa Appointment Checker ====
const checkAppointment = async () => {
  console.log("🔄 Checking for appointment...");

  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  try {
    await page.goto(`https://ais.usvisa-info.com/en-${REGION}/niv/users/sign_in`, { waitUntil: 'networkidle2' });

    await page.waitForSelector('#user_email', { visible: true, timeout: 10000 });
    await page.type('#user_email', USERNAME);
    await page.type('#user_password', PASSWORD);
    await page.click('label[for="policy_confirmed"]');
    await page.click('input[name="commit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    const paymentUrl = `https://ais.usvisa-info.com/en-${REGION}/niv/schedule/${APPOINTMENT_ID}/payment`;
    await page.goto(paymentUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('h3.h4', { visible: true });

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

  } catch (err) {
    console.error("⚠️ Error:", err.message);
  } finally {
    await browser.close();
  }
};

checkAppointment();
setInterval(checkAppointment, 3 * 60 * 1000);
