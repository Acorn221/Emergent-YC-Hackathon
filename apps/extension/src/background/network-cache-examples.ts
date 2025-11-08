/**
 * Test/Demo for Network Cache
 * 
 * This file demonstrates how to access the network cache from the popup or other parts of the extension
 */

import {
  getNetworkCache,
  getAllNetworkCache,
  searchNetworkCache,
  filterNetworkCache,
  getNetworkCacheStats,
  clearNetworkCacheForTab,
  clearAllNetworkCache,
  type NetworkCacheEntry,
} from "./network-cache-api";

// Example 1: Get all requests for current tab
export async function getCurrentTabRequests(): Promise<NetworkCacheEntry[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return [];
  
  return getNetworkCache(tab.id);
}

// Example 2: Get POST requests with errors
export function getFailedPOSTRequests(tabId?: number): NetworkCacheEntry[] {
  return filterNetworkCache({
    tabId,
    method: "POST",
    hasError: true,
  });
}

// Example 3: Search for API calls
export function findAPIRequests(apiDomain: string, tabId?: number): NetworkCacheEntry[] {
  return searchNetworkCache(apiDomain, tabId);
}

// Example 4: Get statistics
export async function logCurrentTabStats(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return;
  
  const stats = getNetworkCacheStats(tab.id);
  console.log("=== Network Cache Stats ===");
  console.log(`Total Requests: ${stats.totalEntries}`);
  console.log("By Method:", stats.byMethod);
  console.log("By Status:", stats.byStatus);
  console.log("By Type:", stats.byType);
  console.log(`Errors: ${stats.errorCount}`);
}

// Example 5: Clear cache
export async function clearCurrentTabCache(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return 0;
  
  return clearNetworkCacheForTab(tab.id);
}

// Example 6: Get all 4xx and 5xx errors
export function getHTTPErrors(tabId?: number): NetworkCacheEntry[] {
  const fourXX = filterNetworkCache({ tabId, minStatus: 400, maxStatus: 499 });
  const fiveXX = filterNetworkCache({ tabId, minStatus: 500, maxStatus: 599 });
  return [...fourXX, ...fiveXX];
}

// Example 7: Monitor specific endpoint
export function monitorEndpoint(
  endpoint: string,
  tabId?: number
): {
  requests: NetworkCacheEntry[];
  successRate: number;
  avgDuration: number;
} {
  const requests = searchNetworkCache(endpoint, tabId);
  const successful = requests.filter(r => r.response.status >= 200 && r.response.status < 300);
  const totalDuration = requests.reduce((sum, r) => sum + r.timing.durationMs, 0);
  
  return {
    requests,
    successRate: requests.length > 0 ? (successful.length / requests.length) * 100 : 0,
    avgDuration: requests.length > 0 ? totalDuration / requests.length : 0,
  };
}

