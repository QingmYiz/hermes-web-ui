import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getProfileDir } from './hermes-profile'
import { bridgeMcpAction } from './mcp'

export interface CommunitySkillItem {
  id: string
  name: string
  title: string
  description: string
  sourceTitle: string
  sourceDescription: string
  sourceLanguage: 'en' | 'zh'
  category: string
  tags: string[]
  installable: boolean
  installed?: boolean
}

export interface CommunityMcpItem {
  id: string
  name: string
  title: string
  description: string
  sourceTitle: string
  sourceDescription: string
  sourceLanguage: 'en' | 'zh'
  tags: string[]
  installable: boolean
  config: Record<string, unknown>
  installed?: boolean
}

const COMMUNITY_SKILLS: Array<CommunitySkillItem & { content: string }> = [
  {
    id: 'meeting-summary-zh',
    name: 'meeting-summary-zh',
    sourceLanguage: 'zh',
    sourceTitle: '会议纪要整理',
    sourceDescription: '把聊天记录、会议转写和访谈内容整理成中文纪要、行动项和风险点。',
    title: '会议纪要整理',
    description: '把聊天记录、会议转写和访谈内容整理成中文纪要、行动项和风险点。',
    category: 'community',
    tags: ['办公', '总结', '中文'],
    installable: true,
    content: `# 会议纪要整理

用于整理会议记录、访谈转写、群聊讨论和项目同步内容。

## 输出格式

- 结论摘要：3-6 条，写清楚已经确定的事情。
- 行动项：负责人、事项、截止时间、依赖条件；未知字段写“待确认”。
- 风险与阻塞：只列真实影响执行的点。
- 待追问问题：把模糊、冲突或缺失的信息列出来。

保持中文、简洁、可执行。不要编造参会人、时间和承诺。
`,
  },
  {
    id: 'document-polish-zh',
    name: 'document-polish-zh',
    sourceLanguage: 'zh',
    sourceTitle: '中文文档润色',
    sourceDescription: '把草稿改成清晰、专业、易读的中文文档，保留原意。',
    title: '中文文档润色',
    description: '把草稿改成清晰、专业、易读的中文文档，保留原意。',
    category: 'community',
    tags: ['写作', '文档', '中文'],
    installable: true,
    content: `# 中文文档润色

用于润色公告、说明文档、产品文案、教程、邮件和方案草稿。

## 规则

1. 保留原意，不擅自增加事实。
2. 删除重复、空泛和口语化表达。
3. 优先使用短句、明确主语和可执行措辞。
4. 对技术名词、产品名、参数名保持原样。
5. 如果原文结构混乱，先重排标题和段落，再输出润色版。
`,
  },
  {
    id: 'research-digest',
    name: 'research-digest',
    sourceLanguage: 'en',
    sourceTitle: 'Research Digest',
    sourceDescription: 'Turn long articles, papers, and reports into concise briefs with claims, evidence, and open questions.',
    title: '研究资料速读',
    description: '把长文章、论文和报告整理成简洁中文简报，突出结论、证据和待确认问题。',
    category: 'community',
    tags: ['研究', '阅读', '已翻译'],
    installable: true,
    content: `# 研究资料速读

用于阅读论文、长文、报告、白皮书和资料包。

## 输出

- 核心结论：用中文列出最重要的 3-7 条。
- 证据依据：每条结论对应原文中的依据，避免无来源推断。
- 限制条件：列出样本、假设、时间范围或数据缺口。
- 可执行建议：如果用户有目标，把资料转成下一步行动。

如果原文是英文，先翻译关键概念为中文；术语、产品名、指标名保留英文原词。
`,
  },
]

const defaultWorkspace = process.env.WORKSPACE_BASE?.trim() || homedir()

