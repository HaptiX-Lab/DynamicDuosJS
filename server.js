const express = require('express');
const cors = require('cors'); 
const fs = require('fs'); 
const fastCsv = require('fast-csv');
const { Client } = require('ads-client'); 
const path = require('path');
const bodyParser = require('body-parser');
const http = require('http') 
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const config = require('./ads-config.json'); 
const { errorMonitor } = require('events');

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

app.post('/ads-read-value', async (req, res) => {
    const { channel } = req.body; 

    // Validate the channel input
    if (!channel) {
        return res.status(400).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            message: 'Missing "channel" in request body'
        });
    }

    try {
        // Attempt to read the value from the ADS server
        const result = await adsClient.readValue(channel);

        // Respond with the data
        return res.status(200).json({
            type: 'CONFIRMATION', 
            status: 'SUCCESS', 
            message: `Value successfully read from ${channel}`, 
            value: result
        });
    } catch (err) {
        console.error("Failed to read value to ADS:", err); 
    }

    return res.status(500).json({
        type: 'CONFIRMATION', 
        status: 'FAILURE', 
        message: `Failed to read value from ${channel}`, 
        error: err.message
    })
})

function generateFilenameTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
  
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    return timestamp;
}

app.post('/save-main-log', async (req, res) => {
    console.log("Received request to save main experiment log..."); 
    const { userID } = req.body; 

    if (!userID) {
        return res.status(400).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            message: 'Missing "userID" in request body'
        })
    }

    const user = await getParticipant(userID); 

    if (!user) {
        return res.status(404).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            message: `User with ID ${userID} not found in database.`
        })
    } else {
        console.log(`Found user ${user.name} with ID ${userID}`)
    }

    let {outputFile, outputDir} = createLogFilepath(user, isCalibrationTrial=false);

    // Then create the filestream 
    const writeStream = fs.createWriteStream(outputFile);
    const csvStream = fastCsv.format({headers: true}); 
    csvStream.pipe(writeStream);

    let totalTime = Date.now(); 
    try {

        const response = await adsClient.invokeRpcMethod('MAIN_DOCILE.fbMainExperimentBlock.fbLogger', 'getLogSize');

        const numLogChunks = response?.outputs?.nNumLogChunks; 
        const chunkSize = response?.outputs?.nCurrentChunkSize; 
        let bytesRead = 0; 
        let bytesRead_20 = 0; // last 20 chunk bytes read
        let bandwidth = 0; 

        console.log("Current chunk size is ", chunkSize); 
        console.log("Attempting to read ", numLogChunks, " chunks."); 
        let chunkTime = Date.now();  
        let dt; 
        for (let i = 0; i < numLogChunks; i++) {
            console.log("Fetching chunk num [", i, "]")
            const chunk = await adsClient.invokeRpcMethod('MAIN_DOCILE.fbMainExperimentBlock.fbLogger', 'getLogChunk', {
                nChunkIndex: i
            });
            bytesRead += chunk.returnValue.nChunkSizeBytes; 
            bytesRead_20 += chunk.returnValue.nChunkSizeBytes; 
            if (i % 20 == 0) {
                dt = (Date.now() - chunkTime); 
                bandwidth = bytesRead_20 / dt; 
                chunkTime = Date.now(); 
                bytesRead_20 = 0; 
            }
            if (i == numLogChunks - 1) {
                console.log("Last chunk: ", chunk); 
                console.log("One element from the chunk: ", chunk.returnValue.aChunk[0])
            }
            chunk.returnValue.aChunk.forEach(row=> {
                csvStream.write(row); 
            });
        }
        csvStream.end()
        console.log('Wrote log to: ', outputFile); 
        
        totalTime = Date.now() - totalTime; 
        console.log(`Finished. took: ${totalTime}ms`);
        console.log("Total data transferred : ", bytesRead/1e6, " MB. Avg bandwidth: ", (bytesRead/totalTime)*1000/1e6, " MB/sec")
        
        // If we got to the end of the save, let's also clear the log on the PLC: 
        const clear = await adsClient.invokeRpcMethod('MAIN_DOCILE.fbMainExperimentBlock', 'resetLogAndTest');
        if (clear) console.log("Log cleared from PLC successfully") 
        
        res.status(200).json({
            type: 'CONFIRMATION', 
            status: 'SUCCESSS', 
            message: 'Log has been saved to CSV!' 
        })
    } catch (err) {
        console.error("Failed to initiate log save. Err: ", err); 
        res.status(500).json({
            type: 'ERROR', 
            status: 'FAILURE',
            message: 'Failed to save calibration log.' + String(err)
        })
    }
})

