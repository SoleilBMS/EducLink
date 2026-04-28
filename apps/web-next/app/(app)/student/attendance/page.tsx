import { Header } from '@/components/shell/Header';
import { AttendanceList } from '@/components/domain/AttendanceList';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import { apiGetSafe, type AttendanceRecord, type StudentProfile } from '@/lib/api';

export default async function StudentAttendancePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== 'student') {
    return (
      <>
        <Header
          schoolLabel={tenantLabel(user.tenantId)}
          title="Mes absences"
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

  const [profile, records] = await Promise.all([
    apiGetSafe<StudentProfile>('/api/v1/students/me'),
    apiGetSafe<AttendanceRecord[]>('/api/v1/attendance')
  ]);

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Mes absences"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      <section className="card p-6">
        <h2>Mon historique d’assiduité</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {profile?.classRoom?.name ? `Classe ${profile.classRoom.name}` : 'Toutes classes confondues'}
        </p>
        <div className="mt-5">
          <AttendanceList
            records={records ?? []}
            emptyText="Aucune absence ou retard enregistré. Continue comme ça !"
          />
        </div>
      </section>
    </>
  );
}
