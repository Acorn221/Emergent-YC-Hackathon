/**
 * Scripts Analyzer
 * Checks for script security issues and integrity
 */

import type {
  IAnalyzer,
  AnalyzerResult,
  AnalyzerConfig,
  Finding,
} from "../types";
import { Severity } from "../types";

export class ScriptsAnalyzer implements IAnalyzer {
  readonly name = "scripts";
  readonly description = "Analyzes script tags and JavaScript security";

  async analyze(config?: AnalyzerConfig): Promise<AnalyzerResult> {
    const startTime = performance.now();
    const findings: Finding[] = [];
    const errors: string[] = [];

    try {
      // Check inline scripts
      const inlineScriptFindings = this.checkInlineScripts();
      findings.push(...inlineScriptFindings);

      // Check external scripts
      const externalScriptFindings = this.checkExternalScripts();
      findings.push(...externalScriptFindings);

      // Check for eval usage
      const evalFindings = this.checkEvalUsage();
      findings.push(...evalFindings);

      // Check for dangerous globals
      const globalFindings = this.checkDangerousGlobals();
      findings.push(...globalFindings);
    } catch (error) {
      errors.push(`Script analysis error: ${error instanceof Error ? error.message : String(error)}`);
    }

    const duration = performance.now() - startTime;

    return {
      analyzerName: this.name,
      timestamp: Date.now(),
      findings,
      hasErrors: errors.length > 0,
      errors: errors.length > 0 ? errors : undefined,
      duration,
    };
  }

  private checkInlineScripts(): Finding[] {
    const findings: Finding[] = [];
    const inlineScripts = document.querySelectorAll("script:not([src])");

    if (inlineScripts.length > 0) {
      findings.push({
        id: "inline-scripts-present",
        severity: Severity.LOW,
        title: "Inline Scripts Detected",
        description: `Found ${inlineScripts.length} inline script tag(s)`,
        recommendation: "Use external scripts with SRI for better security and CSP compatibility",
        metadata: { count: inlineScripts.length },
      });
    }

    // Check for inline event handlers
    const elementsWithHandlers = document.querySelectorAll(
      "[onclick], [onload], [onerror], [onmouseover]"
    );
    if (elementsWithHandlers.length > 0) {
      findings.push({
        id: "inline-event-handlers",
        severity: Severity.MEDIUM,
        title: "Inline Event Handlers Found",
        description: `Found ${elementsWithHandlers.length} element(s) with inline event handlers`,
        recommendation: "Use addEventListener instead of inline event handlers",
        metadata: { count: elementsWithHandlers.length },
      });
    }

    return findings;
  }

  private checkExternalScripts(): Finding[] {
    const findings: Finding[] = [];
    const externalScripts = document.querySelectorAll("script[src]");

    for (const script of Array.from(externalScripts)) {
      const src = script.getAttribute("src");
      const integrity = script.getAttribute("integrity");
      const crossorigin = script.getAttribute("crossorigin");

      if (!src) continue;

      // Check for missing SRI on external scripts
      if (this.isExternalDomain(src) && !integrity) {
        findings.push({
          id: `script-no-sri-${src}`,
          severity: Severity.MEDIUM,
          title: "External Script Without SRI",
          description: "External script loaded without Subresource Integrity check",
          location: src,
          recommendation: "Add integrity and crossorigin attributes to external scripts",
          metadata: { src },
        });
      }

      // Check for missing crossorigin with integrity
      if (integrity && !crossorigin) {
        findings.push({
          id: `script-integrity-no-cors-${src}`,
          severity: Severity.LOW,
          title: "Script Has Integrity But Missing CORS",
          description: "Script has integrity attribute but missing crossorigin",
          location: src,
          recommendation: "Add crossorigin='anonymous' attribute",
          metadata: { src },
        });
      }

      // Check for HTTP scripts on HTTPS page
      if (window.isSecureContext && src.startsWith("http:")) {
        findings.push({
          id: `script-mixed-content-${src}`,
          severity: Severity.CRITICAL,
          title: "Mixed Content: HTTP Script on HTTPS Page",
          description: "Loading script over HTTP on an HTTPS page",
          location: src,
          recommendation: "Use HTTPS for all script resources",
          metadata: { src },
        });
      }
    }

    return findings;
  }

  private checkEvalUsage(): Finding[] {
    const findings: Finding[] = [];

    // Check if eval is accessible
    try {
      if (typeof eval === "function") {
        findings.push({
          id: "eval-available",
          severity: Severity.INFO,
          title: "eval() Function Available",
          description: "The eval() function is available and could be exploited",
          recommendation: "Avoid using eval() and consider CSP to block it",
        });
      }
    } catch {
      // eval is blocked, which is good
    }

    // Check for Function constructor
    try {
      if (typeof Function === "function") {
        findings.push({
          id: "function-constructor-available",
          severity: Severity.INFO,
          title: "Function Constructor Available",
          description: "Function constructor can be used similarly to eval()",
          recommendation: "Be cautious with dynamic code execution",
        });
      }
    } catch {
      // Function constructor blocked
    }

    return findings;
  }

  private checkDangerousGlobals(): Finding[] {
    const findings: Finding[] = [];

    // Check for exposed API keys or secrets
    const dangerousPatterns = [
      { key: "apiKey", severity: Severity.CRITICAL },
      { key: "api_key", severity: Severity.CRITICAL },
      { key: "secretKey", severity: Severity.CRITICAL },
      { key: "secret_key", severity: Severity.CRITICAL },
      { key: "privateKey", severity: Severity.CRITICAL },
      { key: "accessToken", severity: Severity.HIGH },
      { key: "password", severity: Severity.CRITICAL },
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.key in window) {
        findings.push({
          id: `exposed-secret-${pattern.key}`,
          severity: pattern.severity,
          title: "Potential Secret Exposed in Global Scope",
          description: `Found '${pattern.key}' in window object`,
          location: "window." + pattern.key,
          recommendation: "Never expose secrets, API keys, or tokens in client-side code",
          metadata: { key: pattern.key },
        });
      }
    }

    return findings;
  }

  private isExternalDomain(src: string): boolean {
    try {
      if (src.startsWith("//")) {
        src = window.location.protocol + src;
      }
      if (!src.startsWith("http")) {
        return false; // Relative URL
      }
      const url = new URL(src);
      return url.hostname !== window.location.hostname;
    } catch {
      return false;
    }
  }
}
