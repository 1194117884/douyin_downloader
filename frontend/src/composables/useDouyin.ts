import { computed, ref } from 'vue'
import type { AwemeDetail } from '../types'
import { parseAwemeId } from '../utils/parseAwemeId'

export const WORKER_URL = import.meta.env.VITE_WORKER_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '/api')

export function sanitizeFilename(name: string): string {
  return name.replace(/[\x00/\\:*?"<>|]/g, '_')
}

export interface VideoAddressOption {
  id: string
  label: string
  url: string
  source: string
  codec?: string
  definition?: string
  fps?: number
  bitrate?: number
  vmaf?: number
  dataSize?: number
}

interface CachedDouyinState {
  videoData: AwemeDetail
  selectedDownloadUrl: string
}

const CACHE_KEY = 'douyin-downloader:last-result'

function readCachedState(): CachedDouyinState | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) {
      return null
    }
    const cached = JSON.parse(raw) as Partial<CachedDouyinState>
    if (!cached.videoData?.aweme_id) {
      return null
    }
    return {
      videoData: cached.videoData as AwemeDetail,
      selectedDownloadUrl: cached.selectedDownloadUrl || '',
    }
  } catch {
    sessionStorage.removeItem(CACHE_KEY)
    return null
  }
}

function writeCachedState(state: CachedDouyinState): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(state))
  } catch {
    // Storage can fail in private browsing or quota-limited environments.
  }
}

function clearCachedState(): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  sessionStorage.removeItem(CACHE_KEY)
}

export function getVideoAddressOptions(videoData: AwemeDetail | null): VideoAddressOption[] {
  if (!videoData) {
    return []
  }

  const bitRateByHash = new Map<string, import('../types').BitRateItem>()
  const bitRateByUrlKey = new Map<string, import('../types').BitRateItem>()
  for (const br of videoData.video?.bit_rate || []) {
    if (br.play_addr?.file_hash) {
      bitRateByHash.set(br.play_addr.file_hash, br)
    }
    if (br.play_addr?.url_key) {
      bitRateByUrlKey.set(br.play_addr.url_key, br)
    }
  }

  function extractMetadata(addr: import('../types').UrlItem | undefined): Partial<VideoAddressOption> {
    if (!addr) return {}

    const base: Partial<VideoAddressOption> = {
      dataSize: addr.data_size,
      definition: addr.height ? `${addr.height}p` : undefined,
    }

    // Try matching by file_hash or url_key against bit_rate entries for richer data
    const br = (addr.file_hash && bitRateByHash.get(addr.file_hash))
      || (addr.url_key && bitRateByUrlKey.get(addr.url_key))
    if (!br) return base

    let vmaf: number | undefined
    if (br.video_extra) {
      try {
        const extra = JSON.parse(br.video_extra) as { u_vmaf?: number }
        vmaf = extra.u_vmaf
      } catch { /* ignore parse errors */ }
    }

    return {
      ...base,
      codec: br.is_h265 || br.is_bytevc1 ? 'H.265' : br.format?.toUpperCase() || undefined,
      definition: br.play_addr?.height ? `${br.play_addr.height}p` : base.definition,
      fps: br.FPS,
      bitrate: br.bit_rate,
      vmaf: vmaf ? Math.round(vmaf * 10) / 10 : undefined,
      dataSize: br.play_addr?.data_size || base.dataSize,
    }
  }

  const groups: Array<{ source: string; urls: string[]; addr: import('../types').UrlItem | undefined }> = [
    { source: 'Download', urls: videoData.video?.download_addr?.url_list || [], addr: videoData.video?.download_addr },
    { source: 'H.264', urls: videoData.video?.play_addr_h264?.url_list || [], addr: videoData.video?.play_addr_h264 },
    { source: 'H.265', urls: videoData.video?.play_addr_265?.url_list || [], addr: videoData.video?.play_addr_265 },
    { source: 'Preview', urls: videoData.video?.play_addr?.url_list || [], addr: videoData.video?.play_addr },
  ]
  const seen = new Set<string>()

  return groups.flatMap((group) =>
    group.urls
      .filter((url) => {
        if (!url || seen.has(url)) {
          return false
        }
        seen.add(url)
        return true
      })
      .map((url, index) => ({
        id: `${group.source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
        label: getAddressHost(url),
        source: group.source,
        url,
        ...extractMetadata(group.addr),
      }))
  )
}

function getAddressHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'Unknown host'
  }
}

export function useDouyin() {
  const cachedState = readCachedState()
  const videoData = ref<AwemeDetail | null>(cachedState?.videoData || null)
  const selectedDownloadUrl = ref(cachedState?.selectedDownloadUrl || '')
  const videoAddressOptions = computed(() => getVideoAddressOptions(videoData.value))
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  let activeController: AbortController | null = null
  let activeRequestId = 0

  async function fetchVideo(rawInput: string): Promise<void> {
    const requestId = activeRequestId + 1
    activeRequestId = requestId
    activeController?.abort()
    activeController = new AbortController()

    isLoading.value = true
    error.value = null
    try {
      const apiKey = import.meta.env.VITE_API_KEY || ''
      const awemeId = await parseAwemeId(rawInput, WORKER_URL, apiKey)
      if (!awemeId) {
        throw new Error('Unable to parse input. Paste a Douyin video ID, share link, or share text.')
      }

      if (!WORKER_URL) {
        throw new Error('VITE_WORKER_URL is required in production builds')
      }

      const response = await fetch(`${WORKER_URL}?aweme_id=${encodeURIComponent(awemeId)}`, {
        signal: activeController.signal,
        headers: {
          'X-API-Key': apiKey,
        },
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || `Worker request failed with status ${response.status}`)
      }

      if (!data?.aweme_detail) {
        throw new Error('Worker response is missing aweme_detail')
      }

      if (requestId !== activeRequestId) {
        return
      }

      videoData.value = data.aweme_detail
      selectedDownloadUrl.value = getVideoAddressOptions(data.aweme_detail)[0]?.url || ''
      writeCachedState({
        videoData: data.aweme_detail,
        selectedDownloadUrl: selectedDownloadUrl.value,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      console.error('fetchVideo failed', err)
      error.value = err instanceof Error ? err.message : 'Request failed'
      videoData.value = null
      selectedDownloadUrl.value = ''
      clearCachedState()
    } finally {
      if (requestId === activeRequestId) {
        isLoading.value = false
        activeController = null
      }
    }
  }

  function selectDownloadUrl(url: string): void {
    if (videoAddressOptions.value.some((option) => option.url === url)) {
      selectedDownloadUrl.value = url
      if (videoData.value) {
        writeCachedState({
          videoData: videoData.value,
          selectedDownloadUrl: url,
        })
      }
    }
  }

  return {
    videoData,
    selectedDownloadUrl,
    videoAddressOptions,
    isLoading,
    error,
    fetchVideo,
    selectDownloadUrl,
  }
}
