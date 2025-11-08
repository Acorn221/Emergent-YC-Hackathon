import type { PlasmoCSConfig } from "plasmo";

/**
 * Configure which pages this content script should run on
 * Modify the matches array to target your desired websites
 */
export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end",
};

/**
 * Example content script that runs on web pages
 * Add your custom DOM manipulation or page interaction logic here
 */
console.log("Content script loaded!");

// Example: Listen for messages from the background script
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   console.log("Message received in content script:", request);
//   sendResponse({ received: true });
// });

// Example: Send a message to the background script
// chrome.runtime.sendMessage({ type: "CONTENT_LOADED" }, (response) => {
//   console.log("Response from background:", response);
// });

// Example: Modify the DOM
// document.body.style.border = "5px solid red";
