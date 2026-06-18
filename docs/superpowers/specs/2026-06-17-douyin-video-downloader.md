# Douyin Video Downloader — Frontend + Cloudflare Worker

## Overview

A pure frontend Vue 3 + TypeScript app that lets users download Douyin videos by pasting a video ID. A lightweight Cloudflare Worker acts as a pure pass-through proxy to bypass CORS — it forwards the raw Douyin API JSON response without any modification. All data parsing, extraction, and control lives in the frontend. Video files are downloaded directly from Douyin's CDN by the browser.

## Architecture

```
User Browser (Vue 3 + TS)
       │
       │  ① GET /aweme/detail?aweme_id=xxx
       ▼
  Cloudflare Worker (pure proxy, no data mutation)
       │  ② fetch Douyin API + random UA header
       ▼
  Douyin API → raw JSON response
       │
       │  ③ Worker returns raw JSON as-is (pass-through)
       ▼
  Vue Frontend — parses JSON, extracts video info, renders UI
       │
       │  ④ <a download> or fetch→blob from Douyin CDN URL
       ▼
  Douyin CDN — video file downloaded directly by browser
```

## Project Structure

```
douyin_downloader/
├── frontend/                # Vue 3 + TypeScript (Vite)
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   ├── components/
│   │   │   ├── VideoInput.vue        # aweme_id input + fetch trigger
│   │   │   └── VideoInfo.vue         # cover, title, author, download links
│   │   ├── composables/
│   │   │   └── useDouyin.ts          # fetch Worker, parse data, download logic
│   │   ├── types/
│   │   │   └── douyin.ts             # TypeScript types for API response
│   │   └── style.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── eslint.config.js
│
└── worker/                  # Cloudflare Worker
    ├── src/
    │   ├── index.ts                  # request handler (~30 lines)
    │   └── ua.ts                     # UA pool + random picker
    ├── package.json
    ├── tsconfig.json
    └── wrangler.toml
```

## Components

### VideoInput.vue
- Text input for `aweme_id`
- "Fetch" button
- Loading/error states
- Emits `videoData` on success

### VideoInfo.vue
- Props: `videoData: DouyinVideo`
- Displays: cover image, description, author, duration
- Purely presentational

## Data Flow (useDouyin.ts)

```ts
// 1. fetchWorker(awemeId) → call Cloudflare Worker (pass-through proxy)
// 2. Worker returns raw Douyin JSON as-is (no modification)
// 3. Frontend parses: aweme_detail.video.play_addr.url_list, desc, author, cover, etc.
// 4. pickBestUrl(url_list) → first working URL
// 5. downloadVideo(url, filename) → fetch blob → trigger download
```

## Worker

The Worker is a **pure pass-through proxy** — it does NOT parse, transform, or modify the Douyin response in any way.

### Request Flow
1. Receive `GET /?aweme_id=xxx`
2. Randomly select `User-Agent` from pool
3. Fetch `https://www-hj.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${aweme_id}`
4. Return the raw JSON response as-is with CORS headers

### UA Pool
- Chrome 131 (Windows, macOS, Linux)
- Firefox 133 (Windows, macOS)
- Safari 18.2 (macOS)
- Edge 131 (Windows)
- Each request picks one at random via `Math.random()`

### Design Principle
Workers should be simple — just forward the Duck API and get JSON data, all data manipulation in the front-end website.

## Error Handling

- Invalid/missing aweme_id → Worker returns 400
- Douyin API returns error → Worker forwards status + message
- Network error in browser → show "Request failed" toast in UI
- Video URL expired/unreachable → show "Download link expired" in UI

## Tooling

- **Vite** — dev server + build
- **TypeScript** — strict mode
- **ESLint** — `@typescript-eslint` + `eslint-plugin-vue`
- **Wrangler** — `wrangler deploy` for Worker deployment

## Deployment

- Frontend: static hosting (Vercel, Cloudflare Pages, or any static server)
- Worker: `wrangler deploy` to Cloudflare Workers

## Out of Scope (this branch)

- Backend server / database
- Authentication / user accounts
- Batch / concurrent downloads
- Sharing link parsing (video ID only for now)
- Watermark removal
