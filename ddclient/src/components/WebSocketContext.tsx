import {
  createContext,
  useState,
  useEffect,
  useCallback,
  PropsWithChildren,
} from "react";

interface IWebSocketContext {
  ws: WebSocket | null;
  connected: boolean;
  messages: any[];
  connect: () => void;
  disconnect: () => void;
  sendMessage: (msg: any) => void;
}

// Create the context with a default/placeholder value
export const WebSocketContext = createContext<IWebSocketContext>({
  ws: null,
  connected: false,
  messages: [],
  connect: () => {},
  disconnect: () => {},
  sendMessage: () => {},
});

let lastTime = Date.now();

export function WebSocketProvider({ children }: PropsWithChildren<{}>) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [messages, setMessages] = useState<any[]>([]);

  // A function to connect (called by a button or something)
  const connect = useCallback(() => {
    if (!ws) {
      const socket = new WebSocket("ws://localhost:3001");

      socket.onopen = () => {
        console.log("Connected to the WebSocket server");
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          setMessages((prev) => {
            msg.receivedAt = Date.now();
            const next = [...prev, msg];

            if (next.length > 100) {
              next.shift();
            }
            console.log(
              "Got message and parsed successfully, dt:",
              Date.now() - lastTime,
            );
            lastTime = Date.now();

            return next;
          });
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      };

      socket.onclose = () => {
        console.log("Disconnected from the WebSocket server");
        setConnected(false);
      };

      socket.onerror = (err) => {
        console.error("Error connecting to the WebSocket server:", err);
      };

      setWs(socket);
    }
  }, [ws]);

  const disconnect = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
      setConnected(false);
    }
  }, [ws]);

  const sendMessage = useCallback(
    (msg: any) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        console.error("WebSocket is not connected. Failed to send message.");
      }
    },
    [ws],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws]);

  return (
    <WebSocketContext.Provider
      value={{ ws, connected, messages, connect, disconnect, sendMessage }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
