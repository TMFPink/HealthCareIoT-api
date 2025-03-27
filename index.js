require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const { initializeDatabase, insertNumber, BPMCheckResult } = require('./database'); // Import BPMCheckResult model
const amqp = require('amqplib'); // Import amqplib
const { Op } = require('sequelize'); // Import Sequelize operators

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());

// Initialize the database
initializeDatabase();

// RabbitMQ connection setup
let channel;
(async () => {
  const connection = await amqp.connect('amqp://localhost');
  channel = await connection.createChannel();
  await channel.assertQueue('bpm_tasks');
})();

// Handle incoming WebSocket connections
wss.on('connection', (socket) => {
  console.log('🟢 FE WebSocket connected');

  socket.on('close', () => {
    console.log('🔴 FE WebSocket disconnected');
  });
});

// POST endpoint: receive number and send task to worker
app.post('/reading-data', async (req, res) => {
  const { number } = req.body;

  console.log('📨 POST received:', number);

  try {
    const id = await insertNumber(number); // Store number in the database
    console.log('📥 Stored in DB with ID:', id);

    // Send task to worker
    channel.sendToQueue('bpm_tasks', Buffer.from(JSON.stringify({ id, number })));
    console.log('📤 Task sent to worker:', { id, number });

    res.json({ status: 'task_sent', number, dbId: id });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to store data in DB' });
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

// Start both Express and WebSocket server on port 3000
server.listen(3000, () => {
  console.log('🚀 Express + WebSocket server running on http://localhost:3000');
});
