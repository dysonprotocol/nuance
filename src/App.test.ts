import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

describe('App', () => {
  it('renders without crashing', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          'router-view': true,
          Sidebar: true,
          Topbar: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('has the correct layout structure', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          'router-view': true,
          Sidebar: true,
          Topbar: true
        }
      }
    })
    
    expect(wrapper.find('#layout-sidebar-toggle-trigger').exists()).toBe(true)
    expect(wrapper.find('#layout-content').exists()).toBe(true)
    expect(wrapper.find('#layout-sidebar-backdrop').exists()).toBe(true)
  })
})
