import {RadioGroup, Radio} from "@heroui/radio";
import { Divider } from "@heroui/divider"; 
import { Input } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";
import { Slider } from "@heroui/slider"; 
import React, { useState } from "react";
import { Button } from "@heroui/button";  
import { WebSocketContext } from "@/components/WebSocketContext"; 
import { Switch } from "@heroui/switch"
import { useContext, useCallback, useEffect } from "react"; 
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
            <div className="flex flex-row justify-between">
                <h1 className="text-2xl">Select a registered participant and configure experiment settings. </h1> 
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
                            <Button color="primary">Apply Config</Button>
                        }
                    >
                        <div className="container">
                            <div className="flex flex-row justify-between mb-6 items-center">
                                <Button color="default" variant="flat">Generate a random catch from:</Button>
                                <Select className="w-32" aria-label="Load setting 1">
                                    <>
                                        {loadOptionStrings.map((loadSetting) => (
                                            <SelectItem key={loadSetting} textValue={loadSetting}>
                                                {loadSetting}
                                            </SelectItem>
                                        ))}
                                    </>
                                </Select>
                                <h2> to </h2> 
                                <Select className="w-32" aria-label="Load setting 2">
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
        </div> 
    )
}

export default MainExperimentPage;