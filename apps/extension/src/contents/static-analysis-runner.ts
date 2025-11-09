/**
 * Run Static Analysis Content Script
 * 
 * Runs in ISOLATED world where chrome APIs are available.
 * Executes static security analysis and returns results.
 */

import type { PlasmoCSConfig } from "plasmo";
import { runAnalysis } from "../contents-helpers/static-analysis";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	run_at: "document_end",
	all_frames: false,
};

// Listen for requests to run static analysis
// This runs in the ISOLATED world where we have access to chrome APIs
// and can import our modules properly
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "RUN_STATIC_ANALYSIS") {
		console.log("[Static Analysis Content] 🔒 Running analysis...");
		
		// Run analysis asynchronously
		runAnalysis()
			.then(report => {
				console.log(`[Static Analysis Content] ✅ Analysis complete. Found ${report.totalFindings} findings`);
				sendResponse({
					success: true,
					report,
				});
			})
			.catch(error => {
				console.error("[Static Analysis Content] ❌ Error:", error);
				sendResponse({
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			});
		
		// Return true to indicate we'll send response asynchronously
		return true;
	}
});

console.log("[Static Analysis Content] 📡 Listener registered");

