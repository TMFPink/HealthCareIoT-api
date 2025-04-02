require('dotenv').config(); 

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors'); 
const { initializeDatabase, insertNumber, BPMCheckResult, User, ReadingValue } = require('./database');
// const amqp = require('amqplib'); 
const { Op } = require('sequelize');
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken');
const { sendMessage } = require('./utils/messageService'); 

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });



app.use(cors()); 
app.use(bodyParser.json());


initializeDatabase();

// // RabbitMQ connection setup
// let channel;
// (async () => {
//   const connection = await amqp.connect('amqp://localhost');
//   channel = await connection.createChannel();
//   await channel.assertQueue('bpm_tasks');
// })();


wss.on('connection', (socket, req) => {

});


app.post('/reading-data', async (req, res) => {
  const { number } = req.body;

  console.log('📨 POST received:', number);

  try {
    const id = await insertNumber(number); 
    console.log('📥 Stored in DB with ID:', id);

    
    const status = number > 100 ? 'High' : number < 60 ? 'Low' : 'Normal';
    
    
    const now = new Date();
    if (status !== 'Normal') {
      const message = `Immediate BPM Reading:\nValue: ${number}\nStatus: ${status}`;
      await sendMessage(message, now);
      console.log('📤 Immediate Telegram message sent:', message);
    }
    
    // Send WebSocket message for real-time updates
    try {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'immediate_bpm', 
            value: number, 
            status, 
            timestamp: now,
          }));
        }
      });
      console.log('📡 WebSocket message sent to all connected clients');
    } catch (wsError) {
      console.error('⚠️ Error sending WebSocket message:', wsError.message);
    }

    // Send response to the API caller
    res.json({ 
      status: 'success', 
      number, 
      dbId: id, 
      bpmStatus: status 
    });
    
  } catch (err) {
    console.error('❌ Error processing reading data:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to process reading data' });
  }
});

// Helper function to format date from YYYY-MM-DD to DD/MM/YYYY
function formatDateToDDMMYYYY(isoDateString) {
  const [year, month, day] = isoDateString.split('-');
  return `${day}/${month}/${year}`;
}

// Helper function to generate an array of hours for a day
function generateHourlyTimeSlots() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    value: null,
  }));
}

