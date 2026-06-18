import { randomUA } from './ua';

interface Env {
  ALLOWED_ORIGIN?: string;
  API_KEY?: string;
  ASSETS?: Fetcher;
}

function corsHeaders(origin: string, allowedOrigin = '*'): Record<string, string> {
  const allowed = allowedOrigin === '*' || allowedOrigin === origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : allowed ? origin : allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

    // Short-link resolution: follow redirect and extract the aweme_id
    const resolveUrl = url.searchParams.get('resolve_url')?.trim();
    if (resolveUrl) {
      try {
        const redirectResponse = await fetch(resolveUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': randomUA() },
          signal: AbortSignal.timeout(8000),
        })
        const finalUrl = redirectResponse.url
        const idMatch = finalUrl.match(/https?:\/\/(?:www\.)?(?:ies)?douyin\.com\/(?:share\/)?video\/(\d+)/i)
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
      const targetUrl = `https://www-hj.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${encodeURIComponent(awemeId)}`;
      const upstreamResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': randomUA(),
        },
        signal: AbortSignal.timeout(10000),
      });

      const body = await upstreamResponse.text();
      return new Response(body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: {
          ...corsHeaders(origin, allowedOrigin),
          'Content-Type': upstreamResponse.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (err) {
      console.error('Upstream Douyin request failed', err);
      return jsonResponse({ error: 'Upstream request failed' }, origin, allowedOrigin, { status: 502 });
    }
  },
};
