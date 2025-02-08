import {RadioGroup, Radio} from "@heroui/radio";
import { Divider } from "@heroui/divider"; 
import { Input } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";
import { Slider } from "@heroui/slider"; 
import { useState } from "react";
import { Button } from "@heroui/button";  
import { WebSocketContext } from "@/components/WebSocketContext"; 
import { useContext, useCallback, useEffect } from "react"; 
import { switchToCalibration, switchToWaiting } from "@/functions/plc-mode-change";
import { Select, SelectItem } from "@heroui/select"; 
import type { SharedSelection } from "@heroui/system";
import { useNavigate } from "react-router-dom"; 

// TODO: 
// move necessary child props into the parent 
// Make sure that data is saved automatically based on selected participant

const UserSelection = () => {
    let navigate = useNavigate(); 
    const [participant, setParticipant] = useState<SharedSelection>(); 

    useEffect(() => {
        if (participant?.currentKey === 'createNew') {
            navigate('/participant-setup')
        }
    }, [participant]);
    
    return (
        <div className="container mx-auto pt-12">
            <h1 className="text-2xl">Select a registered participant. </h1> 
            <Divider className="my-4" />
            <div className="grid grid-cols-2 lg:gap-2 gap-6">
                <Select
                    className="max-w-md"
                    label="Participant"
                    placeholder="Select a participant"
                    selectedKeys={participant}
                    onSelectionChange={setParticipant} 

                >
                    <SelectItem key={"createNew"} className="text-primary-600">Create a new participant</SelectItem>
                </Select>
            </div>
        </div>
    )
}

interface ST_CalibrationSettings { // this is the actual struct as defined on the PLC
    bTestTypeHuman: boolean;
    nNumTrials : number; 
    bTogglePulseWithGrip : boolean;
    bUseManualPulseTimer : boolean;
    bUseConstantGripTrigger : boolean;
    bUseConstantPulseTorque : boolean; 
    rConstantPulseTorqueVal : number; 
    aGripSchedule : Array<number>; 
}

