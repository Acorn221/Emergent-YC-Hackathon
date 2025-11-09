/**
 * Forms Analyzer
 * Checks for form security issues
 */

import type {
  IAnalyzer,
  AnalyzerResult,
  AnalyzerConfig,
  Finding,
} from "../types";
import { Severity } from "../types";

export class FormsAnalyzer implements IAnalyzer {
  readonly name = "forms";
  readonly description = "Analyzes form security attributes";

  async analyze(config?: AnalyzerConfig): Promise<AnalyzerResult> {
    const startTime = performance.now();
    const findings: Finding[] = [];
    const errors: string[] = [];

    try {
      const forms = document.querySelectorAll("form");

      if (forms.length === 0) {
        findings.push({
          id: "no-forms",
          severity: Severity.INFO,
          title: "No Forms Found",
          description: "No form elements detected on this page",
        });
      } else {
        for (let i = 0; i < forms.length; i++) {
          const form = forms[i];
          const formFindings = this.analyzeForm(form, i);
          findings.push(...formFindings);
        }
      }
    } catch (error) {
      errors.push(`Form analysis error: ${error instanceof Error ? error.message : String(error)}`);
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

  private analyzeForm(form: HTMLFormElement, index: number): Finding[] {
    const findings: Finding[] = [];
    const formId = form.id || `form-${index}`;
    const action = form.action;
    const method = form.method.toUpperCase();

    // Check for HTTP submission on HTTPS page
    if (window.isSecureContext && action && action.startsWith("http:")) {
      findings.push({
        id: `form-insecure-action-${formId}`,
        severity: Severity.CRITICAL,
        title: "Form Submits to HTTP",
        description: "Form submits data over insecure HTTP connection",
        location: formId,
        recommendation: "Always submit forms to HTTPS endpoints",
        metadata: { formId, action },
      });
    }

    // Check for GET method with sensitive fields
    if (method === "GET") {
      const sensitiveFields = this.findSensitiveFields(form);
      if (sensitiveFields.length > 0) {
        findings.push({
          id: `form-get-sensitive-${formId}`,
          severity: Severity.HIGH,
          title: "Sensitive Data Submitted via GET",
          description: "Form uses GET method with sensitive input fields",
          location: formId,
          recommendation: "Use POST method for forms with sensitive data",
          metadata: {
            formId,
            sensitiveFields: sensitiveFields.map((f) => f.name || f.id || "unnamed"),
          },
        });
      }
    }

    // Check autocomplete on sensitive fields
    const autocompleteFindings = this.checkAutocomplete(form, formId);
    findings.push(...autocompleteFindings);

    // Check for CSRF token
    const csrfFindings = this.checkCSRFProtection(form, formId);
    findings.push(...csrfFindings);

    return findings;
  }

  private findSensitiveFields(form: HTMLFormElement): HTMLInputElement[] {
    const sensitiveTypes = ["password", "email", "tel", "number"];
    const sensitiveNames = [
      "password",
      "pass",
      "pwd",
      "email",
      "phone",
      "credit",
      "card",
      "ssn",
      "social",
    ];

    const inputs = form.querySelectorAll("input");
    const sensitive: HTMLInputElement[] = [];

    for (const input of Array.from(inputs)) {
      const type = input.type.toLowerCase();
      const name = (input.name || "").toLowerCase();
      const id = (input.id || "").toLowerCase();

      if (sensitiveTypes.includes(type)) {
        sensitive.push(input);
        continue;
      }

      if (sensitiveNames.some((s) => name.includes(s) || id.includes(s))) {
        sensitive.push(input);
      }
    }

    return sensitive;
  }

  private checkAutocomplete(form: HTMLFormElement, formId: string): Finding[] {
    const findings: Finding[] = [];
    const sensitiveFields = this.findSensitiveFields(form);

    for (const field of sensitiveFields) {
      const autocomplete = field.getAttribute("autocomplete");
      const fieldId = field.id || field.name || "unnamed";

      if (autocomplete !== "off" && field.type === "password") {
        findings.push({
          id: `form-autocomplete-password-${formId}-${fieldId}`,
          severity: Severity.MEDIUM,
          title: "Password Field Allows Autocomplete",
          description: `Password field '${fieldId}' does not disable autocomplete`,
          location: `${formId} > ${fieldId}`,
          recommendation: "Set autocomplete='off' or 'new-password' for password fields",
          metadata: { formId, fieldId },
        });
      }
    }

    return findings;
  }

  private checkCSRFProtection(form: HTMLFormElement, formId: string): Finding[] {
    const findings: Finding[] = [];

    // Only check POST forms
    if (form.method.toUpperCase() !== "POST") {
      return findings;
    }

    // Look for common CSRF token field names
    const csrfFieldNames = [
      "csrf",
      "csrf_token",
      "csrftoken",
      "_csrf",
      "xsrf",
      "xsrf_token",
      "xsrftoken",
      "_token",
    ];

    const inputs = form.querySelectorAll("input[type='hidden']");
    let hasCSRFToken = false;

    for (const input of Array.from(inputs)) {
      const name = (input.getAttribute("name") || "").toLowerCase();
      if (csrfFieldNames.some((csrfName) => name.includes(csrfName))) {
        hasCSRFToken = true;
        break;
      }
    }

    if (!hasCSRFToken) {
      findings.push({
        id: `form-no-csrf-${formId}`,
        severity: Severity.HIGH,
        title: "Possible Missing CSRF Protection",
        description: "POST form does not appear to have a CSRF token",
        location: formId,
        recommendation: "Implement CSRF protection with anti-CSRF tokens",
        metadata: { formId },
      });
    }

    return findings;
  }
}
