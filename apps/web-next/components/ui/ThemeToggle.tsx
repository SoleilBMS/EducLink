'use client';

import { useEffect, useState } from 'react';
import { useTheme } from './ThemeProvider';

type Props = {
  className?: string;
};

export function ThemeToggle({ className = '' }: Props) {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === 'dark';
  const label = isDark ? 'Activer le mode clair' : 'Activer le mode sombre';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`group relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface text-ink-muted shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand-blue/50 hover:text-brand-blue ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-xl bg-brand-soft opacity-0 transition-opacity group-hover:opacity-100"
      />
      <span className="relative h-5 w-5">
        {/* Sun */}
        <svg
          viewBox="0 0 24 24"
          className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
            isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        {/* Moon */}
        <svg
          viewBox="0 0 24 24"
          className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
            isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </button>
  );
}
