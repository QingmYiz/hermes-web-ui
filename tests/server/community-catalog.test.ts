import { beforeEach, describe, expect, it, vi } from 'vitest'

const testProfileDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os')
  return mkdtempSync(join(tmpdir(), 'hermes-community-'))
})

const bridgeMcpActionMock = vi.hoisted(() => vi.fn())

vi.mock('../../packages/server/src/services/hermes/hermes-profile', () => ({
  getProfileDir: () => testProfileDir,
}))

vi.mock('../../packages/server/src/services/hermes/mcp', () => ({
  bridgeMcpAction: bridgeMcpActionMock,
}))

describe('community catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bridgeMcpActionMock.mockResolvedValue({ ok: true, servers: [] })
  })

  it('returns Chinese-translated marketplace fields while preserving English source text', async () => {
    const { listCommunityMcps } = await import('../../packages/server/src/services/hermes/community-catalog')

    const items = await listCommunityMcps('default')
    const filesystem = items.find(item => item.id === 'filesystem')

    expect(filesystem).toMatchObject({
      title: '文件系统',
      sourceTitle: 'Filesystem',
      sourceLanguage: 'en',
      installed: false,
    })
    expect(filesystem?.description).toContain('允许模型读取')
    expect(filesystem?.sourceDescription).toContain('Allow the model')
  })

  it('installs a community skill into the current profile skills directory', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { installCommunitySkill, listCommunitySkills } = await import('../../packages/server/src/services/hermes/community-catalog')

    const result = await installCommunitySkill('default', 'meeting-summary-zh')

    expect(result.ok).toBe(true)
    await expect(readFile(join(testProfileDir, 'skills', 'community', 'meeting-summary-zh', 'SKILL.md'), 'utf-8'))
      .resolves.toContain('会议纪要整理')
    const items = await listCommunitySkills('default')
    expect(items.find(item => item.id === 'meeting-summary-zh')?.installed).toBe(true)
  })

  it('installs a community MCP through the profile-scoped MCP bridge', async () => {
    const { installCommunityMcp } = await import('../../packages/server/src/services/hermes/community-catalog')

    const result = await installCommunityMcp('user-a', 'memory')

    expect(result.ok).toBe(true)
    expect(bridgeMcpActionMock).toHaveBeenCalledWith('mcp_server_add', {
      name: 'community-memory',
      config: expect.objectContaining({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
      }),
    }, 'user-a')
    expect(bridgeMcpActionMock).toHaveBeenCalledWith('mcp_reload', { server: 'community-memory' }, 'user-a')
  })
})
