import { beforeEach, describe, expect, it, vi } from 'vitest'

const testAppHome = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os')
  return mkdtempSync(join(tmpdir(), 'hermes-image-routing-'))
})
const mockReadAppConfig = vi.fn()
const mockReadConfigYaml = vi.fn()
const mockReadConfigYamlForProfile = vi.fn()
const mockFetch = vi.fn()
const mockNormalizeImageGenerationRoutingConfig = vi.fn((value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized: Record<string, unknown> = {}
  if (typeof value.enabled === 'boolean') normalized.enabled = value.enabled
  if (typeof value.provider === 'string' && value.provider.trim()) normalized.provider = value.provider.trim()
  if (typeof value.model === 'string' && value.model.trim()) normalized.model = value.model.trim()
  return normalized
})

vi.mock('../../packages/server/src/services/app-config', () => ({
  readAppConfig: mockReadAppConfig,
  normalizeImageGenerationRoutingConfig: mockNormalizeImageGenerationRoutingConfig,
}))

vi.mock('../../packages/server/src/config', () => ({
  config: { appHome: testAppHome },
}))

vi.mock('../../packages/server/src/services/config-helpers', () => ({
  PROVIDER_ENV_MAP: {},
  readConfigYaml: mockReadConfigYaml,
  readConfigYamlForProfile: mockReadConfigYamlForProfile,
}))

vi.mock('../../packages/server/src/shared/providers', () => ({
  PROVIDER_PRESETS: [],
}))

describe('run chat image routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockReadConfigYamlForProfile.mockResolvedValue({
      custom_providers: [{
        name: 'WebAI2API Doubao',
        base_url: 'http://127.0.0.1:8080/v1',
        api_key: 'sk-doubao',
        model: 'doubao-seedream-4-0',
      }],
    })
    mockReadConfigYaml.mockResolvedValue({})
    mockReadAppConfig.mockResolvedValue({
      imageGenerationRouting: {
        enabled: true,
        provider: 'custom:webai2api-doubao',
        model: 'doubao-seedream-4-0',
      },
    })
  })

  it('detects direct image-generation prompts and returns the configured target', async () => {
    const { isImageGenerationRequest, resolveImageGenerationRunTarget } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    expect(isImageGenerationRequest('帮我生成一张赛博朋克风格的海报')).toBe(true)
    await expect(resolveImageGenerationRunTarget('帮我生成一张赛博朋克风格的海报')).resolves.toEqual({
      provider: 'custom:webai2api-doubao',
      model: 'doubao-seedream-4-0',
    })
  })

  it('does not reroute ordinary image-analysis prompts', async () => {
    const { isImageGenerationRequest, resolveImageGenerationRunTarget } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    expect(isImageGenerationRequest('请帮我分析这张图片里有什么内容')).toBe(false)
    await expect(resolveImageGenerationRunTarget('请帮我分析这张图片里有什么内容')).resolves.toBeNull()
  })

  it('does not reroute when the config is disabled or incomplete', async () => {
    mockReadAppConfig.mockResolvedValueOnce({
      imageGenerationRouting: {
        enabled: false,
        provider: 'custom:webai2api-doubao',
        model: 'doubao-seedream-4-0',
      },
    })

    const { resolveImageGenerationRunTarget } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')
    await expect(resolveImageGenerationRunTarget('generate an image of a mountain lake')).resolves.toBeNull()
  })

  it('resolves configured custom providers for real image generation calls', async () => {
    const { resolveImageGenerationProviderRuntime } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    await expect(resolveImageGenerationProviderRuntime('default', {
      provider: 'custom:webai2api-doubao',
      model: 'doubao-seedream-4-0',
    })).resolves.toEqual({
      provider: 'custom:webai2api-doubao',
      model: 'doubao-seedream-4-0',
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKey: 'sk-doubao',
    })
  })

  it('falls back to the default Hermes profile when the user profile lacks the image provider', async () => {
    mockReadConfigYamlForProfile.mockImplementation(async (profile: string) => {
      if (profile !== 'default') return {}
      return {
        custom_providers: [{
          name: 'WebAI2API Doubao',
          base_url: 'http://127.0.0.1:3000/v1',
          api_key: 'sk-default',
          model: 'seedream-4.5',
        }],
      }
    })
    const { resolveImageGenerationProviderRuntime } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    await expect(resolveImageGenerationProviderRuntime('user-profile', {
      provider: 'custom:webai2api-doubao',
      model: 'seedream-4.5',
    })).resolves.toEqual({
      provider: 'custom:webai2api-doubao',
      model: 'seedream-4.5',
      baseUrl: 'http://127.0.0.1:3000/v1',
      apiKey: 'sk-default',
    })
  })

  it('saves generated image results and returns local image paths for chat rendering', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: pngBytes.toString('base64') }] }),
    })
    const { existsSync, readFileSync } = await import('node:fs')
    const { generateImageForChat } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    const result = await generateImageForChat('default', '生成一张城市夜景图片', {
      provider: 'custom:webai2api-doubao',
      model: 'doubao-seedream-4-0',
    })

    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8080/v1/images/generations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer sk-doubao' }),
    }))
    expect(result.images).toHaveLength(1)
    expect(result.images[0].path).toContain('media')
    expect(existsSync(result.images[0].path)).toBe(true)
    expect(readFileSync(result.images[0].path)).toEqual(pngBytes)
  })

  it('falls back to chat completions for WebAI2API-style image models', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02])
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: `![image](data:image/png;base64,${pngBytes.toString('base64')})`,
            },
          }],
        }),
      })
    const { readFileSync } = await import('node:fs')
    const { generateImageForChat } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    const result = await generateImageForChat('default', '帮我生图', {
      provider: 'custom:webai2api-doubao',
      model: 'seedream-4.5',
    })

    expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8080/v1/images/generations', expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8080/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"model":"seedream-4.5"'),
    }))
    expect(readFileSync(result.images[0].path)).toEqual(pngBytes)
  })

  it('falls back when the images endpoint rejects chat-backed image models', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x03])
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: [{
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${pngBytes.toString('base64')}` },
              }],
            },
          }],
        }),
      })
    const { readFileSync } = await import('node:fs')
    const { generateImageForChat } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    const result = await generateImageForChat('default', '帮我生成图片', {
      provider: 'custom:webai2api-doubao',
      model: 'seedream-4.5',
    })

    expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8080/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"model":"seedream-4.5"'),
    }))
    expect(readFileSync(result.images[0].path)).toEqual(pngBytes)
  })

  it('falls back to chat completions when the images endpoint returns no image data', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x04])
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          images: [{ result: pngBytes.toString('base64') }],
        }),
      })
    const { readFileSync } = await import('node:fs')
    const { generateImageForChat } = await import('../../packages/server/src/services/hermes/run-chat/image-routing')

    const result = await generateImageForChat('default', 'draw an image of a train', {
      provider: 'custom:webai2api-doubao',
      model: 'seedream-4.5',
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(readFileSync(result.images[0].path)).toEqual(pngBytes)
  })
})
