require('dotenv').config(); // Load environment variables from .env file
const TelegramBot = require('node-telegram-bot-api');

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses webhook instead of polling
const bot = new TelegramBot(token, { polling: false }); // Disable polling

// Set up webhook
const WEBHOOK_URL = `${process.env.API_URL}/bot${token}`;
bot.setWebHook(WEBHOOK_URL);

// Add the sendMessage function to send messages to a specific chat
const sendMessage = async (message, timestamp) => {
  try {
    const chatId = process.env.TELEGRAM_CHAT_ID; // Ensure this is set in your .env file
    if (!chatId) {
      throw new Error('TELEGRAM_CHAT_ID is not defined in the environment variables');
    }
    const formattedMessage = `${message}\n🕒 Time: ${timestamp}`;
    await bot.sendMessage(chatId, formattedMessage);
    console.log('✅ Message sent:', formattedMessage);
  } catch (error) {
    console.error('❌ Failed to send message:', error.message);
  }
};

module.exports = { sendMessage };