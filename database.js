const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('HCIoT_db', 'postgres', 'postgres', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false,
});

const ReadingValue = sequelize.define('ReadingValue', {
  value: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
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
    await sequelize.sync();
    console.log('✅ Table "numbers" is ready.');
    await BPMCheckResult.sync();
    console.log('✅ Table "BPMCheckResults" is ready.');
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
  }
}

async function insertNumber(value) {
  try {
    const number = await ReadingValue.create({ value });
    console.log('✅ Number inserted with ID:', number.id);
    return number.id;
  } catch (error) {
    console.error('❌ Error inserting number:', error.message);
    throw error;
  }
}

module.exports = { initializeDatabase, insertNumber, BPMCheckResult,ReadingValue ,User};
