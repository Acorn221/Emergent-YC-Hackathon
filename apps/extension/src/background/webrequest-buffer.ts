/**
 * WebRequest Buffer
 * 
 * Temporary storage for webRequest API data before matching with JS-intercepted requests.
 * webRequest fires BEFORE fetch completes, so we buffer the data and match it later.
 */

export interface PendingRequest {
  requestId: string;
  tabId: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestTimestamp: number;
  
  // Response data (added when response arrives)
  responseHeaders?: Record<string, string>;
  status?: number;
  statusText?: string;
  responseTimestamp?: number;
}

// Main buffer: requestId -> PendingRequest
const pendingRequests = new Map<string, PendingRequest>();

// URL index for fast lookup: "url|tabId" -> Set<requestId>
const urlIndex = new Map<string, Set<string>>();

/**
 * Generate index key for URL+tabId lookup
 */
function getIndexKey(url: string, tabId: number): string {
  return `${url}|${tabId}`;
}

/**
 * Store a new pending request from onBeforeSendHeaders
 */
export function storePendingRequest(request: PendingRequest): void {
  const { requestId, url, tabId } = request;
  
  // Store in main map
  pendingRequests.set(requestId, request);
  
  // Add to URL index
  const indexKey = getIndexKey(url, tabId);
  let requestIds = urlIndex.get(indexKey);
  if (!requestIds) {
    requestIds = new Set();
    urlIndex.set(indexKey, requestIds);
  }
  requestIds.add(requestId);
  
  console.log(`[WebRequest Buffer] 📥 Stored request ${requestId}: ${request.method} ${url}`);
}

/**
 * Update pending request with response data from onResponseStarted
 */
export function updatePendingRequest(
  requestId: string,
  update: {
    responseHeaders?: Record<string, string>;
    status?: number;
    statusText?: string;
  }
): void {
  const request = pendingRequests.get(requestId);
  if (!request) {
    console.warn(`[WebRequest Buffer] ⚠️ No pending request found for ${requestId}`);
    return;
  }
  
  request.responseHeaders = update.responseHeaders;
  request.status = update.status;
  request.statusText = update.statusText;
  request.responseTimestamp = Date.now();
  
  console.log(`[WebRequest Buffer] 📤 Updated response for ${requestId}: ${update.status}`);
}

/**
 * Find matching webRequest data for a JS-intercepted request
 * Matches by URL, tabId, and timestamp proximity (within 500ms)
 */
export function findMatchingWebRequest(
  url: string,
  tabId: number,
  jsTimestamp: number,
  timeWindowMs: number = 500
): PendingRequest | null {
  const indexKey = getIndexKey(url, tabId);
  const requestIds = urlIndex.get(indexKey);
  
  if (!requestIds || requestIds.size === 0) {
    return null;
  }
  
  // Find closest match within time window
  let bestMatch: PendingRequest | null = null;
  let bestTimeDiff = Infinity;
  
  for (const requestId of requestIds) {
    const request = pendingRequests.get(requestId);
    if (!request) continue;
    
    const timeDiff = Math.abs(request.requestTimestamp - jsTimestamp);
    
    if (timeDiff <= timeWindowMs && timeDiff < bestTimeDiff) {
      bestMatch = request;
      bestTimeDiff = timeDiff;
    }
  }
  
  if (bestMatch) {
    console.log(
      `[WebRequest Buffer] ✅ Match found for ${url} (time diff: ${bestTimeDiff}ms)`
    );
  }
  
  return bestMatch;
}

/**
 * Remove a pending request and clean up indices
 */
export function removePendingRequest(requestId: string): void {
  const request = pendingRequests.get(requestId);
  if (!request) return;
  
  // Remove from URL index
  const indexKey = getIndexKey(request.url, request.tabId);
  const requestIds = urlIndex.get(indexKey);
  if (requestIds) {
    requestIds.delete(requestId);
    if (requestIds.size === 0) {
      urlIndex.delete(indexKey);
    }
  }
  
  // Remove from main map
  pendingRequests.delete(requestId);
}

/**
 * Cleanup old pending requests (older than 30 seconds)
 * Call this periodically to prevent memory leaks
 */
export function cleanupOldRequests(): void {
  const now = Date.now();
  const maxAge = 30_000; // 30 seconds
  let cleanedCount = 0;
  
  for (const [requestId, request] of pendingRequests.entries()) {
    const age = now - request.requestTimestamp;
    if (age > maxAge) {
      removePendingRequest(requestId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[WebRequest Buffer] 🧹 Cleaned up ${cleanedCount} old requests`);
  }
}

/**
 * Get buffer statistics (for debugging)
 */
export function getBufferStats() {
  return {
    pendingCount: pendingRequests.size,
    indexedUrls: urlIndex.size,
  };
}

/**
 * Clear all pending requests for a specific tab
 */
export function clearTabRequests(tabId: number): void {
  let removedCount = 0;
  
  for (const [requestId, request] of pendingRequests.entries()) {
    if (request.tabId === tabId) {
      removePendingRequest(requestId);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`[WebRequest Buffer] 🗑️ Cleared ${removedCount} requests for tab ${tabId}`);
  }
}

