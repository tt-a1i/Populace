import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../../i18n/config'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  detailsOpen: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, detailsOpen: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, detailsOpen: false })
  }

  private toggleDetails = () => {
    this.setState((s) => ({ detailsOpen: !s.detailsOpen }))
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { error, errorInfo, detailsOpen } = this.state
    const t = (key: string) => i18n.t(key)

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-lg rounded-[28px] border border-red-400/25 bg-slate-900/90 px-8 py-9 shadow-[0_24px_80px_rgba(2,6,23,0.65)]">
          <p className="text-[11px] uppercase tracking-[0.35em] text-red-300/70">{t('error.badge')}</p>
          <h1 className="mt-3 font-mono text-2xl font-bold text-white">{t('error.title')}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {t('error.desc')}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-full border border-cyan-300/35 bg-cyan-300/14 px-5 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/22"
            >
              {t('error.retry')}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            >
              {t('error.reload')}
            </button>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={this.toggleDetails}
              className="flex items-center gap-2 text-xs text-slate-400 transition hover:text-slate-200"
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: detailsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </span>
              {detailsOpen ? t('error.hide_details') : t('error.show_details')}
            </button>
            {detailsOpen && (
              <pre className="mt-3 max-h-60 overflow-auto rounded-[14px] border border-white/8 bg-slate-950/80 p-4 text-[11px] leading-5 text-red-200/80 whitespace-pre-wrap">
                {error?.toString()}
                {errorInfo?.componentStack}
              </pre>
            )}
          </div>
        </div>
      </div>
    )
  }
}
