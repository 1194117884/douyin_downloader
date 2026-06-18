import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VideoInput from '../VideoInput.vue'

describe('VideoInput', () => {
  it('renders input field and button', () => {
    const wrapper = mount(VideoInput)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('button').text()).toBe('Fetch')
  })

  it('clicking button with empty input does NOT emit fetch', async () => {
    const wrapper = mount(VideoInput)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('fetch')).toBeFalsy()
  })

  it('clicking button with valid input emits fetch with the aweme_id', async () => {
    const wrapper = mount(VideoInput)
    const input = wrapper.find('input')
    await input.setValue('7425930648738942775')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('fetch')).toBeTruthy()
    expect(wrapper.emitted('fetch')![0]).toEqual(['7425930648738942775'])
  })

  it('shows loading state when isLoading prop is true', async () => {
    const wrapper = mount(VideoInput, {
      props: {
        isLoading: true,
      },
    })
    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('renders compact floating summary with the current aweme id', () => {
    const wrapper = mount(VideoInput, {
      props: {
        compact: true,
        currentId: '7642657704577715475',
      },
    })

    expect(wrapper.classes()).toContain('compact')
    expect(wrapper.find('.compact-summary').text()).toContain('7642657704577715475')
    expect(wrapper.find('input').element.value).toBe('7642657704577715475')
  })
})
