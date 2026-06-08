import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@school-a.test', accent: 'blue' },
  { role: 'Direction', email: 'director@school-a.test', accent: 'purple' },
  { role: 'Enseignant', email: 'teacher@school-a.test', accent: 'green' },
  { role: 'Parent', email: 'parent@school-a.test', accent: 'pink' },
  { role: 'Élève', email: 'student@school-a.test', accent: 'teal' },
  { role: 'Comptable', email: 'accountant@school-a.test', accent: 'amber' }
] as const;

const ACCENT_DOT: Record<(typeof DEMO_ACCOUNTS)[number]['accent'], string> = {
  blue: 'bg-brand-blue',
  purple: 'bg-brand-purple',
  green: 'bg-brand-green',
  pink: 'bg-brand-pink',
  teal: 'bg-brand-teal',
  amber: 'bg-brand-amber'
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <span className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-blue/15 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-brand-purple/15 blur-3xl" />
      <span className="pointer-events-none absolute left-1/3 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-brand-green/10 blur-3xl" />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface p-8 shadow-elevated backdrop-blur">
        <span className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        <div className="flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <span className="text-xl font-extrabold tracking-tightest text-brand-gradient">
            EducLink
          </span>
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">Bon retour 👋</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Espace pilote · mot de passe unique :{' '}
          <code className="rounded-md bg-brand-blue/10 px-1.5 py-0.5 font-mono text-xs text-brand-blue">
            password123
          </code>
        </p>

        <form method="POST" action="/api/v1/auth/login" className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Email
            <input
              type="email"
              name="email"
              required
              defaultValue="admin@school-a.test"
              className="input"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Mot de passe
            <input
              type="password"
              name="password"
              required
              defaultValue="password123"
              className="input"
            />
          </label>
          <button type="submit" className="btn-primary mt-2">
            Se connecter
            <span aria-hidden>→</span>
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-line bg-surface-alt p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">
            Comptes de démo
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${ACCENT_DOT[a.accent]}`} />
                  {a.role}
                </span>
                <code className="rounded bg-surface px-2 py-0.5 font-mono text-xs text-ink">
                  {a.email}
                </code>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-brand-blue transition-colors hover:text-brand-purple">
            ← Retour à l’accueil
          </Link>
        </p>
      </div>
    </main>
  );
}
