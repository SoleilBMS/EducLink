import { Header } from '@/components/shell/Header';
import { GradesList } from '@/components/domain/GradesList';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import { apiGetSafe, type Grade, type ParentProfile, type Subject } from '@/lib/api';

export default async function ParentGradesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== 'parent') {
    return (
      <>
        <Header
          schoolLabel={tenantLabel(user.tenantId)}
          title="Notes"
          userName={user.displayName}
          userEmail={user.email}
          roleLabel={user.roleLabel}
        />
        <section className="card p-6">
          <p className="m-0 text-ink-muted">Page réservée aux parents.</p>
        </section>
      </>
    );
  }

  const [profile, grades, subjects] = await Promise.all([
    apiGetSafe<ParentProfile>('/api/v1/parents/me'),
    apiGetSafe<Grade[]>('/api/v1/grades'),
    apiGetSafe<Subject[]>('/api/v1/subjects')
  ]);

  const children = profile?.children ?? [];
  const studentName = (id: string) => {
    const c = children.find((c) => c.id === id);
    return c ? `${c.firstName} ${c.lastName}` : id;
  };
  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? id;

  // Average per child
  const byChild = new Map<string, Grade[]>();
  for (const g of grades ?? []) {
    if (!byChild.has(g.studentId)) byChild.set(g.studentId, []);
    byChild.get(g.studentId)!.push(g);
  }

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Notes des enfants"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children.map((c) => {
          const childGrades = byChild.get(c.id) ?? [];
          const avg =
            childGrades.length > 0
              ? (childGrades.reduce((acc, g) => acc + g.score, 0) / childGrades.length).toFixed(1)
              : '—';
          return (
            <div
              key={c.id}
              className="relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
            >
              <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient opacity-90" />
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                {c.classRoomName ?? c.classRoomId}
              </p>
              <p className="mt-1 text-lg font-bold tracking-tight">
                {c.firstName} {c.lastName}
              </p>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tightest text-brand-blue-dark">
                  {avg}
                </span>
                <span className="text-sm text-ink-muted">moyenne ({childGrades.length})</span>
              </p>
            </div>
          );
        })}
      </section>

      <section className="card mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2>Détail des notes</h2>
          <span className="badge">{(grades ?? []).length}</span>
        </div>
        <div className="mt-4">
          <GradesList
            grades={grades ?? []}
            subjectName={subjectName}
            studentName={studentName}
            emptyText="Aucune note saisie pour vos enfants pour l’instant."
          />
        </div>
      </section>
    </>
  );
}
