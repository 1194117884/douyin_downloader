import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseAwemeId } from '../parseAwemeId'

describe('parseAwemeId', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ---- Plain numeric ID ----
  it('returns the ID when input is a pure numeric aweme ID', async () => {
    const result = await parseAwemeId('7651487458273602789')
    expect(result).toBe('7651487458273602789')
  })

  // ---- Empty / whitespace ----
  it('returns null for empty string', async () => {
    expect(await parseAwemeId('')).toBeNull()
  })

  it('returns null for whitespace-only input', async () => {
    expect(await parseAwemeId('   ')).toBeNull()
  })

  // ---- Full iesdouyin.com share URL ----
  it('extracts ID from a full iesdouyin.com share URL', async () => {
    const url = 'https://www.iesdouyin.com/share/video/7651487458273602789/?region=CN&mid=7620661139520932614'
    const result = await parseAwemeId(url)
    expect(result).toBe('7651487458273602789')
  })

  it('extracts ID from a full iesdouyin.com URL without query params', async () => {
    const result = await parseAwemeId('https://www.iesdouyin.com/share/video/7651487458273602789/')
    expect(result).toBe('7651487458273602789')
  })

  // ---- Messy share text with URL embedded ----
  it('extracts ID from messy share text containing a short link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      url: 'https://www.iesdouyin.com/share/video/7651487458273602789/?region=CN&mid=7620661139520932614',
    } as Response)

    const messyText =
      'Check out this video! https://v.douyin.com/7EGQ5sV0MZU/ 07/25 R@K.JV :9pm sEH:/'
    const result = await parseAwemeId(messyText)
    expect(result).toBe('7651487458273602789')
  })

  it('extracts ID from messy share text containing a full iesdouyin URL', async () => {
    const messyText =
      'Check out this amazing video! https://www.iesdouyin.com/share/video/7651487458273602789/?region=CN 07/25 R@K.JV :9pm sEH:/'
    const result = await parseAwemeId(messyText)
    expect(result).toBe('7651487458273602789')
  })

  // ---- Short link resolution ----
  it('follows v.douyin.com short link redirect and extracts the ID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      url: 'https://www.iesdouyin.com/share/video/7651487458273602789/?region=CN&mid=7620661139520932614',
    } as Response)

    const result = await parseAwemeId('https://v.douyin.com/7EGQ5sV0MZU/')
    expect(result).toBe('7651487458273602789')
    expect(fetch).toHaveBeenCalledWith('https://v.douyin.com/7EGQ5sV0MZU/', { redirect: 'follow' })
  })

  it('returns null when short link redirect does not lead to a video page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      url: 'https://www.douyin.com/some-other-page',
    } as Response)

    const result = await parseAwemeId('https://v.douyin.com/7EGQ5sV0MZU/')
    expect(result).toBeNull()
  })

  it('returns null when short link fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const result = await parseAwemeId('https://v.douyin.com/7EGQ5sV0MZU/')
    expect(result).toBeNull()
  })

  // ---- Invalid input ----
  it('returns null for random text without a douyin URL', async () => {
    const result = await parseAwemeId('This is random text without any URL')
    expect(result).toBeNull()
  })

  it('returns null for a non-douyin URL', async () => {
    const result = await parseAwemeId('https://www.bilibili.com/video/BV1xx411c7mD/')
    expect(result).toBeNull()
  })

  // ---- ID with surrounding whitespace ----
  it('trims whitespace around a numeric ID', async () => {
    const result = await parseAwemeId('  7651487458273602789  ')
    expect(result).toBe('7651487458273602789')
  })
})
