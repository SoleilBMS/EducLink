import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#2563eb',
          'blue-dark': '#1e3a8a',
          'blue-glow': '#60a5fa',
          green: '#22c55e',
          'green-soft': '#4ade80',
          purple: '#7c3aed',
          'purple-soft': '#a78bfa',
          pink: '#ec4899',
          amber: '#f59e0b',
          teal: '#14b8a6',
          rose: '#f43f5e'
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)'
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          alt: 'rgb(var(--surface-alt) / <alpha-value>)',
          bg: 'rgb(var(--surface-bg) / <alpha-value>)',
          elevated: 'rgb(var(--surface-elevated) / <alpha-value>)'
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      letterSpacing: {
        tightest: '-0.03em'
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(95deg, #22c55e 0%, #2563eb 52%, #7c3aed 100%)',
        'brand-soft': 'linear-gradient(135deg, rgba(34,197,94,.12), rgba(37,99,235,.12) 50%, rgba(124,58,237,.14))',
        'sunset-gradient': 'linear-gradient(120deg, #f59e0b 0%, #ec4899 55%, #7c3aed 100%)',
        'ocean-gradient': 'linear-gradient(120deg, #14b8a6 0%, #2563eb 60%, #7c3aed 100%)',
        'hero-glow':
          'radial-gradient(circle at 90% 0%, rgba(124,58,237,.22), transparent 42%), radial-gradient(circle at 0% 100%, rgba(34,197,94,.20), transparent 45%), radial-gradient(circle at 60% 60%, rgba(236,72,153,.10), transparent 50%)'
      },
      boxShadow: {
        brand: '0 12px 28px -10px rgba(37, 99, 235, 0.45)',
        'brand-strong': '0 18px 40px -12px rgba(37, 99, 235, 0.55)',
        soft: '0 1px 2px rgba(17, 24, 39, 0.05)',
        card: '0 12px 24px -8px rgba(17, 24, 39, 0.10)',
        elevated: '0 24px 48px -12px rgba(17, 24, 39, 0.18)',
        glow: '0 0 0 1px rgba(37,99,235,.15), 0 8px 32px -8px rgba(124,58,237,.25)'
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'slow-pulse': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(.4,0,.2,1) both',
        'slow-pulse': 'slow-pulse 3s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite'
      }
    }
  },
  plugins: []
};

export default config;
