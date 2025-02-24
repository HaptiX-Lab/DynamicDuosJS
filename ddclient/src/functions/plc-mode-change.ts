const PlcMasterState = {
    WAITING: 0, 
    CALIBRATION: 1, 
    ACTIVE: 2, 
    TRACKING: 3, 
    ERROR: -1
}

async function switchToWaiting() {
    return switchMasterState(PlcMasterState.WAITING); 
}

async function switchToCalibration() {
    return switchMasterState(PlcMasterState.CALIBRATION);
}

async function switchToMainExperiment() {
    return switchMasterState(PlcMasterState.ACTIVE); 
}

async function switchMasterState(state : Number) {
    try {
        const response = await fetch('http://localhost:3001/ads-write-value', {
            method: 'POST', 
            headers : {
                'Content-Type' : 'application/json'
            },
            body: JSON.stringify({
                channel: "MAIN_DOCILE.stMasterState",
                value: state
            })
        });

        if (!response.ok) {
            throw new Error("Failed to set calibration seetings. Status: " + response.status); 
        }
        return response;
    } catch(err) {
        console.error("Error sending calibration settings: ", err)
    }
}

export { switchToWaiting, switchToCalibration, switchToMainExperiment };