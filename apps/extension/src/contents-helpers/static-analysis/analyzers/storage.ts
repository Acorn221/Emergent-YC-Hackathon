/**
 * Storage Analyzer
 * Checks for security issues with localStorage and sessionStorage
 */

import type {
  IAnalyzer,
  AnalyzerResult,
  AnalyzerConfig,
  Finding,
} from "../types";
import { Severity } from "../types";

export class StorageAnalyzer implements IAnalyzer {
  readonly name = "storage";
  readonly description = "Analyzes localStorage and sessionStorage security";

  async analyze(config?: AnalyzerConfig): Promise<AnalyzerResult> {
    const startTime = performance.now();
    const findings: Finding[] = [];
    const errors: string[] = [];

    try {
      // Check localStorage
      const localStorageFindings = this.analyzeStorage(
        window.localStorage,
        "localStorage"
      );
      findings.push(...localStorageFindings);

      // Check sessionStorage
      const sessionStorageFindings = this.analyzeStorage(
        window.sessionStorage,
        "sessionStorage"
      );
      findings.push(...sessionStorageFindings);
    } catch (error) {
      errors.push(`Storage analysis error: ${error instanceof Error ? error.message : String(error)}`);
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

  private analyzeStorage(storage: Storage, storageName: string): Finding[] {
    const findings: Finding[] = [];

    try {
      const length = storage.length;

      if (length === 0) {
        findings.push({
          id: `${storageName}-empty`,
          severity: Severity.INFO,
          title: `${storageName} is Empty`,
          description: `No data stored in ${storageName}`,
        });
        return findings;
      }

      // Check each storage item
      for (let i = 0; i < length; i++) {
        const key = storage.key(i);
        if (!key) continue;

        const value = storage.getItem(key) || "";
        const itemFindings = this.analyzeStorageItem(key, value, storageName);
        findings.push(...itemFindings);
      }
    } catch (error) {
      findings.push({
        id: `${storageName}-access-error`,
        severity: Severity.HIGH,
        title: `Cannot Access ${storageName}`,
        description: `Error accessing ${storageName}: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: "Check storage permissions and availability",
      });
    }

    return findings;
  }

  private analyzeStorageItem(
    key: string,
    value: string,
    storageName: string
  ): Finding[] {
    const findings: Finding[] = [];

    // Check for sensitive data patterns
    const sensitivePatterns = [
      { pattern: /token/i, name: "token", severity: Severity.HIGH },
      { pattern: /jwt/i, name: "JWT", severity: Severity.HIGH },
      { pattern: /auth/i, name: "authentication", severity: Severity.HIGH },
      { pattern: /session/i, name: "session", severity: Severity.HIGH },
      { pattern: /password/i, name: "password", severity: Severity.CRITICAL },
      { pattern: /secret/i, name: "secret", severity: Severity.CRITICAL },
      { pattern: /apikey/i, name: "API key", severity: Severity.CRITICAL },
      { pattern: /api_key/i, name: "API key", severity: Severity.CRITICAL },
      { pattern: /private.*key/i, name: "private key", severity: Severity.CRITICAL },
      { pattern: /credit.*card/i, name: "credit card", severity: Severity.CRITICAL },
      { pattern: /ssn/i, name: "SSN", severity: Severity.CRITICAL },
    ];

    for (const { pattern, name, severity } of sensitivePatterns) {
      if (pattern.test(key) || pattern.test(value)) {
        findings.push({
          id: `${storageName}-sensitive-${key}`,
          severity,
          title: `Sensitive Data in ${storageName}`,
          description: `Detected potential ${name} data stored in ${storageName}`,
          location: `${storageName}.${key}`,
          recommendation: `Avoid storing ${name}s in Web Storage. Use HttpOnly cookies or secure backend sessions instead`,
          metadata: { key, storageName },
        });
        break; // Only report once per item
      }
    }

    // Check for unencrypted data that looks like it should be encrypted
    if (this.looksLikeUnencryptedSensitiveData(value)) {
      findings.push({
        id: `${storageName}-unencrypted-${key}`,
        severity: Severity.MEDIUM,
        title: "Potentially Unencrypted Sensitive Data",
        description: `Data in '${key}' appears to be unencrypted JSON or plain text`,
        location: `${storageName}.${key}`,
        recommendation: "Encrypt sensitive data before storing in Web Storage",
        metadata: { key, storageName },
      });
    }

    // Check for large storage items (potential DoS)
    if (value.length > 100000) {
      // 100KB
      findings.push({
        id: `${storageName}-large-item-${key}`,
        severity: Severity.LOW,
        title: "Large Storage Item",
        description: `Item '${key}' is very large (${Math.round(value.length / 1024)}KB)`,
        location: `${storageName}.${key}`,
        recommendation: "Consider storing large data on the server instead",
        metadata: { key, size: value.length, storageName },
      });
    }

    return findings;
  }

  private looksLikeUnencryptedSensitiveData(value: string): boolean {
    // Check if it's valid JSON with sensitive-looking keys
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        const keys = Object.keys(parsed).join(" ").toLowerCase();
        const sensitiveWords = [
          "password",
          "token",
          "secret",
          "key",
          "auth",
          "credit",
        ];
        return sensitiveWords.some((word) => keys.includes(word));
      }
    } catch {
      // Not JSON, check for other patterns
      const sensitiveWords = ["password", "token", "secret", "key"];
      const lowerValue = value.toLowerCase();
      return sensitiveWords.some((word) => lowerValue.includes(word));
    }
    return false;
  }
}
