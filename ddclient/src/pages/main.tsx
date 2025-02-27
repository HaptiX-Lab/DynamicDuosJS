import { Divider } from "@heroui/divider"; 
import { Input } from "@heroui/input";
import React, { useState } from "react";
import { Button } from "@heroui/button";  
import { WebSocketContext } from "@/components/WebSocketContext"; 
import { Switch } from "@heroui/switch"
import { useContext, useRef, useEffect } from "react"; 
import { switchToMainExperiment, switchToWaiting } from "@/functions/plc-mode-change";
import { Select, SelectItem } from "@heroui/select"; 
import type { SharedSelection } from "@heroui/system";
import { useNavigate } from "react-router-dom"; 
import type { IParticipantData } from "@/pages/participant";
import { timeAgoString } from "@/functions/time-conversion";
import { writeAdsValue, readAdsValue } from "@/functions/plc-value-change";
import {Accordion, AccordionItem} from "@heroui/accordion"; 

// TODO: 
// move necessary child props into the parent 
// Make sure that data is saved automatically based on selected participant

interface UserSelectionProps {
    users: IParticipantData[];
    participant: SharedSelection | undefined; 
    setParticipant: React.Dispatch<React.SetStateAction<SharedSelection | undefined>>;
}

interface MainTrialProps {
    loadIndex: number; 
    loadSetting: string; 
    finished: boolean; 
}

function generateDefaultTrialPropList(size: number) {
    let defaultList = [] 
    for (let i = 0; i < size; i++) {
        let props : MainTrialProps = {
            loadIndex: 1, 
            loadSetting: "Very Light", 
            finished: false
        }; 
        defaultList.push(props); 
    }
    return defaultList; 
}

