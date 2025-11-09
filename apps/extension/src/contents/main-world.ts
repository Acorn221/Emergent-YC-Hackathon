import type { PlasmoCSConfig } from "plasmo";

/**
 * Configure which pages this content script should run on
 * Modify the matches array to target your desired websites
 */
export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	run_at: "document_end",
	world: "MAIN"
};