import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { config } from '../../../config'
import { normalizeImageGenerationRoutingConfig, readAppConfig } from '../../app-config'
import { PROVIDER_ENV_MAP, readConfigYamlForProfile } from '../../config-helpers'
import { getProfileDir } from '../hermes-profile'
import { PROVIDER_PRESETS } from '../../../shared/providers'
import { contentBlocksToString } from './content-blocks'
import type { ContentBlock } from './types'

export interface ImageGenerationRunTarget {
  provider: string
  model: string
}

export interface ImageGenerationProviderRuntime {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
}

export interface GeneratedChatImage {
  path: string
}

export interface GeneratedChatImageResult {
  provider: string
  model: string
  baseUrl: string
  images: GeneratedChatImage[]
}

const DIRECT_IMAGE_GENERATION_PHRASES = [
  '生图',
  '出图',
  '文生图',
  '图像生成',
  '图片生成',
  '生成图片',
  '生成一张图',
  '生成一幅图',
  '生成海报',
  '生成封面',
  '帮我画',
  '帮我生成图片',
  '帮我做图',
  '/imagine',
  'generate an image',
  'create an image',
  'draw an image',
  'draw me',
  'make a poster',
  'create artwork',
  'illustrate this',
]

const IMAGE_GENERATION_PATTERNS = [
  /(生成|创建|制作|画|绘制|设计|做)\s*(一张|一幅|个|张|幅)?[\s\S]{0,24}?(图片|图像|海报|插画|封面|配图|头像)/i,
  /\b(generate|create|draw|illustrate|render|design|make)\b[\s\S]{0,24}\b(image|picture|poster|illustration|artwork|cover|avatar)\b/i,
]

function providerKeyForCustom(name: string): string {
  return `custom:${name.trim().toLowerCase().replace(/ /g, '-')}`
}

function providerKeyWithoutCustomPrefix(providerKey: string): string {
  return providerKey.startsWith('custom:') ? providerKey.slice('custom:'.length) : providerKey
}

function profileEnvPath(profile: string): string {
  return join(getProfileDir(profile), '.env')
}

function readProfileEnvValue(profile: string, key: string): string {
  if (!key) return ''
  try {
    const envPath = profileEnvPath(profile)
    if (!existsSync(envPath)) return ''
    const envContent = readFileSync(envPath, 'utf-8')
    const match = envContent.match(new RegExp(`^${key}\\s*=\\s*(.+)`, 'm'))
    return match?.[1]?.trim() || ''
  } catch {
    return ''
  }
}

function buildApiUrl(baseUrl: string, pathWithV1: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const apiPath = pathWithV1.startsWith('/') ? pathWithV1 : `/${pathWithV1}`
  if (base.endsWith('/v1') && apiPath.startsWith('/v1/')) return `${base}${apiPath.slice(3)}`
  return `${base}${apiPath}`
}

function defaultImageOutputPath(requestId: string, index = 0): string {
  const safeRequestId = requestId.replace(/[^A-Za-z0-9_-]/g, '_') || `image_${Date.now()}`
  const suffix = index > 0 ? `-${index + 1}` : ''
  return join(config.appHome, 'media', `${safeRequestId}${suffix}.png`)
}

function normalizePromptInput(input: string | ContentBlock[]): string {
  return (Array.isArray(input) ? contentBlocksToString(input) : input)
    .replace(/\s+/g, ' ')
    .trim()
}

export function isImageGenerationRequest(input: string | ContentBlock[]): boolean {
  const normalized = normalizePromptInput(input)
  if (!normalized) return false

  const lower = normalized.toLowerCase()
  if (DIRECT_IMAGE_GENERATION_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()))) {
    return true
  }

  return IMAGE_GENERATION_PATTERNS.some(pattern => pattern.test(normalized))
}

export async function resolveImageGenerationRunTarget(
  input: string | ContentBlock[],
): Promise<ImageGenerationRunTarget | null> {
  if (!isImageGenerationRequest(input)) return null

  const appConfig = await readAppConfig()
  const routing = normalizeImageGenerationRoutingConfig(appConfig.imageGenerationRouting)
  const provider = String(routing.provider || '').trim()
  const model = String(routing.model || '').trim()

  if (routing.enabled !== true || !provider || !model) return null

  return { provider, model }
}

