/**
 * Script Execution Result Message Handler
 * 
 * Content script sends execution results back to background.
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import { scriptExecutionManager } from "../../background/script-execution-manager";

export interface ConsoleLog {
	level: "log" | "warn" | "error";
	message: string;
	timestamp: number;
}

export interface ScriptExecutionResultRequest {
	id: string;
	result?: string;
	error?: string;
	logs?: ConsoleLog[];
}

export interface ScriptExecutionResultResponse {
	success: boolean;
}

const handler: PlasmoMessaging.MessageHandler<
	ScriptExecutionResultRequest,
	ScriptExecutionResultResponse
> = async (req, res) => {
	if (!req.body) {
		console.warn("[Script Execution Result] ⚠️ No request body");
		res.send({ success: false });
		return;
	}
	const { id, result, error, logs } = req.body;

	if (!id) {
		console.warn("[Script Execution Result] ⚠️ No execution ID in request");
		res.send({ success: false });
		return;
	}

	// Format result with logs
	let formattedResult = "";

	if (error) {
		// Execution failed
		formattedResult = `ERROR:\n${error}`;

		if (logs && logs.length > 0) {
			formattedResult += "\n\nConsole logs:\n";
			formattedResult += logs
				.map((log) => `[${log.level.toUpperCase()}] ${log.message}`)
				.join("\n");
		}

		const success = scriptExecutionManager.rejectScriptExecution(
			id,
			formattedResult
		);
		res.send({ success });
	} else if (result !== undefined) {
		// Execution succeeded
		formattedResult = result;

		if (logs && logs.length > 0) {
			formattedResult += "\n\nConsole logs:\n";
			formattedResult += logs
				.map((log) => `[${log.level.toUpperCase()}] ${log.message}`)
				.join("\n");
		}

		const success = scriptExecutionManager.resolveScriptExecution(
			id,
			formattedResult
		);
		res.send({ success });
	} else {
		console.warn(
			"[Script Execution Result] ⚠️ Neither result nor error provided"
		);
		res.send({ success: false });
	}
};

export default handler;

