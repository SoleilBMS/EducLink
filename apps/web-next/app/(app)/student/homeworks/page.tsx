import { Header } from '@/components/shell/Header';
import { HomeworksList } from '@/components/domain/HomeworksList';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import { apiGetSafe, type Homework, type StudentProfile, type Subject } from '@/lib/api';

export default async function StudentHomeworksPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== 'student') {
    return (
      <>
        <Header
          schoolLabel={tenantLabel(user.tenantId)}
          title="Mes devoirs"
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

  const [profile, homeworks, subjects] = await Promise.all([
    apiGetSafe<StudentProfile>('/api/v1/students/me'),
    apiGetSafe<Homework[]>('/api/v1/homeworks'),
    apiGetSafe<Subject[]>('/api/v1/subjects')
  ]);

  const list = (homeworks ?? []).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = list.filter((h) => h.dueDate >= today);
  const past = list.filter((h) => h.dueDate < today);

  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? id;
  const classRoomName = () => profile?.classRoom?.name ?? profile?.classRoomId ?? '';

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Mes devoirs"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      <section className="card mb-5 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-lg font-bold text-brand-blue-dark">
            {profile?.firstName?.[0]}
            {profile?.lastName?.[0]}
          </div>
          <div>
            <p className="m-0 text-lg font-bold">
              {profile?.firstName} {profile?.lastName}
            </p>
            <p className="m-0 text-sm text-ink-muted">
              {profile?.classRoom?.name ?? '—'} · {profile?.admissionNumber}
            </p>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2>À faire</h2>
          <span className="badge">{upcoming.length}</span>
        </div>
        <div className="mt-4">
          <HomeworksList
            homeworks={upcoming}
            subjectName={subjectName}
            classRoomName={classRoomName}
            emptyText="Aucun devoir à venir. 🎉"
          />
        </div>
      </section>

      {past.length > 0 && (
        <section className="card mt-5 p-6">
          <div className="flex items-center justify-between">
            <h2>Devoirs passés</h2>
            <span className="badge">{past.length}</span>
          </div>
          <div className="mt-4 opacity-80">
            <HomeworksList
              homeworks={past.slice().reverse()}
              subjectName={subjectName}
              classRoomName={classRoomName}
              emptyText=""
            />
          </div>
        </section>
      )}
    </>
  );
}
