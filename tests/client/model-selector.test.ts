// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const mockAppStore = vi.hoisted(() => ({
  selectedModel: 'old-model',
  selectedProvider: 'openai',
  customModels: {} as Record<string, string[]>,
  profileModelGroups: [{
    profile: 'default',
    groups: [
      {
        provider: 'openai',
        label: 'OpenAI',
        models: ['old-model', 'new-model'],
        model_meta: {},
      },
      {
        provider: 'custom:webai2api-doubao',
        label: 'Doubao',
        models: ['seedream-4.5'],
        model_meta: {},
      },
    ],
  }],
  switchModel: vi.fn(async (model: string, provider: string) => {
    mockAppStore.selectedModel = model
    mockAppStore.selectedProvider = provider
  }),
  removeCustomModel: vi.fn(),
  displayModelName: vi.fn((model: string) => model),
  getModelAlias: vi.fn(() => ''),
}))

const mockChatStore = vi.hoisted(() => ({
  activeSession: {
    id: 'session-1',
    source: 'chat',
  } as null | { id: string; source?: string },
  switchSessionModel: vi.fn(),
}))

const mockProfilesStore = vi.hoisted(() => ({
  activeProfileName: 'default',
}))

vi.mock('@/stores/hermes/app', () => ({
  useAppStore: () => mockAppStore,
}))

vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => mockChatStore,
}))

vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => mockProfilesStore,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => params?.model || key,
  }),
}))

vi.mock('naive-ui', () => ({
  NModal: { name: 'NModal', inheritAttrs: false, template: '<div><slot /></div>' },
  NInput: { name: 'NInput', inheritAttrs: false, template: '<input />' },
  NSelect: { name: 'NSelect', inheritAttrs: false, template: '<select />' },
}))

import ModelSelector from '@/components/layout/ModelSelector.vue'

describe('ModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppStore.selectedModel = 'old-model'
    mockAppStore.selectedProvider = 'openai'
    mockChatStore.activeSession = {
      id: 'session-1',
      source: 'chat',
    }
  })

  function mountSelector() {
    return mount(ModelSelector)
  }

  it('updates the active chat session when selecting a sidebar model', async () => {
    const wrapper = mountSelector()

    const target = wrapper.findAll('.model-item')
      .find(node => node.text().includes('new-model'))
    expect(target).toBeTruthy()

    await target!.trigger('click')

    expect(mockAppStore.switchModel).toHaveBeenCalledWith('new-model', 'openai')
    expect(mockChatStore.switchSessionModel).toHaveBeenCalledWith('new-model', 'openai', 'session-1')
  })

  it('keeps coding agent sessions isolated from sidebar model changes', async () => {
    mockChatStore.activeSession = {
      id: 'agent-session',
      source: 'coding_agent',
    }
    const wrapper = mountSelector()

    const target = wrapper.findAll('.model-item')
      .find(node => node.text().includes('seedream-4.5'))
    expect(target).toBeTruthy()

    await target!.trigger('click')

    expect(mockAppStore.switchModel).toHaveBeenCalledWith('seedream-4.5', 'custom:webai2api-doubao')
    expect(mockChatStore.switchSessionModel).not.toHaveBeenCalled()
  })
})
