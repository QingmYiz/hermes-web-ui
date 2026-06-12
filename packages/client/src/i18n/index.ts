import { createI18n } from 'vue-i18n'
import { messages } from './messages'
import type { SupportedLocale } from './messages'

const ONLY_LOCALE: SupportedLocale = 'zh'

function setHtmlLang(locale: SupportedLocale) {
  document.documentElement.lang = locale
}

const locale = ONLY_LOCALE
localStorage.setItem('hermes_locale', locale)
setHtmlLang(locale)

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: ONLY_LOCALE,
  messages,
})
