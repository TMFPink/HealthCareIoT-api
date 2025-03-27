require('dotenv').config(); // Load environment variables from .env file
const TelegramBot = require('node-telegram-bot-api');

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

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

// Matches "/echo [whatever]"
bot.onText(/\/echo (.+)/, (msg, match) => {
  
  const chatId = msg.chat.id;
  const resp = match[1];

  
  bot.sendMessage(chatId, resp);
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  // send a message to the chat acknowledging receipt of their message
  bot.sendMessage(chatId, 'Received your message');
});