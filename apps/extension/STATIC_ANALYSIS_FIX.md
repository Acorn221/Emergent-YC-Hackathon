# Static Analysis Fix - Chrome API Issue

## Problem

When the LLM tried to run static analysis, it encountered this error:

```
VM855:4 Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'getURL')
    at eval (eval at executeScript (script-executor.2838c4c1.js:1:2321), <anonymous>:4:61)
```

**Root Cause**: The original implementation tried to dynamically import the static analysis library using `chrome.runtime.getURL()` in the page's MAIN world context, where Chrome extension APIs are not available.

## Solution

Changed the execution model from **MAIN world** to **ISOLATED world** (content script context):

### Before (❌ Broken)

```javascript
// Tried to run in MAIN world via script executor
const code = `
  const { runAnalysis } = await import(chrome.runtime.getURL('...')); // ❌ chrome not available
  const report = await runAnalysis();
`;
await scriptExecutionManager.queueScriptExecution(tabId, code);
```

### After (✅ Working)

```javascript
// Send message directly to content script running in ISOLATED world
const response = await chrome.tabs.sendMessage(tabId, {
  type: "RUN_STATIC_ANALYSIS",
});
```

## Changes Made

### 1. Created Static Analysis Runner Content Script
**File**: `src/contents/static-analysis-runner.ts`

- Runs in **ISOLATED world** where chrome APIs work
- Listens for `RUN_STATIC_ANALYSIS` messages
- Imports and executes the static analysis library
- Returns results via `sendResponse`

### 2. Updated Conversation Manager
**File**: `src/background/conversation-manager.ts`

- Changed from `scriptExecutionManager.queueScriptExecution()` 
- To `chrome.tabs.sendMessage()` for direct communication
- Simpler, more reliable approach

### 3. Added Relay Configuration
**File**: `src/contents/relay.ts`

- Added relay for `run-static-analysis` message (for future use)

## Benefits of New Approach

1. **✅ Chrome APIs Available**: ISOLATED world has full access to extension APIs
2. **✅ Proper Module Imports**: Can use ES6 imports naturally
3. **✅ Simpler**: No script execution queue needed
4. **✅ More Reliable**: Direct message passing
5. **✅ Better Error Handling**: Proper promise-based communication

## Chrome Extension Worlds Comparison

| Feature | MAIN World | ISOLATED World |
|---------|-----------|----------------|
| Chrome APIs | ❌ Not available | ✅ Available |
| Page DOM | ✅ Access | ✅ Access |
| Page JS | ✅ Access | ❌ Separate context |
| ES6 Imports | ⚠️ Limited | ✅ Full support |
| Use Case | Page manipulation | Extension features |

## Testing

To test the fix:

1. **LLM Test**:
   ```
   User: "Run a security analysis on this page"
   LLM: [Should successfully call tool and return findings]
   ```

2. **Console Test** (still works):
   ```javascript
   const report = await window.__SECURITY_ANALYSIS__.runAnalysis();
   ```

## Why This Approach?

The static analysis library needs to:
- ✅ Access the page DOM (to analyze elements)
- ✅ Use Chrome extension APIs (document.cookie, etc.)
- ✅ Import ES6 modules properly

**ISOLATED world** is the perfect fit as it has both DOM access and Chrome APIs, while MAIN world only has DOM access.

## Architecture Update

```
Old Flow (Broken):
LLM → Background → Script Executor (MAIN) → ❌ chrome.runtime undefined

New Flow (Working):
LLM → Background → chrome.tabs.sendMessage → Content Script (ISOLATED) → ✅ Analysis runs
```

## Related Files

- ✅ `/src/contents/static-analysis-runner.ts` - NEW: Runner in ISOLATED world
- ✅ `/src/background/conversation-manager.ts` - UPDATED: Use sendMessage
- ✅ `/src/contents/relay.ts` - UPDATED: Add relay config
- 📝 `/src/contents/main.ts` - Still initializes global API (unchanged)
- 📝 `/src/contents-helpers/static-analysis/*` - Library itself (unchanged)

