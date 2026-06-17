# Douyin Video Downloader — Frontend + Cloudflare Worker

## Overview

A pure frontend Vue 3 + TypeScript app that lets users download Douyin (抖音) videos by pasting a video ID. A lightweight Cloudflare Worker proxies the Douyin API to bypass CORS, returning only the essential JSON data. Video files are downloaded directly from Douyin's CDN by the browser.

## Architecture

```
User Browser (Vue 3 + TS)
       │
       │  ① GET /aweme/detail?aweme_id=xxx
       ▼
  Cloudflare Worker
       │  ② fetch 抖音 API + random UA header
       ▼
  抖音 API → full JSON response
       │
       │  ③ Worker strips to essential fields, returns JSON
       ▼
  Vue Frontend — renders video info, cover, download button
       │
       │  ④ <a download> or fetch→blob from Douyin CDN URL
       ▼
  抖音 CDN — video file downloaded directly by browser
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
│   │   │   ├── VideoInfo.vue         # cover, title, author display
│   │   │   └── DownloadButton.vue    # triggers browser download
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

### DownloadButton.vue
- Props: `videoUrl: string`
- On click: fetches video as blob, creates `URL.createObjectURL`, triggers `<a>` download
- Handles filename from title/aweme_id, sanitizing illegal characters

## Data Flow (useDouyin.ts)

```ts
// 1. fetchWorker(awemeId) → call Cloudflare Worker
// 2. Worker returns { aweme_id, desc, video: { play_addr, cover } }
// 3. pickBestUrl(url_list) → first working URL
// 4. downloadVideo(url, filename) → fetch blob → trigger download
```

## Worker

### Request Flow
1. Receive `GET /?aweme_id=xxx`
2. Randomly select `User-Agent` from pool
3. Fetch `https://www-hj.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${aweme_id}`
4. Extract only needed fields from response
5. Return as JSON with CORS headers

### UA Pool
- Chrome 131 (Windows, macOS, Linux)
- Firefox 133 (Windows, macOS)
- Safari 18.2 (macOS)
- Edge 131 (Windows)
- Each request picks one at random via `Math.random()`

### Response Shape (returned by Worker)
```json
{
  "aweme_id": "7642657704577715475",
  "desc": "视频描述",
  "video": {
    "play_addr": {
      "url_list": ["https://...", "https://..."]
    },
    "cover": {
      "url_list": ["https://..."]
    }
  }
}
```

## Error Handling

- Invalid/missing aweme_id → Worker returns 400
- Douyin API returns error → Worker forwards status + message
- Network error in browser → show "请求失败" toast in UI
- Video URL expired/unreachable → show "下载链接已失效" in UI

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
