import { Storage } from "@plasmohq/storage";
import browser from "webextension-polyfill";
import type { AppRouter } from "@acme/api";
import superjson from "superjson";
import { createTRPCClient, httpBatchLink } from '@trpc/client';

// Initialize webRequest listeners for header capture
import "./webrequest-listener";

const API_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000/api/trpc";

const storage = new Storage({
  area: "sync",
});

let cachedTRPCClient: Awaited<ReturnType<typeof createTRPCClient<AppRouter>>> | null = null;

/**
 * Get a cached tRPC client instance for making API calls
 */
export const getTRPCClient = async () => {
  if (cachedTRPCClient) {
    return cachedTRPCClient;
  }
  cachedTRPCClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: API_URL,
        transformer: superjson,
        headers: {
          'x-trpc-source': 'extension',
        }
      }),
    ],
  });
  return cachedTRPCClient;
};

export type TRPCtype = Awaited<ReturnType<typeof getTRPCClient>>;

/**
 * Listen for extension lifecycle events
 */
browser.runtime.onInstalled.addListener((object) => {
  (async () => {
    if (object.reason === "install") {
      console.log("Extension installed");
      // Add your install logic here
      // Example: open a welcome page
      // await browser.tabs.create({ url: "https://yourwebsite.com/welcome" });
    } else if (object.reason === "update") {
      console.log("Extension updated to version:", browser.runtime.getManifest().version);
      // Add your update logic here
    }
  })().catch(e => console.error(e));
});

/**
 * Example: Listen for messages from content scripts
 */
// browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   console.log("Message received in background:", request);
//   sendResponse({ received: true });
// });
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
