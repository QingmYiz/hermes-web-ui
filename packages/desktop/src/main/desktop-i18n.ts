type TranslationKey =
  | 'tray.show'
  | 'tray.hide'
  | 'tray.checkForUpdates'
  | 'tray.openAtLogin'
  | 'tray.quit'
  | 'update.upToDateTitle'
  | 'update.upToDateMessage'
  | 'update.checkingTitle'
  | 'update.checkingMessage'
  | 'update.currentVersion'
  | 'update.availableTitle'
  | 'update.availableMessage'
  | 'update.downloading'
  | 'update.readyTitle'
  | 'update.readyMessage'
  | 'update.readyDetail'
  | 'update.restartNow'
  | 'update.download'
  | 'update.later'
  | 'update.failedTitle'
  | 'update.failedMessage'
  | 'update.noUpdateInfoMessage'
  | 'update.packagedOnlyMessage'
  | 'desktop.startingLocalServices'
  | 'desktop.selectRuntimeSource'
  | 'desktop.downloadFailed'
  | 'desktop.downloadCloudflareTitle'
  | 'desktop.downloadCloudflareDetail'
  | 'desktop.downloadGithubTitle'
  | 'desktop.downloadGithubDetail'
  | 'desktop.failedPrepareRuntime'
  | 'desktop.failedStartServices'
  | 'runtime.checking'
  | 'runtime.migrating'
  | 'runtime.migrated'
  | 'runtime.migrationFailed'
  | 'runtime.downloading'
  | 'runtime.downloadingPackage'
  | 'runtime.verifying'
  | 'runtime.extracting'
  | 'runtime.ready'
  | 'common.ok'

const translations: Record<TranslationKey, string> = {
  'tray.show': '显示 Hermes Studio',
  'tray.hide': '隐藏 Hermes Studio',
  'tray.checkForUpdates': '检查更新',
  'tray.openAtLogin': '开机启动',
  'tray.quit': '退出 Hermes Studio',
  'update.upToDateTitle': 'Hermes Studio',
  'update.upToDateMessage': 'Hermes Studio 已是最新版本。',
  'update.checkingTitle': 'Hermes Studio',
  'update.checkingMessage': '正在检查更新...',
  'update.currentVersion': '当前版本：{version}',
  'update.availableTitle': '发现新版本',
  'update.availableMessage': 'Hermes Studio {version} 可用。',
  'update.downloading': '更新正在后台下载。',
  'update.readyTitle': '更新已就绪',
  'update.readyMessage': 'Hermes Studio {version} 已准备好安装。',
  'update.readyDetail': '立即重启以应用更新，或下次退出时自动安装。',
  'update.restartNow': '立即重启',
  'update.download': '下载',
  'update.later': '稍后',
  'update.failedTitle': '检查更新失败',
  'update.failedMessage': '无法检查 Hermes Studio 更新。',
  'update.noUpdateInfoMessage': '当前平台的更新信息暂不可用。',
  'update.packagedOnlyMessage': '自动更新仅在打包后的桌面应用中可用。',
  'desktop.startingLocalServices': '正在启动本地服务...',
  'desktop.selectRuntimeSource': '请选择运行时下载源以启动本地服务。',
  'desktop.downloadFailed': '下载失败',
  'desktop.downloadCloudflareTitle': '从 Cloudflare 下载',
  'desktop.downloadCloudflareDetail': '使用 Hermes Studio 下载代理。',
  'desktop.downloadGithubTitle': '从 GitHub 下载',
  'desktop.downloadGithubDetail': '直接使用 GitHub Release 资源。',
  'desktop.failedPrepareRuntime': '准备 Hermes 运行时失败',
  'desktop.failedStartServices': '启动本地服务失败',
  'runtime.checking': '正在检查 Hermes 运行时...',
  'runtime.migrating': '正在迁移 Hermes 运行时...',
  'runtime.migrated': 'Hermes 运行时迁移完成。',
  'runtime.migrationFailed': '运行时迁移失败，正在重新下载...',
  'runtime.downloading': '正在下载 Hermes 运行时...',
  'runtime.downloadingPackage': '正在下载 {name}...',
  'runtime.verifying': '正在校验 Hermes 运行时...',
  'runtime.extracting': '正在解压 Hermes 运行时...',
  'runtime.ready': 'Hermes 运行时已就绪。',
  'common.ok': '确定',
}

export function t(key: TranslationKey, params: Record<string, string> = {}): string {
  const message = translations[key]
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement),
    message,
  )
}
