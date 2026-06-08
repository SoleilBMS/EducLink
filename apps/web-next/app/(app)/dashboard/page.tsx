import { Header } from '@/components/shell/Header';

type Metric = {
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down' | 'flat';
  accent: 'blue' | 'green' | 'purple' | 'amber';
};

const METRICS: Metric[] = [
  { label: 'Élèves inscrits', value: '342', delta: '+12 ce mois', trend: 'up', accent: 'blue' },
  { label: 'Classes actives', value: '18', delta: '6 niveaux', trend: 'flat', accent: 'purple' },
  { label: 'Présence aujourd’hui', value: '94 %', delta: '+1.2 pt vs hier', trend: 'up', accent: 'green' },
  { label: 'Impayés', value: '7', delta: '−2 vs semaine dernière', trend: 'down', accent: 'amber' }
];

const ACCENT_BAR: Record<Metric['accent'], string> = {
  blue: 'bg-brand-blue',
  green: 'bg-brand-green',
  purple: 'bg-brand-purple',
  amber: 'bg-brand-amber'
};

const ACCENT_GLOW: Record<Metric['accent'], string> = {
  blue: 'from-brand-blue/20',
  green: 'from-brand-green/20',
  purple: 'from-brand-purple/20',
  amber: 'from-brand-amber/20'
};

const TREND = [88, 90, 91, 89, 93, 94, 95];

const ACTIVITY = [
  { time: '09:42', label: 'Nouvelle absence saisie · Aya N. (CP-A)', accent: 'amber' as const },
  { time: '09:18', label: 'Bulletin IA généré · 6ème B', accent: 'purple' as const },
  { time: '08:55', label: 'Annonce envoyée à 184 parents', accent: 'blue' as const },
  { time: '08:30', label: 'Paiement reçu · 32 000 DA (M. Saadi)', accent: 'green' as const }
];

const ACTIVITY_DOT: Record<'amber' | 'purple' | 'blue' | 'green', string> = {
  amber: 'bg-brand-amber',
  purple: 'bg-brand-purple',
  blue: 'bg-brand-blue',
  green: 'bg-brand-green'
};

function TrendIcon({ trend }: { trend: Metric['trend'] }) {
  if (trend === 'up') return <span className="text-brand-green">▲</span>;
  if (trend === 'down') return <span className="text-brand-green">▼</span>;
  return <span className="text-ink-soft">●</span>;
}

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
          <div key={m.label} className="card group relative overflow-hidden p-5">
            <span className={`absolute inset-x-0 top-0 h-[3px] ${ACCENT_BAR[m.accent]}`} />
            <span
              className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${ACCENT_GLOW[m.accent]} to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100`}
            />
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">
                {m.label}
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tightest text-ink">{m.value}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                <TrendIcon trend={m.trend} />
                <span>{m.delta}</span>
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-3">
        <div className="card p-6 xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2>Tendance présence (7 jours)</h2>
              <p className="mt-1 text-sm text-ink-muted">Moyenne hebdomadaire 91.4 % · Pic mercredi 95 %</p>
            </div>
            <span className="badge-success">
              <span className="dot-pulse" />
              Live analytics
            </span>
          </div>
          <div className="mt-6 grid h-56 grid-cols-7 items-end gap-3 rounded-2xl border border-line bg-surface-alt p-4">
            {TREND.map((v, i) => (
              <div key={i} className="group flex flex-col items-center gap-2">
                <span className="text-[10px] font-semibold text-ink-soft opacity-0 transition-opacity group-hover:opacity-100">
                  {v}%
                </span>
                <div
                  className="w-full rounded-lg bg-brand-gradient transition-all group-hover:scale-y-105 group-hover:shadow-brand"
                  style={{ height: `${v * 1.6}px` }}
                />
                <span className="text-xs font-medium text-ink-muted">J{i + 1}</span>
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

      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2>Activité récente</h2>
            <button className="btn-ghost text-xs">Voir tout</button>
          </div>
          <ul className="mt-4 grid gap-2">
            {ACTIVITY.map((a) => (
              <li
                key={a.time + a.label}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface-alt px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-soft"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${ACTIVITY_DOT[a.accent]}`} />
                <span className="font-mono text-xs text-ink-soft">{a.time}</span>
                <span className="flex-1 text-sm text-ink">{a.label}</span>
                <span className="text-ink-soft transition-transform group-hover:translate-x-1">→</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card relative overflow-hidden p-6">
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-purple/20 blur-2xl" />
          <span className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-brand-pink/15 blur-2xl" />
          <div className="relative">
            <span className="badge">Assistant IA</span>
            <h2 className="mt-3">3 suggestions disponibles</h2>
            <p className="mt-1 text-sm text-ink-muted">
              L’IA a analysé les données récentes et propose des actions à valider.
            </p>
            <ul className="mt-4 grid gap-2 text-sm">
              <li className="rounded-lg border border-line bg-surface-alt px-3 py-2 text-ink">
                ✦ Programmer un rattrapage maths pour 4 élèves à risque
              </li>
              <li className="rounded-lg border border-line bg-surface-alt px-3 py-2 text-ink">
                ✦ Relancer 7 familles avec impayés (modèle bilingue)
              </li>
              <li className="rounded-lg border border-line bg-surface-alt px-3 py-2 text-ink">
                ✦ Préparer le bulletin trimestriel de la 6ème B
              </li>
            </ul>
            <button className="btn-primary mt-4 w-full">Ouvrir l’assistant</button>
          </div>
        </div>
      </section>
    </>
  );
}
