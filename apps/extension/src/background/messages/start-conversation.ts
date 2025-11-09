/**
 * Start Conversation Message Handler
 * 
 * Initiates a streaming conversation with the LLM
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import { conversationManager } from "../../background";

export interface StartConversationRequest {
	conversationId: string;
	prompt: string;
	tabId?: number;
}

const handler: PlasmoMessaging.MessageHandler<StartConversationRequest, void> = async (req, res) => {
	if (!req.body) {
		console.error("[Start Conversation] ❌ No request body");
		res.send();
		return;
	}

	// Get tab ID from request or sender
	const tabId = req.body.tabId || req.sender?.tab?.id;

	if (!tabId || typeof tabId !== "number") {
		console.error("[Start Conversation] ❌ No valid tab ID");
		res.send();
		return;
	}

	console.log(`[Start Conversation] 🚀 Starting: ${req.body.conversationId}`);

	await conversationManager.startConversation({
		conversationId: req.body.conversationId,
		prompt: req.body.prompt,
		tabId,
	});

	res.send();
};

export default handler;

