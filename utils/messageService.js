require('dotenv').config(); // Load environment variables from .env file
const TelegramBot = require('node-telegram-bot-api');
const { User } = require('../database'); // Import the User model

// Replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses webhook instead of polling
const bot = new TelegramBot(token, { polling: false }); // Disable polling



/**
 * Send a message to a user with a specific telegramId from the database.
 * @param {String} message - The message to send.
 * @param {Date} timestamp - The timestamp to include in the message.
 */
const sendMessage = async (message, timestamp) => {
  try {
    // Fetch all users with a telegramId from the database
    const users = await User.findAll({
      where: {
        telegramId: {
          [require('sequelize').Op.ne]: null, // Ensure telegramId is not null
        },
      },
    });

    if (users.length === 0) {
      console.warn('⚠️ No users with telegramId found in the database.');
      return;
    }

    // Send the message to each user
    for (const user of users) {
      const chatId = user.telegramId;
      const formattedMessage = `${message}\n🕒 Time: ${timestamp}`;
      await bot.sendMessage(chatId, formattedMessage);
      console.log(`✅ Message sent to user with telegramId ${chatId}:`, formattedMessage);
    }
  } catch (error) {
    console.error('❌ Failed to send message:', error.message);
  }
};

module.exports = { sendMessage };