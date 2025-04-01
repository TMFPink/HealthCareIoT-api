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

// API to get BPM data for a specific day, grouped by hour
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

    // Group data by hour
    const hourlyData = generateHourlyTimeSlots();
    bpmData.forEach((reading) => {
      const hour = new Date(reading.timestamp).getHours();
      hourlyData[hour].value = reading.value; // Assuming `value` is the BPM reading
    });

    res.json({ status: 'success', data: hourlyData });
  } catch (error) {
    console.error('❌ Error fetching BPM data for the day:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
}),

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
}),

// API to get BPM data for the current month, grouped by day with average value
app.get('/bpm-data/month', async (req, res) => {
  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of the current month
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // End of the current month

    const bpmData = await ReadingValue.findAll({
      where: {
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
      order: [['timestamp', 'ASC']],
    });

    const dailyData = generateDailyTimeSlots(startDate, endDate);

    // Add a count property to track the number of readings for each day
    dailyData.forEach((entry) => {
      entry.total = 0; // Total sum of readings for the day
      entry.count = 0; // Count of readings for the day
    });

    bpmData.forEach((reading) => {
      const day = formatDateToDDMMYYYY(reading.timestamp.toISOString().split('T')[0]);
      const dayEntry = dailyData.find((entry) => entry.day === day);
      if (dayEntry) {
        dayEntry.total += reading.value; // Add the reading value to the total
        dayEntry.count += 1; // Increment the count
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
    console.error('❌ Error fetching BPM data for the current month:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
}),

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
