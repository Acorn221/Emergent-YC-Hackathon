/**
 * SecShield API SDK
 * TypeScript client for the SecShield vulnerability scanning API
 */

// ============================================================================
// Types
// ============================================================================

export type Severity = "critical" | "high" | "medium" | "low";

export interface Stats {
	total_scans: number;
	total_vulnerabilities: number;
	credits_remaining: number;
	severity_breakdown: {
		critical: number;
		high: number;
		medium: number;
		low: number;
	};
	type_breakdown: Record<string, number>;
}

export interface Vulnerability {
	id: string;
	scan_id: string;
	url: string;
	severity: Severity;
	type: string;
	description: string;
	timestamp: string;
	status?: string;
	notes?: string;
}

export interface VulnerabilityFilters {
	severity?: Severity;
	type?: string;
	limit?: number;
}

export interface VulnerabilityUpdate {
	severity?: Severity;
	type?: string;
	description?: string;
	status?: string;
	notes?: string;
}

export interface Scan {
	id: string;
	user_id: string;
	target_url: string;
	status: string;
	timestamp: string;
	vulnerability_count: number;
	credits_deducted: number;
}

export interface CreateScanRequest {
	target_url: string;
	vulnerabilities?: Array<{
		url: string;
		severity: Severity;
		type: string;
		description: string;
	}>;
}

export interface ScanWithVulnerabilities {
	scan: Scan;
	vulnerabilities: Vulnerability[];
}

export interface AddVulnerabilityToScan {
	url: string;
	severity: Severity;
	type: string;
	description: string;
}

// ============================================================================
// Error Handling
// ============================================================================

export class SecShieldError extends Error {
	constructor(
		message: string,
		public statusCode: number,
		public responseData?: any,
	) {
		super(message);
		this.name = "SecShieldError";
	}
}

// ============================================================================
// SDK Client
// ============================================================================

export class SecShieldSDK {
	private apiKey: string;
	private baseUrl: string;

	/**
	 * Create a new SecShield SDK client
	 * @param apiKey - Your SecShield API key
	 * @param baseUrl - Optional custom base URL (defaults to production)
	 */
	constructor(
		apiKey: string,
		baseUrl: string = "https://vulnguard-6.preview.emergentagent.com/api",
	) {
		if (!apiKey || apiKey.trim().length === 0) {
			throw new Error("API key is required");
		}
		this.apiKey = apiKey.trim();
		this.baseUrl = baseUrl;
	}

