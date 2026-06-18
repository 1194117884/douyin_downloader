# Douyin Downloader

A frontend-focused Douyin video metadata inspector and downloader. Paste a video ID, share link, or share text — get creator details, media statistics, and direct download access.

## Architecture

```
User Browser (Vue 3 + TypeScript)
       │
       │  GET /api?aweme_id=xxx
       ▼
Cloudflare Worker (pass-through proxy, no data mutation)
       │  fetch Douyin API + random User-Agent
       ▼
Douyin API → raw JSON response
       │
       │  Worker returns raw JSON as-is (CORS headers added)
       ▼
Vue Frontend — parses JSON, extracts video info, renders UI
       │
       │  <a download> or fetch→blob from Douyin CDN URL
       ▼
Douyin CDN — video file downloaded directly by browser
```

**Design principle:** The Worker is intentionally dumb — it only forwards requests and adds CORS headers. All data parsing, extraction, and download logic lives in the frontend.

## Project Structure

```
douyin_downloader/
├── frontend/                # Vue 3 + TypeScript (Vite)
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   ├── components/
│   │   │   ├── VideoInput.vue        # ID input + fetch trigger
│   │   │   └── VideoInfo.vue         # Metadata display + download links
│   │   ├── composables/
│   │   │   └── useDouyin.ts          # API calls, caching, download logic
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript types for API response
│   │   └── utils/
│   │       └── parseAwemeId.ts       # Extract video ID from URLs/share text
│   └── ...
│
├── worker/                  # Cloudflare Worker (proxy)
│   ├── src/
│   │   ├── index.ts                  # Request handler
│   │   └── ua.ts                     # User-Agent pool + random picker
│   └── ...
│
├── scripts/
│   └── deploy.sh            # One-command deploy (tests → build → deploy)
│
└── docs/
    └── superpowers/specs/   # Design specification
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI (`npm install -g wrangler`)
- A [Cloudflare](https://cloudflare.com) account

## Quick Start

### 1. Clone and install dependencies

```bash
git clone <repo-url> douyin-downloader
cd douyin-downloader
npm --prefix frontend install
npm --prefix worker install
```

### 2. Configure environment

**Frontend (development):**

```bash
cp frontend/.env.example frontend/.env
# Edit frontend/.env:
#   VITE_WORKER_URL → your Worker URL (http://localhost:8787 for local dev)
#   VITE_API_KEY    → your API key (or leave empty if no auth)
```

**Frontend (production):**

```bash
cp frontend/.env.production.example frontend/.env.production
# Edit frontend/.env.production:
#   VITE_WORKER_URL → /api (same-origin deployment)
#   VITE_API_KEY    → your API key
```

**Worker:**

```bash
# Set API key as a secret (recommended):
wrangler -c worker/wrangler.toml secret put API_KEY

# Or set as a plaintext variable (development only):
# Edit worker/wrangler.toml → [vars] → uncomment and set API_KEY
```

### 3. Start development

```bash
# Terminal 1: Start the Worker
cd worker && wrangler dev

# Terminal 2: Start the frontend
cd frontend && npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Run tests

```bash
npm --prefix frontend test
npm --prefix worker test
```

## Deployment

```bash
# One-command deploy (runs tests, builds frontend, deploys to Cloudflare):
bash scripts/deploy.sh

# Or step by step:
npm --prefix frontend run build
cd worker && wrangler deploy
```

## Configuration Reference

### Frontend environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_WORKER_URL` | Worker API endpoint | `http://localhost:8787` (dev) / `/api` (prod) |
| `VITE_API_KEY` | API key sent as `X-API-Key` header | (empty — no auth) |

### Worker variables

| Variable | Description | Set via |
|----------|-------------|--------|
| `API_KEY` | Required API key for requests (empty = public mode) | `wrangler secret put API_KEY` |
| `ALLOWED_ORIGIN` | CORS allowed origin | `wrangler.toml` [vars] or `wrangler secret` |

## Security & Privacy

- **No tracking or analytics.** This application collects zero user data.
- **No server-side storage.** The Worker is stateless — it proxies requests and forgets everything.
- **API key auth is optional.** Leave `API_KEY` empty to run in public mode.
- **Secrets management.** Use `wrangler secret put` for `API_KEY`. Never commit secrets to version control.
- **Client IP protection.** The Worker proxies all requests to Douyin from Cloudflare's IP — the user's IP is never exposed to third-party services.
- **Session-only caching.** The frontend uses `sessionStorage` (cleared on tab close) to restore the last result on page refresh. No data persists beyond the browsing session.
- **`.env` files are gitignored.** Development and production env files are excluded from version control.

## License

MIT
