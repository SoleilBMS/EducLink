import { Header } from '@/components/shell/Header';
import { AttendanceList } from '@/components/domain/AttendanceList';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import { apiGetSafe, type AttendanceRecord, type ParentProfile } from '@/lib/api';

export default async function ParentAttendancePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== 'parent') {
    return (
      <>
        <Header
          schoolLabel={tenantLabel(user.tenantId)}
          title="Absences"
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

  const [profile, records] = await Promise.all([
    apiGetSafe<ParentProfile>('/api/v1/parents/me'),
    apiGetSafe<AttendanceRecord[]>('/api/v1/attendance')
  ]);

  const children = profile?.children ?? [];
  const studentName = (id: string) => {
    const child = children.find((c) => c.id === id);
    return child ? `${child.firstName} ${child.lastName}` : id;
  };

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Absences des enfants"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      <section className="card p-6">
        <h2>Historique absences & retards</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Toutes les absences et retards saisis par les enseignants pour vos enfants.
        </p>
        <div className="mt-5">
          <AttendanceList
            records={records ?? []}
            studentName={studentName}
            emptyText="Aucune absence ou retard enregistré pour vos enfants."
          />
        </div>
      </section>
    </>
  );
}