app.post('/save-calibration-log', async (req, res) => {
    console.log("Received request to save calibration log..."); 
    const { userID } = req.body; 

    if (!userID) {
        return res.status(400).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            message: 'Missing "userID" in request body'
        })
    }

    const user = await getParticipant(userID); 

    if (!user) {
        return res.status(404).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            message: `User with ID ${userID} not found in database.`
        })
    } else {
        console.log(`Found user ${user.name} with ID ${userID}`)
    }

    let {outputFile, outputDir} = createLogFilepath(user, isCalibrationTrial=true);

    // Then create the filestream 
    const writeStream = fs.createWriteStream(outputFile);
    const csvStream = fastCsv.format({headers: true}); 
    csvStream.pipe(writeStream);

    let totalTime = Date.now(); 
    try {

        const response = await adsClient.invokeRpcMethod('MAIN_DOCILE.fbCalibrationBlock.fbLogger', 'getLogSize');

        const numLogChunks = response?.outputs?.nNumLogChunks; 
        const chunkSize = response?.outputs?.nCurrentChunkSize; 
        let bytesRead = 0; 
        let bytesRead_20 = 0; // last 20 chunk bytes read
        let bandwidth = 0; 

        console.log("Current chunk size is ", chunkSize); 
        console.log("Attempting to read ", numLogChunks, " chunks."); 
        let chunkTime = Date.now();  
        let dt; 
        for (let i = 0; i < numLogChunks; i++) {
            console.log("Fetching chunk num [", i, "]")
            const chunk = await adsClient.invokeRpcMethod('MAIN_DOCILE.fbCalibrationBlock.fbLogger', 'getLogChunk', {
                nChunkIndex: i
            });
            bytesRead += chunk.returnValue.nChunkSizeBytes; 
            bytesRead_20 += chunk.returnValue.nChunkSizeBytes; 
            if (i % 20 == 0) {
                dt = (Date.now() - chunkTime); 
                bandwidth = bytesRead_20 / dt; 
                chunkTime = Date.now(); 
                bytesRead_20 = 0; 
            }
            if (i == numLogChunks - 1) {
                console.log("Last chunk: ", chunk); 
                console.log("One element from the chunk: ", chunk.returnValue.aChunk[0])
            }
            chunk.returnValue.aChunk.forEach(row=> {
                csvStream.write(row); 
            });
        }
        csvStream.end()
        console.log('Wrote log to: ', outputFile); 
        
        totalTime = Date.now() - totalTime; 
        console.log(`Finished. took: ${totalTime}ms`);
        console.log("Total data transferred : ", bytesRead/1e6, " MB. Avg bandwidth: ", (bytesRead/totalTime)*1000/1e6, " MB/sec")
        
        // If we got to the end of the save, let's also clear the log on the PLC: 
        const clear = await adsClient.invokeRpcMethod('MAIN_DOCILE.fbCalibrationBlock', 'resetLogAndTest');
        if (clear) console.log("Log cleared from PLC successfully") 
        
        res.status(200).json({
            type: 'CONFIRMATION', 
            status: 'SUCCESSS', 
            message: 'Log has been saved to CSV!' 
        })
    } catch (err) {
        console.error("Failed to initiate log save. Err: ", err); 
        res.status(500).json({
            type: 'ERROR', 
            status: 'FAILURE',
            message: 'Failed to save calibration log.' + String(err)
        })
    }
})


