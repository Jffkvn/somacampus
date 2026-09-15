/** @type {import('tailwindcss').Config} */
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#006c8b',
          tealLight: '#008bb3',
          tealDark: '#004f66',
        },
        nav: {
          deep: '#002732',
          rail: '#003847',
          surface: '#004658',
          hover: 'rgba(255, 255, 255, 0.08)',
          active: 'rgba(0, 108, 139, 0.35)',
          text: '#f8fafc',
          muted: '#94a3b8',
        },
        status: {
          success: '#10b981',
          pending: '#f59e0b',
          warning: '#f97316',
          critical: '#ef4444',
          info: '#0284c7',
          neutral: '#64748b',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.06)',
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      keyframes: {
        'modal-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'modal-out': {
          '0%': { opacity: '1', transform: 'scale(1) translateY(0)' },
          '100%': { opacity: '0', transform: 'scale(0.98) translateY(4px)' },
        },
      },
      animation: {
        'modal-in': 'modal-in 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        'modal-out': 'modal-out 140ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
