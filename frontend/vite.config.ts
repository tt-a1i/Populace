import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 250,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor'
          }

          if (id.includes('/i18next/') || id.includes('/react-i18next/') || id.includes('/zustand/')) {
            return 'state-i18n-vendor'
          }

          if (id.includes('/d3-')) {
            return 'd3-vendor'
          }

          if (id.includes('/pixi.js/') || id.includes('/@pixi/')) {
            return undefined
          }

          if (id.includes('/html-to-image/')) {
            return 'export-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      // REST API — forward /api/* to the FastAPI backend
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // WebSocket — forward /ws to the FastAPI backend
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
