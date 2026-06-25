import { randomUA } from './ua';

interface Env {
  ALLOWED_ORIGIN?: string;
  API_KEY?: string;
  ASSETS?: Fetcher;
}

type SourceName = 'web_detail' | 'share_html';

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A.210817.036) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.79 Mobile Safari/537.36';
const NUMERIC_ID_RE = /^\d{15,25}$/;
const EMBEDDED_ID_RE = /\d{15,25}/;
const DOUYIN_ITEM_ID_RE = /https?:\/\/(?:www\.)?(?:ies)?douyin\.com\/(?:share\/)?(?:video|note)\/(\d+)/i;
const SHORT_LINK_RE = /https?:\/\/v\.douyin\.com\/[a-zA-Z0-9_-]+\/?/i;
const ANY_URL_RE = /https?:\/\/\S+/i;

interface AttemptLog {
  source: SourceName;
  ok: boolean;
  status?: number;
  durationMs: number;
  error?: string;
}

interface UrlItem {
  url_list: string[];
  width?: number;
  height?: number;
  data_size?: number;
  uri?: string;
}

interface NormalizedAwemeDetail {
  aweme_id: string;
  desc: string;
  create_time: number;
  author: {
    nickname: string;
    avatar_thumb?: UrlItem;
  };
  statistics?: {
    comment_count?: number;
    digg_count?: number;
    play_count?: number;
    share_count?: number;
  };
  video: {
    play_addr: UrlItem;
    download_addr?: UrlItem;
    cover?: UrlItem;
    origin_cover?: UrlItem;
    duration: number;
  };
  cover?: string;
}

interface FetchAttemptResult {
  source: SourceName;
  detail: unknown;
}

class FetchPathError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function corsHeaders(origin: string, allowedOrigin = '*'): Record<string, string> {
  const allowed = allowedOrigin === '*' || allowedOrigin === origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : allowed ? origin : allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

function jsonResponse(body: unknown, origin: string, allowedOrigin: string, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(origin, allowedOrigin),
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function isAllowedDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return [
      'aweme.snssdk.com',
      'api-play.amemv.com',
    ].includes(parsed.hostname)
      || parsed.hostname.endsWith('.douyinvod.com')
      || parsed.hostname.endsWith('.douyincdn.com')
      || parsed.hostname.endsWith('.snssdk.com');
  } catch {
    return false;
  }
}