const ConfigureExperiment: React.FC<UserSelectionProps> = ({ users, participant, setParticipant }) => {
    const [enableDemoMode, setEnableDemoMode] = useState(false); 
    const [loadOptions, setLoadOptions] = useState([]); 
    const [loadOptionStrings, setLoadOptionStrings] = useState<string[]>([]); 
    const [selectedDemoLoadSetting, setSelectedDemoLoadSettings] = useState<SharedSelection | undefined>(); 
    const [randomLoad1, setRandomLoad1] = useState<SharedSelection | undefined>(); 
    const [randomLoad2, setRandomLoad2] = useState<SharedSelection | undefined>(); 
    const [numTrials, setNumTrials] = useState(10); 
    const [trialPropsList, setTrialPropsList] = useState<MainTrialProps[]>(generateDefaultTrialPropList(numTrials)); 

    const numTrialsDidChange = (value : string) => {
        console.log("Num trials is being changed to :", Number(value)); 
        // First set the value to numTrials
        let previousNumTrials = numTrials; 
        let newNumTrials = Number(value); 

        // Then we need to regen the schedule. 
        let newTrialPropsList = []; 

        if(newNumTrials < previousNumTrials) {
            // Then we try and do as much copying as we can. 
            for (let i = 0; i < newNumTrials; i++) {
                newTrialPropsList.push(trialPropsList[i]) 
            }
        } else if (newNumTrials > previousNumTrials) {
            // Just add new default items
            newTrialPropsList = trialPropsList.concat(generateDefaultTrialPropList(newNumTrials-previousNumTrials));
        } else {
            newTrialPropsList = trialPropsList; 
        }
        console.log("New list:", newTrialPropsList); 
        setNumTrials(Number(value)); 
        setTrialPropsList(newTrialPropsList); 
    }

    const updateTrialLoad = (value: SharedSelection, index: number) => {
        console.log("Got selected value: ", value, ", for index ", index); 
        if (value?.currentKey) {
            const loadSetting = value.currentKey;
            const loadIndex = loadOptionStrings.indexOf(loadSetting);
            setTrialPropsList(prevList => {
                // Create a copy of the array
                const newTrialPropsList = [...prevList];
                // Replace the specific trial with a new object
                newTrialPropsList[index] = {
                    ...newTrialPropsList[index],
                    loadIndex,
                    loadSetting
                };
                return newTrialPropsList;
            });
        }
    };

    const generateRandomLoadCase = () => {
        if (randomLoad1?.currentKey && randomLoad2?.currentKey) {
            // Generate a random number based on num trials for where to switch
            let delta = numTrials/3
            let catchPosition = Math.floor(numTrials/2) + Math.floor(Math.random() * delta); 
            // Then we institute the load. 
            const loadSetting1 = randomLoad1.currentKey;
            const loadSetting2 = randomLoad2.currentKey
            const loadIndex1 = loadOptionStrings.indexOf(randomLoad1?.currentKey); 
            const loadIndex2 = loadOptionStrings.indexOf(randomLoad2?.currentKey); 

            setTrialPropsList(prevList => {
                const newTrialPropsList = [...prevList];
                for (let i = 0; i < numTrials; i++) {
                    newTrialPropsList[i].finished = false; 
                    if (i < catchPosition) {
                        newTrialPropsList[i].loadIndex = loadIndex1;
                        newTrialPropsList[i].loadSetting = loadSetting1;
                    } else {
                        newTrialPropsList[i].loadIndex = loadIndex2;
                        newTrialPropsList[i].loadSetting = loadSetting2;
                    }
                }
                return newTrialPropsList;
            });
        }
    }

    const handleConfigSubmit = async () => {
        // We need to upload our config to the PLC. 
        // First write the number of tests we want. 
        const result = await writeAdsValue(`MAIN_DOCILE.fbMainExperimentBlock.nNumTests`, numTrials); 
        if (!result) {
            console.log("Error writing numTests to PLC:", result)
        }
        for (let i = 0; i < numTrials; i++) {
            const result = await writeAdsValue(`MAIN_DOCILE.fbMainExperimentBlock.aTestSettings[${i+1}].Weight`, 
                                                trialPropsList[i].loadIndex); 
            if (!result) {
                console.log(`Error writing config for test ${i} to PLC: `, result); 
            }
        }
    }

    const saveExperimentLog = async () => {
        try {
            console.log("Saving main experiment log..."); 
            const response = await fetch('http://localhost:3001/save-main-log', {
                method: 'POST',
                headers : {
                    'Content-Type' : 'application/json'
                },
                body: JSON.stringify({ userID: participant?.currentKey })
            });

            if (!response.ok) {
                throw new Error("Failed to save log. Status: " + response.status); 
            }
        } catch (err) {
            console.error(err); 
        }
    }

    const handleLaunchTest = async() => {
        // We just need to write launchTest to the plc 
        const result = await writeAdsValue(`MAIN_DOCILE.fbMainExperimentBlock.bLaunchTestSequence`, true); 
        if (!result) {
            console.log("Error writing bLaunchTestSequence to PLC: ", result); 
        }
    }

    useEffect(() => {
        
        // We want to write demo mode to the experiment block inside the PLC: 
        writeAdsValue('MAIN_DOCILE.fbMainExperimentBlock.bDemoMode', enableDemoMode); 
    }, [enableDemoMode])

    useEffect(() => {
        if (selectedDemoLoadSetting?.currentKey) {
            const loadSettingIndex = loadOptionStrings.indexOf(selectedDemoLoadSetting.currentKey); 
            writeAdsValue('MAIN_DOCILE.fbMainExperimentBlock.nDemoLoadSetting', loadSettingIndex + 1);
        }
        
    }, [selectedDemoLoadSetting])

    // Also want to call useEffect to get load settings when the component mounts. 
    useEffect(() => {

        const getLoadOptions = async () => {
            let loadOptionStringsOnServer = await readAdsValue('MAIN_DOCILE.fbMainExperimentBlock.aLOAD_CONSTANTS_STRINGS')
            let loadOptionsOnServer = await readAdsValue('MAIN_DOCILE.fbMainExperimentBlock.aLOAD_CONSTANTS')
            setLoadOptions(loadOptionsOnServer.value); 
            setLoadOptionStrings(loadOptionStringsOnServer.value); 
        }
        getLoadOptions(); 

    }, []);

    return (
        <div className="container mx-auto pt-12">
            <div className="flex flex-row justify-between items-center">
                <h1 className="text-xl">Select a registered participant and configure experiment settings. </h1> 
                <Switch isSelected={enableDemoMode} onValueChange={setEnableDemoMode}> Demo Mode </Switch>
                <Select 
                    label="Load setting"
                    placeholder="Select a load setting"
                    selectedKeys={selectedDemoLoadSetting}
                    onSelectionChange={setSelectedDemoLoadSettings}
                    className="max-w-64"
                >
                    <>
                    {loadOptionStrings.map((loadSetting) => (
                        <SelectItem key={loadSetting} textValue={loadSetting}>
                            {loadSetting}
                        </SelectItem>
                    ))}
                    </>
                </Select>
                <Button color="danger" onPress={handleLaunchTest}>Launch Test</Button>
                <Button color="primary" onPress={saveExperimentLog}>Save Experiment Log</Button>
            </div> 
            <Divider className="my-4" />
            <div className="grid grid-cols-2 lg:gap-2 gap-6">
                <Select
                    className="max-w-md"
                    label="Participant"
                    placeholder="Select a participant"
                    selectedKeys={participant}
                    onSelectionChange={setParticipant} 

                >
                    <>
                        <SelectItem key="createNew" className="text-primary-600">
                        Create a new participant
                        </SelectItem>
                        {users.map((user) => (
                        <SelectItem key={String(user.id)} textValue={user.name}>
                            {user.name}{' '}
                            <span className="font-thin italic">
                            {timeAgoString(user.createdAt)}
                            </span>
                        </SelectItem>
                        ))}
                    </>
                </Select>
                <Accordion
                variant="shadow"
                > 
                    <AccordionItem
                        key="1"
                        aria-label="Accordion 1"
                        subtitle="Press to expand"
                        title="Load Schedule"
                        startContent = {
                            <Button color="primary" onPress={handleConfigSubmit}>Apply Config</Button>
                        }
                    >
                        <div className="container">
                            <div className="flex flex-row justify-between mb-6 items-center">
                                <Button color="default" variant="flat" onPress={generateRandomLoadCase}>Generate a random catch from:</Button>
                                <Select className="w-32" aria-label="Load setting 1" onSelectionChange={setRandomLoad1}>
                                    <>
                                        {loadOptionStrings.map((loadSetting) => (
                                            <SelectItem key={loadSetting} textValue={loadSetting}>
                                                {loadSetting}
                                            </SelectItem>
                                        ))}
                                    </>
                                </Select>
                                <h2> to </h2> 
                                <Select className="w-32" aria-label="Load setting 2" onSelectionChange={setRandomLoad2}>
                                    <>
                                        {loadOptionStrings.map((loadSetting) => (
                                            <SelectItem key={loadSetting} textValue={loadSetting}>
                                                {loadSetting}
                                            </SelectItem>
                                        ))}
                                    </>
                                </Select>
                            </div>
                            <Input label="Number of trials" className="pb-4" placeholder="Enter number of trials" type="" value={String(numTrials)} onValueChange={numTrialsDidChange}/>
                            {trialPropsList.map((trialProps : MainTrialProps, index : number) => (
                                <div key={index} className="flex flex-row justify-between items-center pt-2 pb-2">
                                    <h2 className="font-semibold">
                                        Trial #{index}:
                                    </h2> 
                                    <Select 
                                        label="Load setting"
                                        placeholder="Select a load setting"
                                        onSelectionChange={(value) => updateTrialLoad(value, index)}
                                        selectedKeys={[trialProps.loadSetting]}
                                        className="max-w-64"
                                    >
                                        <>
                                        {loadOptionStrings.map((loadSetting) => (
                                            <SelectItem key={loadSetting} textValue={loadSetting}>
                                                {loadSetting}
                                            </SelectItem>
                                        ))}
                                        </>
                                    </Select>
                                    <div className={`min-w-20 h-12 border-solid border-2 p-2 ${trialProps.finished? `border-green-400` : `border-red-400`}`}> 
                                        {trialProps.finished ? `Completed` : `Not yet completed`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    )
}

const WheelAndSpeedGauge = () => {
    const { messages, connected } = useContext(WebSocketContext);
    const speedGaugeRef = useRef<HTMLCanvasElement>(null);
    const wheelGaugeRef = useRef<HTMLCanvasElement>(null);
    
    // Velocity state (in degrees per second, for example)
    const [velocity, setVelocity] = useState<number>(0);
    // Keep a history of angle measurements and timestamps
    const angleHistoryRef = useRef<{ angle: number; time: number }[]>([]);
  
    useEffect(() => {
      if (!speedGaugeRef.current || !wheelGaugeRef.current) return;
  
      const now = Date.now();
      // Get the current angle measurement from the messages.
      const foundValidMessage = messages
        .slice()
        .reverse()
        .find(obj => obj.hasOwnProperty("GVL.ENCODER_1_DEGREES"));
      const messageData = foundValidMessage ? foundValidMessage["GVL.ENCODER_1_DEGREES"] : 0;
      const currentAngle = Number(messageData);
      const currentAngleRadians = currentAngle * Math.PI / 180;
  
      // Add the new measurement with its timestamp.
      angleHistoryRef.current.push({ angle: currentAngle, time: now });
      // Define a window duration (in ms) for stable velocity computation.
      const windowDuration = 500; // 1 second
      // Remove measurements older than the window.
      angleHistoryRef.current = angleHistoryRef.current.filter(item => now - item.time <= windowDuration);
  
      // Compute velocity (absolute change in angle / time difference) if we have at least two points.
      if (angleHistoryRef.current.length > 1) {
        const oldest = angleHistoryRef.current[0];
        const angleDiff = currentAngle - oldest.angle;
        const timeDiff = (now - oldest.time) / windowDuration; // seconds
        const computedVelocity = Math.abs(angleDiff) / timeDiff; // degrees per second
        setVelocity(computedVelocity);
      }
  
      // Get canvas contexts.
      const wheelCanvas = wheelGaugeRef.current;
      const wheelCtx = wheelCanvas.getContext('2d');
      const speedCanvas = speedGaugeRef.current;
      const speedCtx = speedCanvas.getContext('2d');
      if (!wheelCtx || !speedCtx) return;
  
      // Dimensions for the wheel gauge.
      const wheelGaugeWidth = wheelCanvas.width;
      const wheelGaugeHeight = wheelCanvas.height;
      const wheelRadius = wheelGaugeHeight * 0.4;
  
      // Dimensions for the speed gauge.
      const speedGaugeWidth = speedCanvas.width;
      const speedGaugeHeight = speedCanvas.height;
      const speedRadius = speedGaugeHeight * 0.4;
  
      // Clear both canvases.
      wheelCtx.clearRect(0, 0, wheelGaugeWidth, wheelGaugeHeight);
      speedCtx.clearRect(0, 0, speedGaugeWidth, speedGaugeHeight);
  
      // Draw the speed gauge circles.
      const numCircles = 5;
      // Calculate equal spacing so that the circles are centered with equal margins.
      const spacing = speedGaugeWidth / (numCircles + 1);
  
      // Define cumulative velocity thresholds for each circle.
      // For example, the leftmost circle fills as velocity goes from 0 to 10,
      // the next from 10 to 20, and so on.
      const thresholds = [15, 30, 45, 60, 75]; // Adjust as needed.
      const baseOpacity = 0.2;
  
      for (let i = 0; i < numCircles; i++) {
        const x = (i + 1) * spacing;
        const y = speedGaugeHeight / 2;
  
        speedCtx.beginPath();
        speedCtx.arc(x, y, speedRadius, 0, 2 * Math.PI);
  
        let baseColor = "";
        if (i < 2) {
          baseColor = "red";
        } else if (i < 4) {
          baseColor = "yellow";
        } else {
          baseColor = "green";
        }
  
        // Determine the velocity range for this circle.
        // For the first circle, lowerBound is 0. For subsequent circles, it's the previous threshold.
        const lowerBound = i === 0 ? 0 : thresholds[i - 1];
        const upperBound = thresholds[i];
  
        let opacity = baseOpacity;
        if (velocity > lowerBound) {
          if (velocity >= upperBound) {
            opacity = 1;
          } else {
            // Map velocity in the interval [lowerBound, upperBound] to opacity [baseOpacity, 1].
            opacity = baseOpacity + ((velocity - lowerBound) / (upperBound - lowerBound)) * (1 - baseOpacity);
          }
        }
  
        // Apply the fill with the computed opacity.
        speedCtx.fillStyle = baseColor;
        speedCtx.globalAlpha = opacity;
        speedCtx.fill();
        speedCtx.globalAlpha = 1.0; // Reset for stroke.
        speedCtx.strokeStyle = "black";
        speedCtx.stroke();
      }
  
      // Draw a placeholder for the wheel gauge.
      wheelCtx.fillStyle = "#ccc";
      wheelCtx.fillRect(0, 0, wheelGaugeWidth, wheelGaugeHeight);

      // Now we're going to draw the wheel itself
      wheelCtx.beginPath(); 
      wheelCtx.moveTo(wheelGaugeWidth/2 + wheelRadius, wheelGaugeHeight/2); 
      wheelCtx.strokeStyle = "black"
      wheelCtx.lineWidth = 6
      wheelCtx.arc(wheelGaugeWidth/2, wheelGaugeHeight/2, wheelRadius, 0, 2*Math.PI); 
      wheelCtx.stroke();
      // Draw target indicator in the upper right quadrant.
      const centerX = wheelGaugeWidth / 2;
      const centerY = wheelGaugeHeight / 2;
      // Use a negative angle to move the arc to the upper right quadrant.
      // For instance, center the arc at -60°.
      const centerAngle = -30 * Math.PI / 180; 
      const buffer = 8 * Math.PI / 180; // 8° on either side of the center
      wheelCtx.beginPath();
      wheelCtx.moveTo(centerX, centerY);
      wheelCtx.arc(centerX, centerY, wheelRadius, centerAngle - buffer, centerAngle + buffer);
      wheelCtx.closePath(); // Closes the wedge so the fill covers the entire slice.
      wheelCtx.fillStyle = "green";
      wheelCtx.globalAlpha = 0.6
      wheelCtx.fill();
      wheelCtx.strokeStyle = "green";
      wheelCtx.stroke();
      wheelCtx.globalAlpha = 1.0

      // Then draw the indicator
      wheelCtx.beginPath(); 
      wheelCtx.moveTo(wheelGaugeWidth/2, wheelGaugeHeight/2); 
      wheelCtx.strokeStyle = "red"; 
      wheelCtx.lineWidth = 8;
      wheelCtx.lineTo(wheelGaugeWidth/2 + wheelRadius * 1.1 * Math.sin(currentAngleRadians), 
                    wheelGaugeHeight/2 - wheelRadius * 1.1 * Math.cos(currentAngleRadians));
      wheelCtx.stroke(); 

    }, [messages, connected]);
  
    return (
      <div className="flex flex-row justify-center mt-20">
        <div className="w-8/12 flex flex-col items-left border-2 border-black">
          <canvas
            id="speed-gauge-main"
            ref={speedGaugeRef}
            className="w-full h-24"
            height={150}
            width={1200}
          ></canvas>
          <canvas
            id="wheel-gauge-main"
            ref={wheelGaugeRef}
            className="h-[36rem] w-full"
            height={800}
            width={1200}
          ></canvas>
        </div>
      </div>
    );
  };


const MainExperimentPage = () => {
    let navigate = useNavigate(); 
    const [participant, setParticipant] = useState<SharedSelection | undefined>(); 
    const [users, setUsers] = useState<IParticipantData[]>([]); 
    const [logSaveInProgess, setLogSaveInProgress] = useState(false); 

    // Hook to check if we should redirect (need to define new participant)
    useEffect(() => {
        if (participant?.currentKey === 'createNew') {
            navigate('/participant-setup')
        }
    }, [participant]);

    useEffect(() => { // When the page first loads, want to put the PLC in calibration mode. 
        switchToMainExperiment()
            .catch(console.error)

        return () => {
            switchToWaiting()
                .catch(console.error)
        }
    }, []);

    useEffect(() => { // When the page first loads, also get the list of participants to populate the dropdown
        const getRegisteredParticipants = async() => {
            try {
                const response = await fetch('http://localhost:3001/list-users', {
                    method: "GET", 
                    headers: {
                        "Content-Type" : "application/json"
                    }, 
                }); 

                const responseData = await response.json(); 
                if (!response.ok) {
                    throw new Error("Error fetching list of users"); 
                }
                setUsers(responseData); 
            } catch (error) {
                console.error("Error fetching users: ", error); 
            }
        }
        getRegisteredParticipants();
    }, []); 

    return (
        <div>
            <ConfigureExperiment users={users} participant={participant} setParticipant={setParticipant}/>
            <WheelAndSpeedGauge />
        </div> 
    )
}

export default MainExperimentPage;