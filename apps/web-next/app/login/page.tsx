import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@school-a.test' },
  { role: 'Direction', email: 'director@school-a.test' },
  { role: 'Enseignant', email: 'teacher@school-a.test' },
  { role: 'Parent', email: 'parent@school-a.test' },
  { role: 'Élève', email: 'student@school-a.test' },
  { role: 'Comptable', email: 'accountant@school-a.test' }
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-white p-8 shadow-elevated">
        <span className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        <div className="flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <span className="text-xl font-extrabold tracking-tightest text-brand-gradient">
            EducLink
          </span>
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Connexion</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Espace pilot · mot de passe unique :{' '}
          <code className="rounded-md bg-brand-blue/10 px-1.5 py-0.5 font-mono text-xs text-brand-blue-dark">
            password123
          </code>
        </p>

        <form
          method="POST"
          action="/api/v1/auth/login"
          className="mt-6 grid gap-4"
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              name="email"
              required
              defaultValue="admin@school-a.test"
              className="rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink shadow-soft transition-all focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Mot de passe
            <input
              type="password"
              name="password"
              required
              defaultValue="password123"
              className="rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink shadow-soft transition-all focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
            />
          </label>
          <button type="submit" className="btn-primary mt-2">
            Se connecter
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-line bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Comptes de démo
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-2">
                <span className="text-ink-muted">{a.role}</span>
                <code className="rounded bg-white px-2 py-0.5 text-xs">{a.email}</code>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-brand-blue hover:text-brand-purple">
            ← Retour à l’accueil
          </Link>
        </p>
      </div>
    </main>
  );
}
