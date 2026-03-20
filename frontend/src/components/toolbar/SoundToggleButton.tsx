import { useSound } from '../../audio'

export function SoundToggleButton() {
  const { enabled, toggleEnabled } = useSound()

  return (
    <button
      type="button"
      aria-label={enabled ? '关闭音效' : '开启音效'}
      onClick={toggleEnabled}
      className={[
        'rounded-full border px-4 py-2 text-sm transition',
        enabled
          ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-50'
          : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10',
      ].join(' ')}
    >
      <span className="mr-2">{enabled ? '🔊' : '🔇'}</span>
      {enabled ? '音效开' : '音效关'}
    </button>
  )
}
