/**
 * Abort Conversation Message Handler
 * 
 * Cancels an active streaming conversation
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import { conversationManager } from "../../background";

export interface AbortConversationRequest {
	conversationId: string;
}

const handler: PlasmoMessaging.MessageHandler<AbortConversationRequest, void> = (req, res) => {
	if (!req.body?.conversationId) {
		console.error("[Abort Conversation] ❌ No conversation ID");
		res.send();
		return;
	}

	console.log(`[Abort Conversation] 🛑 Aborting: ${req.body.conversationId}`);
	conversationManager.abort(req.body.conversationId);

	res.send();
};

export default handler;

