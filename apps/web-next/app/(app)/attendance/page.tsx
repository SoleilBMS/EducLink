import { redirect } from 'next/navigation';
import { Header } from '@/components/shell/Header';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import { apiGetSafe, type AttendanceRecord, type Student, type TeacherProfile } from '@/lib/api';
import { AttendanceForm } from './AttendanceForm';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendancePage({
  searchParams
}: {
  searchParams: { classRoomId?: string; date?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role !== 'teacher') {
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
          <p className="m-0 text-ink-muted">
            Cette page est réservée aux enseignants pour la saisie quotidienne.
          </p>
        </section>
      </>
    );
  }

  const profile = await apiGetSafe<TeacherProfile>('/api/v1/teachers/me');
  const classRooms = profile?.classRooms ?? [];

  const selectedClassRoomId = searchParams.classRoomId || classRooms[0]?.id || '';
  const selectedDate = searchParams.date || todayIso();

  const isOwnedClass = classRooms.some((c) => c.id === selectedClassRoomId);

  const [students, attendance] = isOwnedClass
    ? await Promise.all([
        apiGetSafe<Student[]>(`/api/v1/students?classRoomId=${encodeURIComponent(selectedClassRoomId)}`),
        apiGetSafe<AttendanceRecord[]>(
          `/api/v1/attendance?classRoomId=${encodeURIComponent(selectedClassRoomId)}&date=${encodeURIComponent(selectedDate)}`
        )
      ])
    : [null, null];

  const existingMap = new Map<string, AttendanceRecord>(
    (attendance ?? []).map((r) => [r.studentId, r])
  );

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Saisie des absences"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      <section className="card p-6">
        <form className="flex flex-wrap items-end gap-3" method="GET" action="/attendance">
          <label className="grid gap-1.5 text-sm font-medium">
            Classe
            <select
              name="classRoomId"
              defaultValue={selectedClassRoomId}
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-soft focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
            >
              {classRooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Date
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-soft focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
            />
          </label>
          <button type="submit" className="btn-secondary">
            Charger
          </button>
        </form>

        {classRooms.length === 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Aucune classe rattachée à votre profil enseignant. Contactez l’administration.
          </p>
        )}

        {classRooms.length > 0 && (!students || students.length === 0) && (
          <p className="mt-4 text-sm italic text-ink-muted">Aucun élève pour cette classe.</p>
        )}

        {students && students.length > 0 && (
          <AttendanceForm
            classRoomId={selectedClassRoomId}
            date={selectedDate}
            students={students}
            existing={Object.fromEntries(
              [...existingMap.entries()].map(([sid, r]) => [sid, r.status])
            )}
          />
        )}
      </section>
    </>
  );
}
