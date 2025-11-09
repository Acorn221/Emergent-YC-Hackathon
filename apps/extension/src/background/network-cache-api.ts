/**
 * Network Cache API
 * 
 * Public API for accessing cached network requests from other parts of the extension
 */

import {
  getAllEntries,
  getEntriesForTab,
  getCacheStatistics,
  searchByUrl,
  filterEntries,
  clearTabCache,
  clearAllCaches,
  type NetworkCacheEntry,
} from "./cache-state";

/**
 * Get all cached network requests for a specific tab
 */
export function getNetworkCache(tabId: number): NetworkCacheEntry[] {
  return getEntriesForTab(tabId);
}

/**
 * Get all cached network requests across all tabs
 */
export function getAllNetworkCache(): NetworkCacheEntry[] {
  return getAllEntries();
}

/**
 * Search network cache by URL pattern
 */
export function searchNetworkCache(pattern: string, tabId?: number): NetworkCacheEntry[] {
  return searchByUrl(pattern, tabId);
}

/**
 * Filter network cache by various criteria
 */
export function filterNetworkCache(filters: {
  tabId?: number;
  method?: string;
  minStatus?: number;
  maxStatus?: number;
  hasError?: boolean;
  type?: "fetch" | "xhr";
}): NetworkCacheEntry[] {
  return filterEntries(filters);
}

/**
 * Get statistics about cached requests
 */
export function getNetworkCacheStats(tabId?: number) {
  return getCacheStatistics(tabId);
}

/**
 * Clear network cache for a specific tab
 */
export function clearNetworkCacheForTab(tabId: number): number {
  return clearTabCache(tabId);
}

/**
 * Clear all network caches
 */
export function clearAllNetworkCache(): number {
  return clearAllCaches();
}

// Export types
export type { NetworkCacheEntry } from "./cache-state";

