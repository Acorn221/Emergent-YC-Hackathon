import type { PlasmoCSConfig } from "plasmo";
import { initializeSecurityAnalysis } from "../contents-helpers/static-analysis";

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

// Initialize static security analysis and make it available globally
try {
  const securityAnalysis = initializeSecurityAnalysis();
  console.log("🔒 Security analysis initialized. Access via window.__SECURITY_ANALYSIS__");
} catch (error) {
  console.error("Failed to initialize security analysis:", error);
}

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
