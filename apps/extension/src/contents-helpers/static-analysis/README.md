# Static Analysis Library

Type-safe extensible static analysis library for frontend security checks. Runs in the main world context and provides comprehensive security auditing of web pages.

## Features

- 🔒 **Security-First**: Detects common web security issues
- 🔌 **Extensible**: Plugin-based architecture for custom analyzers
- 📊 **Type-Safe**: Full TypeScript support with strict typing
- 🎯 **Targeted**: Severity-based filtering and reporting
- 🌐 **Global Access**: Results available via `window.__SECURITY_ANALYSIS__`

## Built-in Analyzers

### 1. Headers Analyzer
Checks for security-related HTTP headers and configurations:
- Content Security Policy (CSP) presence and configuration
- CSP unsafe-inline and unsafe-eval detection
- Frame embedding detection
- Secure context (HTTPS) verification
- Referrer policy validation

### 2. Cookies Analyzer
Analyzes cookie security attributes:
- HttpOnly flag detection
- Secure flag verification
- Sensitive cookie identification
- SameSite attribute checks

### 3. Scripts Analyzer
Checks for JavaScript security issues:
- Inline scripts detection
- Inline event handlers
- External script SRI (Subresource Integrity) verification
- Mixed content detection (HTTP scripts on HTTPS pages)
- eval() and Function constructor availability
- Exposed secrets in global scope

### 4. Forms Analyzer
Analyzes form security:
- Insecure form submission (HTTP on HTTPS pages)
- Sensitive data via GET method
- Autocomplete on password fields
- CSRF token presence

### 5. Storage Analyzer
Checks localStorage and sessionStorage security:
- Sensitive data exposure (tokens, passwords, API keys)
- Unencrypted sensitive data detection
- Large storage items (potential DoS)

## Usage

### Basic Usage (Automatic)

The library is automatically initialized in `main-world.ts` and runs on every page load:

```typescript
// Access results via window object
window.__SECURITY_ANALYSIS__.report // Latest analysis report
window.__SECURITY_ANALYSIS__.runAnalysis() // Run analysis again
window.__SECURITY_ANALYSIS__.getCriticalFindings() // Get critical issues
window.__SECURITY_ANALYSIS__.getFindingsBySeverity("high") // Filter by severity
```

### Manual Usage

```typescript
import { runAnalysis, logAnalysisReport, Severity } from '@/contents-helpers/static-analysis';

// Run analysis with default configuration
const report = await runAnalysis();
logAnalysisReport(report);

// Run with custom configuration
const report = await runAnalysis({
  verbose: true,
  minSeverity: Severity.HIGH, // Only show high and critical findings
  analyzers: {
    headers: { enabled: true },
    cookies: { enabled: false }, // Disable cookies analyzer
  }
});
```

### Creating Custom Analyzers

```typescript
import { IAnalyzer, AnalyzerResult, AnalyzerConfig, Finding, Severity } from '@/contents-helpers/static-analysis';

class CustomAnalyzer implements IAnalyzer {
  readonly name = "custom";
  readonly description = "My custom security analyzer";

  async analyze(config?: AnalyzerConfig): Promise<AnalyzerResult> {
    const startTime = performance.now();
    const findings: Finding[] = [];

    // Your analysis logic here
    if (someCondition) {
      findings.push({
        id: "custom-issue-1",
        severity: Severity.HIGH,
        title: "Custom Issue Detected",
        description: "Description of the issue",
        recommendation: "How to fix it",
      });
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

// Register and use
import { createStaticAnalyzer } from '@/contents-helpers/static-analysis';

const analyzer = createStaticAnalyzer();
analyzer.register(new CustomAnalyzer());
const report = await analyzer.analyze();
```

### Advanced Configuration

```typescript
import { initializeSecurityAnalysis, Severity } from '@/contents-helpers/static-analysis';

const securityAnalysis = initializeSecurityAnalysis({
  // Enable verbose logging
  verbose: true,
  
  // Only show medium and above
  minSeverity: Severity.MEDIUM,
  
  // Configure individual analyzers
  analyzers: {
    headers: {
      enabled: true,
      options: {
        // Custom options for headers analyzer
      }
    },
    scripts: {
      enabled: true,
      options: {
        checkExternal: true,
      }
    },
    cookies: { enabled: false },
  }
});

// Run analysis
const report = await securityAnalysis.runAnalysis();
```

## API Reference

### Types

