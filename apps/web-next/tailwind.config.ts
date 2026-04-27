import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#2563eb',
          'blue-dark': '#1e3a8a',
          green: '#22c55e',
          'green-soft': '#4ade80',
          purple: '#7c3aed',
          'purple-soft': '#a78bfa'
        },
        ink: {
          DEFAULT: '#111827',
          muted: '#687280',
          soft: '#9ca3af'
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#f8fafc',
          bg: '#f9fafb'
        },
        line: {
          DEFAULT: '#e5e7eb',
          strong: '#d1d5db'
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
        'hero-glow':
          'radial-gradient(circle at 90% 0%, rgba(124,58,237,.18), transparent 42%), radial-gradient(circle at 0% 100%, rgba(34,197,94,.18), transparent 45%)'
      },
      boxShadow: {
        brand: '0 12px 28px -10px rgba(37, 99, 235, 0.45)',
        soft: '0 1px 2px rgba(17, 24, 39, 0.05)',
        card: '0 12px 24px -8px rgba(17, 24, 39, 0.10)',
        elevated: '0 24px 48px -12px rgba(17, 24, 39, 0.18)'
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
        }
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(.4,0,.2,1) both'
      }
    }
  },
  plugins: []
};

export default config;
