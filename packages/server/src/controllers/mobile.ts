import type { Context } from 'koa'
import send from 'koa-send'
import { basename, join, resolve } from 'path'
import { readFile } from 'fs/promises'
import { config } from '../config'

const mobileDir = join(config.appHome, 'mobile')
const mobileFilesDir = join(mobileDir, 'files')

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function manifest(ctx: Context) {
  ctx.body = await readJsonFile(join(mobileDir, 'manifest.json'), {
    versionCode: 1,
    versionName: '0.1.0',
    apkUrl: '',
    notes: '暂无更新',
  })
}

export async function content(ctx: Context) {
  ctx.body = await readJsonFile(join(mobileDir, 'content.json'), {
    items: [],
  })
}

export async function file(ctx: Context) {
  const requested = basename(String(ctx.params.name || '').trim())
  if (!requested) {
    ctx.status = 400
    ctx.body = { error: 'Missing file name' }
    return
  }
  const root = resolve(mobileFilesDir)
  const target = resolve(root, requested)
  if (!target.startsWith(root)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid file path' }
    return
  }
  await send(ctx, requested, {
    root,
    setHeaders(res) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(requested)}"`)
    },
  })
}