function sanitizeDownloadFilename(value: string, asciiOnly = false): string {
  const cleaned = value.replace(/[\x00/\\:*?"<>|]/g, '_').trim();
  const filename = cleaned || 'douyin-video.mp4';
  return asciiOnly ? filename.replace(/[^\x20-\x7E]/g, '_') : filename;
}

function contentDisposition(filename: string): string {
  const fallback = sanitizeDownloadFilename(filename, true).replace(/"/g, '_');
  const encoded = encodeURIComponent(sanitizeDownloadFilename(filename));
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function proxyDownloadResponse(upstreamResponse: Response, filename: string): Response {
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get('Content-Type') || 'video/mp4';
  const contentLength = upstreamResponse.headers.get('Content-Length');
  const contentRange = upstreamResponse.headers.get('Content-Range');
  const acceptRanges = upstreamResponse.headers.get('Accept-Ranges');

  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', contentDisposition(filename));
  headers.set('Cache-Control', 'private, no-store');
  if (contentLength) headers.set('Content-Length', contentLength);
  if (contentRange) headers.set('Content-Range', contentRange);
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

async function proxyDownloadUrl(downloadUrl: string, filename: string, range?: string | null): Promise<Response> {
  const upstreamResponse = await fetch(downloadUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': MOBILE_UA,
      'Referer': 'https://www.douyin.com/',
      ...(range ? { 'Range': range } : {}),
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    throw new FetchPathError(`Download upstream failed with status ${upstreamResponse.status}`, upstreamResponse.status);
  }

  return proxyDownloadResponse(upstreamResponse, filename);
}

// Simple in-memory rate limiter (per IP, resets on cold-start)
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;       // max requests
const RATE_WINDOW = 60_000;  // per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function hasVideoAddress(detail: unknown): boolean {
  const video = (detail as { video?: { play_addr?: { url_list?: unknown }, download_addr?: { url_list?: unknown } } })?.video;
  const playUrls = video?.play_addr?.url_list;
  const downloadUrls = video?.download_addr?.url_list;
  return (Array.isArray(playUrls) && playUrls.some(Boolean))
    || (Array.isArray(downloadUrls) && downloadUrls.some(Boolean));
}

function getVideoDownloadUrl(detail: unknown): string {
  const video = (detail as { video?: { play_addr?: { url_list?: unknown }, download_addr?: { url_list?: unknown } } })?.video;
  const playUrls = video?.play_addr?.url_list;
  const downloadUrls = video?.download_addr?.url_list;
  const playUrl = Array.isArray(playUrls) ? playUrls.find((url): url is string => typeof url === 'string' && Boolean(url)) : '';
  const downloadUrl = Array.isArray(downloadUrls) ? downloadUrls.find((url): url is string => typeof url === 'string' && Boolean(url)) : '';
  return playUrl || downloadUrl || '';
}

function getDetailText(detail: unknown, key: 'aweme_id' | 'desc'): string {
  const value = (detail as Record<string, unknown>)?.[key];
  return typeof value === 'string' ? value : '';
}

function extractUrl(input: string): string {
  return input.match(ANY_URL_RE)?.[0]?.replace(/[，。),\]]+$/g, '') || '';
}

function extractItemIdFromUrl(url: string): string {
  return url.match(DOUYIN_ITEM_ID_RE)?.[1] || '';
}

async function resolveInputToAwemeId(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Missing input');
  }
  if (NUMERIC_ID_RE.test(trimmed)) {
    return trimmed;
  }

  const url = extractUrl(trimmed);
  if (url) {
    const directId = extractItemIdFromUrl(url);
    if (directId) {
      return directId;
    }

    const shortUrl = url.match(SHORT_LINK_RE)?.[0] || '';
    if (shortUrl) {
      const redirectResponse = await fetch(shortUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': MOBILE_UA },
        signal: AbortSignal.timeout(8000),
      });
      const resolvedId = extractItemIdFromUrl(redirectResponse.url);
      if (resolvedId) {
        return resolvedId;
      }
      throw new Error('Could not extract video ID from redirect URL');
    }
  }

  const embeddedId = trimmed.match(EMBEDDED_ID_RE)?.[0] || '';
  if (embeddedId) {
    return embeddedId;
  }

  throw new Error('Could not extract video ID from input');
}

async function readDirectDownloadInput(request: Request, url: URL): Promise<string> {
  const queryInput = url.searchParams.get('input')?.trim();
  if (queryInput) {
    return queryInput;
  }

  if (request.method !== 'POST') {
    return '';
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json() as { input?: unknown };
    return typeof body.input === 'string' ? body.input : '';
  }

  return request.text();
}

async function fetchWebAwemeDetail(awemeId: string): Promise<FetchAttemptResult> {
  const targetUrl = `https://www-hj.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${encodeURIComponent(awemeId)}`;
  const upstreamResponse = await fetch(targetUrl, {
    headers: {
      'User-Agent': randomUA(),
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await upstreamResponse.text();

  if (!upstreamResponse.ok) {
    throw new FetchPathError(`HTTP ${upstreamResponse.status}`, upstreamResponse.status);
  }

  let data: { aweme_detail?: unknown };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('Response is not valid JSON');
  }

  if (!data?.aweme_detail) {
    throw new Error('Response is missing aweme_detail');
  }

  if (!hasVideoAddress(data.aweme_detail)) {
    throw new Error('aweme_detail has no playable video address');
  }

  return { source: 'web_detail', detail: data.aweme_detail };
}

function cleanEscapedUrl(url: string): string {
  return url
    .replace(/\\\\u002F/g, '/')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&');
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value;
  }
}

function firstMatch(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1] || '';
}

function firstUrlListValue(html: string, key: string): string {
  const match = html.match(new RegExp(`${key}.*?url_list.*?\\["(.*?)"`, 's'));
  return match?.[1] ? cleanEscapedUrl(match[1]) : '';
}

