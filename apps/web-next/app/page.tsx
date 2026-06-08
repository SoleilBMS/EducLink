import Link from 'next/link';
import { LogoWordmark } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const PILLARS = [
  { label: 'Design system unifié (web + mobile)', accent: 'from-brand-green/20 to-brand-blue/10' },
  { label: 'UX multi-profils: admin, enseignant, parent, élève', accent: 'from-brand-blue/20 to-brand-purple/10' },
  { label: 'Automations IA avec validation humaine', accent: 'from-brand-purple/20 to-brand-pink/10' },
  { label: 'Architecture frontend scalable Next.js + Tailwind', accent: 'from-brand-teal/20 to-brand-blue/10' }
];

const PHASES = [
  'PHASE 1 — Design system, navigation, layout shell',
  'PHASE 2 — Landing premium + conversion',
  'PHASE 3 — Dashboard admin, KPI, analytics',
  'PHASE 4 — Espace enseignant (présences, notes, devoirs)',
  'PHASE 5 — Portail parent (messagerie, suivi enfant)',
  'PHASE 6-8 — Responsive, animations, accessibilité'
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <LogoWordmark className="text-lg" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn-secondary">Connexion</Link>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 shadow-elevated sm:p-12">
        <div className="absolute inset-0 bg-hero-glow" />
        <span className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-purple/20 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-green/20 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-blue/20 bg-brand-blue/5 px-3 py-1 text-xs font-semibold text-brand-blue">
            <span className="dot-pulse" />
            EdTech ERP nouvelle génération · Algérie & Afrique
          </p>
          <h1 className="mt-5 max-w-[16ch] text-5xl font-extrabold leading-[1.03] tracking-tightest">
            <span className="text-brand-gradient">Le frontend SaaS éducatif</span>{' '}
            <span>premium, rapide et scalable.</span>
          </h1>
          <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-ink-muted">
            EducLink connecte direction, enseignants, parents et élèves dans une expérience moderne
            inspirée des meilleurs standards SaaS (Linear, Stripe, Notion, Vercel).
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-primary">
              Voir le dashboard
              <span aria-hidden>→</span>
            </Link>
            <Link href="/login" className="btn-secondary">Essayer la démo</Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="card p-6">
          <div className="flex items-center justify-between">
            <h2>System pillars</h2>
            <span className="badge">4 piliers</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {PILLARS.map((item) => (
              <li
                key={item.label}
                className={`group flex items-center gap-3 rounded-xl border border-line bg-gradient-to-br ${item.accent} px-4 py-3 text-sm text-ink transition-transform hover:-translate-y-0.5`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface text-brand-blue shadow-soft">
                  ✓
                </span>
                <span className="font-medium">{item.label}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="card p-6">
          <div className="flex items-center justify-between">
            <h2>Roadmap UX/UI</h2>
            <span className="badge-success">En cours</span>
          </div>
          <ul className="mt-4 grid gap-2">
            {PHASES.map((phase, i) => (
              <li
                key={phase}
                className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-alt"
              >
                <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-bold text-brand-blue">
                  {i + 1}
                </span>
                <span>{phase}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
