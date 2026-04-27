import { Header } from '@/components/shell/Header';

const METRICS = [
  { label: 'Élèves inscrits', value: '342', delta: '+12 ce mois' },
  { label: 'Classes actives', value: '18', delta: '6 niveaux' },
  { label: 'Présence aujourd’hui', value: '94 %', delta: '+1.2 pt vs hier' },
  { label: 'Impayés', value: '7', delta: '— 2 vs sem. dernière' }
];

const ACTIVITY = [
  { type: 'Bulletin', text: '12 appréciations générées par IA — Mme Bensalem · 6ème A', time: 'il y a 12 min' },
  { type: 'Absence', text: 'Aya Nadir absente ce matin · justificatif en attente', time: 'il y a 38 min' },
  { type: 'Paiement', text: 'Paiement reçu — Famille Khelifi · 18 000 DA · trim. 2', time: 'il y a 2 h' },
  { type: 'Annonce', text: 'Nouvelle annonce : Réunion parents 5ème — vendredi 16h', time: 'il y a 4 h' }
];

const ALERTS = [
  { level: 'warning', text: '4 élèves en baisse de moyenne — 5ème A · Mathématiques' },
  { level: 'info', text: 'Bulletins T2 à valider avant le 15 mai (24 restants)' },
  { level: 'danger', text: '3 paiements en retard · relances IA proposées' }
];

const ALERT_STYLES: Record<string, string> = {
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  info: 'bg-brand-blue/5 text-brand-blue-dark border-brand-blue/20',
  danger: 'bg-red-50 text-red-900 border-red-200'
};

export default function DashboardPage() {
  return (
    <>
      <Header
        schoolLabel="École Pilote · School A"
        title="Tableau de bord — Direction"
        userName="Karim Bouaziz"
        userEmail="admin@school-a.test"
        roleLabel="School Admin"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => (
          <div
            key={m.label}
            className="relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
          >
            <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient opacity-90" />
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              {m.label}
            </p>
            <p className="mt-2 text-3xl font-extrabold tracking-tightest">{m.value}</p>
            <p className="mt-1 text-xs text-ink-muted">{m.delta}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2>Activité récente</h2>
            <span className="badge">Temps réel</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {ACTIVITY.map((a, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface-alt p-4"
              >
                <div>
                  <p className="m-0 text-xs font-semibold uppercase tracking-widest text-brand-blue">
                    {a.type}
                  </p>
                  <p className="mt-1 text-sm text-ink">{a.text}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-muted">{a.time}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2>Alertes IA</h2>
            <span className="badge">5 actifs</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {ALERTS.map((a, i) => (
              <li
                key={i}
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${ALERT_STYLES[a.level]}`}
              >
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card mt-6 p-6">
        <h2>Actions rapides</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn-primary">Saisir une absence</button>
          <button className="btn-secondary">Générer bulletins (IA)</button>
          <button className="btn-secondary">Nouvelle annonce</button>
          <button className="btn-secondary">Encaisser un paiement</button>
        </div>
      </section>
    </>
  );
}
