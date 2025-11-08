/**
 * Script Execution Helpers
 * 
 * Helper functions for executing JavaScript in page context.
 */

export interface ConsoleLog {
	level: "log" | "warn" | "error";
	message: string;
	timestamp: number;
}

export interface ConsoleInterceptor {
	logs: ConsoleLog[];
	restore: () => void;
}

/**
 * Wrap code in async IIFE for execution
 */
export function wrapCodeInAsync(code: string): string {
	return `(async () => { ${code} })()`;
}

/**
 * Create console interceptor to capture logs during execution
 */
export function createConsoleInterceptor(): ConsoleInterceptor {
	const logs: ConsoleLog[] = [];

	// Store original console methods
	const originalConsole = {
		log: console.log,
		warn: console.warn,
		error: console.error,
	};

	// Intercept console.log
	console.log = (...args: unknown[]) => {
		logs.push({
			level: "log",
			message: args.map(arg => String(arg)).join(" "),
			timestamp: Date.now(),
		});
		originalConsole.log(...args);
	};

	// Intercept console.warn
	console.warn = (...args: unknown[]) => {
		logs.push({
			level: "warn",
			message: args.map(arg => String(arg)).join(" "),
			timestamp: Date.now(),
		});
		originalConsole.warn(...args);
	};

	// Intercept console.error
	console.error = (...args: unknown[]) => {
		logs.push({
			level: "error",
			message: args.map(arg => String(arg)).join(" "),
			timestamp: Date.now(),
		});
		originalConsole.error(...args);
	};

	// Return interceptor with restore function
	return {
		logs,
		restore: () => {
			console.log = originalConsole.log;
			console.warn = originalConsole.warn;
			console.error = originalConsole.error;
		},
	};
}

/**
 * Serialize execution result for transmission
 */
export function serializeExecutionResult(result: unknown): string {
	try {
		// Handle DOM Elements
		if (result instanceof Element) {
			const tagName = result.tagName;
			const className = result.className ? `.${result.className}` : "";
			const id = result.id ? `#${result.id}` : "";
			return `<Element: ${tagName}${id}${className}>`;
		}

		// Handle NodeList / HTMLCollection
		if (result instanceof NodeList || result instanceof HTMLCollection) {
			return `<NodeList: ${result.length} elements>`;
		}

		// Handle Functions
		if (typeof result === "function") {
			const funcName = result.name || "anonymous";
			return `[Function: ${funcName}]`;
		}

		// Handle Errors (preserve stack trace)
		if (result instanceof Error) {
			return `Error: ${result.message}\n${result.stack || ""}`;
		}

		// Handle undefined/null
		if (result === undefined) return "undefined";
		if (result === null) return "null";

		// Handle primitives
		if (typeof result !== "object") {
			return String(result);
		}

		// Handle objects with JSON.stringify (with circular reference handling)
		const seen = new WeakSet();
		return JSON.stringify(
			result,
			(key, value) => {
				// Handle circular references
				if (typeof value === "object" && value !== null) {
					if (seen.has(value)) {
						return "[Circular]";
					}
					seen.add(value);
				}

				// Handle DOM Elements in objects
				if (value instanceof Element) {
					return `<Element: ${value.tagName}>`;
				}

				// Handle Functions in objects
				if (typeof value === "function") {
					return `[Function: ${value.name || "anonymous"}]`;
				}

				return value;
			},
			2 // Pretty print with 2 spaces
		);
	} catch (error) {
		// Fallback for any serialization errors
		return `[Serialization Error: ${error instanceof Error ? error.message : String(error)}]`;
	}
}

/**
 * Format execution error for display
 */
export function formatExecutionError(error: unknown): string {
	if (error instanceof Error) {
		let message = `Error: ${error.message}`;
		if (error.stack) {
			message += `\n\nStack trace:\n${error.stack}`;
		}
		return message;
	}

	if (typeof error === "string") {
		return `Error: ${error}`;
	}

	try {
		return `Error: ${JSON.stringify(error)}`;
	} catch {
		return `Error: ${String(error)}`;
	}
}

