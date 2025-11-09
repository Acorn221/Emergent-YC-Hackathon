/**
 * Script Execution Manager
 * 
 * Manages pending JavaScript executions and their results.
 * Content scripts poll for pending code to execute in the page context.
 */

interface PendingScriptExecution {
	id: string;
	tabId: number;
	code: string;
	timestamp: number;
	resolve: (result: string) => void;
	reject: (error: Error) => void;
	timeout?: NodeJS.Timeout;
}

class ScriptExecutionManager {
	private pendingExecutions = new Map<string, PendingScriptExecution>();
	private executionQueue = new Map<number, string[]>(); // tabId -> [executionIds]
	private idCounter = 0;

	/**
	 * Queue JavaScript code for execution on a specific tab
	 */
	queueScriptExecution(tabId: number, code: string): Promise<string> {
		const id = `script-exec-${tabId}-${this.idCounter++}-${Date.now()}`;

		return new Promise<string>((resolve, reject) => {
			// Set timeout (30 seconds)
			const timeout = setTimeout(() => {
				this.pendingExecutions.delete(id);
				this.removeFromQueue(tabId, id);
				reject(new Error(`Script execution timeout for ${id}`));
				console.warn(`[Script Exec] ⏱️ Timeout for ${id}`);
			}, 30_000);

			const execution: PendingScriptExecution = {
				id,
				tabId,
				code,
				timestamp: Date.now(),
				resolve,
				reject,
				timeout,
			};

			this.pendingExecutions.set(id, execution);

			// Add to tab's queue
			if (!this.executionQueue.has(tabId)) {
				this.executionQueue.set(tabId, []);
			}
			const queue = this.executionQueue.get(tabId);
			if (queue) {
				queue.push(id);
			}

			console.log(`[Script Exec] 📝 Queued ${id} for tab ${tabId}`);
		});
	}

	/**
	 * Content script polls for pending executions
	 */
	getPendingScript(tabId: number): { id: string; code: string } | null {
		const queue = this.executionQueue.get(tabId);
		if (!queue || queue.length === 0) {
			return null;
		}

		const id = queue[0]; // Get first in queue (FIFO)
		if (!id) return null;

		const execution = this.pendingExecutions.get(id);

		if (!execution) {
			// Clean up orphaned queue entry
			queue.shift();
			return this.getPendingScript(tabId); // Try next
		}

		console.log(`[Script Exec] 📤 Providing ${id} to content script`);
		return { id, code: execution.code };
	}

	/**
	 * Content script sends back successful result
	 */
	resolveScriptExecution(id: string, result: string): boolean {
		const execution = this.pendingExecutions.get(id);

		if (!execution) {
			console.warn(`[Script Exec] ⚠️ No pending execution found for ${id}`);
			return false;
		}

		// Clear timeout
		if (execution.timeout) {
			clearTimeout(execution.timeout);
		}

		// Remove from queue and pending
		this.removeFromQueue(execution.tabId, id);
		this.pendingExecutions.delete(id);

		// Resolve promise
		execution.resolve(result);

		console.log(`[Script Exec] ✅ Resolved ${id}`);
		return true;
	}

	/**
	 * Handle execution error
	 */
	rejectScriptExecution(id: string, error: string): boolean {
		const execution = this.pendingExecutions.get(id);

		if (!execution) {
			console.warn(`[Script Exec] ⚠️ No pending execution found for ${id}`);
			return false;
		}

		if (execution.timeout) {
			clearTimeout(execution.timeout);
		}

		this.removeFromQueue(execution.tabId, id);
		this.pendingExecutions.delete(id);

		execution.reject(new Error(error));

		console.log(`[Script Exec] ❌ Rejected ${id}: ${error}`);
		return true;
	}

	/**
	 * Clean up tab's queue when tab closes
	 */
	clearTabExecutions(tabId: number): void {
		const queue = this.executionQueue.get(tabId);
		if (!queue) return;

		// Reject all pending executions for this tab
		for (const id of queue) {
			const execution = this.pendingExecutions.get(id);
			if (execution) {
				if (execution.timeout) {
					clearTimeout(execution.timeout);
				}
				execution.reject(new Error(`Tab ${tabId} closed`));
				this.pendingExecutions.delete(id);
			}
		}

		this.executionQueue.delete(tabId);
		console.log(`[Script Exec] 🧹 Cleared tab ${tabId}`);
	}

	/**
	 * Cancel all pending executions for a tab (used when aborting conversations)
	 */
	cancelAllForTab(tabId: number): number {
		const queue = this.executionQueue.get(tabId);
		if (!queue) return 0;

		let cancelledCount = 0;

		// Reject all pending executions for this tab
		for (const id of queue) {
			const execution = this.pendingExecutions.get(id);
			if (execution) {
				if (execution.timeout) {
					clearTimeout(execution.timeout);
				}
				execution.reject(
					new Error("Execution cancelled - conversation aborted")
				);
				this.pendingExecutions.delete(id);
				cancelledCount++;
			}
		}

		// Clear the queue
		this.executionQueue.delete(tabId);

		console.log(
			`[Script Exec] 🛑 Cancelled ${cancelledCount} pending executions for tab ${tabId}`
		);

		return cancelledCount;
	}

	/**
	 * Remove execution from queue
	 */
	private removeFromQueue(tabId: number, id: string): void {
		const queue = this.executionQueue.get(tabId);
		if (!queue) return;

		const index = queue.indexOf(id);
		if (index > -1) {
			queue.splice(index, 1);
		}

		if (queue.length === 0) {
			this.executionQueue.delete(tabId);
		}
	}

	/**
	 * Get stats for debugging
	 */
	getStats() {
		return {
			pendingCount: this.pendingExecutions.size,
			tabsWithQueue: this.executionQueue.size,
			queues: Array.from(this.executionQueue.entries()).map(
				([tabId, queue]) => ({
					tabId,
					count: queue.length,
				})
			),
		};
	}
}

// Singleton instance
export const scriptExecutionManager = new ScriptExecutionManager();

