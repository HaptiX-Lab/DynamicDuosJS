async function writeAdsValue(channel: string, value: any) {
    try {
        const response = await fetch('http://localhost:3001/ads-write-value', {
            method: 'POST', 
            headers : {
                'Content-Type' : 'application/json'
            },
            body: JSON.stringify({ channel, value })
        });

        if (!response.ok) {
            throw new Error(`Failed to set ads value on channel ${channel}. Server response: ${response.status}`); 
        }
        return response;
    } catch(err) {
        console.error(err)
    }
}

async function readAdsValue(channel: string) {
    try {
        const response = await fetch('http://localhost:3001/ads-read-value', {
            method: 'POST', 
            headers : {
                'Content-Type': 'application/json'
            }, 
            body: JSON.stringify({ channel }) 
        });

        if (!response.ok) {
            throw new Error(`Failed to read ads value on channel ${channel}. Server response: ${response.status}`);
        }
        const responseData = await response.json(); 
        return responseData.value; 
    } catch(err) {
        console.error(err); 
    }
}

export { writeAdsValue, readAdsValue }