async function getParticipant(userID) {
    const filePath = path.join(__dirname, 'data', 'participants.json');
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');

    // Parse the JSON data
    const data = JSON.parse(fileContent); 
    const found = data.registered_users.find((element) => element.id == Number(userID)); 
    return found; 
}

function createLogFilepath(user, isCalibrationTrial) {
    let log_id = `${user.name.split(' ').join('_')}-${isCalibrationTrial? 'calibration' : 'main'}-${generateFilenameTimestamp()}`
    const outputDir = path.join(__dirname, 'data', user.name.split(' ').join('_'), (isCalibrationTrial? 'calibration' : 'main'))
    const outputFile =  path.join(outputDir, (log_id+'.csv'))

    if (!fs.existsSync(outputDir)) {
        console.log("Creating output directory: ", outputDir)
        fs.mkdirSync(outputDir, { recursive: true })
    }
    return { outputFile, outputDir }
}

app.post('/create-user', async (req, res) => {
    try {
        const { name, gender, notes } = req.body; 

        // Validate that a name was provided 
        if (!name || !gender) { 
            return res.status(400).json({
                type: 'CONFIRMATION', 
                status: 'FAILURE', 
                message: `You are one or many fields (name, gender) in your request.`
            })
        }

        // Build the filepath to the participants.json file
        const filePath = path.join(__dirname, 'data', 'participants.json'); 

        // Read the file contents 
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');

        // Parse the JSON data
        const data = JSON.parse(fileContent); 

        // Ensure the registered_users key exists and is an array 
        if (!Array.isArray(data.registered_users)) {
            data.registered_users = [];
        }

        // Create the new user object 
        const newUser = {
            id: Date.now(), 
            name, 
            gender,
            notes,
            createdAt: new Date().toISOString()
        };

        // Append the new user to the registered_users array // 
        data.registered_users.push(newUser); 

        // Write the updated data back to the file with pretty-print formatting 
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2)); 

        // Respond with the newly created user
        res.status(201).json(newUser); 
    } catch (error) {
        console.error('Error creating user: ', error); 
        res.status(500).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            error:error
        });
    }
})

app.get('/list-users', async (req, res) => {
    try {
        // We wouldn't expect a body for this request. 

        // Build the filepath to the participants.json file
        const filePath = path.join(__dirname, 'data', 'participants.json'); 

        // Read the file contents 
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');

        // Parse the JSON data
        const data = JSON.parse(fileContent); 

        // Ensure the registered_users key exists and is an array 
        if (!Array.isArray(data.registered_users)) {
            throw new Error("There are no registered users!")
        }

        res.status(201).json(data.registered_users);

    } catch (error) {
        console.error("Error fetching list users: ", error); 
        res.status(500).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            error:error
        });
    }
});

app.get('/get-user', async (req, res) => {
    try {
        // There will be a body for this request and it will be the userid that we want.
        const { id } = req.body; 

        // validate the id 
        if (!id) {
            return res.status(400).json({
                type: 'CONFIRMATION', 
                status: 'FAILURE', 
                error: 'You must submit an ID with your request.' 
            })
        }

        // Then we get the data from the file and send it back 
        const filePath = path.join(__dirname, 'data', 'participants.json'); 

        // Read the file contents 
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');

        // Parse the JSON data
        const data = JSON.parse(fileContent); 

        // Search the array for the data with the corresponding key
        const found = data.registered_users.find((element) => element.id===id)

        if (!found) {
            return res.status(404).json({
                type: 'CONFIRMATION', 
                status: 'NOT FOUND', 
                error: `Could not find the user with id ${id} in the database.`
            });
        } else {
            return res.status(200).json(found); 
        }
    } catch (error) {
        console.error("Error fetching user: ", error); 
        res.status(500).json({
            type: 'CONFIRMATION', 
            status: 'FAILURE', 
            error: 'An unexpected server error occurred.'
        })
    }
});



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