const SettingsSection = () => {
    const [config, setConfig] = useState({
        testType: "human", 
        triggerType: "grip", 
        numTrials: 10, 
        useManualPulseTimer : false, 
        manualPulseTimerVal : 0,
        gripTriggerValueType : "schedule", 
        constantGripThreshold : 0, 
        gripThresholdSchedule: "2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25", 
        pulseType: "adaptive", 
        constantPulseTorqueVal: 0,
    })

    const updateConfig = (key: string, value: any) => {
        setConfig((prev) => ({...prev, [key]: value}));
    }

    useEffect(() => { // When the page first loads, want to put the PLC in calibration mode. 
        switchToCalibration()
            .catch(console.error)

        return () => {
            switchToWaiting()
                .catch(console.error)
        }
    }, []);

    const handleConfigSubmit = useCallback(async () => {
        // Initialize with default values
        let data: ST_CalibrationSettings = {
            bTestTypeHuman: false,
            nNumTrials: 0,
            bTogglePulseWithGrip: false,
            bUseManualPulseTimer: false,
            bUseConstantGripTrigger: false,
            bUseConstantPulseTorque: false,
            rConstantPulseTorqueVal :  0,
            aGripSchedule: [],
        };
    
        // Assign parsed values
        data.bTestTypeHuman = (config.testType === "human");
        data.nNumTrials = config.numTrials;
        data.bTogglePulseWithGrip = (config.triggerType === "grip"); 
        data.bUseManualPulseTimer = config.useManualPulseTimer
        data.bUseConstantGripTrigger = (config.gripTriggerValueType == "constant")
        data.bUseConstantPulseTorque = (config.pulseType == "constant") 
        data.rConstantPulseTorqueVal = config.constantPulseTorqueVal; 

        // Helper function to parse grip threshold schedules
        const parseGripSchedule = (scheduleString: string): Array<number> => {
            return scheduleString.split(',').map((value) => parseFloat(value.trim())).filter((val) => !isNaN(val));
        };
        
        if (config.triggerType === "grip" && config.gripTriggerValueType == "constant") {
            data.aGripSchedule = [config.constantGripThreshold];
        } else if (config.triggerType == "grip") {
            data.aGripSchedule = parseGripSchedule(config.gripThresholdSchedule);
        }
    
        // Send over the web socket or handle it here
        console.log("Final configuration data: ", data);

        try {
            const response = await fetch('http://localhost:3001/ads-write-value', {
                method: 'POST', 
                headers : {
                    'Content-Type' : 'application/json'
                },
                body: JSON.stringify({
                    channel: "MAIN_DOCILE.fbCalibrationBlock.stCalibrationSettings",
                    value: data
                })
            });

            if (!response.ok) {
                throw new Error("Failed to set calibration seetings. Status: " + response.status); 
            }
        } catch(err) {
            console.error("Error sending calibration settings: ", err)
        }

    }, [config]);

    const handleLaunchTest = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:3001/ads-write-value', {
                method: 'POST',
                headers : {
                    'Content-Type' : 'application/json'
                },
                body: JSON.stringify({
                    channel: "MAIN_DOCILE.fbCalibrationBlock.bLaunchTestSequence", 
                    value: true
                })
            });

            if (!response.ok) {
                throw new Error("Failed to launch test. Status: " + response.status); 
            }
        } catch(err) {
            console.error("Error launching test: ", err); 
        }
    }, []);

    return (
        <div className="container mx-auto pt-12">
            <h1 className="text-2xl">Configure impedance estimation settings. </h1> 
            <Divider className="my-4" />
            <div className="grid grid-cols-2 lg:gap-2 gap-6">
                <RadioGroup label="Select test type" orientation="horizontal" value={config.testType} onValueChange={(value) => updateConfig("testType", value)}>
                    <Radio value="human">Human</Radio>
                    <Radio value="motor">Motor</Radio>
                </RadioGroup>
                <RadioGroup label="Select trigger type" orientation="horizontal" value={config.triggerType} onValueChange={(value) => updateConfig("triggerType", value)}>
                    <Radio value="manual">Manually activated trigger</Radio>
                    <Radio value="grip">Grip activated trigger</Radio>
                </RadioGroup>
            </div>
            <div className="grid grid-cols-2 pt-10 lg:gap-2 gap-6">
                <Slider
                    classNames={{
                        base: "max-w-md", 
                        label: "text-medium"
                    }}
                    color="foreground"
                    label="Select Number of Trials"
                    maxValue={20}
                    minValue={0}
                    showSteps={true}
                    showOutline={true}
                    size="md"
                    step={1}
                    value={config.numTrials}
                    onChange={(value) => updateConfig("numTrials", value)}
                />
                {config.triggerType === "manual" ? 
                <div className="">
                    <Checkbox defaultSelected className="min-w-64 pb-6" isSelected={config.useManualPulseTimer} onValueChange={(value) => updateConfig("useManualPulseTimer", value)}>Timer triggered pulses</Checkbox>
                    <Input
                        type="number"
                        label="Timer Value (seconds)"
                        placeholder="0"
                        min={0}
                        max={10}
                        size="md"
                        value={config.manualPulseTimerVal.toString()}
                        onValueChange={(value) => updateConfig("manualPulseTimerVal", Number(value))}
                        className="min-w-80"
                    />
                </div>
                :
                <>
                <div className="">
                    <RadioGroup label="Select type of grip trigger" className="pb-6" orientation="horizontal" value={config.gripTriggerValueType} onValueChange={(value) => updateConfig("gripTriggerValueType", value)}>
                        <Radio value="constant">Constant grip force trigger</Radio>
                        <Radio value="schedule">Grip force schedule</Radio>
                    </RadioGroup>
                {config.gripTriggerValueType === "constant" ?
                        <Input 
                            type="number" 
                            label="Grip threshold (N)"
                            placeholder="0"
                            min={0}
                            max={80}
                            size="md"
                            value={config.constantGripThreshold.toString()}
                            onValueChange={(value) => updateConfig("constantGripThreshold", Number(value))}
                        /> 
                        :
                        <Input
                            type="string"
                            label="Specify thresholds as real values beteween commas"
                            placeholder="e.g. 2.5, 5, 7.5, ..."
                            size="md"
                            value={config.gripThresholdSchedule}
                            onValueChange={(value) => updateConfig("gripThresholdSchedule", value)}
                        />
                }
                </div>
                </>}
            </div>
            <div className="top-12">
                <h2 className="text-xl">Pulse Controls</h2>
                <div className="grid grid-cols-2">
                    <RadioGroup label="Select a pulse type" orientation="horizontal" value={config.pulseType} onValueChange={(value) => updateConfig("pulseType", value)}>
                        <Radio value="constant">Constant pulse torque</Radio>
                        <Radio value="adaptive">Adaptive pulse torque</Radio>
                    </RadioGroup>
                    { config.pulseType === "constant" ? 
                        <Input 
                            type="number"
                            label="Pulse torque value (N-m)"
                            placeholder="0"
                            min={0}
                            max={2.5}
                            size="md"
                            value={config.constantPulseTorqueVal.toString()}
                            onValueChange={(value) => updateConfig("constantPulseTorqueVal", Number(value))}
                        />
                        :
                        <></>
                    }
                </div>
            </div>
            <div className="pt-10 grid grid-cols-10 gap-8">
                <Button color="primary" onPress={handleConfigSubmit}>Apply Config</Button>
                <Button color="success" onPress={handleLaunchTest}>Launch Test</Button>
            </div>
        </div>
    )
}

