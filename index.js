// index.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());

// Handle incoming WebSocket connections
wss.on('connection', (socket) => {
  console.log('🟢 FE WebSocket connected');

  socket.on('close', () => {
    console.log('🔴 FE WebSocket disconnected');
  });
});

// POST endpoint: receive number and broadcast to all FE clients
app.post('/send-number', (req, res) => {
  const { number } = req.body;
  const message = { type: 'number', data: number };

  console.log('📨 POST received:', message.data);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      console.log('📤 Broadcasting to client');
      client.send(JSON.stringify(message.data));
    }
  });

  res.json({ status: 'sent', number });
});

// Start both Express and WebSocket server on port 3000
server.listen(3000, () => {
  console.log('🚀 Express + WebSocket server running on http://localhost:3000');
});
