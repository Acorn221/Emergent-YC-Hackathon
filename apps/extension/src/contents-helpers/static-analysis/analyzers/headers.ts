/**
 * Headers Analyzer
 * Checks for security-related HTTP headers and their configurations
 */

import type {
  IAnalyzer,
  AnalyzerResult,
  AnalyzerConfig,
  Finding,
} from "../types";
import { Severity } from "../types";

export class HeadersAnalyzer implements IAnalyzer {
  readonly name = "headers";
  readonly description = "Analyzes HTTP security headers";

  async analyze(config?: AnalyzerConfig): Promise<AnalyzerResult> {
    const startTime = performance.now();
    const findings: Finding[] = [];
    const errors: string[] = [];

    try {
      // Check meta tags for CSP
      const cspFindings = this.checkCSP();
      findings.push(...cspFindings);

      // Check for X-Frame-Options via meta tag
      const frameOptionsFindings = this.checkFrameOptions();
      findings.push(...frameOptionsFindings);

      // Check for secure context (HTTPS)
      const secureContextFindings = this.checkSecureContext();
      findings.push(...secureContextFindings);

      // Check referrer policy
      const referrerFindings = this.checkReferrerPolicy();
      findings.push(...referrerFindings);
    } catch (error) {
      errors.push(`Headers analysis error: ${error instanceof Error ? error.message : String(error)}`);
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

  private checkCSP(): Finding[] {
    const findings: Finding[] = [];
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');

    if (!cspMeta) {
      findings.push({
        id: "csp-missing",
        severity: Severity.HIGH,
        title: "Content Security Policy Not Found",
        description: "No Content-Security-Policy meta tag or header detected",
        recommendation: "Implement a Content Security Policy to prevent XSS and data injection attacks",
      });
    } else {
      const content = cspMeta.getAttribute("content") || "";
      
      // Check for unsafe-inline
      if (content.includes("unsafe-inline")) {
        findings.push({
          id: "csp-unsafe-inline",
          severity: Severity.MEDIUM,
          title: "CSP Contains 'unsafe-inline'",
          description: "The CSP allows inline scripts/styles which reduces security",
          location: "CSP meta tag",
          recommendation: "Use nonces or hashes instead of 'unsafe-inline'",
          metadata: { csp: content },
        });
      }

      // Check for unsafe-eval
      if (content.includes("unsafe-eval")) {
        findings.push({
          id: "csp-unsafe-eval",
          severity: Severity.MEDIUM,
          title: "CSP Contains 'unsafe-eval'",
          description: "The CSP allows eval() which can be dangerous",
          location: "CSP meta tag",
          recommendation: "Avoid using eval() and remove 'unsafe-eval' directive",
          metadata: { csp: content },
        });
      }
    }

    return findings;
  }

  private checkFrameOptions(): Finding[] {
    const findings: Finding[] = [];
    
    // Check if page can be framed
    if (window.self !== window.top) {
      findings.push({
        id: "frame-embedded",
        severity: Severity.INFO,
        title: "Page is Embedded in Frame",
        description: "This page is running inside a frame or iframe",
        recommendation: "Ensure X-Frame-Options or CSP frame-ancestors is properly configured",
      });
    }

    return findings;
  }

  private checkSecureContext(): Finding[] {
    const findings: Finding[] = [];

    if (!window.isSecureContext) {
      findings.push({
        id: "insecure-context",
        severity: Severity.CRITICAL,
        title: "Insecure Context (HTTP)",
        description: "Page is served over HTTP instead of HTTPS",
        location: window.location.href,
        recommendation: "Always use HTTPS to encrypt data in transit",
      });
    }

    return findings;
  }

  private checkReferrerPolicy(): Finding[] {
    const findings: Finding[] = [];
    const referrerMeta = document.querySelector('meta[name="referrer"]');

    if (!referrerMeta) {
      findings.push({
        id: "referrer-policy-missing",
        severity: Severity.LOW,
        title: "Referrer Policy Not Set",
        description: "No referrer policy meta tag found",
        recommendation: "Set a referrer policy to control referrer information leakage",
      });
    } else {
      const content = referrerMeta.getAttribute("content") || "";
      if (content === "unsafe-url" || content === "no-referrer-when-downgrade") {
        findings.push({
          id: "referrer-policy-weak",
          severity: Severity.LOW,
          title: "Weak Referrer Policy",
          description: `Referrer policy is set to '${content}' which may leak information`,
          recommendation: "Consider using 'strict-origin-when-cross-origin' or 'no-referrer'",
          metadata: { policy: content },
        });
      }
    }

    return findings;
  }
}