interface ICalibSequenceStateChannel {
    name: string, 
    value: number
}

const CalibrationStateMachine = () => {
    const { messages, connected } = useContext(WebSocketContext); 

    const CalibState = {
        PRE_LAUNCH: 0, // When the user is inputting settings. 
        TEST_SETUP: 1, // When the automation is getting the test ready
        TEST_ACTIVE: 2, // When the test is actively running. 
        TEST_FINISHED: 3, // When all calibration rounds have been completed. 
        PROCESSING_LOG: 4,
    }

    const isStateActive = (state: Number) => {
        // First we check to see if the service is connected. If it is, we poll the calibration state: 
        if (!connected) return; 

        // Look at the last messages to check the state 
        const channel = "MAIN_DOCILE.fbCalibrationBlock.eSequenceState";
        const foundValidMessage = messages.slice().reverse().find(obj => obj.hasOwnProperty(channel));

        if (!foundValidMessage) {
            return false;
        } else {
            const calibSequenceState = foundValidMessage[channel] as ICalibSequenceStateChannel;
            return calibSequenceState.value === state;
        }
    }

    return (
        <div className="container w-11/12 mx-auto mt-8 h-96"> 
            <h1 className="text-2xl">Monitor impedance estimation test. </h1> 
            <Divider className="my-4" />
            <div className="grid grid-cols-4 gap-24">
                <div className={`${isStateActive(CalibState.PRE_LAUNCH) ? 'bg-green-400' : 'bg-neutral-200'} h-10 border-2 border-black rounded-large flex justify-center items-center`}>
                    Pre-Launch
                </div>
                <div className={`${isStateActive(CalibState.TEST_SETUP) ? 'bg-green-400' : 'bg-neutral-200'} h-10 border-2 border-black rounded-large flex justify-center items-center`}>
                    Setup
                </div>
                <div className={`${isStateActive(CalibState.TEST_ACTIVE) ? 'bg-green-400' : 'bg-neutral-200'} h-10 border-2 border-black rounded-large flex justify-center items-center`}>
                    Active
                </div>
                <div className={`${isStateActive(CalibState.TEST_FINISHED) ? 'bg-green-400' : 'bg-neutral-200'} h-10 border-2 border-black rounded-large flex justify-center items-center`}>
                    Finished
                </div>
            </div>
        </div>
    )
}


const CalibrationPage = () => {
    return (
        <div>
            <UserSelection />
            <SettingsSection />
            <CalibrationStateMachine /> 
        </div> 
    )
}

export default CalibrationPage;