/** @type {import('tailwindcss').Config} */
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
      }
    },
  },
  plugins: [],
};
