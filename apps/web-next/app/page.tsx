import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';

const FEATURES = [
  {
    title: 'Gestion administrative',
    description:
      'Admissions, classes, enseignants, dossiers élèves et opérations quotidiennes sur une base unifiée.'
  },
  {
    title: 'Suivi pédagogique',
    description:
      'Notes, assiduité, devoirs, évaluations et visibilité continue pour accompagner la réussite.'
  },
  {
    title: 'Communication école-parents',
    description:
      'Annonces, messagerie et partage d’informations entre l’établissement et les familles.'
  },
  {
    title: 'Finance & paiements',
    description:
      'Frais, factures, paiements, soldes — vue claire pour l’administration et les parents.'
  },
  {
    title: 'IA intégrée',
    description:
      'Génération d’appréciations, résumés de suivi, alertes pédagogiques — auditables et validés humainement.'
  }
];

const AUDIENCE = ['Direction', 'Administration', 'Enseignants', 'Parents', 'Élèves'];

export default function LandingPage() {
  return (
    <main className="mx-auto grid max-w-6xl gap-7 px-6 py-10">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-white p-10 shadow-elevated bg-hero-glow">
        <span className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        <div className="flex items-center gap-3 text-xl font-extrabold tracking-tightest">
          <LogoMark className="h-10 w-10" />
          <span className="text-brand-gradient">EducLink</span>
        </div>
        <h1 className="mt-5 max-w-[22ch] text-4xl font-extrabold leading-[1.1] tracking-tightest sm:text-5xl">
          L’école connectée, intelligente et simplifiée
        </h1>
        <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-ink-muted">
          La solution SaaS pensée pour les établissements privés en Algérie et en Afrique
          francophone : gestion scolaire, communication et IA dans une expérience moderne et
          rassurante.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/login" className="btn-primary">
            Se connecter
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Voir la démo
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <h2>Produit</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="group rounded-2xl border border-line bg-white p-5 shadow-soft transition-all hover:-translate-y-1 hover:border-brand-blue/30 hover:shadow-card"
            >
              <h3 className="text-base font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2>Pour qui ?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {AUDIENCE.map((a) => (
            <div
              key={a}
              className="rounded-xl border border-line bg-surface-alt px-4 py-3 text-center text-sm font-semibold text-ink"
            >
              {a}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border-l-4 border-brand-purple bg-gradient-to-r from-brand-purple/[0.06] to-transparent p-5 text-sm text-ink-muted">
        <strong className="text-ink">Note de transparence : </strong>
        version pilot/demo-ready. Certaines fonctionnalités restent en évolution avant la mise en
        production généralisée.
      </section>
    </main>
  );
}