```typescript
enum Severity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  location?: string;
  recommendation?: string;
  metadata?: Record<string, unknown>;
}

interface AnalysisReport {
  timestamp: number;
  url: string;
  results: AnalyzerResult[];
  totalFindings: number;
  findingsBySeverity: Record<Severity, number>;
  totalDuration: number;
  config: StaticAnalysisConfig;
}
```

### Functions

#### `runAnalysis(config?: StaticAnalysisConfig): Promise<AnalysisReport>`
Run static analysis with default analyzers.

#### `createStaticAnalyzer(config?: StaticAnalysisConfig): StaticAnalyzer`
Create a new analyzer instance with default analyzers registered.

#### `initializeSecurityAnalysis(config?: StaticAnalysisConfig): SecurityAnalysisWindow`
Initialize the library and inject into window.__SECURITY_ANALYSIS__.

#### `logAnalysisReport(report: AnalysisReport): void`
Log formatted analysis results to console.

### Window API

```typescript
window.__SECURITY_ANALYSIS__ = {
  report: AnalysisReport | null,
  runAnalysis: (config?: StaticAnalysisConfig) => Promise<AnalysisReport>,
  getFindingsBySeverity: (severity: Severity) => Finding[],
  getCriticalFindings: () => Finding[],
  config: StaticAnalysisConfig,
}
```

## Severity Levels

- **CRITICAL**: Immediate security risk (e.g., HTTP on sensitive pages, exposed secrets)
- **HIGH**: Significant security concern (e.g., missing CSRF protection, sensitive cookies accessible via JS)
- **MEDIUM**: Moderate security issue (e.g., missing HttpOnly flags, inline event handlers)
- **LOW**: Minor security improvement (e.g., missing referrer policy, autocomplete on password fields)
- **INFO**: Informational findings (e.g., page is framed, eval() available)

## Console Output

When analysis runs, you'll see a detailed report in the console:

```
🔒 Security Analysis Report
URL: https://example.com
Timestamp: 2025-01-15T10:30:00.000Z
Duration: 15.23ms
Total Findings: 8

Findings by Severity:
  🔴 Critical: 1
  🟠 High: 2
  🟡 Medium: 3
  🟢 Low: 1
  ℹ️  Info: 1

headers (3 findings)
  🔴 Insecure Context (HTTP)
    Page is served over HTTP instead of HTTPS
    Location: http://example.com
    💡 Always use HTTPS to encrypt data in transit
...
```

## Browser Console Usage

```javascript
// View latest report
window.__SECURITY_ANALYSIS__.report

// Run analysis again
await window.__SECURITY_ANALYSIS__.runAnalysis()

// Get all critical findings
window.__SECURITY_ANALYSIS__.getCriticalFindings()

// Get findings by severity
window.__SECURITY_ANALYSIS__.getFindingsBySeverity("high")

// Run with custom config
await window.__SECURITY_ANALYSIS__.runAnalysis({
  verbose: true,
  minSeverity: "medium"
})
```

## Architecture

```
static-analysis/
├── types.ts                    # Core type definitions
├── engine.ts                   # Analysis engine and registry
├── index.ts                    # Main exports and utilities
├── analyzers/
│   ├── headers.ts             # Headers analyzer
│   ├── cookies.ts             # Cookies analyzer
│   ├── scripts.ts             # Scripts analyzer
│   ├── forms.ts               # Forms analyzer
│   └── storage.ts             # Storage analyzer
└── README.md                   # This file
```

## Best Practices

1. **Filter by Severity**: Focus on CRITICAL and HIGH findings first
2. **Custom Analyzers**: Create domain-specific analyzers for your needs
3. **Regular Audits**: Run analysis periodically on different pages
4. **CI Integration**: Use in automated testing pipelines
5. **False Positives**: Review findings context before acting

## Extensibility

The library is designed to be extended:

1. **Custom Analyzers**: Implement `IAnalyzer` interface
2. **Custom Configurations**: Pass options to analyzers
3. **Registry Pattern**: Add/remove analyzers dynamically
4. **Severity Filtering**: Control what gets reported

## Performance

- Runs asynchronously to not block page rendering
- Each analyzer tracks its own execution time
- Total analysis typically completes in < 50ms
- Minimal memory footprint

## Security Considerations

- Runs in MAIN world context (has full page access)
- Results stored in window object (accessible to page scripts)
- Does not send data externally
- No network requests made
- All analysis is client-side

## Contributing

To add a new analyzer:

1. Create a new file in `analyzers/` directory
2. Implement the `IAnalyzer` interface
3. Register it in `index.ts` in `createStaticAnalyzer()`
4. Update this README with analyzer details

## License

Part of the SecShield project.
