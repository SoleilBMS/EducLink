import Link from 'next/link';
import { LogoWordmark } from '@/components/ui/Logo';

const PILLARS = [
  'Design system unifié (web + mobile)',
  'UX multi-profils: admin, enseignant, parent, élève',
  'Automations IA avec validation humaine',
  'Architecture frontend scalable Next.js + Tailwind'
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
      <section className="relative overflow-hidden rounded-3xl border border-line bg-white p-8 shadow-elevated sm:p-12">
        <div className="absolute inset-0 bg-hero-glow" />
        <div className="relative">
          <LogoWordmark className="text-2xl" />
          <p className="mt-8 inline-flex rounded-full border border-brand-blue/20 bg-brand-blue/5 px-3 py-1 text-xs font-semibold text-brand-blue-dark">
            EdTech ERP nouvelle génération · Algérie & Afrique
          </p>
          <h1 className="mt-5 max-w-[16ch] text-5xl font-extrabold leading-[1.03] tracking-tightest">
            Le frontend SaaS éducatif premium, rapide et scalable.
          </h1>
          <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-ink-muted">
            EducLink connecte direction, enseignants, parents et élèves dans une expérience moderne
            inspirée des meilleurs standards SaaS (Linear, Stripe, Notion, Vercel).
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-primary">Voir le dashboard</Link>
            <Link href="/login" className="btn-secondary">Essayer la démo</Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="card p-6">
          <h2>System pillars</h2>
          <ul className="mt-4 grid gap-3">
            {PILLARS.map((item) => (
              <li key={item} className="rounded-xl border border-line bg-surface-alt px-4 py-3 text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </article>
        <article className="card p-6">
          <h2>Roadmap UX/UI</h2>
          <ul className="mt-4 grid gap-2">
            {PHASES.map((phase) => (
              <li key={phase} className="text-sm text-ink-muted">• {phase}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
