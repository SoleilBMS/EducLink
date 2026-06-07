import { Header } from '@/components/shell/Header';
import { HomeworksList } from '@/components/domain/HomeworksList';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import {
  apiGetSafe,
  type Homework,
  type ParentProfile,
  type Subject,
  type ClassRoom
} from '@/lib/api';

export default async function ParentHomeworksPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== 'parent') {
    return (
      <>
        <Header
          schoolLabel={tenantLabel(user.tenantId)}
          title="Devoirs"
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

  const [profile, homeworks, classRooms, subjects] = await Promise.all([
    apiGetSafe<ParentProfile>('/api/v1/parents/me'),
    apiGetSafe<Homework[]>('/api/v1/homeworks'),
    apiGetSafe<ClassRoom[]>('/api/v1/class-rooms'),
    apiGetSafe<Subject[]>('/api/v1/subjects')
  ]);

  const children = profile?.children ?? [];
  const list = (homeworks ?? []).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const classRoomName = (id: string) =>
    classRooms?.find((c) => c.id === id)?.name ?? children.find((c) => c.classRoomId === id)?.classRoomName ?? id;
  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? id;
  const studentNameFor = (h: Homework) => {
    const child = children.find((c) => c.classRoomId === h.classRoomId);
    return child ? `${child.firstName} ${child.lastName}` : null;
  };

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Devoirs des enfants"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-line bg-white p-5 shadow-soft transition-all hover:shadow-card"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              {c.classRoomName ?? c.classRoomId}
            </p>
            <p className="mt-1 text-lg font-bold tracking-tight">
              {c.firstName} {c.lastName}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{c.relationship ?? 'Enfant'}</p>
          </div>
        ))}
      </section>

      <section className="card mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2>Devoirs à venir et passés</h2>
          <span className="badge">{list.length}</span>
        </div>
        <div className="mt-4">
          <HomeworksList
            homeworks={list}
            classRoomName={classRoomName}
            subjectName={subjectName}
            studentNameFor={studentNameFor}
            emptyText="Aucun devoir publié pour vos enfants pour l’instant."
          />
        </div>
      </section>
    </>
  );
}
