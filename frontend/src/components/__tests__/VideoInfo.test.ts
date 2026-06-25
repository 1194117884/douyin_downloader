import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VideoInfo from '../VideoInfo.vue'
import type { AwemeDetail } from '../../types'

const mockVideoData = {
  aweme_id: '7425930648738942775',
  desc: 'Test video description',
  create_time: 1234567890,
  author: { nickname: 'Test Author' },
  video: {
    play_addr: { url_list: ['https://example.com/video.mp4'] },
    cover: { url_list: ['https://example.com/cover.jpg'] },
    duration: 30,
  },
}

describe('VideoInfo', () => {
  it('renders desc, author nickname, and media details without a video preview', () => {
    const wrapper = mount(VideoInfo, {
      props: {
        videoData: mockVideoData,
      },
    })
    expect(wrapper.text()).toContain('Test video description')
    expect(wrapper.text()).toContain('Test Author')
    expect(wrapper.text()).toContain('30')
    expect(wrapper.find('video').exists()).toBe(false)
  })

  it('renders proxied download links for each address option', () => {
    const wrapper = mount(VideoInfo, {
      props: {
        videoData: mockVideoData,
        addressOptions: [
          { id: 'download-0', url: 'https://example.com/dl.mp4', source: 'Download', label: 'example.com' },
          { id: 'h264-0', url: 'https://example.com/h264.mp4', source: 'H.264', label: 'h264.example.com' },
        ],
      },
    })

    const downloadLinks = wrapper.findAll('a.option-download')
    expect(downloadLinks).toHaveLength(2)
    expect(downloadLinks[0].attributes('href')).toContain('/download?url=https%3A%2F%2Fexample.com%2Fdl.mp4')
    expect(downloadLinks[0].attributes('href')).toContain('filename=7425930648738942775-Download.mp4')
    expect(downloadLinks[0].attributes('target')).toBeUndefined()
    expect(downloadLinks[0].attributes('title')).toContain('Download')
  })

  it('clicking address option emits select-url', async () => {
    const wrapper = mount(VideoInfo, {
      props: {
        videoData: mockVideoData,
        addressOptions: [
          { id: 'download-0', url: 'https://example.com/dl.mp4', source: 'Download', label: 'example.com' },
        ],
      },
    })

    await wrapper.find('.option-select').trigger('click')
    expect(wrapper.emitted('select-url')).toHaveLength(1)
    expect(wrapper.emitted('select-url')![0]).toEqual(['https://example.com/dl.mp4'])
  })

  it('shows placeholder when videoData is null', () => {
    const wrapper = mount(VideoInfo, {
      props: {
        videoData: null,
      },
    })
    expect(wrapper.find('.video-info').exists()).toBe(true)
    expect(wrapper.text()).toBe('')
  })

  it('renders fallback text when nested author or video data is missing', () => {
    const wrapper = mount(VideoInfo, {
      props: {
        videoData: {
          aweme_id: '7425930648738942775',
          desc: 'Malformed video',
          create_time: 1234567890,
        } as AwemeDetail,
      },
    })

    expect(wrapper.text()).toContain('Malformed video')
    expect(wrapper.text()).toContain('Unknown author')
  })

  it('strips hashtags from desc while keeping them in the tags area', () => {
    const wrapper = mount(VideoInfo, {
      props: {
        videoData: {
          aweme_id: '7425930648738942775',
          desc: 'Amazing sunset #fyp #viral check this out',
          create_time: 1234567890,
          author: { nickname: 'Test Author' },
          video: {
            play_addr: { url_list: ['https://example.com/video.mp4'] },
            cover: { url_list: ['https://example.com/cover.jpg'] },
            duration: 30,
          },
          text_extra: [
            { hashtag_name: 'fyp' },
            { hashtag_name: 'viral' },
          ],
        } as AwemeDetail,
      },
    })

    // Desc element should NOT contain #hashtags
    const descEl = wrapper.find('.desc')
    expect(descEl.exists()).toBe(true)
    expect(descEl.text()).toBe('Amazing sunset check this out')

    // Tags area should still show the hashtag names
    const tagsArea = wrapper.find('.hashtags')
    expect(tagsArea.exists()).toBe(true)
    expect(tagsArea.text()).toContain('#fyp')
    expect(tagsArea.text()).toContain('#viral')
  })
})
