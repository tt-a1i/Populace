import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config'
import { SoundProvider } from './audio'
import App from './App.tsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastProvider } from './components/ui/ToastProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SoundProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </SoundProvider>
    </ErrorBoundary>
  </StrictMode>,
)
