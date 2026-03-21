import { useSound } from '../../audio'

export function SoundToggleButton() {
  const { enabled, toggleEnabled } = useSound()

  return (
    <button
      type="button"
      aria-label={enabled ? '关闭音效' : '开启音效'}
      onClick={toggleEnabled}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full border text-sm transition',
        enabled
          ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10',
      ].join(' ')}
      title={enabled ? '关闭音效' : '开启音效'}
    >
      {enabled ? '🔊' : '🔇'}
    </button>
  )
}
