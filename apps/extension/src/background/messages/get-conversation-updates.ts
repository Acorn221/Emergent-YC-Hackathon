/**
 * Get Conversation Updates Message Handler
 * 
 * Polls for new chunks from streaming conversation
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import { conversationManager } from "../conversation-manager";
import type { StreamChunk } from "../conversation-manager";

export interface GetUpdatesRequest {
	conversationId: string;
}

export interface GetUpdatesResponse {
	chunks: StreamChunk[];
	status: "streaming" | "completed" | "error" | "aborted";
	fullText: string;
	scanId?: string;
	vulnerabilityCount?: number;
}

const handler: PlasmoMessaging.MessageHandler<GetUpdatesRequest, GetUpdatesResponse> = (req, res) => {
	if (!req.body?.conversationId) {
		console.warn("[Get Updates] ❌ No conversation ID provided");
		res.send({
			chunks: [],
			status: "error",
			fullText: "",
		});
		return;
	}

	const updates = conversationManager.getUpdates(req.body.conversationId);

	if (!updates) {
		console.warn(`[Get Updates] ⚠️ No conversation found for ID: ${req.body.conversationId}`);
		res.send({
			chunks: [],
			status: "error",
			fullText: "",
		});
		return;
	}

	console.log(
		`[Get Updates] 📤 Sending ${updates.chunks.length} chunks, status: ${updates.status}, fullText length: ${updates.fullText.length}`
	);
	
	if (updates.chunks.length > 0) {
		console.log(`[Get Updates] 📋 Chunk types:`, updates.chunks.map(c => c.type));
	}

	res.send(updates);
};

export default handler;