// Helper function to generate an array of days for a date range
function generateDailyTimeSlots(startDate, endDate) {
  const days = [];
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    days.push({
      day: formatDateToDDMMYYYY(currentDate.toISOString().split('T')[0]),
      average: null,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return days;
}

// Helper function to generate 6 time slots for a day
function generateSixTimeSlots() {
  const slots = [
    { start: 0, end: 3, label: '00:00-03:59', value: null },
    { start: 4, end: 7, label: '04:00-07:59', value: null },
    { start: 8, end: 11, label: '08:00-11:59', value: null },
    { start: 12, end: 15, label: '12:00-15:59', value: null },
    { start: 16, end: 19, label: '16:00-19:59', value: null },
    { start: 20, end: 23, label: '20:00-23:59', value: null },
  ];
  return slots;
}

// API to get BPM data for a specific day, grouped into 6 parts
app.get('/bpm-data/day', async (req, res) => {
  const { date } = req.query; // Expecting date in YYYY-MM-DD format

  if (!date) {
    return res.status(400).json({ status: 'error', message: 'Date is required' });
  }

  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bpmData = await ReadingValue.findAll({
      where: {
        timestamp: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      order: [['timestamp', 'ASC']],
    });

    // Group data into 6 time slots
    const timeSlots = generateSixTimeSlots();
    bpmData.forEach((reading) => {
      const hour = new Date(reading.timestamp).getHours();
      const slot = timeSlots.find((slot) => hour >= slot.start && hour <= slot.end);
      if (slot) {
        slot.value = slot.value ? (slot.value + reading.value) / 2 : reading.value; // Average value
      }
    });

    res.json({ status: 'success', data: timeSlots });
  } catch (error) {
    console.error('❌ Error fetching BPM data for the day:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
});

// API to get BPM data for the current week, grouped by day with average value
app.get('/bpm-data/week', async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() - 7); // Start of the week (Sunday)
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // End of the week (Saturday)
    endOfWeek.setHours(23, 59, 59, 999);

    const bpmData = await ReadingValue.findAll({
      where: {
        timestamp: {
          [Op.between]: [startOfWeek, endOfWeek],
        },
      },
      order: [['timestamp', 'ASC']],
    });

    const dailyData = generateDailyTimeSlots(startOfWeek, endOfWeek);
    bpmData.forEach((reading) => {
      const day = formatDateToDDMMYYYY(reading.timestamp.toISOString().split('T')[0]);
      const dayEntry = dailyData.find((entry) => entry.day === day);
      if (dayEntry) {
        dayEntry.average = (dayEntry.average || 0) + reading.value; // Assuming `value` is the BPM reading
      }
    });

    res.json({ status: 'success', data: dailyData });
  } catch (error) {
    console.error('❌ Error fetching BPM data for the current week:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
});

// API to get BPM data for the current month, grouped by day with average value
app.get('/bpm-data/month', async (req, res) => {
  const { month } = req.query; // Expecting month in YYYY-MM format (e.g., "2025-03")

  if (!month) {
    return res.status(400).json({ status: 'error', message: 'Month is required in YYYY-MM format' });
  }

  try {
    const [year, monthIndex] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, monthIndex - 1, 1, 0, 0, 0)); // First day of the specified month
    const endDate = new Date(Date.UTC(year, monthIndex, 0, 23, 59, 59)); // Last day of the specified month
    

    const bpmData = await ReadingValue.findAll({
      where: {
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
      order: [['timestamp', 'ASC']],
    });

    const dailyData = generateDailyTimeSlots(startDate, endDate);

    bpmData.forEach((reading) => {
      const readingDate = new Date(reading.timestamp);
      if (readingDate >= startDate && readingDate <= endDate) {
        const day = formatDateToDDMMYYYY(readingDate.toISOString().split('T')[0]);
        const dayEntry = dailyData.find((entry) => entry.day === day);
        if (dayEntry) {
          dayEntry.total = (dayEntry.total || 0) + reading.value; // Add the reading value to the total
          dayEntry.count = (dayEntry.count || 0) + 1; // Increment the count
        }
      }
    });

    // Calculate the average for each day
    dailyData.forEach((entry) => {
      if (entry.count > 0) {
        entry.average = entry.total / entry.count; // Compute the average
      }
      delete entry.total; // Remove the total property
      delete entry.count; // Remove the count property
    });

    res.json({ status: 'success', data: dailyData });
  } catch (error) {
    console.error('❌ Error fetching BPM data for the specified month:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
});

// API to get BPM data for the previous month
app.get('/bpm-data/last-month', async (req, res) => {
  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of the previous month
    const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); // End of the previous month

    const bpmData = await ReadingValue.findAll({
      where: {
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
      order: [['timestamp', 'ASC']],
    });

    const dailyData = generateDailyTimeSlots(startDate, endDate);
    bpmData.forEach((reading) => {
      const day = formatDateToDDMMYYYY(reading.timestamp.toISOString().split('T')[0]);
      const dayEntry = dailyData.find((entry) => entry.day === day);
      if (dayEntry) {
        dayEntry.average = (dayEntry.average || 0) + reading.value; // Assuming `value` is the BPM reading
      }
    });

    res.json({ status: 'success', data: dailyData });
  } catch (error) {
    console.error('❌ Error fetching BPM data for the previous month:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
}),

app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
    const user = await User.create({ email, password: hashedPassword });
    res.json({ status: 'success', message: 'User registered', userId: user.id });
  } catch (error) {
    console.error('❌ Error registering user:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to register user' });
  }
}),


app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ status: 'error', message: 'Invalid password' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ status: 'success', message: 'Login successful', token });
  } catch (error) {
    console.error('❌ Error logging in user:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to login' });
  }
}),


app.put('/update-telegram-id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; 
  const { telegramId } = req.body;

  console.log('📨 PUT received:', telegramId);
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    user.telegramId = telegramId;
    await user.save();
    res.json({ status: 'success', message: 'Telegram ID updated' });
  } catch (error) {
    console.error('❌ Error updating Telegram ID:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to update Telegram ID' });
  }
}),

app.get('/telegram-id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; // Extract token from Authorization header

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify and decode the token
    const userId = decoded.userId;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    res.json({ status: 'success', telegramId: user.telegramId });
  } catch (error) {
    console.error('❌ Error fetching Telegram ID:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch Telegram ID' });
  }
}),

app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body); // Process incoming updates
  res.sendStatus(200);
}),

server.listen(3000, () => {
  console.log(`🚀 Express + WebSocket server running on ${process.env.API_URL}`);
})
