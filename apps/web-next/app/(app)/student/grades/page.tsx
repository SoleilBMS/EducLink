import { Header } from '@/components/shell/Header';
import { GradesList } from '@/components/domain/GradesList';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import { apiGetSafe, type Grade, type StudentProfile, type Subject } from '@/lib/api';

export default async function StudentGradesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== 'student') {
    return (
      <>
        <Header
          schoolLabel={tenantLabel(user.tenantId)}
          title="Mes notes"
          userName={user.displayName}
          userEmail={user.email}
          roleLabel={user.roleLabel}
        />
        <section className="card p-6">
          <p className="m-0 text-ink-muted">Page réservée aux élèves.</p>
        </section>
      </>
    );
  }

  const [profile, grades, subjects] = await Promise.all([
    apiGetSafe<StudentProfile>('/api/v1/students/me'),
    apiGetSafe<Grade[]>('/api/v1/grades'),
    apiGetSafe<Subject[]>('/api/v1/subjects')
  ]);

  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? id;

  const list = grades ?? [];
  const avg = list.length > 0 ? (list.reduce((acc, g) => acc + g.score, 0) / list.length).toFixed(1) : '—';

  // Average per subject
  const bySubject = new Map<string, number[]>();
  for (const g of list) {
    if (!bySubject.has(g.subjectId)) bySubject.set(g.subjectId, []);
    bySubject.get(g.subjectId)!.push(g.score);
  }
  const subjectAvgs = [...bySubject.entries()].map(([id, scores]) => ({
    id,
    name: subjectName(id),
    avg: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
    count: scores.length
  }));

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Mes notes"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-soft md:col-span-1">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient" />
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Moyenne générale
          </p>
          <p className="mt-2 text-4xl font-extrabold tracking-tightest text-brand-blue-dark">
            {avg}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {list.length} note{list.length > 1 ? 's' : ''} · {profile?.classRoom?.name ?? '—'}
          </p>
        </div>
        <div className="md:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {subjectAvgs.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-line bg-white p-4 shadow-soft"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
                  {s.name}
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">{s.avg}</span>
                  <span className="text-xs text-ink-muted">/ 20 ({s.count})</span>
                </p>
              </div>
            ))}
            {subjectAvgs.length === 0 && (
              <div className="rounded-xl border border-dashed border-line bg-surface-alt p-5 text-center text-sm italic text-ink-muted sm:col-span-2">
                Aucune note saisie pour l’instant.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2>Détail des notes</h2>
          <span className="badge">{list.length}</span>
        </div>
        <div className="mt-4">
          <GradesList grades={list} subjectName={subjectName} />
        </div>
      </section>
    </>
  );
}
