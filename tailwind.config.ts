import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Deep navy/indigo/purple accent system on a clean light base.
        navy: {
          50: '#f5f6fb',
          100: '#e9ebf7',
          200: '#cdd1ec',
          300: '#a7addb',
          400: '#7c81c4',
          500: '#5b5fac',
          600: '#454990',
          700: '#383b74',
          800: '#262845',
          900: '#14152a',
          950: '#0b0c1a',
        },
        brand: {
          50: '#f4f3ff',
          100: '#ebe8ff',
          200: '#d9d4ff',
          300: '#bcb1ff',
          400: '#9b86ff',
          500: '#7c5cff',
          600: '#6a3ef5',
          700: '#5a2fd6',
          800: '#4b28ad',
          900: '#3e2489',
          950: '#251555',
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f8f9fc',
          muted: '#f1f2f9',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 21, 42, 0.04), 0 4px 16px -4px rgba(20, 21, 42, 0.08)',
        'card-hover': '0 2px 4px rgba(20, 21, 42, 0.06), 0 12px 28px -6px rgba(20, 21, 42, 0.14)',
        popover: '0 8px 30px -6px rgba(20, 21, 42, 0.22)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
