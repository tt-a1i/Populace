import '@testing-library/jest-dom'
// Initialize i18n (defaults to 'zh') so useTranslation works in all tests
import '../i18n/config'

// Polyfill ResizeObserver for test environment (used by Toolbar indicator)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver
}
