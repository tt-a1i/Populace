import { generateResidentAvatarDataUrl, type ResidentAvatarSeed } from '../../lib/residentAvatar'

interface ResidentAvatarProps extends ResidentAvatarSeed {
  className?: string
  size?: number
  alt?: string
}

export function ResidentAvatar({
  className = '',
  size = 40,
  alt,
  ...seed
}: ResidentAvatarProps) {
  const src = generateResidentAvatarDataUrl(seed)

  return (
    <img
      src={src}
      alt={alt ?? `${seed.name ?? 'Resident'} avatar`}
      width={size}
      height={size}
      className={[
        'rounded-2xl border border-white/10 bg-slate-900/70 object-cover shadow-[0_10px_24px_rgba(2,6,23,0.35)]',
        className,
      ].join(' ')}
    />
  )
}
