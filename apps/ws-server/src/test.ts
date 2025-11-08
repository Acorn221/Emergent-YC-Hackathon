#!/usr/bin/env node
/**
 * Test script to verify full stack integration:
 * WS Server <-> tRPC Backend
 *
 * Run with: pnpm test-stack
 */

import { WebSocket } from "ws";

const WS_URL = "ws://localhost:8080";

async function testStack() {
  console.log("🧪 Testing WebSocket + tRPC Stack\n");

  // Test 1: Chrome client connects
  console.log("1️⃣  Testing Chrome client connection...");
  const chromeClient = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    chromeClient.on("open", () => {
      console.log("   ✅ Chrome client connected");
      chromeClient.send(
        JSON.stringify({ type: "register", clientType: "chrome" })
      );
    });

    chromeClient.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "registered") {
        console.log("   ✅ Chrome client registered\n");
        resolve();
      }
    });

    chromeClient.on("error", reject);
    setTimeout(() => reject(new Error("Timeout")), 5000);
  });

  // Test 2: VS Code client connects
  console.log("2️⃣  Testing VS Code client connection...");
  const vscodeClient = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    vscodeClient.on("open", () => {
      console.log("   ✅ VS Code client connected");
      vscodeClient.send(
        JSON.stringify({ type: "register", clientType: "vscode" })
      );
    });

    vscodeClient.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "registered") {
        console.log("   ✅ VS Code client registered\n");
        resolve();
      }
    });

    vscodeClient.on("error", reject);
    setTimeout(() => reject(new Error("Timeout")), 5000);
  });

  // Test 3: Chrome sends data to VS Code
  console.log("3️⃣  Testing Chrome → VS Code relay...");
  const dataReceived = new Promise<void>((resolve) => {
    vscodeClient.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chrome-data") {
        console.log("   ✅ VS Code received Chrome data");
        console.log(`   📦 Data:`, msg.data);
        resolve();
      }
    });
  });

  chromeClient.send(
    JSON.stringify({
      type: "chrome-data",
      data: {
        console: ["test log"],
        network: [],
        errors: [],
      },
    })
  );

  await dataReceived;
  console.log("\n");

  // Test 4: VS Code sends command to Chrome
  console.log("4️⃣  Testing VS Code → Chrome relay...");
  const commandReceived = new Promise<void>((resolve) => {
    chromeClient.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "vscode-command") {
        console.log("   ✅ Chrome received VS Code command");
        console.log(`   📦 Command:`, msg.command);
        resolve();
      }
    });
  });

  vscodeClient.send(
    JSON.stringify({
      type: "vscode-command",
      command: "pause",
    })
  );

  await commandReceived;
  console.log("\n");

  // Cleanup
  chromeClient.close();
  vscodeClient.close();

  console.log("✅ All tests passed!\n");
  process.exit(0);
}

testStack().catch((error) => {
  console.error("\n❌ Test failed:", error.message);
  process.exit(1);
});
