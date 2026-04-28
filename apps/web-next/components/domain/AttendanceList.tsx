import type { AttendanceRecord, AttendanceStatus } from '@/lib/api';

const STATUS_META: Record<AttendanceStatus, { label: string; klass: string }> = {
  present: { label: 'Présent', klass: 'bg-emerald-100 text-emerald-800' },
  absent: { label: 'Absent', klass: 'bg-red-100 text-red-800' },
  late: { label: 'Retard', klass: 'bg-amber-100 text-amber-800' }
};

type Props = {
  records: AttendanceRecord[];
  /** When provided, shows the student column (parent view). */
  studentName?: (studentId: string) => string;
  emptyText?: string;
};

export function AttendanceList({
  records,
  studentName,
  emptyText = 'Aucune absence ou retard enregistré.'
}: Props) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-alt p-6 text-center text-sm italic text-ink-muted">
        {emptyText}
      </div>
    );
  }

  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const counts = sorted.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    {} as Record<AttendanceStatus, number>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
          Présents · {counts.present || 0}
        </span>
        <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-800">
          Absents · {counts.absent || 0}
        </span>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
          Retards · {counts.late || 0}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-surface-alt">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                Date
              </th>
              {studentName && (
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                  Élève
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                Statut
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <tr key={r.id} className="border-t border-line transition-colors hover:bg-surface-alt">
                  <td className="px-4 py-3 text-sm font-mono">{r.date}</td>
                  {studentName && (
                    <td className="px-4 py-3 text-sm font-medium text-ink">
                      {studentName(r.studentId)}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${meta.klass}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
