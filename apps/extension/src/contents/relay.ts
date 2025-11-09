import type { PlasmoCSConfig } from "plasmo";
import { relayMessage } from "@plasmohq/messaging";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	run_at: "document_start",
	all_frames: true,
};

// Relay messages from MAIN world content scripts to background
relayMessage({
	name: "cache-network",
});

relayMessage({
	name: "start-conversation",
});

relayMessage({
	name: "get-conversation-updates",
});

relayMessage({
	name: "abort-conversation",
});

relayMessage({
	name: "get-pending-script",
});

relayMessage({
	name: "script-execution-result",
});

relayMessage({
	name: "run-static-analysis",
});
