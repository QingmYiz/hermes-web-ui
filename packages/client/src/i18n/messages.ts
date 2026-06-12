import zh from './locales/zh'

export type LocaleMessages = Record<string, any>

export const supportedLocales = ['zh'] as const
export type SupportedLocale = (typeof supportedLocales)[number]

export const messages: Record<SupportedLocale, LocaleMessages> = { zh }

export { zh }
