/**
 * Cookies Analyzer
 * Checks cookie security attributes and configurations
 */

import type {
  IAnalyzer,
  AnalyzerResult,
  AnalyzerConfig,
  Finding,
} from "../types";
import { Severity } from "../types";

interface CookieInfo {
  name: string;
  value: string;
  hasSecure: boolean;
  hasHttpOnly: boolean;
  hasSameSite: boolean;
  sameSiteValue?: string;
}

export class CookiesAnalyzer implements IAnalyzer {
  readonly name = "cookies";
  readonly description = "Analyzes cookie security attributes";

  async analyze(config?: AnalyzerConfig): Promise<AnalyzerResult> {
    const startTime = performance.now();
    const findings: Finding[] = [];
    const errors: string[] = [];

    try {
      const cookies = this.parseCookies();

      if (cookies.length === 0) {
        findings.push({
          id: "no-cookies",
          severity: Severity.INFO,
          title: "No Cookies Found",
          description: "No cookies are set for this domain",
        });
      } else {
        // Check each cookie for security attributes
        for (const cookie of cookies) {
          const cookieFindings = this.analyzeCookie(cookie);
          findings.push(...cookieFindings);
        }
      }
    } catch (error) {
      errors.push(`Cookie analysis error: ${error instanceof Error ? error.message : String(error)}`);
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

  private parseCookies(): CookieInfo[] {
    const cookies: CookieInfo[] = [];
    const cookieString = document.cookie;

    if (!cookieString) return cookies;

    const cookiePairs = cookieString.split(";");
    for (const pair of cookiePairs) {
      const [name, ...valueParts] = pair.trim().split("=");
      if (name) {
        cookies.push({
          name: name.trim(),
          value: valueParts.join("="),
          // Note: JavaScript can't access HttpOnly, Secure, and SameSite flags
          // These need to be checked via Set-Cookie headers
          hasSecure: false,
          hasHttpOnly: false,
          hasSameSite: false,
        });
      }
    }

    return cookies;
  }

  private analyzeCookie(cookie: CookieInfo): Finding[] {
    const findings: Finding[] = [];

    // Check if cookie is accessible via JavaScript
    if (!cookie.hasHttpOnly) {
      // If we can see it in document.cookie, it's not HttpOnly
      findings.push({
        id: `cookie-no-httponly-${cookie.name}`,
        severity: Severity.MEDIUM,
        title: "Cookie Missing HttpOnly Flag",
        description: `Cookie '${cookie.name}' is accessible via JavaScript`,
        location: cookie.name,
        recommendation: "Set HttpOnly flag to prevent XSS attacks from stealing cookies",
        metadata: { cookieName: cookie.name },
      });
    }

    // Check for sensitive cookie names
    const sensitivePrefixes = ["session", "auth", "token", "jwt", "csrf", "xsrf"];
    const isSensitive = sensitivePrefixes.some((prefix) =>
      cookie.name.toLowerCase().includes(prefix)
    );

    if (isSensitive) {
      findings.push({
        id: `cookie-sensitive-${cookie.name}`,
        severity: Severity.HIGH,
        title: "Sensitive Cookie Detected",
        description: `Cookie '${cookie.name}' appears to contain sensitive data and is accessible via JavaScript`,
        location: cookie.name,
        recommendation: "Ensure this cookie has HttpOnly, Secure, and SameSite attributes set",
        metadata: { cookieName: cookie.name, cookieValue: "[REDACTED]" },
      });
    }

    // Check if running on HTTPS but can't verify Secure flag
    if (window.isSecureContext && !cookie.hasSecure) {
      findings.push({
        id: `cookie-secure-unknown-${cookie.name}`,
        severity: Severity.LOW,
        title: "Cookie Secure Flag Unknown",
        description: `Cannot verify if cookie '${cookie.name}' has Secure flag (requires header inspection)`,
        location: cookie.name,
        recommendation: "Verify that Secure flag is set in Set-Cookie header",
        metadata: { cookieName: cookie.name },
      });
    }

    return findings;
  }
}