export async function resolveImageGenerationProviderRuntime(
  profile: string,
  target: ImageGenerationRunTarget,
): Promise<ImageGenerationProviderRuntime> {
  const providerKey = String(target.provider || '').trim()
  const model = String(target.model || '').trim()
  if (!providerKey || !model) {
    throw new Error('Image generation provider and model are required')
  }

  const profileConfig = await readConfigYamlForProfile(profile)
  const customProviders = Array.isArray(profileConfig.custom_providers)
    ? profileConfig.custom_providers as Array<{ name?: string; base_url?: string; api_key?: string; model?: string }>
    : []
  const customProvider = customProviders.find((entry) => {
    const name = String(entry?.name || '').trim()
    if (!name) return false
    return providerKeyForCustom(name) === providerKey || name === providerKey
  })
  if (customProvider) {
    const baseUrl = String(customProvider.base_url || '').trim()
    if (!baseUrl) throw new Error(`Image generation provider "${providerKey}" is missing base_url`)
    return {
      provider: providerKey,
      model,
      baseUrl,
      apiKey: String(customProvider.api_key || '').trim(),
    }
  }

  const builtinProviderKey = providerKeyWithoutCustomPrefix(providerKey)
  const envMapping = PROVIDER_ENV_MAP[builtinProviderKey]
  const preset = PROVIDER_PRESETS.find((item: any) => item.value === builtinProviderKey)
  const envApiKey = envMapping?.api_key_env
    ? readProfileEnvValue(profile, envMapping.api_key_env) || String(process.env[envMapping.api_key_env] || '').trim()
    : ''
  const envBaseUrl = envMapping?.base_url_env
    ? readProfileEnvValue(profile, envMapping.base_url_env) || String(process.env[envMapping.base_url_env] || '').trim()
    : ''
  const baseUrl = envBaseUrl || String(preset?.base_url || '').trim()
  if (!baseUrl) {
    throw new Error(`Image generation provider "${providerKey}" is missing base_url`)
  }
  return {
    provider: providerKey,
    model,
    baseUrl,
    apiKey: envApiKey,
  }
}

function collectImageItems(value: unknown, images: Array<{ base64?: string; url?: string }> = []): Array<{ base64?: string; url?: string }> {
  if (!value || typeof value !== 'object') return images
  const record = value as Record<string, unknown>
  for (const key of ['b64_json', 'base64', 'image_base64', 'result']) {
    if (typeof record[key] === 'string' && record[key]) {
      images.push({ base64: record[key] as string })
    }
  }
  if (typeof record.url === 'string' && record.url) {
    images.push({ url: record.url })
  }
  for (const key of ['data', 'output']) {
    const list = record[key]
    if (Array.isArray(list)) {
      for (const item of list) collectImageItems(item, images)
    }
  }
  return images
}

async function imageBytesFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) {
    throw new Error(`image download failed: ${res.status} ${res.statusText}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function imageBytesFromBase64(value: string): Buffer {
  const dataUriMatch = value.match(/^data:image\/[^;,]+;base64,(.+)$/)
  return Buffer.from(dataUriMatch?.[1] || value, 'base64')
}

async function saveImageItem(item: { base64?: string; url?: string }, index: number): Promise<GeneratedChatImage> {
  const bytes = item.base64
    ? imageBytesFromBase64(item.base64)
    : item.url
      ? await imageBytesFromUrl(item.url)
      : null
  if (!bytes || bytes.length === 0) {
    throw new Error('image generation returned an empty image')
  }
  const outputPath = defaultImageOutputPath(`image_${Date.now()}`, index)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, bytes)
  return { path: outputPath }
}

export async function generateImageForChat(
  profile: string,
  input: string | ContentBlock[],
  target: ImageGenerationRunTarget,
): Promise<GeneratedChatImageResult> {
  const prompt = normalizePromptInput(input)
  if (!prompt) throw new Error('Image generation prompt is empty')

  const runtime = await resolveImageGenerationProviderRuntime(profile, target)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (runtime.apiKey) headers.Authorization = `Bearer ${runtime.apiKey}`

  const res = await fetch(buildApiUrl(runtime.baseUrl, '/v1/images/generations'), {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10 * 60 * 1000),
    body: JSON.stringify({
      model: runtime.model,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
      stream: false,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`image generation request failed: ${res.status} ${detail || res.statusText}`)
  }

  const response = await res.json()
  const items = collectImageItems(response)
  if (items.length === 0) {
    throw new Error('image generation response did not contain an image')
  }

  const images = await Promise.all(items.slice(0, 1).map((item, index) => saveImageItem(item, index)))
  return {
    provider: runtime.provider,
    model: runtime.model,
    baseUrl: runtime.baseUrl,
    images,
  }
}
