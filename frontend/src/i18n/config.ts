import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en.json'
import zh from './zh.json'

const STORAGE_KEY = 'populace:lang'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    lng: (() => { try { return localStorage?.getItem?.(STORAGE_KEY) || 'zh' } catch { return 'zh' } })(),
    fallbackLng: 'zh',
    interpolation: { escapeValue: false },
  })

export function setLanguage(lang: 'zh' | 'en') {
  void i18n.changeLanguage(lang)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang)
  }
}

export default i18n
