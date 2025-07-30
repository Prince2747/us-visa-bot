# 🇺🇸 US Visa Appointment Checker Bot

This Node.js script uses Puppeteer to log in to the US Visa scheduling website, check for the earliest available appointment, and send updates to users via Telegram.

## ✨ Features

- Automatically logs into https://ais.usvisa-info.com
- Scrapes the earliest appointment date and location
- Sends updates via Telegram using a bot
- Runs every 3 minutes
- Supports multiple users (can store and message all chat IDs)

---

## ⚙️ Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/us-visa-bot.git
cd us-visa-bot
npm install
Create a .env file in the root of the project with the following content:
USERNAME=your-visa-email@example.com
PASSWORD=your-visa-password
REGION=et
APPOINTMENT_ID=your-appointment-id
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
To start checking appointments and sending updates:
node US-visa.js
📡 Telegram Bot
To receive notifications:

Start a conversation with your Telegram bot

Send it any message

It will record your chat ID and send future updates to all users
us-visa-bot/
├── US-visa.js           # Main script logic
├── .env                 # Secrets (ignored by Git)
├── chat_ids.json        # Local Telegram user tracking
├── .gitignore           # Prevents sensitive files from being committed
├── package.json         # Node dependencies
└── README.md            # You're reading it
