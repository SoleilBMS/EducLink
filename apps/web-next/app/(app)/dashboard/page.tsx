import { Header } from '@/components/shell/Header';

const METRICS = [
  { label: 'Élèves inscrits', value: '342', delta: '+12 ce mois' },
  { label: 'Classes actives', value: '18', delta: '6 niveaux' },
  { label: 'Présence aujourd’hui', value: '94 %', delta: '+1.2 pt vs hier' },
  { label: 'Impayés', value: '7', delta: '−2 vs semaine dernière' }
];

const TREND = [88, 90, 91, 89, 93, 94, 95];

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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => (
          <div key={m.label} className="card relative overflow-hidden p-5">
            <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient opacity-90" />
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">{m.label}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tightest">{m.value}</p>
            <p className="mt-1 text-xs text-ink-muted">{m.delta}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-3">
        <div className="card p-6 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2>Tendance présence (7 jours)</h2>
            <span className="badge">Live analytics</span>
          </div>
          <div className="mt-6 grid h-52 grid-cols-7 items-end gap-3 rounded-2xl border border-line bg-surface-alt p-4">
            {TREND.map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-full rounded-md bg-brand-gradient" style={{ height: `${v * 1.6}px` }} />
                <span className="text-xs text-ink-muted">J{i + 1}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2>Actions rapides</h2>
          <div className="mt-4 grid gap-2">
            <button className="btn-primary">Saisir une absence</button>
            <button className="btn-secondary">Générer bulletins IA</button>
            <button className="btn-secondary">Envoyer une annonce</button>
            <button className="btn-secondary">Créer facture</button>
          </div>
        </div>
      </section>
    </>
  );
}
