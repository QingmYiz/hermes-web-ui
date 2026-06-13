import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const androidDir = join(root, 'packages', 'android')
const isWindows = process.platform === 'win32'
const gradlew = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew')

const defaultSdk = isWindows
  ? join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'Android', 'Sdk')
  : join(process.env.HOME || '', 'Android', 'Sdk')
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || defaultSdk

if (!existsSync(gradlew)) {
  console.error(`Gradle wrapper not found: ${gradlew}`)
  process.exit(1)
}
if (!existsSync(androidHome)) {
  console.error(`Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT. Tried: ${androidHome}`)
  process.exit(1)
}

const result = spawnSync(gradlew, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
  },
})

process.exit(result.status ?? 1)
