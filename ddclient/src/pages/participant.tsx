import { Button } from "@heroui/button"
import { Code } from "@heroui/code"
import {
    ArrowPathRoundedSquareIcon
} from "@heroicons/react/24/outline";
import { useEffect, useState, useCallback } from "react"
import {
    Modal, 
    ModalContent,
    ModalHeader,
    ModalBody, 
    ModalFooter,
    useDisclosure, 
} from "@heroui/modal"; 
import { Input, Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner"
import { timeAgoString } from "@/functions/time-conversion";

interface IParticipantData {
    id: number, 
    name: string, 
    gender: string, 
    notes: string, 
    createdAt: string
}
export type {IParticipantData}; 

function AddNewParticipantButton() {
    const {isOpen, onOpen, onOpenChange} = useDisclosure();
    const [gender, setGender] = useState("");
    const [name, setName] = useState(""); 
    const [notes, setNotes] = useState(""); 
    const [isLoading, setIsLoading] = useState(false); 
    const [errorMessage, setErrorMessage] = useState(""); 

    const clearConfig = useCallback(() => {
        setGender(""); 
        setName(""); 
        setNotes(""); 
        setErrorMessage(""); 
    }, []);

    const handleSubmit = async(onCloseCallback : any) => {
        if (!name.trim() || !gender) {
            setErrorMessage("Name and gender are required.") ; 
            return;
        }

        setIsLoading(true); 
        setErrorMessage(""); 

        try {
            const response = await fetch("http://localhost:3001/create-user", {
                method: "POST", 
                headers: {
                    "Content-Type": "application/json", 
                },
                body: JSON.stringify({ name, gender, notes }), 
            });

            if (!response.ok) {
                const responseData = await response.json().catch(() => null);
                console.log("Error in creating user: ", responseData); 
                throw new Error(responseData.message); 
            }
            clearConfig(); 
            onCloseCallback(); 
        } catch (error : any) {
            setErrorMessage(error.message || "An error occurred."); 
        } finally {
            setIsLoading(false); 
        }
    }

    return (
        <>
        <Button
        variant="solid"
        color="success"
        className="transition-colors duration-200 hover:bg-success-300 h-8"
        onPress={()=> {onOpen(); clearConfig()}}
        >
            Add user +
        </Button>
        <Modal isOpen={isOpen} placement="top-center" onOpenChange={onOpenChange}>
            <ModalContent>
                {(onClose : any) => (
                <>
                    <ModalHeader className="flex flex-col gap-1">Add a new participant</ModalHeader>
                    <ModalBody>
                    <Input
                        label="Name"
                        placeholder="Enter participant name"
                        variant="bordered"
                        value={name}
                        onValueChange={setName}
                    />
                    <Textarea
                        label="Notes"
                        labelPlacement="inside"
                        placeholder="Enter notes (if any)"
                        value={notes} 
                        onValueChange={setNotes}
                    />
                    <div className="pl-2 flex flex-row justify-evenly">
                        <h2 className="font-thin">Gender: </h2>
                        <div className="flex flex-row justify-evenly min-w-40">
                            {["male", "female", "x"].map((g) => (
                                <div
                                    key={g}
                                    className={`w-6 h-6 select-none transition-colors duration-200 ${
                                        gender === g ? `bg-primary-200 hover:bg-primary-300` : `bg-slate-200 hover:bg-slate-300`
                                    } flex flex-row items-center justify-center rounded-md`}
                                    onClick={() => setGender(g)}
                                >
                                    <h2>{g.charAt(0).toUpperCase()}</h2>
                                </div>
                            ))}
                        </div>
                    </div>
                    {errorMessage && <p className="text-red-500 text-sm mt-2">{errorMessage}</p>}
                    </ModalBody>
                    <ModalFooter>
                    <Button color="primary" onPress={()=> handleSubmit(onClose)} isDisabled={isLoading}>
                        {isLoading ? <Spinner size="sm" /> : "Add"}
                    </Button>
                    </ModalFooter>
                </>
                )}
            </ModalContent>
        </Modal>
        </>
    )
}

export default function ParticipantPage () {
    const [users, setUsers] = useState<IParticipantData[]>([]); 
    const [selectedUser, setSelectedUser] = useState<IParticipantData>(); 
    const [usersNeedRefreshing, setRefresh] = useState(false); 

    // Handler to refresh user list
    useEffect(() => {
        setUsers([]); 
        const getRegisteredParticipants = async() => {
            try {
                const response = await fetch('http://localhost:3001/list-users', {
                    method: "GET", 
                    headers: {
                        "Content-Type" : "application/json"
                    }
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
        setRefresh(false); 

    }, [usersNeedRefreshing]);

    return (
        <div className="mx-auto container">
            <div className="min-h-96 min-w-32 mt-16 grid grid-cols-3">
                <div className="col-span-1">
                    <div className="flex flex-row justify-between items-center pb-2">
                        <h1 className="text-2xl font-semibold">Registered Participants</h1>
                        <Button 
                        isIconOnly 
                        aria-label="Refresh participants list" 
                        variant="faded" 
                        className="h-8 w-8 transition-colors duration-200 hover:bg-gray-200"
                        onPress={()=> setRefresh(true)}
                        >
                            <ArrowPathRoundedSquareIcon className="h-6 w-6 text-gray-500 transition-colors duration-200 hover:text-gray-700"/>
                        </Button>
                        <AddNewParticipantButton/>
                    </div>

                    <div className="w-full rounded-xl bg-slate-100 h-[48rem] overflow-y-hidden">
                        {users.map((user) => (
                            <div 
                            key={user.name} 
                            className={`pl-4 pt-2 pb-2 flex flex-col transition-colors hover:bg-slate-200 duration-200 ${selectedUser?.id === user.id ? 'bg-slate-200' : ''}`}
                            onClick={() => setSelectedUser(user)}
                            >
                                <h1 className="text-lg">
                                    {user.name}
                                </h1>
                                <h2 className="font-thin text-xs">
                                    {timeAgoString(user.createdAt)}
                                </h2>

                            </div>
                        ))}
                    </div>
                </div>
                <div className="col-span-2 pl-6 flex flex-col justify-center items-center">
                    <div>
                        <h1 className="text-2xl font-semibold">Currently selected Participant: {selectedUser? selectedUser.name : 'None'}</h1>
                        <div className="pt-2 flex flex-row justify-between">
                            <h2>Created at:</h2>
                            <Code color="success">{selectedUser? selectedUser.createdAt : 'Unknown'}</Code>
                        </div>
                        <div className="pt-2 flex flex-row justify-between">
                            <h2>Gender: </h2>
                            <Code color="success">{selectedUser? selectedUser.gender : 'Unknown'}</Code>
                        </div>
                        <div className="pt-2 flex flex-row justify-between">
                            <h2>ID: </h2>
                            <Code color="success">{selectedUser? selectedUser.id : 'Unknown'}</Code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}