const COMMUNITY_MCPS: CommunityMcpItem[] = [
  {
    id: 'filesystem',
    name: 'community-filesystem',
    sourceLanguage: 'en',
    sourceTitle: 'Filesystem',
    sourceDescription: 'Allow the model to read and manage files under a configured directory.',
    title: '文件系统',
    description: '允许模型读取和管理指定目录里的文件，默认绑定当前工作目录或用户目录。',
    tags: ['文件', '本地', '已翻译'],
    installable: true,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', defaultWorkspace],
      enabled: true,
    },
  },
  {
    id: 'memory',
    name: 'community-memory',
    sourceLanguage: 'en',
    sourceTitle: 'Memory',
    sourceDescription: 'Provide persistent memory tools for preferences, facts, and long-term context.',
    title: '长期记忆',
    description: '提供简单持久记忆工具，适合保存偏好、项目事实和长期上下文。',
    tags: ['记忆', '上下文', '已翻译'],
    installable: true,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      enabled: true,
    },
  },
  {
    id: 'sequential-thinking',
    name: 'community-sequential-thinking',
    sourceLanguage: 'en',
    sourceTitle: 'Sequential Thinking',
    sourceDescription: 'Expose a structured step-by-step reasoning tool for planning and debugging.',
    title: '分步思考',
    description: '给复杂任务提供分步推理工具，适合排查、规划和多阶段任务。',
    tags: ['推理', '规划', '已翻译'],
    installable: true,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      enabled: true,
    },
  },
  {
    id: 'fetch',
    name: 'community-fetch',
    sourceLanguage: 'en',
    sourceTitle: 'Fetch',
    sourceDescription: 'Fetch web content for model context. Requires uvx on the server.',
    title: '网页抓取',
    description: '允许模型抓取网页内容；需要服务器可访问外网并安装 uvx。',
    tags: ['网页', '资料', '已翻译'],
    installable: true,
    config: {
      command: 'uvx',
      args: ['mcp-server-fetch'],
      enabled: true,
    },
  },
  {
    id: 'git',
    name: 'community-git',
    sourceLanguage: 'en',
    sourceTitle: 'Git',
    sourceDescription: 'Read Git repository status, commit history, and diffs. Requires uvx on the server.',
    title: 'Git 仓库',
    description: '允许模型读取 Git 仓库状态、提交历史和差异；需要 uvx。',
    tags: ['代码', 'Git', '已翻译'],
    installable: true,
    config: {
      command: 'uvx',
      args: ['mcp-server-git', '--repository', defaultWorkspace],
      enabled: true,
    },
  },
]

function profileSkillsDir(profile: string): string {
  return join(getProfileDir(profile || 'default'), 'skills')
}

function skillTargetDir(profile: string, item: CommunitySkillItem): string {
  return join(profileSkillsDir(profile), item.category, item.name)
}

function findSkill(id: string) {
  return COMMUNITY_SKILLS.find(item => item.id === id)
}

function findMcp(id: string) {
  return COMMUNITY_MCPS.find(item => item.id === id)
}

export async function listCommunitySkills(profile: string): Promise<CommunitySkillItem[]> {
  return COMMUNITY_SKILLS.map(({ content: _content, ...item }) => ({
    ...item,
    installed: existsSync(skillTargetDir(profile, item)),
  }))
}

export async function installCommunitySkill(profile: string, id: string): Promise<{ ok: boolean; item?: CommunitySkillItem; error?: string }> {
  const item = findSkill(id)
  if (!item) return { ok: false, error: 'Community skill not found' }

  const targetDir = skillTargetDir(profile, item)
  const targetFile = join(targetDir, 'SKILL.md')
  if (existsSync(targetFile)) {
    const { content: _content, ...dto } = item
    return { ok: true, item: { ...dto, installed: true } }
  }

  await mkdir(targetDir, { recursive: true })
  await writeFile(targetFile, item.content, 'utf-8')
  await writeFile(join(profileSkillsDir(profile), item.category, 'DESCRIPTION.md'), '社区技能\n', 'utf-8')
  const { content: _content, ...dto } = item
  return { ok: true, item: { ...dto, installed: true } }
}

export async function listCommunityMcps(profile?: string): Promise<CommunityMcpItem[]> {
  let installedNames = new Set<string>()
  try {
    const current = await bridgeMcpAction('mcp_list', {}, profile)
    const servers = Array.isArray((current as any)?.servers) ? (current as any).servers : []
    installedNames = new Set(servers.map((server: any) => String(server?.name || '')).filter(Boolean))
  } catch {
    installedNames = new Set()
  }
  return COMMUNITY_MCPS.map(item => ({
    ...item,
    installed: installedNames.has(item.name),
  }))
}

export async function installCommunityMcp(profile: string | undefined, id: string): Promise<{ ok: boolean; item?: CommunityMcpItem; error?: string }> {
  const item = findMcp(id)
  if (!item) return { ok: false, error: 'Community MCP not found' }

  const current = await listCommunityMcps(profile)
  const currentItem = current.find(entry => entry.id === id)
  if (currentItem?.installed) return { ok: true, item: currentItem }

  const result = await bridgeMcpAction('mcp_server_add', {
    name: item.name,
    config: item.config,
  }, profile)
  if ((result as any)?.ok === false) {
    return { ok: false, error: (result as any)?.error || 'Failed to install MCP server' }
  }
  try {
    await bridgeMcpAction('mcp_reload', { server: item.name }, profile)
  } catch {
    // Reload can fail while npm/uvx dependencies are resolving. The user can refresh later.
  }
  return { ok: true, item: { ...item, installed: true } }
}
