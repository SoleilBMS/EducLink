import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';
import { LoginForm } from './LoginForm';

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

        <LoginForm />

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
