require('dotenv').config();
const amqp = require('amqplib');
const { BPMCheckResult, ReadingValue } = require('./database');
const { sendMessage } = require('./utils/messageService');
const WebSocket = require('ws');

// Create a WebSocket client to connect to the server
const ws = new WebSocket('ws://localhost:3000');

(async () => {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  await channel.assertQueue('bpm_tasks');

  console.log('🚀 Worker is ready to process tasks.');

  // Periodically check the database for new ReadingValues grouped by minute
  setInterval(async () => {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);

      // Fetch readings from the last minute
      const readings = await ReadingValue.findAll({
        where: {
          timestamp: {
            [require('sequelize').Op.between]: [oneMinuteAgo, now],
          },
        },
      });

      if (readings.length > 0) {
        const totalValue = readings.reduce((sum, reading) => sum + reading.value, 0);
        const averageValue = Math.round(totalValue / readings.length);

        // Perform BPM check
        const status = averageValue > 100 ? 'High' : averageValue < 60 ? 'Low' : 'Normal';

        // Insert result into BPMCheckResults table
        await BPMCheckResult.create({ value: averageValue, status, timestamp: now });
        console.log('✅ BPM check result stored:', { value: averageValue, status, timestamp: now });

        // Send Telegram message
        const message = `BPM Check Result:\nAverage Value: ${averageValue}\nStatus: ${status}`;
        await sendMessage(message, now);
        console.log('📤 Telegram message sent:', message);

        // Send WebSocket message
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'bpm_result', value: averageValue, status, timestamp: now }));
          console.log('📤 WebSocket message sent:', { value: averageValue, status, timestamp: now });
        } else {
          console.warn('⚠️ WebSocket connection is not open.');
        }

        // Optionally delete processed readings (if no longer needed)
        for (const reading of readings) {
          await reading.destroy();
        }
      } else {
        console.log('ℹ️ No readings found for the last minute.');
      }
    } catch (error) {
      console.error('❌ Error processing readings:', error.message);
    }
  }, 60000); // Run every minute

  // Existing task queue processing
  channel.consume('bpm_tasks', async (msg) => {
    if (msg !== null) {
      const { id, number } = JSON.parse(msg.content.toString());
      console.log('📥 Task received:', { id, number });

      try {
        // Skip inserting individual BPM results here
        console.log('ℹ️ Task processed, but BPM calculation is handled by periodic aggregation.');

        channel.ack(msg);
      } catch (error) {
        console.error('❌ Error processing task:', error.message);
        channel.nack(msg);
      }
    }
  });
})();
