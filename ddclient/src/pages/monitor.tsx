import { useContext, useEffect, useRef, useState, useCallback } from "react"
import { WebSocketContext } from "@/components/WebSocketContext"
import { Button } from "@heroui/button";


interface GaugeProps {
    title: string;
    channel : string; 
    type?: string;
    units? : string; 
    min? : number; 
    max? : number; 
}

const LinearGauge = (props : GaugeProps) => {
    const id = props.channel + '-monitor';
    const { messages, connected } = useContext(WebSocketContext); 
    const canvasRef = useRef<HTMLCanvasElement>(null); 
    const [currentVal, setCurrentVal] = useState<number>(); 

    useEffect(() => {
        if (!canvasRef.current) return; 

        const canvas = canvasRef.current; 
        const ctx = canvas.getContext('2d'); 
        const gaugeWidth = canvas.width; 
        const gaugeHeight = canvas.height; 
        if (!ctx) return; 

        // Clear the canvas for each new render 
        ctx.clearRect(0, 0, canvas.width, canvas.height); 

        if (!connected) {
            ctx.strokeStyle = "red"; 
            ctx.lineWidth = 5;
            ctx.beginPath(); 
            ctx.moveTo(0, 0); 
            ctx.lineTo(gaugeWidth, gaugeHeight); 
            ctx.stroke(); 
            return; 
        }

        // Consume the message
        const foundValidMessage = messages.slice().reverse().find(obj => obj.hasOwnProperty(props.channel));
        const messageData = foundValidMessage ? foundValidMessage[props.channel] : 0;
        const messageDataValue = Number(messageData); // Have to cast to avoid typescript error. All values passed to linear gauge should be numbers to begin with. 

        setCurrentVal(messageDataValue); 

        // Then draw it to the canvas. 
        const filledHeight = (messageDataValue / 100) * gaugeHeight; 

        // Background color of the gauge; 
        ctx.fillStyle = '#ccc'; 
        ctx.fillRect(0, 0, gaugeWidth, gaugeHeight); 

        // Filled part of the gauge 
        ctx.fillStyle = '#4caf50'; 
        ctx.fillRect(0, gaugeHeight, gaugeWidth, -filledHeight);

    }, [messages, connected]);


    return (
        <div className="flex flex-col items-left">
            <canvas id={id} ref={canvasRef} className="h-72 border-solid border-black border-2 w-20"></canvas>
            <h2>{props.title}</h2>
            <h2 className="roboto-bold">{currentVal ? Number(currentVal).toFixed(2) : 'N/A'}</h2>
        </div>
    )
}

const WheelGauge = (props : GaugeProps) => {
    const id = props.channel + '-monitor';
    const { messages, connected } = useContext(WebSocketContext); 
    const canvasRef = useRef<HTMLCanvasElement>(null); 
    const [currentVal, setCurrentVal] = useState<number>(); 

    useEffect(() => {
        if (!canvasRef.current) return; 

        const canvas = canvasRef.current; 
        const ctx = canvas.getContext('2d'); 
        const gaugeWidth = canvas.width; 
        const gaugeHeight = canvas.height;  
        const wheelRadius = gaugeHeight * 0.4; 
        if (!ctx) return; 

        // Clear the canvas for each new render 
        ctx.clearRect(0, 0, canvas.width, canvas.height); 

        if (!connected) {
            ctx.strokeStyle = "red"; 
            ctx.lineWidth = 5;
            ctx.beginPath(); 
            ctx.moveTo(0, 0); 
            ctx.lineTo(gaugeWidth, gaugeHeight); 
            ctx.stroke(); 
            return; 
        }

        // Consume the message
        const foundValidMessage = messages.slice().reverse().find(obj => obj.hasOwnProperty(props.channel));
        const messageData = foundValidMessage ? foundValidMessage[props.channel] : 0;
        const messageDataValue = Number(messageData); // Have to cast to avoid typescript error. All values passed to linear gauge should be numbers to begin with. 
        const angleRadians = messageDataValue * Math.PI / 180;

        setCurrentVal(messageDataValue); 

        // Then draw it to the canvas. 
        const filledHeight = (messageDataValue / 100) * gaugeHeight; 

       // Draw the wheel of the cricle
       ctx.beginPath(); 
       ctx.moveTo(gaugeWidth/2 + wheelRadius, gaugeHeight/2);
       ctx.strokeStyle = "black"; 
       ctx.lineWidth = 6; 
       ctx.arc(gaugeWidth/2, gaugeHeight/2, wheelRadius, 0, 2 * Math.PI);
       ctx.stroke();

       // Now draw the indicator 
       ctx.beginPath();
       ctx.moveTo(gaugeWidth/2, gaugeHeight/2);
       ctx.strokeStyle = "red"; 
       ctx.lineWidth = 8; 
       ctx.lineTo(gaugeWidth/2 + wheelRadius * 1.2 * Math.sin(angleRadians), gaugeHeight/2 - wheelRadius * 1.2 * Math.cos(angleRadians));
       ctx.stroke(); 


    }, [messages, connected]);


    return (
        <div className="flex flex-col items-left">
            <canvas id={id} ref={canvasRef} className="h-72 w-full" height={600} width={1200}></canvas>
            <h2>{props.title}</h2>
            <h2 className="roboto-bold">{currentVal ? Number(currentVal).toFixed(2) : 'N/A'}</h2>
        </div>
    )
}

const MonitorPage = () => {
    // Simple function to "tare" the wheel on the Beckhoff side
    const resetWheel = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:3001/ads-write-value', {
                method: 'POST',
                headers : {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    channel: "MAIN_DOCILE.bEncoderReset", 
                    value: true, 
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to reset the wheel. Status: " + response.status); 
            }
        } catch (err) {
            console.error("Error resetting wheel: ", err); 
        }

    }, []);


    return (
        <div>
            <div className="container mx-auto flex items-center justify-center h-auto mt-60 overflow-hidden p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    <div className="border-solid border-black border-2 p-4">
                        <h1 className="roboto-regular text-2xl">Signals</h1>
                        <div className="grid grid-cols-3 gap-2">
                            <LinearGauge channel="GVL.LOAD_CELL_NEWTONS" title="Load Cell (N)"/>
                            <LinearGauge channel="GVL.MOTOR_1_APPLIED_VOLTAGE" title={"Applied Voltage (V)"}/> 
                            <LinearGauge channel="GVL.MOTOR_1_APPLIED_TORQUE" title="Torque (N-m)"/> 
                        </div> 
                    </div>
                    <div className="border-solid border-black border-2 p-4">
                        <div className="flex flex-row justify-between">
                            <h1 className="roboto-regular text-2xl">Wheel</h1>
                            <Button className="roboto-regular" color="primary" variant="bordered" onPress={resetWheel}>Tare</Button>
                        </div>
                        <WheelGauge channel="GVL.ENCODER_1_DEGREES" title="Wheel Position (deg)"/>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MonitorPage; 