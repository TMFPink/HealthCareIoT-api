require('dotenv').config(); 

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors'); 
const { initializeDatabase, insertNumber, BPMCheckResult, User } = require('./database');
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
      // await sendMessage(message, now);
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

// API to get BPM data by days
app.get('/bpm-data/days', async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const bpmData = await BPMCheckResult.findAll({
      where: {
        timestamp: {
          [Op.between]: [new Date(startDate), new Date(endDate)],
        },
      },
      order: [['timestamp', 'ASC']],
    });

    res.json({ status: 'success', data: bpmData });
  } catch (error) {
    console.error('❌ Error fetching BPM data by days:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
});

// API to get BPM data by month
app.get('/bpm-data/month', async (req, res) => {
  const { year, month } = req.query;

  try {
    if (!year || !month) {
      return res.status(400).json({ error: 'year and month are required' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of the month

    const bpmData = await BPMCheckResult.findAll({
      where: {
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
      order: [['timestamp', 'ASC']],
    });

    res.json({ status: 'success', data: bpmData });
  } catch (error) {
    console.error('❌ Error fetching BPM data by month:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch BPM data' });
  }
});


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
});


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
});


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
});

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
});


server.listen(3000, () => {
  console.log(`🚀 Express + WebSocket server running on ${process.env.API_URL}`);
});
