const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config(); 
// Update the connection URL to the provided database
const sequelize = new Sequelize(`${process.env.DB_CONNECTION_STRING}`, {
  dialect: 'postgres',
  logging: false,
});

const ReadingValue = sequelize.define('ReadingValue', {
  value: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isInt: true, // Ensure the value is an integer
      min: 0, // Optional: Ensure the value is non-negative
    },
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW, // Ensure this matches the database schema
  },
});

const BPMCheckResult = sequelize.define('BPMCheckResult', {
  value: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
  },
});

const User = sequelize.define('User', {
  telegramId: {
    type: DataTypes.STRING,
    allowNull: true, // Allow telegramId to be nullable
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true, // Ensure email is unique
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to PostgreSQL database.');
    await sequelize.sync({ alter: true }); // Sync models with the database
    console.log('✅ Tables are ready.');
    require('./mqtt.js');
    // Adjust the sequence for the ReadingValues table
    const maxIdResult = await sequelize.query('SELECT MAX(id) AS maxId FROM "ReadingValues";');
    
    const maxId = maxIdResult[0][0].maxid || 0; // Use the correct key 'maxid'
    
    const nextId = maxId + 1;
    await sequelize.query(`ALTER SEQUENCE "ReadingValues_id_seq" RESTART WITH ${nextId};`);
    
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
  }
}

async function insertNumber(value) {
  try {
    console.log('🔍 Inserting value:', value); // Log the input value
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new Error('Value must be an integer.');
    }
    const number = await ReadingValue.create({ value });
    console.log('✅ Number inserted with ID:', number.id);
    return number.id;
  } catch (error) {
    console.error('❌ Error inserting number:', error.message);
    throw error;
  }
}

module.exports = { initializeDatabase, insertNumber, BPMCheckResult, ReadingValue, User };
