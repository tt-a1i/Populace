import { useTranslation } from 'react-i18next'

interface GuidePageProps {
  onBack: () => void
}

interface FeatureSection {
  title: string
  description: string
  bullets: string[]
}

interface ShortcutEntry {
  action: string
  key: string
}

interface FaqEntry {
  question: string
  answer: string
}

export function GuidePage({ onBack }: GuidePageProps) {
  const { t } = useTranslation()
  const features = t('guide_page.features', { returnObjects: true }) as FeatureSection[]
  const shortcuts = t('guide_page.shortcuts.items', { returnObjects: true }) as ShortcutEntry[]
  const faq = t('guide_page.faq.items', { returnObjects: true }) as FaqEntry[]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_42%,#111827_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="rounded-[28px] border border-white/10 bg-slate-950/72 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-200/75">{t('guide_page.badge')}</p>
              <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">{t('guide_page.title')}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{t('guide_page.description')}</p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 py-2 text-sm font-medium text-slate-100 transition duration-200 hover:border-cyan-300/35 hover:bg-cyan-300/10"
            >
              {t('guide_page.back')}
            </button>
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {features.map((section) => (
            <article
              key={section.title}
              className="rounded-[24px] border border-white/10 bg-slate-900/65 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.28)] backdrop-blur"
            >
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/65">{t('guide_page.features_label')}</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">{section.description}</p>
              <ul className="mt-4 grid gap-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                    {bullet}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[24px] border border-white/10 bg-slate-900/65 p-5 backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/65">{t('guide_page.shortcuts.badge')}</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">{t('guide_page.shortcuts.title')}</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
              <div className="grid grid-cols-[1.1fr_0.9fr] bg-white/[0.05] px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                <span>{t('guide_page.shortcuts.action')}</span>
                <span>{t('guide_page.shortcuts.key')}</span>
              </div>
              {shortcuts.map((entry) => (
                <div key={entry.action} className="grid grid-cols-[1.1fr_0.9fr] border-t border-white/8 px-4 py-3 text-sm">
                  <span className="pr-4 text-slate-200">{entry.action}</span>
                  <code className="justify-self-start rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-cyan-100">
                    {entry.key}
                  </code>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[24px] border border-white/10 bg-slate-900/65 p-5 backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-100/65">{t('guide_page.faq.badge')}</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">{t('guide_page.faq.title')}</h2>
            <div className="mt-5 grid gap-3">
              {faq.map((entry) => (
                <div key={entry.question} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <h3 className="text-sm font-semibold text-white">{entry.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{entry.answer}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  )
}
