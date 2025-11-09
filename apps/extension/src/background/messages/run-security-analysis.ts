import type { PlasmoMessaging } from "@plasmohq/messaging";
import type { Severity } from "../../utils/secshield-sdk";

export interface RunSecurityAnalysisRequest {
	tabId?: number;
	config?: {
		verbose?: boolean;
		minSeverity?: Severity;
		analyzers?: {
			headers?: { enabled: boolean };
			cookies?: { enabled: boolean };
			scripts?: { enabled: boolean };
			forms?: { enabled: boolean };
			storage?: { enabled: boolean };
		};
	};
}

export interface SecurityFinding {
	id: string;
	severity: Severity;
	title: string;
	description: string;
	location?: string;
	recommendation?: string;
	metadata?: Record<string, any>;
}

export interface AnalyzerResult {
	analyzerName: string;
	timestamp: number;
	findings: SecurityFinding[];
	hasErrors: boolean;
	duration: number;
	error?: string;
}

export interface SecurityAnalysisReport {
	url: string;
	timestamp: number;
	results: AnalyzerResult[];
	totalFindings: number;
	totalDuration: number;
	findingsBySeverity: Record<Severity, number>;
}

export interface RunSecurityAnalysisResponse {
	success: boolean;
	message: string;
	report?: SecurityAnalysisReport;
	error?: string;
}

const handler: PlasmoMessaging.MessageHandler<
	RunSecurityAnalysisRequest,
	RunSecurityAnalysisResponse
> = async (req, res) => {
	const { tabId, config } = req.body || {};

	console.log(
		`[run-security-analysis] 🔒 Running security analysis`,
		{ tabId, config },
	);

	try {
		// Determine which tab to analyze
		let targetTabId = tabId;
		if (!targetTabId) {
			// Use active tab if not specified
			const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!activeTab?.id) {
				return res.send({
					success: false,
					message: "No active tab found",
				});
			}
			targetTabId = activeTab.id;
		}

		// Inject and execute the static analysis script
		const results = await chrome.scripting.executeScript({
			target: { tabId: targetTabId },
			func: async (configStr: string) => {
				const config = JSON.parse(configStr);

				// Import the static analysis library
				// Note: This assumes the library is available in the content script context
				// You may need to inject it first
				const { runAnalysis } = await import(
					/* @vite-ignore */
					chrome.runtime.getURL("contents-helpers/static-analysis/index.ts")
				);

				// Run the analysis
				const report = await runAnalysis(config);
				return report;
			},
			args: [JSON.stringify(config || {})],
		});

		if (!results || results.length === 0 || !results[0]) {
			return res.send({
				success: false,
				message: "Failed to execute security analysis script",
			});
		}

		const report = results[0].result as SecurityAnalysisReport;

		console.log(
			`[run-security-analysis] ✅ Analysis complete. Found ${report.totalFindings} findings`,
		);

		res.send({
			success: true,
			message: `Security analysis completed. Found ${report.totalFindings} findings.`,
			report,
		});
	} catch (error) {
		console.error("[run-security-analysis] ❌ Error running security analysis:", error);
		res.send({
			success: false,
			message: `Failed to run security analysis: ${error instanceof Error ? error.message : String(error)}`,
			error: error instanceof Error ? error.message : String(error),
		});
	}
};

export default handler;

