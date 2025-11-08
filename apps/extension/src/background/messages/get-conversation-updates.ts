/**
 * Get Conversation Updates Message Handler
 * 
 * Polls for new chunks from streaming conversation
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import { conversationManager } from "../conversation-manager";

export interface GetUpdatesRequest {
	conversationId: string;
}

export interface GetUpdatesResponse {
	chunks: Array<{ type: string; data: any; timestamp: number }>;
	status: "streaming" | "completed" | "error" | "aborted";
	fullText: string;
}

const handler: PlasmoMessaging.MessageHandler<GetUpdatesRequest, GetUpdatesResponse> = (req, res) => {
	if (!req.body?.conversationId) {
		res.send({
			chunks: [],
			status: "error",
			fullText: "",
		});
		return;
	}

	const updates = conversationManager.getUpdates(req.body.conversationId);

	if (!updates) {
		res.send({
			chunks: [],
			status: "error",
			fullText: "",
		});
		return;
	}

	res.send(updates);
};

export default handler;

