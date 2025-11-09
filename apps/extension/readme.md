# SecShield

A security-focused Chrome extension built with:
- 🎨 [Plasmo](https://plasmo.com/) - Extension framework
- ⚛️ React - UI library
- 🎨 TailwindCSS - Styling
- 🔌 tRPC - Type-safe API calls
- 📦 TypeScript - Type safety
- 🏗️ Monorepo architecture with shared packages

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
Create a `.env` file in the root directory:
```env
PLASMO_PUBLIC_API_URL="http://localhost:3000/api/trpc"
```

3. Development:
```bash
cd apps/extension
pnpm dev
```

4. Build for production:
```bash
cd apps/extension
pnpm build
```

5. Build for Firefox:
```bash
cd apps/extension
pnpm build-firefox
```

### Loading the Extension

#### Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `apps/extension/build/chrome-mv3-dev` (or `chrome-mv3-prod`) directory

#### Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the manifest file from `apps/extension/build/firefox-mv3-prod`

## Project Structure

```
apps/extension/
├── src/
│   ├── background/        # Background scripts
│   │   └── index.ts       # Main background service worker
│   ├── contents/          # Content scripts
│   │   └── main.ts        # Injected into web pages
│   ├── popup/            # Extension popup
│   │   ├── index.tsx     # Popup React component
│   │   └── style.css     # Popup styles
│   └── misc/             # Utilities
│       ├── env.ts        # Environment validation
│       └── utils.ts      # Helper functions
├── assets/               # Static assets
└── package.json
```

## Features

### Background Script
- Service worker that runs in the background
- Handles tRPC API calls
- Manages extension lifecycle events
- LLM conversation management with AI SDK
- Network request caching and analysis

### Content Script
- Runs on web pages matching the configured patterns
- Can interact with the DOM
- Communicates with background script
- **Static Security Analysis** - Automated security auditing

### Popup
- React-based UI
- TailwindCSS styling
- Chrome storage integration
- Message passing with background script

### Static Security Analysis 🔒

The extension includes a comprehensive static security analysis library that can be used by both developers and the LLM agent to audit web pages for security issues.

**What it analyzes:**
- **Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Cookies**: HttpOnly, Secure, SameSite attributes
- **Scripts**: Inline scripts, external sources, integrity checks
- **Forms**: HTTPS submission, autocomplete settings
- **Storage**: Sensitive data in localStorage/sessionStorage

**Usage Methods:**

1. **Browser Console (Manual)**:
```javascript
// Access the global API
const report = await window.__SECURITY_ANALYSIS__.runAnalysis();
console.log(report);
```

2. **LLM Agent** (via conversation):
```
"Run a security analysis on this page"
"Check for critical security vulnerabilities"
"Analyze cookie security"
```

3. **Programmatic** (in content scripts):
```typescript
import { runAnalysis } from '../contents-helpers/static-analysis';
const report = await runAnalysis();
```

For complete API documentation, see [Static Analysis API](./src/contents-helpers/static-analysis/API.md).

## Configuration

### Manifest Permissions
Edit `package.json` to add permissions:
```json
{
  "manifest": {
    "host_permissions": ["*://example.com/*"],
    "permissions": ["storage", "tabs"]
  }
}
```

### Content Script Matching
Edit `src/contents/main.ts` to configure which pages your content script runs on:
```typescript
export const config: PlasmoCSConfig = {
  matches: ["*://example.com/*"],
  run_at: "document_end",
};
```

## tRPC Integration

The extension comes with tRPC client setup for type-safe API calls:

```typescript
import { getTRPCClient } from "@/background";

const trpc = await getTRPCClient();
const result = await trpc.your.endpoint.query();
```

## Workspace Integration

This extension is part of a monorepo and can access shared packages:
- `@acme/api` - tRPC API definitions
- `@acme/ui` - Shared UI components
- `@acme/lib` - Shared utilities
- `@acme/db` - Database schema

## Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for Chrome production
- `pnpm build-firefox` - Build for Firefox production
- `pnpm package` - Package extension for distribution
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking

## Customization

1. **Change popup UI**: Modify `src/popup/index.tsx`
2. **Add background logic**: Edit `src/background/index.ts`
3. **Inject content scripts**: Modify `src/contents/main.ts`
4. **Add message handlers**: Create files in `src/background/messages/`

## Learn More

- [Plasmo Documentation](https://docs.plasmo.com/)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [tRPC Documentation](https://trpc.io/)
- [TailwindCSS Documentation](https://tailwindcss.com/)
