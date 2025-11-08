import { WebSocketServer, WebSocket } from "ws";
import { appRouter, createTRPCContext } from "@acme/api";

const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;

const wss = new WebSocketServer({ port: PORT });

// Store connected clients by type
const clients = new Map<string, Set<WebSocket>>();

// Create tRPC caller for server-side calls
const createCaller = async () => {
  const ctx = await createTRPCContext({
    headers: new Headers(),
  });
  return appRouter.createCaller(ctx);
};

wss.on("connection", (ws: WebSocket) => {
  console.log("New client connected");

  let clientType: string | null = null;

  ws.on("message", (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle client registration
      if (message.type === "register") {
        clientType = message.clientType; // "chrome" | "vscode"

        if (!clients.has(clientType)) {
          clients.set(clientType, new Set());
        }
        clients.get(clientType)?.add(ws);

        console.log(`Client registered as: ${clientType}`);
        ws.send(JSON.stringify({ type: "registered", clientType }));
        return;
      }

      // Forward messages to appropriate clients
      if (message.type === "chrome-data" && clientType === "chrome") {
        // Forward Chrome DevTools data to VS Code clients
        const vscodeClients = clients.get("vscode");
        if (vscodeClients) {
          vscodeClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data.toString());
            }
          });
        }

        // Also send to backend via tRPC for processing/storage
        createCaller()
          .then((caller) => {
            // Example: You can process the data through tRPC here
            console.log("Chrome data received, can process via tRPC");
          })
          .catch((error) => {
            console.error("Error calling tRPC:", error);
          });
      }

      if (message.type === "vscode-command" && clientType === "vscode") {
        // Forward VS Code commands to Chrome clients
        const chromeClients = clients.get("chrome");
        if (chromeClients) {
          chromeClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data.toString());
            }
          });
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected${clientType ? `: ${clientType}` : ""}`);

    // Remove from clients map
    if (clientType && clients.has(clientType)) {
      clients.get(clientType)?.delete(ws);
      if (clients.get(clientType)?.size === 0) {
        clients.delete(clientType);
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

wss.on("listening", () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  wss.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