function parseShareHtml(html: string, awemeId: string): NormalizedAwemeDetail {
  const playUrl = firstUrlListValue(html, 'play_addr').replace('/playwm/', '/play/');
  if (!playUrl) {
    throw new Error('HTML is missing play_addr');
  }

  const downloadUrl = firstUrlListValue(html, 'download_addr');
  const coverUrl = firstUrlListValue(html, 'cover');
  const avatarUrl = firstUrlListValue(html, 'avatar_thumb');
  let duration = 0;
  for (const match of html.matchAll(/"duration"\s*:\s*(\d+)/g)) {
    duration = Math.max(duration, Number(match[1]) || 0);
  }
  if (duration > 1000) {
    duration = duration / 1000;
  }

  return {
    aweme_id: awemeId,
    desc: decodeJsonString(firstMatch(html, /"desc"\s*:\s*"([^"]*)"/)),
    create_time: Number(firstMatch(html, /"create_time"\s*:\s*(\d+)/)) || 0,
    author: {
      nickname: decodeJsonString(firstMatch(html, /"nickname"\s*:\s*"([^"]*)"/)),
      ...(avatarUrl ? { avatar_thumb: { url_list: [avatarUrl] } } : {}),
    },
    statistics: {
      digg_count: Number(firstMatch(html, /"digg_count"\s*:\s*(\d+)/)) || 0,
      comment_count: Number(firstMatch(html, /"comment_count"\s*:\s*(\d+)/)) || 0,
      share_count: Number(firstMatch(html, /"share_count"\s*:\s*(\d+)/)) || 0,
      play_count: Number(firstMatch(html, /"play_count"\s*:\s*(\d+)/)) || 0,
    },
    video: {
      play_addr: { url_list: [playUrl] },
      ...(downloadUrl ? { download_addr: { url_list: [downloadUrl] } } : {}),
      ...(coverUrl ? {
        cover: { url_list: [coverUrl] },
        origin_cover: { url_list: [coverUrl] },
      } : {}),
      duration,
    },
    ...(coverUrl ? { cover: coverUrl } : {}),
  };
}

