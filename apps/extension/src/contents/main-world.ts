import type { PlasmoCSConfig } from "plasmo";
import { initializeSecurityAnalysis, logAnalysisReport } from "@/contents-helpers/static-analysis";

/**
 * Configure which pages this content script should run on
 * Modify the matches array to target your desired websites
 */
export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end",
  world: "MAIN",
};

/**
 * Initialize static analysis on page load
 */
(async () => {
  try {
    console.log("[Security Analysis] Initializing...");

    // Initialize the security analysis library
    const securityAnalysis = initializeSecurityAnalysis({
      verbose: false, // Set to true for detailed logging
      minSeverity: undefined, // Show all findings
    });

    // Run initial analysis
    const report = await securityAnalysis.runAnalysis();

    // Log results to console
    logAnalysisReport(report);

    // Update the window object with the latest report
    if (window.__SECURITY_ANALYSIS__) {
      window.__SECURITY_ANALYSIS__.report = report;
    }

    // Log access instructions
    console.log(
      "%c[Security Analysis] ✅ Analysis complete!",
      "color: #10b981; font-weight: bold;"
    );
    console.log(
      "%cAccess results via: window.__SECURITY_ANALYSIS__",
      "color: #3b82f6; font-weight: bold;"
    );
    console.log("Available methods:");
    console.log("  - window.__SECURITY_ANALYSIS__.report           // View latest report");
    console.log("  - window.__SECURITY_ANALYSIS__.runAnalysis()    // Run analysis again");
    console.log("  - window.__SECURITY_ANALYSIS__.getCriticalFindings()  // Get critical issues");
    console.log(
      '  - window.__SECURITY_ANALYSIS__.getFindingsBySeverity("high")  // Filter by severity'
    );
  } catch (error) {
    console.error("[Security Analysis] Error:", error);
  }
})();