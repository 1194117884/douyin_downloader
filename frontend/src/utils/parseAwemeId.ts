/** Pure numeric Douyin aweme ID (typically 15–25 digits). */
const NUMERIC_ID_RE = /^\d{15,25}$/

/**
 * Extract video ID from douyin / iesdouyin URLs.
 * Handles both:
 *   - www.iesdouyin.com/share/video/7651487458273602789/...
 *   - www.douyin.com/video/7651487458273602789?...
 */
const DOUYIN_VIDEO_ID_RE = /https?:\/\/(?:www\.)?(?:ies)?douyin\.com\/(?:share\/)?video\/(\d+)/i

/** Short link from v.douyin.com — needs redirect follow to resolve. */
const SHORT_LINK_RE = /https?:\/\/v\.douyin\.com\/[a-zA-Z0-9]+/i

/** Generic URL extractor — picks the first http(s) URL from arbitrary text. */
const ANY_URL_RE = /https?:\/\/\S+/i

/**
 * Parse user input and return the aweme_id, or `null` if no valid ID found.
 *
 * Accepted formats:
 *  1. Plain numeric ID:  "7651487458273602789"
 *  2. Full share URL:    "https://www.iesdouyin.com/share/video/7651487458273602789/..."
 *  3. Video page URL:    "https://www.douyin.com/video/7651487458273602789?..."
 *  4. Short link:        "https://v.douyin.com/7EGQ5sV0MZU/"
 *  5. Messy share text containing any of the above URLs.
 *
 * @param input       Raw user input (ID, URL, or messy share text).
 * @param workerBaseUrl  Base URL of the Cloudflare Worker (needed to resolve short links).
 *                       If omitted, short links cannot be resolved.
 * @param apiKey         Optional API key for Worker-proxied short-link resolution.
 */
export async function parseAwemeId(input: string, workerBaseUrl?: string, apiKey?: string): Promise<string | null> {
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1. Pure numeric ID — use directly
  if (NUMERIC_ID_RE.test(trimmed)) {
    return trimmed
  }

  // 2. Extract the first URL from the input (handles messy share text)
  const urlMatch = trimmed.match(ANY_URL_RE)
  if (!urlMatch) return null

  const url = urlMatch[0]

  // 3. Full douyin / iesdouyin URL — extract ID from path
  const videoMatch = url.match(DOUYIN_VIDEO_ID_RE)
  if (videoMatch) return videoMatch[1]!

  // 4. Short link — resolve via Worker (or direct fetch as fallback)
  if (SHORT_LINK_RE.test(url)) {
    return resolveShortLink(url, workerBaseUrl, apiKey)
  }

  return null
}

/**
 * Follow a v.douyin.com short link redirect and extract the video ID.
 *
 * In the browser, we must proxy through the Cloudflare Worker because
 * CORS blocks direct cross-origin fetch to v.douyin.com.
 *
 * If `workerBaseUrl` is provided, use the Worker's resolve_url endpoint.
 * Otherwise, try a direct fetch (works in Node.js / testing environments).
 */
async function resolveShortLink(shortUrl: string, workerBaseUrl?: string, apiKey?: string): Promise<string | null> {
  try {
    let finalUrl: string

    if (workerBaseUrl) {
      // Browser path: proxy through Worker to avoid CORS
      const resolveEndpoint = `${workerBaseUrl}?resolve_url=${encodeURIComponent(shortUrl)}`
      const response = await fetch(resolveEndpoint, {
        headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
      })
      if (!response.ok) return null
      const data = await response.json()
      return data?.aweme_id || null
    }

    // Fallback: direct fetch (Node.js / test environments without CORS)
    const response = await fetch(shortUrl, { redirect: 'follow' })
    finalUrl = response.url
    const match = finalUrl.match(DOUYIN_VIDEO_ID_RE)
    return match ? match[1]! : null
  } catch {
    return null
  }
}
