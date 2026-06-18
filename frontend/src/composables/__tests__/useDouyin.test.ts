import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getVideoAddressOptions, sanitizeFilename, useDouyin } from '../useDouyin'
import * as parseAwemeIdModule from '../../utils/parseAwemeId'

const mockAwemeDetail = {
  aweme_id: '7425930648738942775',
  desc: 'Test video description',
  create_time: 1234567890,
  author: { nickname: 'Test Author' },
  video: {
    play_addr: { url_list: ['https://example.com/video.mp4'] },
    download_addr: { url_list: ['https://example.com/download.mp4', 'https://api-play.amemv.com/video.mp4'] },
    play_addr_h264: { url_list: ['https://example.com/video.mp4', 'https://h264.example.com/video.mp4'] },
    duration: 30,
  },
}

const mockApiResponse = {
  aweme_detail: mockAwemeDetail,
}

describe('useDouyin', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    sessionStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('initial state has videoData=null, isLoading=false, error=null', () => {
    const { videoData, isLoading, error } = useDouyin()
    expect(videoData.value).toBeNull()
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('fetchVideo sets isLoading=true then on success sets videoData and isLoading=false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    )

    const { fetchVideo, videoData, isLoading, error } = useDouyin()

    const fetchPromise = fetchVideo('7425930648738942775')
    expect(isLoading.value).toBe(true)

    await fetchPromise

    expect(isLoading.value).toBe(false)
    expect(videoData.value).toEqual(mockAwemeDetail)
    expect(error.value).toBeNull()
  })

  it('persists successful video data in sessionStorage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    )

    const { fetchVideo, selectedDownloadUrl } = useDouyin()
    await fetchVideo('7425930648738942775')

    const cached = JSON.parse(sessionStorage.getItem('douyin-downloader:last-result') || '{}')
    expect(cached.videoData).toEqual(mockAwemeDetail)
    expect(cached.selectedDownloadUrl).toBe(selectedDownloadUrl.value)
  })

  it('restores the last successful result from sessionStorage', () => {
    sessionStorage.setItem('douyin-downloader:last-result', JSON.stringify({
      videoData: mockAwemeDetail,
      selectedDownloadUrl: 'https://example.com/download.mp4',
    }))

    const { videoData, selectedDownloadUrl, videoAddressOptions } = useDouyin()

    expect(videoData.value).toEqual(mockAwemeDetail)
    expect(selectedDownloadUrl.value).toBe('https://example.com/download.mp4')
    expect(videoAddressOptions.value.length).toBeGreaterThan(0)
  })

  it('fetchVideo on network error sets error from the thrown error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const { fetchVideo, videoData, isLoading, error } = useDouyin()

    await fetchVideo('7425930648738942775')

    expect(isLoading.value).toBe(false)
    expect(videoData.value).toBeNull()
    expect(error.value).toBe('Network error')
  })

  it('fetchVideo on HTTP error sets error and clears stale videoData', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockApiResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }))

    const { fetchVideo, videoData, error } = useDouyin()

    await fetchVideo('7425930648738942775')
    expect(videoData.value).toEqual(mockAwemeDetail)

    await fetchVideo('7425930648738942775')

    expect(videoData.value).toBeNull()
    expect(error.value).toBe('forbidden')
  })

  it('fetchVideo ignores stale responses from earlier requests', async () => {
    let callCount = 0
    const responses: Array<(value: Response) => void> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return new Promise<Response>((resolve) => {
        responses[callCount] = resolve
        callCount++
      })
    })

    const { fetchVideo, videoData, isLoading } = useDouyin()
    const firstRequest = fetchVideo('1111111111111111111')
    const secondRequest = fetchVideo('2222222222222222222')

    // Flush microtask queue so both parseAwemeId + fetch calls complete
    await Promise.resolve()

    // Second response resolves first (the stale case)
    responses[1](new Response(JSON.stringify({
      aweme_detail: { ...mockAwemeDetail, aweme_id: 'second' },
    }), { status: 200 }))
    await secondRequest

    expect(videoData.value?.aweme_id).toBe('second')
    expect(isLoading.value).toBe(false)

    // First (stale) response arrives late — should be ignored
    responses[0](new Response(JSON.stringify({
      aweme_detail: { ...mockAwemeDetail, aweme_id: 'first' },
    }), { status: 200 }))
    await firstRequest

    expect(videoData.value?.aweme_id).toBe('second')
    expect(isLoading.value).toBe(false)
  })

  it('fetchVideo calls Worker with correct aweme_id query param', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    )

    const { fetchVideo } = useDouyin()
    await fetchVideo('7425930648738942775')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callUrl = fetchSpy.mock.calls[0][0] as string
    expect(callUrl).toContain('aweme_id=7425930648738942775')
  })

  it('fetchVideo URL-encodes aweme_id query param', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    )
    vi.spyOn(parseAwemeIdModule, 'parseAwemeId').mockResolvedValue('id&with=value#hash')

    const { fetchVideo } = useDouyin()
    await fetchVideo('some-raw-input')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callUrl = fetchSpy.mock.calls[0][0] as string
    expect(callUrl).toContain('aweme_id=id%26with%3Dvalue%23hash')
  })

  it('fetchVideo sets error when parseAwemeId returns null (unrecognizable input)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.spyOn(parseAwemeIdModule, 'parseAwemeId').mockResolvedValue(null)

    const { fetchVideo, error, isLoading } = useDouyin()
    await fetchVideo('garbage text without any valid ID or URL')

    expect(error.value).toBe('Unable to parse input. Paste a Douyin video ID, share link, or share text.')
    expect(isLoading.value).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getVideoAddressOptions returns deduplicated address choices', () => {
    const options = getVideoAddressOptions(mockAwemeDetail)

    expect(options.map((option) => option.url)).toEqual([
      'https://example.com/download.mp4',
      'https://api-play.amemv.com/video.mp4',
      'https://example.com/video.mp4',
      'https://h264.example.com/video.mp4',
    ])
    expect(options[0]).toMatchObject({
      source: 'Download',
      label: 'example.com',
    })
  })

  it('sanitizeFilename removes illegal characters / \\ : * ? " < > |', () => {
    const dirty = 'file/name\\with:illegal*chars?here"and<and>and|end'
    const result = sanitizeFilename(dirty)
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
    expect(result).not.toContain(':')
    expect(result).not.toContain('*')
    expect(result).not.toContain('?')
    expect(result).not.toContain('"')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).not.toContain('|')
    expect(result).toBe('file_name_with_illegal_chars_here_and_and_and_end')
  })

  it('sanitizeFilename removes null bytes', () => {
    expect(sanitizeFilename('bad\x00name')).toBe('bad_name')
  })
})
