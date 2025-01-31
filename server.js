const express = require('express');
const { Client } = require('ads-client'); 
const path = require('path');
const bodyParser = require('body-parser');
const http = require('http') 
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const config = require('./ads-config.json'); 

// Parse JSON bodies
app.use(bodyParser.json());

// ================== TwinCat ADS Client ==================
const adsClient = new Client({
    targetAmsNetId: 'localhost', 
    targetAdsPort: 851, 
});

// Shared state for subscribed values
const subscribedValues = {};

// connect to ads
adsClient
    .connect()
    .then(() => {
        console.log('Connected to ADS server'); 

        // For each entry in the config, subscribe to the PLC symbol
        config.subscriptions.forEach((sub) => {
            adsClient.subscribe({
                target: sub.symbol, 
                cycleTime: sub.cycleTime, 
                callback: (data, subscription) => {
                    subscribedValues[sub.symbol] = data.value;
                },
                sendOnChange: false // so it is sent every cycle
            })
        });

    })
    .then(() => {
        // Broadcast all values to all clients every 20ms
        setInterval(broadcastAllValues, 20);
    })
    .catch ((err) => {
        console.error('Error connecting to ADS server: ', err);
    });


function broadcastAllValues() {
    const packet = {
        type: 'PLC_DATA', 
        data: subscribedValues
    }
    const message = JSON.stringify(packet);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}




// ================== Websocket Events ===================
wss.on('connection', (ws) => {
    console.log('New client connected'); 

    // When the client sends a message 
    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data); 
            console.log('Message received: ', msg);
        } catch (err) {
            console.error('Error parsing message: ', err);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    })
})

// start the server on port 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

// Graceful shutdown 
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server shut down');
    });
    adsClient.disconnect();
})