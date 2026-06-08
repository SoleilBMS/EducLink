import { ThemeToggle } from '@/components/ui/ThemeToggle';

type Props = {
  schoolLabel: string;
  title: string;
  userName: string;
  userEmail: string;
  roleLabel: string;
};

export function Header({ schoolLabel, title, userName, userEmail, roleLabel }: Props) {
  const initials = userName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-6 py-5 shadow-soft backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="hidden h-10 w-1 rounded-full bg-brand-gradient sm:block" />
        <div>
          <p className="m-0 text-[11px] font-bold uppercase tracking-widest text-ink-soft">
            {schoolLabel}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative hidden md:block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <input
            aria-label="Rechercher"
            type="search"
            placeholder="Recherche globale…"
            className="w-64 rounded-xl border border-line bg-surface-alt py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft transition-all focus:border-brand-blue focus:bg-surface focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
          />
        </div>

        <ThemeToggle />

        <button
          type="button"
          aria-label="Notifications"
          className="btn-icon relative"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10 21a2 2 0 0 0 4 0" />
          </svg>
          <span className="absolute right-2 top-2 inline-flex h-2 w-2 rounded-full bg-brand-rose ring-2 ring-surface" />
        </button>

        <div className="ml-1 hidden items-center gap-3 rounded-xl border border-line bg-surface-alt px-3 py-1.5 sm:flex">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-brand">
            {initials}
          </div>
          <div className="flex flex-col items-start gap-0.5 leading-none">
            <p className="m-0 text-sm font-semibold text-ink">{userName}</p>
            <p className="m-0 text-[11px] text-ink-muted">{userEmail}</p>
          </div>
          <span className="badge ml-1">{roleLabel}</span>
        </div>
      </div>
    </header>
  );
}
