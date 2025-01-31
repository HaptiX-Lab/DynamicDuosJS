import { useEffect, useState, useContext } from "react";
import {
  ClockIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from "@heroicons/react/24/outline";
import {Popover, PopoverTrigger, PopoverContent} from "@heroui/popover";
import { Button } from "@heroui/button";
import { Divider } from "@heroui/divider";
import { WebSocketContext } from "@/components/WebSocketContext";

function ConnectionDropdown() {
  const { connected, connect, disconnect, messages } = useContext(WebSocketContext);
  return (
    <Popover placement="bottom" showArrow={true}>
        <PopoverTrigger>
            <Button className="font-semibold">
              PLC Status <span className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </Button>
        </PopoverTrigger>
        <PopoverContent>
            {(titleProps) => (
                <div className="px-1 pt-4">
                    <h2 {...titleProps} className="font-semibold text-lg">PLC Connection</h2>
                    <Divider />
                    <div className="py-1">
                        Connection Status: {connected? <span className="text-green-500">Connected</span> : <span className="text-red-500">Disconnected</span>}
                    </div> 
                    <div className="py-1">
                        Last Update: {
                            messages.length > 0 ? (
                                new Date(messages[messages.length - 1].receivedAt).toLocaleTimeString()
                            ) : (
                                'N/A'
                            )
                        }
                    </div>
                    <Divider />
                    <div className="py-3">
                        <Button size="sm" onPress={connected? disconnect : connect}>{connected? 'Disconnect' : 'Connect'}</Button>
                    </div>
                </div>
            )}
        </PopoverContent>
    </Popover>
  );
}

function Header() {
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <header>
      <div className="text-lg flex items-center justify-between px-6 py-2 shadow-md bg-default-200 font-normal">
        <h2>HaptiX Lab Experiment Dashboard</h2>

        <div className="flex items-center gap-4">
          <ConnectionDropdown />
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5" />
            {time}
          </div>
          <button onClick={handleFullscreen}>
            {fullscreen ? (
              <ArrowsPointingInIcon className="w-5 h-5" />
            ) : (
              <ArrowsPointingOutIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;