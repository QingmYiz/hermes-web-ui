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
  configured?: boolean
  ready?: boolean
  installed?: boolean
  error?: string
}

export interface CommunityInstallResult<T> {
  ok: boolean
  item?: T
  error?: string
  notFound?: boolean
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
  {
    id: 'code-review-zh',
    name: 'code-review-zh',
    sourceLanguage: 'zh',
    sourceTitle: '代码审查助手',
    sourceDescription: '按风险优先级审查代码变更，指出 bug、回归风险和缺失测试。',
    title: '代码审查助手',
    description: '按风险优先级审查代码变更，指出 bug、回归风险和缺失测试。',
    category: 'community',
    tags: ['代码', '审查', '测试'],
    installable: true,
    content: `# 代码审查助手

用于审查代码、PR、diff 和技术方案。

## 输出

- 先列问题，按严重程度排序。
- 每条问题写清影响、触发条件、建议修复方式。
- 明确指出缺失测试和残余风险。
- 没有发现问题时直接说明，并补充仍未覆盖的验证点。
`,
  },
  {
    id: 'bug-repro-zh',
    name: 'bug-repro-zh',
    sourceLanguage: 'zh',
    sourceTitle: 'Bug 复现与定位',
    sourceDescription: '把零散报错整理成可复现步骤、可疑模块和下一步排查命令。',
    title: 'Bug 复现与定位',
    description: '把零散报错整理成可复现步骤、可疑模块和下一步排查命令。',
    category: 'community',
    tags: ['排障', '测试', '代码'],
    installable: true,
    content: `# Bug 复现与定位

用于处理报错、异常日志、用户反馈和线上故障。

## 工作方式

1. 提炼现象、影响范围、环境和时间线。
2. 给出最小复现步骤。
3. 列出最可能的 3 个原因，并说明证据。
4. 给出低风险验证命令或检查点。
`,
  },
  {
    id: 'api-doc-writer-zh',
    name: 'api-doc-writer-zh',
    sourceLanguage: 'zh',
    sourceTitle: '接口文档生成',
    sourceDescription: '把接口代码、请求示例或需求整理成清晰的 API 文档。',
    title: '接口文档生成',
    description: '把接口代码、请求示例或需求整理成清晰的 API 文档。',
    category: 'community',
    tags: ['API', '文档', '开发'],
    installable: true,
    content: `# 接口文档生成

用于编写 REST、WebSocket、Webhook 或内部服务接口文档。

## 输出结构

- 用途
- 鉴权方式
- 请求路径与方法
- 请求参数表
- 响应字段表
- 示例请求和示例响应
- 错误码与排查建议
`,
  },
  {
    id: 'product-requirements-zh',
    name: 'product-requirements-zh',
    sourceLanguage: 'zh',
    sourceTitle: '产品需求整理',
    sourceDescription: '把想法整理成目标、用户故事、流程、边界和验收标准。',
    title: '产品需求整理',
    description: '把想法整理成目标、用户故事、流程、边界和验收标准。',
    category: 'community',
    tags: ['产品', '需求', '规划'],
    installable: true,
    content: `# 产品需求整理

用于把口头想法、聊天记录或粗略方案整理成可开发需求。

## 输出

- 背景与目标
- 用户角色与权限
- 核心流程
- 页面和状态
- 边界条件
- 验收标准
- 暂不做事项
`,
  },
  {
    id: 'learning-coach-zh',
    name: 'learning-coach-zh',
    sourceLanguage: 'zh',
    sourceTitle: '学习教练',
    sourceDescription: '把一个知识点拆成学习路径、练习题、复盘问题和记忆卡片。',
    title: '学习教练',
    description: '把一个知识点拆成学习路径、练习题、复盘问题和记忆卡片。',
    category: 'community',
    tags: ['学习', '课程', '复盘'],
    installable: true,
    content: `# 学习教练

用于学习新知识、备考、复盘课程和制定训练计划。

## 规则

- 先判断用户基础，再分层解释。
- 每个概念都给一个例子。
- 输出 3-5 道练习题和答案。
- 最后给出复盘问题和下一步学习建议。
`,
  },
  {
    id: 'prompt-optimizer-zh',
    name: 'prompt-optimizer-zh',
    sourceLanguage: 'zh',
    sourceTitle: '提示词优化',
    sourceDescription: '把粗糙指令改成目标明确、约束清晰、可复用的提示词。',
    title: '提示词优化',
    description: '把粗糙指令改成目标明确、约束清晰、可复用的提示词。',
    category: 'community',
    tags: ['提示词', 'AI', '效率'],
    installable: true,
    content: `# 提示词优化

用于优化模型指令、系统提示词和工作流提示词。

## 输出

- 改写后的提示词
- 关键变量
- 输出格式
- 约束条件
- 反例或注意事项
`,
  },
  {
    id: 'customer-service-zh',
    name: 'customer-service-zh',
    sourceLanguage: 'zh',
    sourceTitle: '客服回复助手',
    sourceDescription: '生成礼貌、清楚、有解决路径的中文客服回复。',
    title: '客服回复助手',
    description: '生成礼貌、清楚、有解决路径的中文客服回复。',
    category: 'community',
    tags: ['客服', '运营', '回复'],
    installable: true,
    content: `# 客服回复助手

用于处理投诉、售后、咨询、催促和解释类回复。

## 原则

- 先承认问题或诉求，再给处理路径。
- 不承诺无法确认的结果。
- 需要信息时一次性列清楚。
- 语气克制、友好、不过度营销。
`,
  },
  {
    id: 'marketing-copy-zh',
    name: 'marketing-copy-zh',
    sourceLanguage: 'zh',
    sourceTitle: '营销文案生成',
    sourceDescription: '围绕卖点、人群和渠道生成多版本中文营销文案。',
    title: '营销文案生成',
    description: '围绕卖点、人群和渠道生成多版本中文营销文案。',
    category: 'community',
    tags: ['营销', '文案', '运营'],
    installable: true,
    content: `# 营销文案生成

用于生成短视频脚本、朋友圈文案、落地页文案、标题和卖点。

## 输出

- 目标人群
- 核心卖点
- 3 个标题
- 3 个短文案版本
- 1 个更克制的专业版本
- 禁用夸大、虚假和绝对化表达
`,
  },
  {
    id: 'data-analyst-zh',
    name: 'data-analyst-zh',
    sourceLanguage: 'zh',
    sourceTitle: '数据分析解读',
    sourceDescription: '把表格、指标和现象整理成结论、原因假设和行动建议。',
    title: '数据分析解读',
    description: '把表格、指标和现象整理成结论、原因假设和行动建议。',
    category: 'community',
    tags: ['数据', '分析', '指标'],
    installable: true,
    content: `# 数据分析解读

用于分析业务指标、表格、实验结果和运营数据。

## 输出

- 关键变化
- 可能原因
- 需要补充的数据
- 可执行建议
- 风险和误读提醒

不要把相关性说成因果关系。
`,
  },
  {
    id: 'legal-risk-zh',
    name: 'legal-risk-zh',
    sourceLanguage: 'zh',
    sourceTitle: '合同与合规风险提示',
    sourceDescription: '帮助识别合同、公告、协议中的风险点，但不替代律师意见。',
    title: '合同与合规风险提示',
    description: '帮助识别合同、公告、协议中的风险点，但不替代律师意见。',
    category: 'community',
    tags: ['合同', '合规', '风险'],
    installable: true,
    content: `# 合同与合规风险提示

用于初步阅读合同、服务协议、隐私条款和商业文件。

## 输出

- 高风险条款
- 模糊或缺失条款
- 对用户不利的义务
- 建议追问的问题
- 需要专业律师确认的事项

明确说明这不是法律意见。
`,
  },
  {
    id: 'resume-interview-zh',
    name: 'resume-interview-zh',
    sourceLanguage: 'zh',
    sourceTitle: '简历与面试辅导',
    sourceDescription: '优化中文简历要点，准备面试问题和回答框架。',
    title: '简历与面试辅导',
    description: '优化中文简历要点，准备面试问题和回答框架。',
    category: 'community',
    tags: ['简历', '面试', '职业'],
    installable: true,
    content: `# 简历与面试辅导

用于优化简历、项目经历和面试准备。

## 输出

- 简历亮点重写
- 可量化成果建议
- 常见追问
- STAR 回答框架
- 需要补充的证据或数据
`,
  },
  {
    id: 'translation-localization-zh',
    name: 'translation-localization-zh',
    sourceLanguage: 'zh',
    sourceTitle: '翻译与本地化',
    sourceDescription: '在保留术语的同时进行中英互译和本地化改写。',
    title: '翻译与本地化',
    description: '在保留术语的同时进行中英互译和本地化改写。',
    category: 'community',
    tags: ['翻译', '本地化', '写作'],
    installable: true,
    content: `# 翻译与本地化

用于中英互译、产品本地化和双语文案。

## 规则

- 先判断受众和语气。
- 技术术语、品牌名、变量名保持一致。
- 输出自然表达，不逐字硬翻。
- 必要时给出“直译版”和“本地化版”。
`,
  },
  {
    id: 'mindmap-outline-zh',
    name: 'mindmap-outline-zh',
    sourceLanguage: 'zh',
    sourceTitle: '大纲与脑图整理',
    sourceDescription: '把零散信息整理成层级大纲、脑图结构和讲稿。',
    title: '大纲与脑图整理',
    description: '把零散信息整理成层级大纲、脑图结构和讲稿。',
    category: 'community',
    tags: ['大纲', '脑图', '整理'],
    installable: true,
    content: `# 大纲与脑图整理

用于整理课程、文章、方案、直播脚本和汇报材料。

## 输出

- 一级/二级/三级大纲
- 每节核心观点
- 适合展开的案例
- 可删减内容
- 讲稿顺序建议
`,
  },
  {
    id: 'sql-helper-zh',
    name: 'sql-helper-zh',
    sourceLanguage: 'zh',
    sourceTitle: 'SQL 助手',
    sourceDescription: '根据表结构和需求生成 SQL，并解释性能风险。',
    title: 'SQL 助手',
    description: '根据表结构和需求生成 SQL，并解释性能风险。',
    category: 'community',
    tags: ['SQL', '数据库', '开发'],
    installable: true,
    content: `# SQL 助手

用于编写、解释和优化 SQL。

## 输出

- SQL 语句
- 字段假设
- 索引建议
- 可能的性能风险
- 验证结果的查询

如果缺少表结构，先列出需要用户补充的信息。
`,
  },
  {
    id: 'social-video-script-zh',
    name: 'social-video-script-zh',
    sourceLanguage: 'zh',
    sourceTitle: '短视频脚本',
    sourceDescription: '生成适合抖音、小红书、B站的短视频结构和口播稿。',
    title: '短视频脚本',
    description: '生成适合抖音、小红书、B站的短视频结构和口播稿。',
    category: 'community',
    tags: ['短视频', '脚本', '内容'],
    installable: true,
    content: `# 短视频脚本

用于生成短视频选题、口播、分镜和标题。

## 输出

- 开头 3 秒钩子
- 正文结构
- 口播稿
- 分镜建议
- 标题与封面文案
- 评论区引导
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
  {
    id: 'everything',
    name: 'community-everything',
    sourceLanguage: 'en',
    sourceTitle: 'Everything',
    sourceDescription: 'A reference MCP server exposing prompts, resources, and sample tools for testing.',
    title: 'MCP 综合测试',
    description: '官方综合测试 MCP，适合验证当前账号的 MCP 能力、工具发现和资源读取是否正常。',
    tags: ['测试', '工具', '已翻译'],
    installable: true,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      enabled: true,
    },
  },
  {
    id: 'puppeteer',
    name: 'community-puppeteer',
    sourceLanguage: 'en',
    sourceTitle: 'Puppeteer',
    sourceDescription: 'Browser automation and page inspection through Puppeteer.',
    title: '浏览器自动化',
    description: '提供网页打开、点击、截图和 DOM 检查能力；需要服务器具备可用的浏览器运行环境。',
    tags: ['浏览器', '自动化', '需配置'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      enabled: true,
    },
  },
  {
    id: 'github',
    name: 'community-github',
    sourceLanguage: 'en',
    sourceTitle: 'GitHub',
    sourceDescription: 'Read and manage GitHub repositories, issues, pull requests, and files.',
    title: 'GitHub 仓库',
    description: '读取和管理 GitHub 仓库、Issue、PR 和文件；需要配置 GitHub Token。',
    tags: ['GitHub', '代码', '需密钥'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
      enabled: true,
    },
  },
  {
    id: 'brave-search',
    name: 'community-brave-search',
    sourceLanguage: 'en',
    sourceTitle: 'Brave Search',
    sourceDescription: 'Search the web through Brave Search API.',
    title: 'Brave 网络搜索',
    description: '通过 Brave Search API 搜索网页；需要配置 BRAVE_API_KEY。',
    tags: ['搜索', '网页', '需密钥'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: '' },
      enabled: true,
    },
  },
  {
    id: 'google-maps',
    name: 'community-google-maps',
    sourceLanguage: 'en',
    sourceTitle: 'Google Maps',
    sourceDescription: 'Location lookup, directions, and place search through Google Maps APIs.',
    title: 'Google 地图',
    description: '查询地点、路线和地图信息；需要配置 Google Maps API Key。',
    tags: ['地图', '位置', '需密钥'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-google-maps'],
      env: { GOOGLE_MAPS_API_KEY: '' },
      enabled: true,
    },
  },
  {
    id: 'postgres',
    name: 'community-postgres',
    sourceLanguage: 'en',
    sourceTitle: 'PostgreSQL',
    sourceDescription: 'Read PostgreSQL database schemas and run SQL queries.',
    title: 'PostgreSQL 数据库',
    description: '读取 PostgreSQL 表结构并执行查询；需要配置数据库连接串。',
    tags: ['数据库', 'SQL', '需配置'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:password@localhost:5432/db'],
      enabled: true,
    },
  },
  {
    id: 'redis',
    name: 'community-redis',
    sourceLanguage: 'en',
    sourceTitle: 'Redis',
    sourceDescription: 'Inspect Redis keys and values through a configured Redis connection.',
    title: 'Redis 数据库',
    description: '读取 Redis key 和值；需要配置 Redis 连接地址。',
    tags: ['数据库', '缓存', '需配置'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-redis', 'redis://localhost:6379'],
      enabled: true,
    },
  },
  {
    id: 'slack',
    name: 'community-slack',
    sourceLanguage: 'en',
    sourceTitle: 'Slack',
    sourceDescription: 'Read and post Slack messages with a bot token.',
    title: 'Slack 协作',
    description: '读取和发送 Slack 消息；需要配置 Slack Bot Token 和团队信息。',
    tags: ['协作', '消息', '需密钥'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
      enabled: true,
    },
  },
  {
    id: 'gitlab',
    name: 'community-gitlab',
    sourceLanguage: 'en',
    sourceTitle: 'GitLab',
    sourceDescription: 'Read and manage GitLab projects, issues, merge requests, and files.',
    title: 'GitLab 项目',
    description: '读取和管理 GitLab 项目、Issue、合并请求和文件；需要配置 GitLab Token。',
    tags: ['GitLab', '代码', '需密钥'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gitlab'],
      env: { GITLAB_PERSONAL_ACCESS_TOKEN: '' },
      enabled: true,
    },
  },
  {
    id: 'aws-kb',
    name: 'community-aws-kb',
    sourceLanguage: 'en',
    sourceTitle: 'AWS Knowledge Base Retrieval',
    sourceDescription: 'Retrieve content from AWS Bedrock Knowledge Bases.',
    title: 'AWS 知识库检索',
    description: '检索 AWS Bedrock Knowledge Base 内容；需要 AWS 凭证和知识库配置。',
    tags: ['知识库', 'AWS', '需配置'],
    installable: false,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-aws-kb-retrieval'],
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function listCommunitySkills(profile: string): Promise<CommunitySkillItem[]> {
  return COMMUNITY_SKILLS.map(({ content: _content, ...item }) => ({
    ...item,
    installed: existsSync(skillTargetDir(profile, item)),
  }))
}

export async function installCommunitySkill(profile: string, id: string): Promise<CommunityInstallResult<CommunitySkillItem>> {
  const item = findSkill(id)
  if (!item) return { ok: false, error: '社区技能不存在', notFound: true }

  const targetDir = skillTargetDir(profile, item)
  const targetFile = join(targetDir, 'SKILL.md')
  const { content: _content, ...dto } = item
  if (existsSync(targetFile)) return { ok: true, item: { ...dto, installed: true } }

  await mkdir(targetDir, { recursive: true })
  await writeFile(targetFile, item.content, 'utf-8')
  await writeFile(join(profileSkillsDir(profile), item.category, 'DESCRIPTION.md'), '社区技能\n', 'utf-8')
  return { ok: true, item: { ...dto, installed: true } }
}

export async function listCommunityMcps(profile?: string): Promise<CommunityMcpItem[]> {
  const statusByName = new Map<string, { configured: boolean; ready: boolean; error?: string }>()
  try {
    const current = await bridgeMcpAction('mcp_list', {}, profile)
    const servers = Array.isArray((current as any)?.servers) ? (current as any).servers : []
    for (const server of servers) {
      const name = String(server?.name || '')
      if (!name) continue
      const toolCount = Number(server?.tools_registered ?? server?.tools ?? 0)
      const ready = server?.connected === true && toolCount > 0
      statusByName.set(name, {
        configured: true,
        ready,
        error: typeof server?.error === 'string' ? server.error : undefined,
      })
    }
  } catch {
    statusByName.clear()
  }
  return COMMUNITY_MCPS.map(item => ({
    ...item,
    configured: statusByName.get(item.name)?.configured ?? false,
    ready: statusByName.get(item.name)?.ready ?? false,
    installed: statusByName.get(item.name)?.ready ?? false,
    error: statusByName.get(item.name)?.error,
  }))
}

async function waitForMcpTools(profile: string | undefined, serverName: string): Promise<{ ok: boolean; error?: string }> {
  const delays = [0, 500, 1000, 1500, 2500, 3500]
  let lastError = ''
  for (const waitMs of delays) {
    if (waitMs > 0) await delay(waitMs)
    try {
      const result = await bridgeMcpAction('mcp_server_test', { name: serverName }, profile)
      if ((result as any)?.ok === true) {
        const tools = Array.isArray((result as any)?.tools) ? (result as any).tools : []
        if (tools.length > 0) return { ok: true }
        lastError = '服务已连接但没有发现可用工具'
      } else {
        lastError = String((result as any)?.error || '服务暂未连接')
      }
    } catch (err: any) {
      lastError = err?.message || '服务暂未连接'
    }
  }
  return { ok: false, error: lastError || '服务暂未连接' }
}

export async function installCommunityMcp(profile: string | undefined, id: string): Promise<CommunityInstallResult<CommunityMcpItem>> {
  const item = findMcp(id)
  if (!item) return { ok: false, error: '社区 MCP 不存在', notFound: true }
  if (!item.installable) return { ok: false, error: '该 MCP 需要先配置密钥、连接串或运行环境，暂不支持一键安装' }

  const current = await listCommunityMcps(profile)
  const currentItem = current.find(entry => entry.id === id)
  if (currentItem?.installed) return { ok: true, item: currentItem }

  try {
    const action = currentItem?.configured ? 'mcp_server_update' : 'mcp_server_add'
    const result = await bridgeMcpAction(action, {
      name: item.name,
      config: item.config,
    }, profile)
    if ((result as any)?.ok === false) {
      return { ok: false, error: (result as any)?.error || 'MCP bridge 拒绝安装该服务' }
    }
  } catch (err: any) {
    return { ok: false, error: `MCP bridge 暂不可用：${err?.message || '无法连接'}` }
  }

  try {
    await bridgeMcpAction('mcp_reload', { server: item.name }, profile)
  } catch (err: any) {
    return { ok: false, error: `已写入配置，但 MCP 重载失败：${err?.message || '未知错误'}` }
  }

  const ready = await waitForMcpTools(profile, item.name)
  if (!ready.ok) {
    return { ok: false, error: `已写入配置，但 MCP 暂不可用：${ready.error || '未发现工具'}` }
  }
  return { ok: true, item: { ...item, installed: true } }
}
