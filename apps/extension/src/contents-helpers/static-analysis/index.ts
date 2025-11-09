/**
 * Static Analysis Library - Main Export
 * Type-safe extensible static analysis for frontend security checks
 */

import { StaticAnalyzer } from "./engine";
import { HeadersAnalyzer } from "./analyzers/headers";
import { CookiesAnalyzer } from "./analyzers/cookies";
import { ScriptsAnalyzer } from "./analyzers/scripts";
import { FormsAnalyzer } from "./analyzers/forms";
import { StorageAnalyzer } from "./analyzers/storage";

import type {
  AnalysisReport,
  StaticAnalysisConfig,
  Finding,
  SecurityAnalysisWindow,
} from "./types";
import { Severity } from "./types";

// Export types
export type {
  IAnalyzer,
  AnalyzerResult,
  AnalyzerConfig,
  Finding,
  AnalysisReport,
  StaticAnalysisConfig,
  SecurityAnalysisWindow,
} from "./types";
export { Severity } from "./types";

// Export analyzers for custom usage
export { HeadersAnalyzer } from "./analyzers/headers";
export { CookiesAnalyzer } from "./analyzers/cookies";
export { ScriptsAnalyzer } from "./analyzers/scripts";
export { FormsAnalyzer } from "./analyzers/forms";
export { StorageAnalyzer } from "./analyzers/storage";

// Export engine
export { StaticAnalyzer, AnalyzerRegistry } from "./engine";

/**
 * Create and configure a static analyzer with default analyzers
 */
export function createStaticAnalyzer(config?: StaticAnalysisConfig): StaticAnalyzer {
  const analyzer = new StaticAnalyzer(config);

  // Register default analyzers
  analyzer.register(new HeadersAnalyzer());
  analyzer.register(new CookiesAnalyzer());
  analyzer.register(new ScriptsAnalyzer());
  analyzer.register(new FormsAnalyzer());
  analyzer.register(new StorageAnalyzer());

  return analyzer;
}

/**
 * Run analysis with default configuration
 */
export async function runAnalysis(config?: StaticAnalysisConfig): Promise<AnalysisReport> {
  const analyzer = createStaticAnalyzer(config);
  return analyzer.analyze();
}

/**
 * Initialize the static analysis library and inject into window
 */
export function initializeSecurityAnalysis(config?: StaticAnalysisConfig): SecurityAnalysisWindow {
  const analyzer = createStaticAnalyzer(config);
  let latestReport: AnalysisReport | null = null;

  /**
   * Run analysis and update latest report
   */
  const runAnalysis = async (customConfig?: StaticAnalysisConfig): Promise<AnalysisReport> => {
    const report = await analyzer.analyze(customConfig);
    latestReport = report;
    return report;
  };

  /**
   * Get findings filtered by severity
   */
  const getFindingsBySeverity = (severity: Severity): Finding[] => {
    if (!latestReport) return [];

    const findings: Finding[] = [];
    for (const result of latestReport.results) {
      for (const finding of result.findings) {
        if (finding.severity === severity) {
          findings.push(finding);
        }
      }
    }
    return findings;
  };

  /**
   * Get all critical and high severity findings
   */
  const getCriticalFindings = (): Finding[] => {
    if (!latestReport) return [];

    const findings: Finding[] = [];
    for (const result of latestReport.results) {
      for (const finding of result.findings) {
        if (finding.severity === Severity.CRITICAL || finding.severity === Severity.HIGH) {
          findings.push(finding);
        }
      }
    }
    return findings;
  };

  // Create the window interface
  const securityAnalysis: SecurityAnalysisWindow = {
    report: latestReport,
    runAnalysis,
    getFindingsBySeverity,
    getCriticalFindings,
    config: config || {},
  };

  // Inject into window
  if (typeof window !== "undefined") {
    window.__SECURITY_ANALYSIS__ = securityAnalysis;
  }

  return securityAnalysis;
}

/**
 * Quick helper to log analysis results to console
 */
export function logAnalysisReport(report: AnalysisReport): void {
  console.group("🔒 Security Analysis Report");
  console.log(`URL: ${report.url}`);
  console.log(`Timestamp: ${new Date(report.timestamp).toISOString()}`);
  console.log(`Duration: ${report.totalDuration.toFixed(2)}ms`);
  console.log(`Total Findings: ${report.totalFindings}`);
  console.log("\nFindings by Severity:");
  console.log(`  🔴 Critical: ${report.findingsBySeverity[Severity.CRITICAL]}`);
  console.log(`  🟠 High: ${report.findingsBySeverity[Severity.HIGH]}`);
  console.log(`  🟡 Medium: ${report.findingsBySeverity[Severity.MEDIUM]}`);
  console.log(`  🟢 Low: ${report.findingsBySeverity[Severity.LOW]}`);
  console.log(`  ℹ️  Info: ${report.findingsBySeverity[Severity.INFO]}`);

  // Log detailed findings
  for (const result of report.results) {
    if (result.findings.length > 0) {
      console.group(`\n${result.analyzerName} (${result.findings.length} findings)`);
      for (const finding of result.findings) {
        const severityIcon = {
          [Severity.CRITICAL]: "🔴",
          [Severity.HIGH]: "🟠",
          [Severity.MEDIUM]: "🟡",
          [Severity.LOW]: "🟢",
          [Severity.INFO]: "ℹ️",
        };
        console.log(`${severityIcon[finding.severity]} ${finding.title}`);
        console.log(`  ${finding.description}`);
        if (finding.location) {
          console.log(`  Location: ${finding.location}`);
        }
        if (finding.recommendation) {
          console.log(`  💡 ${finding.recommendation}`);
        }
      }
      console.groupEnd();
    }
  }

  console.groupEnd();
}

// Default export
export default {
  createStaticAnalyzer,
  runAnalysis,
  initializeSecurityAnalysis,
  logAnalysisReport,
  Severity,
};
