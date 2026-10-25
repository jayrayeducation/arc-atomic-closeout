/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#080D18', 900: '#080D18', 800: '#0C1423', 700: '#111B2A', 600: '#182638', 500: '#223249' },
        card: '#111B2A',
        cyan: { DEFAULT: '#43E0D0', soft: '#43E0D01A' },
        blue: { DEFAULT: '#568AFF', soft: '#568AFF1F' },
        ink: { DEFAULT: '#F3F7FC', dim: '#A9B6C8', mute: '#7D8CA3' },
        ok: '#3DDC97',
        warn: '#F5B94A',
        bad: '#FF6B7A',
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'ui-sans-serif', 'sans-serif'],
        sans: ['"DM Sans Variable"', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(243,247,252,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(67,224,208,0.35), 0 8px 28px -10px rgba(67,224,208,0.35)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: { shimmer: 'shimmer 1.4s linear infinite' },
    },
  },
  plugins: [],
}
