/**
 * Get Pending Script Message Handler
 * 
 * Content script polls this handler for pending JavaScript executions.
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import { scriptExecutionManager } from "../../background/script-execution-manager";

export interface GetPendingScriptRequest { }

export interface GetPendingScriptResponse {
	id: string | null;
	code: string | null;
}

const handler: PlasmoMessaging.MessageHandler<
	GetPendingScriptRequest,
	GetPendingScriptResponse
> = async (req, res) => {
	const tabId = req.sender?.tab?.id;

	if (!tabId) {
		console.warn("[Get Pending Script] ⚠️ No tab ID in request");
		res.send({ id: null, code: null });
		return;
	}

	// Get next pending script for this tab
	const pending = scriptExecutionManager.getPendingScript(tabId);

	if (pending) {
		res.send({ id: pending.id, code: pending.code });
	} else {
		res.send({ id: null, code: null });
	}
};

export default handler;

