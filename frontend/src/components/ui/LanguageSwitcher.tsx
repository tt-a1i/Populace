import { useTranslation } from 'react-i18next'

import { setLanguage } from '../../i18n/config'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation()
  const isZh = i18n.language === 'zh'

  return (
    <button
      type="button"
      onClick={() => setLanguage(isZh ? 'en' : 'zh')}
      className={`rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white ${className}`}
      title={isZh ? 'Switch to English' : '切换为中文'}
    >
      {t('lang.switch')}
    </button>
  )
}
