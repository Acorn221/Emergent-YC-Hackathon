/**
 * Static Analysis Library - Usage Examples
 * 
 * This file demonstrates various ways to use the static analysis library.
 * These examples can be run in the browser console or integrated into your extension.
 */

import {
  runAnalysis,
  createStaticAnalyzer,
  initializeSecurityAnalysis,
  logAnalysisReport,
  Severity,
  type IAnalyzer,
  type AnalyzerResult,
  type AnalyzerConfig,
  type Finding,
} from "./index";

/**
 * Example 1: Basic Usage - Run analysis with defaults
 */
export async function example1_basicUsage() {
  console.log("=== Example 1: Basic Usage ===");
  
  // Run analysis with all default analyzers
  const report = await runAnalysis();
  
  // Log formatted report to console
  logAnalysisReport(report);
  
  return report;
}

/**
 * Example 2: Custom Configuration - Filter by severity
 */
export async function example2_customConfiguration() {
  console.log("=== Example 2: Custom Configuration ===");
  
  // Only show high and critical findings
  const report = await runAnalysis({
    verbose: true,
    minSeverity: Severity.HIGH,
  });
  
  console.log(`Found ${report.totalFindings} high/critical issues`);
  return report;
}

/**
 * Example 3: Selective Analyzers - Disable specific analyzers
 */
export async function example3_selectiveAnalyzers() {
  console.log("=== Example 3: Selective Analyzers ===");
  
  // Run only headers and scripts analyzers
  const report = await runAnalysis({
    analyzers: {
      headers: { enabled: true },
      scripts: { enabled: true },
      cookies: { enabled: false },
      forms: { enabled: false },
      storage: { enabled: false },
    },
  });
  
  console.log(`Ran ${report.results.length} analyzer(s)`);
  return report;
}

/**
 * Example 4: Window Integration - Use global API
 */
export async function example4_windowIntegration() {
  console.log("=== Example 4: Window Integration ===");
  
  // Initialize and inject into window
  const securityAnalysis = initializeSecurityAnalysis({
    verbose: false,
  });
  
  // Run analysis
  await securityAnalysis.runAnalysis();
  
  // Access via window
  console.log("Access via: window.__SECURITY_ANALYSIS__");
  
  // Get critical findings
  const critical = securityAnalysis.getCriticalFindings();
  console.log(`Found ${critical.length} critical findings`);
  
  return critical;
}

/**
 * Example 5: Custom Analyzer - Create your own analyzer
 */
export class CustomDOMAnalyzer implements IAnalyzer {
  readonly name = "dom";
  readonly description = "Analyzes DOM structure for security issues";

  async analyze(config?: AnalyzerConfig): Promise<AnalyzerResult> {
    const startTime = performance.now();
    const findings: Finding[] = [];

    // Check for dangerous innerHTML usage indicators
    const scriptsWithInnerHTML = document.querySelectorAll("script");
    for (const script of Array.from(scriptsWithInnerHTML)) {
      if (script.textContent?.includes("innerHTML")) {
        findings.push({
          id: "dom-innerhtml-usage",
          severity: Severity.MEDIUM,
          title: "Potential innerHTML Usage in Scripts",
          description: "Script contains innerHTML which may be vulnerable to XSS",
          recommendation: "Use textContent or DOM methods instead of innerHTML",
          metadata: { scriptSrc: script.src || "inline" },
        });
      }
    }

    // Check for iframe sandboxing
    const iframes = document.querySelectorAll("iframe");
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      const sandbox = iframe.getAttribute("sandbox");
      
      if (!sandbox) {
        findings.push({
          id: `dom-iframe-no-sandbox-${i}`,
          severity: Severity.MEDIUM,
          title: "Iframe Without Sandbox",
          description: "Iframe does not have sandbox attribute",
          location: iframe.src || `iframe-${i}`,
          recommendation: "Add sandbox attribute to restrict iframe capabilities",
        });
      }
    }

    // Check for target="_blank" without rel="noopener noreferrer"
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    for (let i = 0; i < externalLinks.length; i++) {
      const link = externalLinks[i] as HTMLAnchorElement;
      const rel = link.getAttribute("rel") || "";
      
      if (!rel.includes("noopener") || !rel.includes("noreferrer")) {
        findings.push({
          id: `dom-link-tabnabbing-${i}`,
          severity: Severity.LOW,
          title: "Link Vulnerable to Tabnabbing",
          description: "External link with target='_blank' missing rel='noopener noreferrer'",
          location: link.href,
          recommendation: "Add rel='noopener noreferrer' to prevent tabnabbing attacks",
        });
      }
    }

