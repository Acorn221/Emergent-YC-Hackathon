/**
 * Static Analysis Types
 * Core type definitions for the extensible static analysis library
 */

/**
 * Severity levels for security issues
 */
export enum Severity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

/**
 * Individual analysis finding
 */
export interface Finding {
  /** Unique identifier for the finding type */
  id: string;
  /** Severity level */
  severity: Severity;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Where the issue was found */
  location?: string;
  /** Recommendation to fix */
  recommendation?: string;
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Result from a single analyzer
 */
export interface AnalyzerResult {
  /** Name of the analyzer */
  analyzerName: string;
  /** Timestamp when analysis was performed */
  timestamp: number;
  /** List of findings */
  findings: Finding[];
  /** Whether the analyzer encountered errors */
  hasErrors: boolean;
  /** Error messages if any */
  errors?: string[];
  /** Analysis duration in milliseconds */
  duration: number;
}

/**
 * Configuration for an analyzer
 */
export interface AnalyzerConfig {
  /** Whether the analyzer is enabled */
  enabled: boolean;
  /** Custom options for the analyzer */
  options?: Record<string, unknown>;
}

/**
 * Global configuration for static analysis
 */
export interface StaticAnalysisConfig {
  /** Enable/disable specific analyzers */
  analyzers?: Record<string, AnalyzerConfig>;
  /** Minimum severity to report */
  minSeverity?: Severity;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Complete analysis report
 */
export interface AnalysisReport {
  /** Timestamp when analysis started */
  timestamp: number;
  /** URL of the analyzed page */
  url: string;
  /** Results from all analyzers */
  results: AnalyzerResult[];
  /** Total findings count */
  totalFindings: number;
  /** Findings grouped by severity */
  findingsBySeverity: Record<Severity, number>;
  /** Total analysis duration */
  totalDuration: number;
  /** Configuration used */
  config: StaticAnalysisConfig;
}

/**
 * Base interface that all analyzers must implement
 */
export interface IAnalyzer {
  /** Unique name for the analyzer */
  readonly name: string;
  /** Description of what the analyzer checks */
  readonly description: string;
  /** Run the analysis */
  analyze(config?: AnalyzerConfig): Promise<AnalyzerResult>;
}

/**
 * Window interface extension for global access
 */
export interface SecurityAnalysisWindow {
  /** Latest analysis report */
  report: AnalysisReport | null;
  /** Run analysis manually */
  runAnalysis: (config?: StaticAnalysisConfig) => Promise<AnalysisReport>;
  /** Get findings by severity */
  getFindingsBySeverity: (severity: Severity) => Finding[];
  /** Get all critical and high severity findings */
  getCriticalFindings: () => Finding[];
  /** Configuration */
  config: StaticAnalysisConfig;
}

declare global {
  interface Window {
    __SECURITY_ANALYSIS__?: SecurityAnalysisWindow;
  }
}
