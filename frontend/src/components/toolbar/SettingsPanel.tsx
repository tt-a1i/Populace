import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getLlmKeyStatus, setLlmKey } from '../../services/api'
import { useSound } from '../../audio'
import { setLanguage } from '../../i18n/config'
import { THEME_ACCENTS, useThemeStore } from '../../stores/theme'
import { resetTutorial } from '../ui/TutorialOverlay'

const LS_KEY = 'populace-llm-key'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl px-4 py-3 even:bg-white/4">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function ToggleBtn({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-xs font-medium transition duration-200 active:scale-95',
        active
          ? 'theme-accent-button-active'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export function SettingsPanel() {
  const { t, i18n } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const accent = useThemeStore((s) => s.accent)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const setAccent = useThemeStore((s) => s.setAccent)
  const { enabled: soundEnabled, toggleEnabled: toggleSound } = useSound()

  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem(LS_KEY) ?? '' } catch { return '' }
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [configured, setConfigured] = useState(false)
  const [tutorialReset, setTutorialReset] = useState(false)

  useEffect(() => {
    getLlmKeyStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => {})
  }, [])

  const handleSaveKey = async () => {
    setSaveState('saving')
    try {
      const trimmed = apiKey.trim()
      const res = await setLlmKey(trimmed)
      setConfigured(res.configured)
      try { localStorage.setItem(LS_KEY, trimmed) } catch { /* ignore */ }
    } catch {
      // ignore — key may still be saved server-side if network recovered
    }
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
  }

  const handleResetTutorial = () => {
    resetTutorial()
    // Also reset the onboarding drama so it replays on next page load
    localStorage.removeItem('populace:onboarding_done')
    localStorage.removeItem('populace:first-run-guide-seen')
    setTutorialReset(true)
    setTimeout(() => setTutorialReset(false), 2000)
  }

  const isZh = i18n.language === 'zh'
  const openGuide = () => {
    window.dispatchEvent(new CustomEvent('populace:open-guide'))
  }
  const inputClass =
    'theme-accent-input flex-1 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none'

  return (
    <div className="rounded-xl border border-white/10 bg-white/4 p-5">
      <p className="mb-1 text-[10px] uppercase tracking-[0.3em] text-slate-400">
        {t('settings.badge')}
      </p>
      <h3 className="mb-5 text-base font-semibold text-white">{t('settings.title')}</h3>

      <div className="grid gap-1">
        {/* LLM API Key */}
        <div className="rounded-xl px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-300">{t('settings.llm_key_label')}</span>
            <span
              className={`text-xs font-medium ${configured ? 'text-emerald-400' : 'text-amber-400'}`}
            >
              {configured ? t('settings.llm_key_status_ok') : t('settings.llm_key_status_missing')}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              className={inputClass}
              placeholder={t('settings.llm_key_placeholder')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey() }}
            />
            <button
              type="button"
              onClick={handleSaveKey}
              disabled={saveState === 'saving'}
              className="theme-accent-button-outline rounded-full border px-4 py-1.5 text-sm transition duration-200 active:scale-95 disabled:opacity-40"
            >
              {saveState === 'saving'
                ? t('settings.llm_key_saving')
                : saveState === 'saved'
                ? t('settings.llm_key_status_ok')
                : t('settings.llm_key_save')}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">{t('settings.llm_key_hint')}</p>
        </div>

        {/* Language */}
        <Row label={t('settings.language')}>
          <ToggleBtn active={isZh} onClick={() => setLanguage('zh')} label={t('settings.language_zh')} />
          <ToggleBtn active={!isZh} onClick={() => setLanguage('en')} label={t('settings.language_en')} />
        </Row>

        {/* Theme */}
        <Row label={t('settings.theme')}>
          <ToggleBtn
            active={theme === 'dark'}
            onClick={() => { if (theme !== 'dark') toggleTheme() }}
            label={t('settings.theme_dark')}
          />
          <ToggleBtn
            active={theme === 'light'}
            onClick={() => { if (theme !== 'light') toggleTheme() }}
            label={t('settings.theme_light')}
          />
        </Row>

        <Row label={t('settings.theme_color')}>
          {Object.values(THEME_ACCENTS).map((preset) => (
            <button
              key={preset.key}
              type="button"
              aria-pressed={accent === preset.key}
              aria-label={t(`settings.theme_color_${preset.key}`)}
              onClick={() => setAccent(preset.key)}
              className={[
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition duration-200 active:scale-95',
                accent === preset.key
                  ? 'theme-accent-button-active'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full border border-white/20"
                style={{ backgroundColor: preset.hex }}
              />
              {t(`settings.theme_color_${preset.key}`)}
            </button>
          ))}
        </Row>

        {/* Sound */}
        <Row label={t('settings.sound')}>
          <ToggleBtn active={soundEnabled} onClick={() => { if (!soundEnabled) toggleSound() }} label={t('settings.sound_on')} />
          <ToggleBtn active={!soundEnabled} onClick={() => { if (soundEnabled) toggleSound() }} label={t('settings.sound_off')} />
        </Row>

        <Row label={t('settings.guide')}>
          <button
            type="button"
            onClick={openGuide}
            className="theme-accent-button-outline rounded-full border px-4 py-1.5 text-sm transition duration-200 active:scale-95"
          >
            {t('settings.guide_open')}
          </button>
        </Row>

        {/* Tutorial reset */}
        <Row label={t('settings.tutorial_reset')}>
          <button
            type="button"
            onClick={handleResetTutorial}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-200 transition duration-200 hover:bg-white/10 active:scale-95"
          >
            {tutorialReset ? t('settings.tutorial_reset_done') : '↺'}
          </button>
        </Row>
      </div>
    </div>
  )
}
