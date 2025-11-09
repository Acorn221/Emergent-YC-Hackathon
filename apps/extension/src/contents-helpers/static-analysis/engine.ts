/**
 * Static Analysis Engine
 * Core engine for running analyzers and aggregating results
 */

import type {
  IAnalyzer,
  AnalysisReport,
  AnalyzerResult,
  StaticAnalysisConfig,
  AnalyzerConfig,
  Finding,
} from "./types";
import { Severity } from "./types";

/**
 * Analyzer Registry
 * Manages registration and retrieval of analyzers
 */
export class AnalyzerRegistry {
  private analyzers: Map<string, IAnalyzer> = new Map();

  /**
   * Register a new analyzer
   */
  register(analyzer: IAnalyzer): void {
    if (this.analyzers.has(analyzer.name)) {
      console.warn(`Analyzer '${analyzer.name}' is already registered. Overwriting.`);
    }
    this.analyzers.set(analyzer.name, analyzer);
  }

  /**
   * Unregister an analyzer
   */
  unregister(name: string): boolean {
    return this.analyzers.delete(name);
  }

  /**
   * Get an analyzer by name
   */
  get(name: string): IAnalyzer | undefined {
    return this.analyzers.get(name);
  }

  /**
   * Get all registered analyzers
   */
  getAll(): IAnalyzer[] {
    return Array.from(this.analyzers.values());
  }

  /**
   * Get all analyzer names
   */
  getNames(): string[] {
    return Array.from(this.analyzers.keys());
  }

  /**
   * Clear all analyzers
   */
  clear(): void {
    this.analyzers.clear();
  }
}

/**
 * Main Static Analyzer
 * Orchestrates analysis across all registered analyzers
 */
export class StaticAnalyzer {
  private registry: AnalyzerRegistry;
  private config: StaticAnalysisConfig;

  constructor(config?: StaticAnalysisConfig) {
    this.registry = new AnalyzerRegistry();
    this.config = config || {};
  }

  /**
   * Register an analyzer
   */
  register(analyzer: IAnalyzer): void {
    this.registry.register(analyzer);
  }

  /**
   * Unregister an analyzer
   */
  unregister(name: string): boolean {
    return this.registry.unregister(name);
  }

  /**
   * Get all registered analyzers
   */
  getAnalyzers(): IAnalyzer[] {
    return this.registry.getAll();
  }

  /**
   * Run analysis with all registered analyzers
   */
  async analyze(config?: StaticAnalysisConfig): Promise<AnalysisReport> {
    const startTime = performance.now();
    const mergedConfig = { ...this.config, ...config };
    const results: AnalyzerResult[] = [];

    // Get all analyzers
    const analyzers = this.registry.getAll();

    if (mergedConfig.verbose) {
      console.log(`[StaticAnalyzer] Running ${analyzers.length} analyzer(s)...`);
    }

    // Run each analyzer
    for (const analyzer of analyzers) {
      const analyzerConfig = this.getAnalyzerConfig(analyzer.name, mergedConfig);

      // Skip if disabled
      if (analyzerConfig && !analyzerConfig.enabled) {
        if (mergedConfig.verbose) {
          console.log(`[StaticAnalyzer] Skipping disabled analyzer: ${analyzer.name}`);
        }
        continue;
      }

      try {
        if (mergedConfig.verbose) {
          console.log(`[StaticAnalyzer] Running analyzer: ${analyzer.name}`);
        }

        const result = await analyzer.analyze(analyzerConfig);
        results.push(result);

        if (mergedConfig.verbose) {
          console.log(
            `[StaticAnalyzer] ${analyzer.name} completed in ${result.duration.toFixed(2)}ms with ${result.findings.length} finding(s)`
          );
        }
      } catch (error) {
        console.error(`[StaticAnalyzer] Error running analyzer '${analyzer.name}':`, error);
        results.push({
          analyzerName: analyzer.name,
          timestamp: Date.now(),
          findings: [],
          hasErrors: true,
          errors: [error instanceof Error ? error.message : String(error)],
          duration: 0,
        });
      }
    }

    const duration = performance.now() - startTime;

    // Aggregate results
    const report = this.aggregateResults(results, mergedConfig, duration);

    if (mergedConfig.verbose) {
      console.log(
        `[StaticAnalyzer] Analysis complete in ${duration.toFixed(2)}ms. Total findings: ${report.totalFindings}`
      );
    }

    return report;
  }

  /**
   * Get configuration for a specific analyzer
   */
  private getAnalyzerConfig(
    analyzerName: string,
    config: StaticAnalysisConfig
  ): AnalyzerConfig | undefined {
    if (!config.analyzers) return undefined;
    return config.analyzers[analyzerName];
  }

  /**
   * Aggregate results from all analyzers into a single report
   */
  private aggregateResults(
    results: AnalyzerResult[],
    config: StaticAnalysisConfig,
    duration: number
  ): AnalysisReport {
    const allFindings: Finding[] = [];
    const findingsBySeverity: Record<Severity, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
      [Severity.INFO]: 0,
    };

    // Collect all findings
    for (const result of results) {
      for (const finding of result.findings) {
        // Filter by minimum severity if configured
        if (config.minSeverity && !this.meetsMinSeverity(finding.severity, config.minSeverity)) {
          continue;
        }

        allFindings.push(finding);
        findingsBySeverity[finding.severity]++;
      }
    }

    return {
      timestamp: Date.now(),
      url: window.location.href,
      results,
      totalFindings: allFindings.length,
      findingsBySeverity,
      totalDuration: duration,
      config,
    };
  }

  /**
   * Check if a finding severity meets the minimum threshold
   */
  private meetsMinSeverity(severity: Severity, minSeverity: Severity): boolean {
    const severityOrder = [
      Severity.INFO,
      Severity.LOW,
      Severity.MEDIUM,
      Severity.HIGH,
      Severity.CRITICAL,
    ];

    const severityIndex = severityOrder.indexOf(severity);
    const minSeverityIndex = severityOrder.indexOf(minSeverity);

    return severityIndex >= minSeverityIndex;
  }

  /**
   * Update configuration
   */
  setConfig(config: StaticAnalysisConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): StaticAnalysisConfig {
    return { ...this.config };
  }
}