    return {
      analyzerName: this.name,
      timestamp: Date.now(),
      findings,
      hasErrors: false,
      duration: performance.now() - startTime,
    };
  }
}

export async function example5_customAnalyzer() {
  console.log("=== Example 5: Custom Analyzer ===");
  
  // Create analyzer instance
  const analyzer = createStaticAnalyzer();
  
  // Register custom analyzer
  analyzer.register(new CustomDOMAnalyzer());
  
  // Run analysis (includes custom analyzer)
  const report = await analyzer.analyze();
  
  // Find results from our custom analyzer
  const domResults = report.results.find(r => r.analyzerName === "dom");
  console.log(`Custom analyzer found ${domResults?.findings.length || 0} issues`);
  
  return report;
}

/**
 * Example 6: Filtering Results - Work with analysis results
 */
export async function example6_filteringResults() {
  console.log("=== Example 6: Filtering Results ===");
  
  // Run analysis
  const report = await runAnalysis();
  
  // Get all critical findings
  const criticalFindings: Finding[] = [];
  for (const result of report.results) {
    for (const finding of result.findings) {
      if (finding.severity === Severity.CRITICAL) {
        criticalFindings.push(finding);
      }
    }
  }
  
  console.log(`Critical findings: ${criticalFindings.length}`);
  
  // Group findings by analyzer
  const byAnalyzer = new Map<string, Finding[]>();
  for (const result of report.results) {
    byAnalyzer.set(result.analyzerName, result.findings);
  }
  
  console.log("Findings by analyzer:");
  for (const [name, findings] of byAnalyzer.entries()) {
    console.log(`  ${name}: ${findings.length} findings`);
  }
  
  return { criticalFindings, byAnalyzer };
}

/**
 * Example 7: Re-run Analysis - Monitor changes over time
 */
export async function example7_monitorChanges() {
  console.log("=== Example 7: Monitor Changes ===");
  
  // Initial analysis
  const report1 = await runAnalysis();
  console.log(`Initial: ${report1.totalFindings} findings`);
  
  // Simulate waiting for page changes
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Re-run analysis
  const report2 = await runAnalysis();
  console.log(`After changes: ${report2.totalFindings} findings`);
  
  // Compare
  const difference = report2.totalFindings - report1.totalFindings;
  console.log(`Difference: ${difference > 0 ? '+' : ''}${difference} findings`);
  
  return { before: report1, after: report2 };
}

/**
 * Example 8: Export Results - Save analysis for later
 */
export async function example8_exportResults() {
  console.log("=== Example 8: Export Results ===");
  
  // Run analysis
  const report = await runAnalysis();
  
  // Convert to JSON
  const json = JSON.stringify(report, null, 2);
  
  // Create downloadable blob
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  console.log("Report exported to JSON");
  console.log(`Size: ${(json.length / 1024).toFixed(2)} KB`);
  
  // In browser, you could trigger download:
  // const a = document.createElement('a');
  // a.href = url;
  // a.download = `security-analysis-${Date.now()}.json`;
  // a.click();
  
  return { json, url };
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log("\n🔒 Static Analysis Library - Examples\n");
  
  await example1_basicUsage();
  await example2_customConfiguration();
  await example3_selectiveAnalyzers();
  await example4_windowIntegration();
  await example5_customAnalyzer();
  await example6_filteringResults();
  await example7_monitorChanges();
  await example8_exportResults();
  
  console.log("\n✅ All examples completed!\n");
}

// Export for use in browser console
if (typeof window !== "undefined") {
  (window as any).StaticAnalysisExamples = {
    example1_basicUsage,
    example2_customConfiguration,
    example3_selectiveAnalyzers,
    example4_windowIntegration,
    example5_customAnalyzer,
    example6_filteringResults,
    example7_monitorChanges,
    example8_exportResults,
    runAllExamples,
  };
  
  console.log(
    "%c💡 Examples loaded! Access via: window.StaticAnalysisExamples",
    "color: #10b981; font-weight: bold;"
  );
}
