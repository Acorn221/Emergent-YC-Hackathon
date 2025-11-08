/**
 * Network Cache State Management
 * 
 * Original implementation - manages in-memory cache of network requests per tab
 */

export interface NetworkCacheEntry {
  id: string;
  tabId: number;
  capturedAt: number;
  
  // Request data
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    timestamp: number;
  };
  
  // Response data
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: string;
    contentType?: string;
  };
  
  // Timing information
  timing: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
  
  // Metadata
  metadata: {
    requestType: "fetch" | "xhr";
    hasError: boolean;
    errorMessage?: string;
  };
}

// Global state: Map of tabId -> Map of entryId -> entry
const tabCaches = new Map<number, Map<string, NetworkCacheEntry>>();

// Counter for generating unique IDs per tab
const tabCounters = new Map<number, number>();

/**
 * Get or create cache for a specific tab
 */
export function getTabCache(tabId: number): Map<string, NetworkCacheEntry> {
  let cache = tabCaches.get(tabId);
  if (!cache) {
    cache = new Map();
    tabCaches.set(tabId, cache);
  }
  return cache;
}

/**
 * Generate unique ID for a request in a specific tab
 */
export function generateEntryId(tabId: number, type: "fetch" | "xhr"): string {
  const counter = tabCounters.get(tabId) || 0;
  const newCounter = counter + 1;
  tabCounters.set(tabId, newCounter);
  
  return `${type}-${tabId}-${newCounter}-${Date.now()}`;
}

/**
 * Add entry to cache
 */
export function addCacheEntry(entry: NetworkCacheEntry): void {
  const cache = getTabCache(entry.tabId);
  cache.set(entry.id, entry);
  
  // Prevent memory overflow - keep max 1000 entries per tab
  if (cache.size > 1000) {
    // Remove oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey as string);
    }
  }
}

/**
 * Get all entries for a tab
 */
export function getEntriesForTab(tabId: number): NetworkCacheEntry[] {
  const cache = getTabCache(tabId);
  return Array.from(cache.values());
}

/**
 * Get all entries across all tabs
 */
export function getAllEntries(): NetworkCacheEntry[] {
  const allEntries: NetworkCacheEntry[] = [];
  for (const cache of tabCaches.values()) {
    allEntries.push(...cache.values());
  }
  return allEntries;
}

/**
 * Clear cache for specific tab
 */
export function clearTabCache(tabId: number): number {
  const cache = tabCaches.get(tabId);
  if (!cache) return 0;
  
  const count = cache.size;
  cache.clear();
  return count;
}

/**
 * Clear all caches
 */
export function clearAllCaches(): number {
  let totalCleared = 0;
  for (const cache of tabCaches.values()) {
    totalCleared += cache.size;
  }
  tabCaches.clear();
  tabCounters.clear();
  return totalCleared;
}

/**
 * Get cache statistics
 */
export function getCacheStatistics(tabId?: number): {
  totalEntries: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  errorCount: number;
} {
  const entries = tabId !== undefined ? getEntriesForTab(tabId) : getAllEntries();
  
  const stats = {
    totalEntries: entries.length,
    byMethod: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    errorCount: 0,
  };
  
  for (const entry of entries) {
    // Count by method
    const method = entry.request.method;
    stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
    
    // Count by status
    const statusGroup = `${Math.floor(entry.response.status / 100)}xx`;
    stats.byStatus[statusGroup] = (stats.byStatus[statusGroup] || 0) + 1;
    
    // Count by type
    const type = entry.metadata.requestType;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    
    // Count errors
    if (entry.metadata.hasError) {
      stats.errorCount++;
    }
  }
  
  return stats;
}

/**
 * Search entries by URL pattern
 */
export function searchByUrl(pattern: string, tabId?: number): NetworkCacheEntry[] {
  const entries = tabId !== undefined ? getEntriesForTab(tabId) : getAllEntries();
  const lowerPattern = pattern.toLowerCase();
  
  return entries.filter(entry => 
    entry.request.url.toLowerCase().includes(lowerPattern)
  );
}

/**
 * Filter entries by criteria
 */
export function filterEntries(criteria: {
  tabId?: number;
  method?: string;
  minStatus?: number;
  maxStatus?: number;
  hasError?: boolean;
  type?: "fetch" | "xhr";
}): NetworkCacheEntry[] {
  const entries = criteria.tabId !== undefined 
    ? getEntriesForTab(criteria.tabId) 
    : getAllEntries();
  
  return entries.filter(entry => {
    if (criteria.method && entry.request.method !== criteria.method) {
      return false;
    }
    if (criteria.minStatus && entry.response.status < criteria.minStatus) {
      return false;
    }
    if (criteria.maxStatus && entry.response.status > criteria.maxStatus) {
      return false;
    }
    if (criteria.hasError !== undefined && entry.metadata.hasError !== criteria.hasError) {
      return false;
    }
    if (criteria.type && entry.metadata.requestType !== criteria.type) {
      return false;
    }
    return true;
  });
}

/**
 * Cleanup caches for closed tabs
 */
export function cleanupClosedTab(tabId: number): void {
  tabCaches.delete(tabId);
  tabCounters.delete(tabId);
}

