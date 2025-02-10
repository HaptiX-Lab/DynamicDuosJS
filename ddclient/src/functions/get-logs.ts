
async function getCurrentCalibrationLog() {
    // First thing we need to do is to read the number of steps on the PLC
    try {
        const response = await fetch('http://localhost:3001/ads-read-value', {
            method: 'POST',
            headers : {
                'Content-Type' : 'application/json'
            },
            body: JSON.stringify({
                channel: "MAIN_DOCILE.fbCalibrationBlock.fbLogger.nStepsSoFar", 
            })
        });

        if (!response.ok) {
            throw new Error("Failed to launch test. Status: " + response.status); 
        }
    } catch(err) {
        console.error("Error launching test: ", err); 
    }
}