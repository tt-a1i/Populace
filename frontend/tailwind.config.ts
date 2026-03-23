import type { Config } from 'tailwindcss'

// Responsive breakpoints: sm(640) / md(768) / lg(1024) / xl(1280) — Tailwind defaults
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    // Using Tailwind default screens: sm:640px, md:768px, lg:1024px, xl:1280px
    extend: {
      colors: {
        abyss: '#020617',
      },
    },
  },
  plugins: [],
}

export default config