	/**
	 * Internal fetch wrapper that adds authentication and error handling
	 */
	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-API-Key": this.apiKey,
			...((options.headers as Record<string, string>) || {}),
		};

		try {
			const response = await fetch(url, {
				...options,
				headers,
			});

			// Handle error responses
			if (!response.ok) {
				let errorMessage = `API request failed with status ${response.status}`;
				let errorData: any;

				try {
					errorData = await response.json();
					errorMessage = errorData.detail || errorMessage;
				} catch {
					// Response body is not JSON
				}

				throw new SecShieldError(errorMessage, response.status, errorData);
			}

			// Handle empty responses (e.g., 204 No Content)
			const contentType = response.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				return {} as T;
			}

			return await response.json();
		} catch (error) {
			if (error instanceof SecShieldError) {
				throw error;
			}
			throw new SecShieldError(
				`Network error: ${error instanceof Error ? error.message : String(error)}`,
				0,
			);
		}
	}

	/**
	 * Build query string from filters object
	 */
	private buildQueryString(params: Record<string, any>): string {
		const searchParams = new URLSearchParams();
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				searchParams.append(key, String(value));
			}
		});
		const queryString = searchParams.toString();
		return queryString ? `?${queryString}` : "";
	}

	// ============================================================================
	// Statistics Methods
	// ============================================================================

	/**
	 * Get comprehensive user statistics
	 * @returns Stats object with scan counts, vulnerability breakdown, etc.
	 */
	async getStats(): Promise<Stats> {
		return this.request<Stats>("/stats");
	}

	// ============================================================================
	// Vulnerability Methods
	// ============================================================================

	/**
	 * Get all vulnerabilities with optional filters
	 * @param filters - Optional filters for severity, type, limit
	 * @returns Array of vulnerabilities
	 */
	async getVulnerabilities(
		filters?: VulnerabilityFilters,
	): Promise<Vulnerability[]> {
		const queryString = filters ? this.buildQueryString(filters) : "";
		return this.request<Vulnerability[]>(`/vulnerabilities${queryString}`);
	}

	/**
	 * Get a single vulnerability by ID
	 * @param id - Vulnerability ID
	 * @returns Vulnerability object
	 */
	async getVulnerability(id: string): Promise<Vulnerability> {
		return this.request<Vulnerability>(`/vulnerabilities/${id}`);
	}

	/**
	 * Update a vulnerability
	 * @param id - Vulnerability ID
	 * @param updates - Fields to update
	 * @returns Success message
	 */
	async updateVulnerability(
		id: string,
		updates: VulnerabilityUpdate,
	): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/vulnerabilities/${id}`, {
			method: "PATCH",
			body: JSON.stringify(updates),
		});
	}

	// ============================================================================
	// Scan Methods
	// ============================================================================

	/**
	 * Create a new scan (deducts 1 credit)
	 * @param data - Scan data with target URL and optional vulnerabilities
	 * @returns Created scan object
	 */
	async createScan(data: CreateScanRequest): Promise<Scan> {
		return this.request<Scan>("/scans", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	/**
	 * Get all scans for the authenticated user
	 * @returns Array of scans
	 */
	async getScans(): Promise<Scan[]> {
		return this.request<Scan[]>("/scans");
	}

	/**
	 * Get scan details with all vulnerabilities
	 * @param scanId - Scan ID
	 * @returns Scan with vulnerabilities
	 */
	async getScanVulnerabilities(scanId: string): Promise<ScanWithVulnerabilities> {
		return this.request<ScanWithVulnerabilities>(`/scans/${scanId}/vulnerabilities`);
	}

	/**
	 * Delete a scan and all its vulnerabilities
	 * @param scanId - Scan ID
	 * @returns Success message
	 */
	async deleteScan(scanId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/scans/${scanId}`, {
			method: "DELETE",
		});
	}

	// ============================================================================
	// Helper Methods for Agent Integration
	// ============================================================================

	/**
	 * Initialize a scan for the current page/target
	 * This is called at the start of an agent run
	 * @param targetUrl - The URL being scanned
	 * @returns Scan ID to use for reporting vulnerabilities
	 */
	async initializeScan(targetUrl: string): Promise<string> {
		const scan = await this.createScan({
			target_url: targetUrl,
			vulnerabilities: [], // Start with empty, agent will add them
		});
		return scan.id;
	}

	/**
	 * Add a vulnerability to an existing scan
	 * This is called by the agent when it detects a vulnerability
	 * @param scanId - The scan ID from initializeScan
	 * @param vulnerability - Vulnerability details
	 * @returns Updated scan
	 */
	async addVulnerabilityToScan(
		scanId: string,
		vulnerability: AddVulnerabilityToScan,
	): Promise<Scan> {
		// Note: The API doesn't have a direct "add vulnerability" endpoint,
		// so we create a new scan with the vulnerability.
		// In a real implementation, you might want to update the scan
		// or create vulnerabilities separately.

		// For now, we'll get the current scan and create vulnerabilities individually
		// This is a workaround - in production, the API should support adding vulnerabilities
		const currentScan = await this.getScanVulnerabilities(scanId);

		// Create a new scan with all vulnerabilities
		const allVulnerabilities = [
			...currentScan.vulnerabilities.map(v => ({
				url: v.url,
				severity: v.severity,
				type: v.type,
				description: v.description,
			})),
			vulnerability,
		];

		const updatedScan = await this.createScan({
			target_url: currentScan.scan.target_url,
			vulnerabilities: allVulnerabilities,
		});

		return updatedScan;
	}
}

/**
 * Create an SDK instance from stored API key
 * Convenience function for use within the extension
 */
export async function createSDKFromStorage(): Promise<SecShieldSDK | null> {
	const { getApiKey } = await import("./api-key-storage");
	const apiKey = await getApiKey();

	if (!apiKey) {
		return null;
	}

	return new SecShieldSDK(apiKey);
}

