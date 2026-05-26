/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          bg: '#f8fafc',
          panel: '#ffffff',
          panelHeader: '#f1f5f9',
          border: '#e2e8f0',
          borderLight: '#f1f5f9',
          cyan: '#f28524',
          orange: '#1e293b',
          green: '#10b981',
          red: '#ef4444',
          yellow: '#f59e0b',
          gray: '#475569',
          text: '#0f172a',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.875rem', { lineHeight: '1.25rem' }],   // 14px (default 12px)
        'sm': ['0.9375rem', { lineHeight: '1.4rem' }],   // 15px (default 14px)
        'base': ['1.0625rem', { lineHeight: '1.6rem' }], // 17px (default 16px)
        'lg': ['1.1875rem', { lineHeight: '1.8rem' }],   // 19px (default 18px)
        'xl': ['1.375rem', { lineHeight: '2rem' }],      // 22px (default 20px)
        '2xl': ['1.625rem', { lineHeight: '2.25rem' }],  // 26px (default 24px)
        '3xl': ['2.125rem', { lineHeight: '2.5rem' }],   // 34px (default 30px)
      },
      boxShadow: {
        'cyan-glow': '0 0 15px rgba(242, 133, 36, 0.25)',
        'orange-glow': '0 0 15px rgba(30, 41, 59, 0.15)',
        'panel-glow': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
