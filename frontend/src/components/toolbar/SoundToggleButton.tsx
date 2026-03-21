import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio'

export function SoundToggleButton() {
  const { t } = useTranslation()
  const { enabled, toggleEnabled } = useSound()
  const label = `${t('settings.sound')} ${enabled ? t('settings.sound_on', 'ON') : t('settings.sound_off', 'OFF')}`

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      onClick={toggleEnabled}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full border text-sm transition duration-200 active:scale-95',
        enabled
          ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10',
      ].join(' ')}
      title={label}
    >
      {enabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
    </button>
  )
}
