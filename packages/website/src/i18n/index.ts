import { createI18n } from 'vue-i18n'
import zh from './zh'

localStorage.setItem('hermes_website_locale', 'zh')

export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages: { zh },
})