async function fetchShareHtmlDetail(awemeId: string): Promise<FetchAttemptResult> {
  let lastError: unknown;
  for (const contentType of ['video', 'note']) {
    try {
      const targetUrl = `https://www.iesdouyin.com/share/${contentType}/${encodeURIComponent(awemeId)}/`;
      const upstreamResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': MOBILE_UA,
          'Referer': 'https://www.douyin.com/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!upstreamResponse.ok) {
        throw new FetchPathError(`HTTP ${upstreamResponse.status}`, upstreamResponse.status);
      }

      const html = await upstreamResponse.text();
      return { source: 'share_html', detail: parseShareHtml(html, awemeId) };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Share HTML parsing failed');
}

async function withAttempt(
  source: SourceName,
  attempts: AttemptLog[],
  action: () => Promise<FetchAttemptResult>
): Promise<FetchAttemptResult | null> {
  const startedAt = Date.now();
  try {
    const result = await action();
    const durationMs = Date.now() - startedAt;
    attempts.push({ source, ok: true, durationMs });
    console.info(`Douyin ${source} succeeded in ${durationMs}ms`);
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const error = err instanceof Error ? err.message : 'Unknown error';
    const status = err instanceof FetchPathError ? err.status : undefined;
    attempts.push({ source, ok: false, durationMs, ...(status ? { status } : {}), error });
    console.warn(`Douyin ${source} failed in ${durationMs}ms: ${error}`);
    return null;
  }
}

async function fetchBestAwemeDetail(awemeId: string): Promise<{ result: FetchAttemptResult | null, attempts: AttemptLog[] }> {
  const attempts: AttemptLog[] = [];
  const paths: Array<[SourceName, () => Promise<FetchAttemptResult>]> = [
    ['web_detail', () => fetchWebAwemeDetail(awemeId)],
    ['share_html', () => fetchShareHtmlDetail(awemeId)],
  ];

  for (const [source, action] of paths) {
    const result = await withAttempt(source, attempts, action);
    if (result) {
      return { result, attempts };
    }
  }

  return { result: null, attempts };
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const apiKey = env.API_KEY || '';
    const isApiRequest = url.pathname === '/api' || url.pathname.startsWith('/api/');

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, allowedOrigin),
      });
    }

    if (!isApiRequest && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    const ip = request.headers.get('CF-Connecting-IP');

    // Guard 1: rate limit
    if (ip && isRateLimited(ip)) {
      return jsonResponse({ error: 'Too many requests' }, origin, allowedOrigin, { status: 429 });
    }

    // Guard 2: API key
    if (apiKey) {
      const key = request.headers.get('X-API-Key') || url.searchParams.get('api_key') || '';
      if (key !== apiKey) {
        return jsonResponse({ error: 'Unauthorized' }, origin, allowedOrigin, { status: 401 });
      }
    }

    if (url.pathname === '/api/download') {
      const downloadUrl = url.searchParams.get('url')?.trim() || '';
      if (!downloadUrl) {
        return jsonResponse({ error: 'Missing url parameter' }, origin, allowedOrigin, { status: 400 });
      }
      if (!isAllowedDownloadUrl(downloadUrl)) {
        return jsonResponse({ error: 'Download URL is not allowed' }, origin, allowedOrigin, { status: 400 });
      }

      try {
        const range = request.headers.get('Range');
        return await proxyDownloadUrl(downloadUrl, url.searchParams.get('filename') || 'douyin-video.mp4', range);
      } catch (err) {
        console.error('Download proxy failed', err);
        if (err instanceof FetchPathError) {
          return jsonResponse(
            { error: err.message },
            origin,
            allowedOrigin,
            { status: 502 }
          );
        }
        return jsonResponse({ error: 'Download proxy failed' }, origin, allowedOrigin, { status: 502 });
      }
    }

    if (url.pathname === '/api/direct-download') {
      try {
        const input = await readDirectDownloadInput(request, url);
        const awemeId = await resolveInputToAwemeId(input);
        const { result } = await fetchBestAwemeDetail(awemeId);
        if (!result) {
          return jsonResponse({ error: 'All Douyin fetch paths failed' }, origin, allowedOrigin, { status: 502 });
        }

        const downloadUrl = getVideoDownloadUrl(result.detail);
        if (!downloadUrl || !isAllowedDownloadUrl(downloadUrl)) {
          return jsonResponse({ error: 'No allowed video download URL found' }, origin, allowedOrigin, { status: 502 });
        }

        const title = getDetailText(result.detail, 'desc');
        const filename = `${awemeId}${title ? `-${title}` : ''}.mp4`;
        return await proxyDownloadUrl(downloadUrl, filename, request.headers.get('Range'));
      } catch (err) {
        console.error('Direct download failed', err);
        const message = err instanceof Error ? err.message : 'Direct download failed';
        return jsonResponse({ error: message }, origin, allowedOrigin, { status: 400 });
      }
    }

    // Short-link resolution: follow redirect and extract the aweme_id
    const resolveUrl = url.searchParams.get('resolve_url')?.trim();
    if (resolveUrl) {
      try {
        const redirectResponse = await fetch(resolveUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': MOBILE_UA },
          signal: AbortSignal.timeout(8000),
        })
        const finalUrl = redirectResponse.url
        const idMatch = finalUrl.match(/https?:\/\/(?:www\.)?(?:ies)?douyin\.com\/(?:share\/)?(?:video|note)\/(\d+)/i)
        if (idMatch) {
          return jsonResponse({ aweme_id: idMatch[1] }, origin, allowedOrigin)
        }
        return jsonResponse({ error: 'Could not extract video ID from redirect URL' }, origin, allowedOrigin, { status: 422 })
      } catch (err) {
        console.error('Short-link resolution failed', err)
        return jsonResponse({ error: 'Failed to resolve short link' }, origin, allowedOrigin, { status: 502 })
      }
    }

    const awemeId = url.searchParams.get('aweme_id')?.trim();
    if (!awemeId) {
      return jsonResponse({ error: 'Missing aweme_id or resolve_url parameter' }, origin, allowedOrigin, { status: 400 });
    }

    try {
      const { result, attempts } = await fetchBestAwemeDetail(awemeId);
      const debug = url.searchParams.get('debug') === '1';
      if (!result) {
        return jsonResponse(
          { error: 'All Douyin fetch paths failed', ...(debug ? { attempts } : {}) },
          origin,
          allowedOrigin,
          { status: 502 }
        );
      }

      return jsonResponse({
        aweme_detail: result.detail,
        source: result.source,
        ...(debug ? { attempts } : {}),
      }, origin, allowedOrigin);
    } catch (err) {
      console.error('Upstream Douyin request failed', err);
      return jsonResponse({ error: 'Upstream request failed' }, origin, allowedOrigin, { status: 502 });
    }
  },
};
