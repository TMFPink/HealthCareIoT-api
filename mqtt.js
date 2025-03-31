const express = require("express");
const http = require("http");
const mqtt = require("mqtt");
const socketIo = require("socket.io");
const { sendToApi } = require('./utils/apiService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// HiveMQ Cloud Credentials
const MQTT_BROKER = "mqtts://366bbae938ab4db1ad8fb2ba4ce9de6c.s1.eu.hivemq.cloud";
const MQTT_PORT = 8883;
const MQTT_USERNAME = "bached";
const MQTT_PASSWORD = "123456qwertyQ";
const MQTT_TOPIC = "esp32/pulse";

// Connect to MQTT Broker with authentication
const mqttClient = mqtt.connect(MQTT_BROKER, {
    port: MQTT_PORT,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    rejectUnauthorized: false, // Ignore SSL certificate issues
});

mqttClient.on("connect", () => {
    console.log("Connected to HiveMQ Cloud");
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (!err) {
            console.log(`Subscribed to topic: ${MQTT_TOPIC}`);
        }
    });
});

// When an MQTT message is received
mqttClient.on("message", (topic, message) => {
    console.log(`Received from MQTT: ${message.toString()}`);
    
    try {
        // Parse the message as JSON
        const data = JSON.parse(message.toString());
        
        
        // Send data to the API
        sendToApi(data)
            .then(apiResponse => {
                console.log('Successfully sent data to API:', apiResponse);
            })
            .catch(err => {
                console.error('API request failed:', err);
            });
        
        // Send to web client (keep existing functionality)
        io.emit("buttonPress", message.toString());
    } catch (error) {
        console.error('Error processing MQTT message:', error.message);
    }
});

// Start the server
server.listen(3001, () => {
    console.log("MQTT running on http://localhost:3001");
});