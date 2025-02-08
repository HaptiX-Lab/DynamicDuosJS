import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  PropsWithChildren,
} from "react";

interface Message {
  [key : string] : unknown; // These are the beckhoff types. 
  receivedAt: number;
}

interface IWebSocketContext {
  adsError : boolean; 
  connected: boolean;
  messages: Message[];
  connect: () => void;
  disconnect: () => void;
  sendMessage: (msg: unknown) => void;
}

// Create the context with a default/placeholder value
export const WebSocketContext = createContext<IWebSocketContext>({
  adsError: false, 
  connected: false,
  messages: [],
  connect: () => {},
  disconnect: () => {},
  sendMessage: () => {},
});


export function WebSocketProvider({ children }: PropsWithChildren<{}>) {
  const wsRef = useRef<WebSocket | null>(null);
  const [adsError, setAdsError] = useState<boolean>(false); 
  const [connected, setConnected] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const lastTimeRef = useRef<number>(Date.now());

  // A function to connect (called by a button or something)
  const connect = useCallback(() => {
    if (!wsRef.current) {
      const socket = new WebSocket("ws://localhost:3001");
      wsRef.current = socket;

      socket.onopen = () => {
        console.log("Connected to the WebSocket server");
        setConnected(true);
        localStorage.setItem("wasConnected", "true");  
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const receivedAt = Date.now();
          
          if (msg.type === 'ADS_ERROR') {
            console.log("Received an ADS error indicator"); 
            setAdsError(true); 
            return;
          }
          if (msg.type != 'PLC_DATA') {
            console.log("Received foreign message type: ", msg.type); 
            return;
          } 

          // add receivedAt as a prop to the msg
          msg.data.receivedAt = receivedAt
          setAdsError(false); 

          setMessages((prev) => {
            const next = [...prev, msg.data];
            if (next.length > 100) {
              next.shift();
            }
            return next;
          });
          lastTimeRef.current = receivedAt;
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      };

      socket.onclose = () => {
        console.log("Disconnected from the WebSocket server");
        setConnected(false);
        wsRef.current = null;
      };

      socket.onerror = (err) => {
        console.error("Error connecting to the WebSocket server:", err);
      };
    }
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null; 
    setConnected(false);
    localStorage.setItem("wasConnected", "false"); 
  }, []);

  const sendMessage = useCallback((msg: unknown) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(msg));
        } catch (err) {
          console.error("Failed to send message:", err);
        }
      } else {
        console.warn("WebSocket is not connected. Failed to send message.");
      }
  }, []);

  // On mount, check if the socket was previously opened (on last load of page, and reconnect if possible)
  useEffect(() => {
    const wasConnected = localStorage.getItem("wasConnected") === "true";
    let timer: any;
    if (wasConnected) {
      timer = setTimeout(() => {
        connect();
      }, 50); // short delay to avoid mount/unmount race
    }
    return () => clearTimeout(timer);
  }, [connect]);
  
  // 2) On unmount, close the socket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const contextValue = useMemo(() => ({
    adsError, connected, messages, connect, disconnect, sendMessage
  }), [adsError, connected, messages, connect, disconnect, sendMessage]);

  return (
    <WebSocketContext.Provider
      value={contextValue}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
