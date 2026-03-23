import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getLlmKeyStatus, setLlmKey } from '../../services/api'
import { useSound } from '../../audio'
import { setLanguage } from '../../i18n/config'
import { THEME_ACCENTS, useThemeStore } from '../../stores/theme'
import { resetTutorial } from '../ui/TutorialOverlay'
import { PanelShell } from '../ui/PanelShell'
import { PerformancePanel } from './PerformancePanel'

const LS_KEY = 'populace-llm-key'

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

function SettingsGroup({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="panel-section-label mb-2 flex items-center gap-1.5">
        <span>{icon}</span> {title}
      </p>
      <div className="grid gap-1">
        {children}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 even:bg-white/[0.03]">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
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

  return (
    <PanelShell
      icon="⚙️"
      title={t('settings.title')}
      badge={t('settings.badge')}
    >
      {/* ── Data ── */}
      <SettingsGroup title={t('settings.llm_key_label')} icon="🔑">
        <div className="px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('settings.llm_key_hint')}</span>
            <span
              className={`text-xs font-medium ${configured ? 'text-emerald-400' : 'text-amber-400'}`}
            >
              {configured ? t('settings.llm_key_status_ok') : t('settings.llm_key_status_missing')}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              className="panel-input flex-1"
              placeholder={t('settings.llm_key_placeholder')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey() }}
            />
            <button
              type="button"
              onClick={handleSaveKey}
              disabled={saveState === 'saving'}
              className="btn-secondary rounded-xl px-4 py-1.5 text-sm transition duration-200 active:scale-95"
            >
              {saveState === 'saving'
                ? t('settings.llm_key_saving')
                : saveState === 'saved'
                ? t('settings.llm_key_status_ok')
                : t('settings.llm_key_save')}
            </button>
          </div>
        </div>
      </SettingsGroup>

      {/* ── Appearance ── */}
      <SettingsGroup title={t('settings.theme')} icon="🎨">
        <Row label={t('settings.language')}>
          <ToggleBtn active={isZh} onClick={() => setLanguage('zh')} label={t('settings.language_zh')} />
          <ToggleBtn active={!isZh} onClick={() => setLanguage('en')} label={t('settings.language_en')} />
        </Row>

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
      </SettingsGroup>

      {/* ── Audio ── */}
      <SettingsGroup title={t('settings.sound')} icon="🔊">
        <Row label={t('settings.sound')}>
          <ToggleBtn active={soundEnabled} onClick={() => { if (!soundEnabled) toggleSound() }} label={t('settings.sound_on')} />
          <ToggleBtn active={!soundEnabled} onClick={() => { if (soundEnabled) toggleSound() }} label={t('settings.sound_off')} />
        </Row>
      </SettingsGroup>

      {/* ── Help ── */}
      <SettingsGroup title={t('settings.guide')} icon="ℹ️">
        <Row label={t('settings.guide')}>
          <button
            type="button"
            onClick={openGuide}
            className="btn-secondary rounded-full px-4 py-1.5 text-sm transition duration-200 active:scale-95"
          >
            {t('settings.guide_open')}
          </button>
        </Row>

        <Row label={t('settings.tutorial_reset')}>
          <button
            type="button"
            onClick={handleResetTutorial}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-200 transition duration-200 hover:bg-white/10 active:scale-95"
          >
            {tutorialReset ? t('settings.tutorial_reset_done') : '↺'}
          </button>
        </Row>
      </SettingsGroup>

      {/* ── About ── */}
      <SettingsGroup title={t('settings.about_title')} icon="🏘️">
        <div className="px-3 py-2">
          <p className="text-sm leading-relaxed text-slate-300">{t('settings.about_desc')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['React 19', 'PixiJS 8', 'D3.js', 'Zustand', 'Tailwind CSS', 'Vite', 'TypeScript', 'i18next'].map((tech) => (
              <span key={tech} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-400">{tech}</span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
            <span className="font-mono font-medium text-slate-400">v1.0.0</span>
            <span className="h-3 w-px bg-slate-700/60" />
            <span>MIT License</span>
            <span className="h-3 w-px bg-slate-700/60" />
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors hover:text-slate-300"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </div>
          <p className="mt-2 text-[11px] text-slate-600">{t('settings.about_paper')}</p>
        </div>
      </SettingsGroup>

      {/* ── Performance ── */}
      <PerformancePanel />
    </PanelShell>
  )
}
