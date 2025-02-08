const express = require('express');
const cors = require('cors'); 
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
app.use(bodyParser.json(), cors({origin:'http://localhost:5174'})); // Support the frontend

// ================== TwinCat ADS Client ==================
const adsClient = new Client({
    targetAmsNetId: 'localhost', 
    targetAdsPort: 851, 
});

// Shared state for subscribed values
const subscribedValues = {};
let broadcastInterval;
let dataIsStale = false; 
let retryInterval = null; 

// connect to ads
function attemptAdsConnection () {
    adsClient
        .connect()
        .then(() => {
            console.log('Connected to ADS server'); 

            // Clear any retry_interval if connection succeeds
            if (retryInterval) {
                clearInterval(retryInterval); 
                retryInterval = null; 
            }

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
            broadcastInterval = setInterval(broadcastAllValues, 20);
        })
        .catch ((err) => {
            console.error('Error connecting to ADS server: ', err);

            // Notify WebSocket clients about the connection failure 
            broadcastAdsErrorToClients(err); 

            // Retry connection after 5 seconds if not already trying 
            if (!retryInterval) {
                retryInterval = setInterval(() => {
                    console.log('Retrying connection to ADS server...'); 
                    attemptAdsConnection(); 
                }, 5000);
            }
        });
}
attemptAdsConnection(); 

// If the ADS drops out, also broadcast this to websocket clients.
adsClient.on('connectionLost', async (message) => {
    await broadcastAdsErrorToClients(message);
    dataIsStale = true; 
    return 
})

// Then when the connection comes back, fix things. 
adsClient.on('reconnect', async () => {
    dataIsStale = false; 
    return 
});

function broadcastAdsErrorToClients(err) {
    const packet = {
        type: 'ADS_ERROR', 
        data: err
    }
    const message = JSON.stringify(packet); 
    console.log("Broadcasting ADS error to WebSocket clients"); 
    wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN) {
            client.send(message); 
        }
    });
}

function broadcastAllValues() {
    if (dataIsStale) return; 
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


// ================== Normal Requests ===================
app.post('/ads-write-value', async (req, res) => {
    const { channel, value } = req.body; 

    // Validate the channel input 
    if (!channel || value === undefined) {
        return res.status(400).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            message: 'Missing "channel" or "value" in request body'
        });
    }

    try {
        // Attempt to write the value to the ADS server 
        const result = await adsClient.writeValue(channel, value, autoFill=true); 
        console.log("Value written successfully to ADS: ", result); 

        // Respond with a success message
        return res.status(200).json({
            type: 'CONFIRMATION', 
            status: 'SUCCESS', 
            message: `Value written successfully to ${channel}`,
            value: value
        });
    } catch (err) {
        console.error("Failed to write value to ADS:", err); 
        try {
            const symbols = await adsClient.getSymbols(); 
            console.log("Available symbols:"); 
            for (const channel in symbols) {
                if (channel.startsWith('main_docile')) {
                    console.log(symbols[channel]);
                }
            }
        } catch (err) {
            console.warn("Attempted to fetch available symbols and failed.", err)
        }

        // Respond with an error message 
        return res.status(500).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            message: `Failed to write value to ${channel}`,
            error: err.message
        });
    }
})



// ================== Websocket Events ===================
wss.on('connection', (ws) => {
    console.log('New client connected'); 

    // When the client sends a message 
    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data); 
            console.log('Message received: ', msg);
            await parseReceivedMessageSocket(msg, ws); 
        } catch (err) {
            console.error('Error parsing message: ', err);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    })
})

async function parseReceivedMessageSocket(msg, ws) {
    // This is a message sent from our WebGUI probably intended for the ADS server. 
    if (msg.type === 'valueWrite') {

        // First we need to check if that value exists in the ADS. If it does, we can attempt to write the value
        try {
            const res = await adsClient.writeValue(msg.channel, msg.value, autoFill=true);
            console.log("Value written successfully to ADS: " , res); 

            ws.send(JSON.stringify({
                type: 'CONFIRMATION', 
                status: 'SUCCESS', 
                message: `Value written successfuly to ${msg.channel}`,
                value: msg.value
            }));

        } catch (err) {
            console.log("Failed to write value to ADS: ", err); 

            ws.send(JSON.stringify({
                type: 'CONFIRMATION', 
                status: 'FAILURE', 
                message: `Failed to write value to ${msg.channel}`,
                error: err.message
            }));

        }
        

    } else {
        console.warn("Message type not yet supported. Exiting parse"); 
        return; 
    }
}

// start the server on port 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});


function shutdown() {
    console.log('Shutting down server...');

    if (broadcastInterval) {
        clearInterval(broadcastInterval);
    }

    // Close all websocket connections
    wss.clients.forEach((client) => {
        client.close(); 
    })

    // Close the Websocket server, this will sever connections
    wss.close(() => {
        console.log('Websocket server closed');
    });

    // Stop accepting new HTTP connections. 
    server.close(() => {
        console.log('HTTP server closed');

        // Disconnect from the ADS server
        adsClient.disconnect();

        console.log('ADS client disconnected');

        // Exit the process
        process.exit(0);
    });

}

// Listen for SIGINT and SIGTERM 
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);