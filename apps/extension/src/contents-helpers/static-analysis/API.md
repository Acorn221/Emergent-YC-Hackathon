# Static Security Analysis API

The Static Security Analysis library provides comprehensive client-side security analysis capabilities for web pages. It can be accessed both programmatically and through the LLM agent.

## Overview

The library performs automated security audits across multiple dimensions:
- **Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Cookies**: HttpOnly, Secure, SameSite attributes
- **Scripts**: Inline scripts, external sources, integrity checks
- **Forms**: HTTPS submission, autocomplete settings
- **Storage**: Sensitive data in localStorage/sessionStorage

## Access Methods

### 1. Browser Console (Manual)

When the extension is loaded, the analysis tools are automatically available:

```javascript
// Access the global security analysis API
const analysis = window.__SECURITY_ANALYSIS__;

// Run analysis manually
const report = await analysis.runAnalysis();
console.log(report);

// Get critical findings only
const criticalFindings = analysis.getCriticalFindings();

// Get findings by severity
const highSeverityFindings = analysis.getFindingsBySeverity('high');
```

### 2. LLM Agent Tool: `run_static_security_analysis`

The LLM agent has access to a dedicated tool for running security analysis:

**Tool Name**: `run_static_security_analysis`

**Description**: Run a comprehensive static security analysis on the current page. Returns detailed findings with severity levels and specific recommendations.

**Parameters**: None - the tool runs a complete analysis with all analyzers enabled.

**Example LLM Prompts**:

```
"Run a security analysis on this page"

"Check for security issues"

"Analyze this page for vulnerabilities"

"Run a full security scan and tell me what vulnerabilities exist"
```

**How it works**: The tool automatically runs all five analyzers (headers, cookies, scripts, forms, storage) and returns all findings. The LLM can then filter or prioritize findings based on severity or other criteria as needed.

**Response Format**:

```json
{
  "success": true,
  "message": "Found 12 security findings (Critical: 2, High: 3, Medium: 4, Low: 2, Info: 1)",
  "report": {
    "url": "https://example.com",
    "timestamp": 1699564800000,
    "totalFindings": 12,
    "totalDuration": 45.2,
    "findingsBySeverity": {
      "critical": 2,
      "high": 3,
      "medium": 4,
      "low": 2,
      "info": 1
    },
    "results": [
      {
        "analyzerName": "headers",
        "findings": [
          {
            "id": "headers-missing-csp",
            "severity": "high",
            "title": "Missing Content Security Policy",
            "description": "No Content-Security-Policy header found. This allows scripts from any source to execute.",
            "recommendation": "Implement a strict Content-Security-Policy header to prevent XSS attacks.",
            "metadata": {}
          }
        ],
        "duration": 12.5,
        "hasErrors": false
      }
    ]
  }
}
```

### 3. Programmatic Access (Content Script)

Import and use directly in content scripts:

```typescript
import { runAnalysis, createStaticAnalyzer, Severity } from '../contents-helpers/static-analysis';

// Simple usage
const report = await runAnalysis();

// With configuration
const report = await runAnalysis({
  minSeverity: Severity.HIGH,
  verbose: true,
  analyzers: {
    cookies: { enabled: true },
    headers: { enabled: true },
  }
});

// Custom analyzer instance
const analyzer = createStaticAnalyzer({
  verbose: false
});
const report = await analyzer.analyze();
```

## Severity Levels

Findings are categorized by severity:

- **CRITICAL**: Immediate security threats (e.g., data leakage, RCE vectors)
- **HIGH**: Serious vulnerabilities (e.g., missing CSP, insecure cookies with tokens)
- **MEDIUM**: Notable security issues (e.g., XSS risks, CSRF potential)
- **LOW**: Minor security concerns (e.g., information disclosure)
- **INFO**: Informational findings (e.g., best practice recommendations)

## Finding Structure

Each finding includes:

```typescript
{
  id: string;              // Unique identifier
  severity: Severity;      // Severity level
  title: string;           // Short description
  description: string;     // Detailed explanation
  location?: string;       // Where the issue was found
  recommendation?: string; // How to fix it
  metadata?: object;       // Additional context
}
```

## Common Use Cases

### 1. Quick Security Audit

```javascript
// LLM prompt: "Run a security analysis on this page"
// Returns all findings with recommendations
```

### 2. Finding High-Risk Issues

```javascript
// LLM prompt: "Check for critical security vulnerabilities"
// Returns only critical and high severity findings
```

### 3. Specific Area Analysis

```javascript
// LLM prompt: "Analyze cookie security on this page"
// Returns findings related to cookie configuration
```

### 4. Compliance Checking

```javascript
// LLM prompt: "Check if this page follows security best practices"
// Returns comprehensive report with recommendations
```

## Integration with Vulnerability Reporting

The static analysis tool works seamlessly with the vulnerability reporting system:

1. Run analysis: `run_static_security_analysis`
2. Review findings
3. Report genuine vulnerabilities: `report_vulnerability`

Example workflow:
```
User: "Scan this page for security issues"
Agent: [Calls run_static_security_analysis]
Agent: "Found 3 critical issues: [lists findings]"
Agent: [Calls report_vulnerability for each genuine vulnerability]
```

## Technical Details

### Architecture

The library follows a plugin-based architecture:
- **Engine**: Core analysis orchestration
- **Analyzers**: Modular security checkers
- **Registry**: Dynamic analyzer management
- **Types**: Strict TypeScript definitions

### Performance

- Typical analysis time: 50-200ms
- Async execution with Promise-based API
- No blocking of UI thread
- Efficient DOM traversal

### Browser Compatibility

- Chrome/Edge: ✅ Fully supported
- Firefox: ✅ Fully supported
- Safari: ✅ Fully supported
- Opera: ✅ Fully supported

## Examples

See `/src/contents-helpers/static-analysis/examples.ts` for comprehensive usage examples including:
- Basic usage
- Custom configuration
- Selective analyzers
- Window integration
- Custom analyzers
- Result filtering
- Monitoring changes
- Exporting results

## Troubleshooting

**Issue**: "Static analysis failed"
- **Cause**: Page not fully loaded
- **Solution**: Wait for `document_end` or `load` event

**Issue**: "runAnalysis is not defined"
- **Cause**: Library not loaded
- **Solution**: Check content script injection

**Issue**: "No findings returned"
- **Cause**: minSeverity filter too strict
- **Solution**: Lower minSeverity or remove filter

## Future Enhancements

- Real-time monitoring mode
- Custom analyzer plugins
- Integration with OWASP Top 10
- Automated fix suggestions
- Historical trend analysis

