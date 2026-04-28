import type { Grade } from '@/lib/api';

type Props = {
  grades: Grade[];
  subjectName?: (id: string) => string;
  /** When provided, shows the student name column (parent view). */
  studentName?: (studentId: string) => string;
  emptyText?: string;
};

function scoreClass(score: number, max = 20): string {
  const ratio = score / max;
  if (ratio >= 0.8) return 'bg-emerald-100 text-emerald-800';
  if (ratio >= 0.5) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export function GradesList({ grades, subjectName, studentName, emptyText = 'Aucune note pour l’instant.' }: Props) {
  if (grades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-alt p-6 text-center text-sm italic text-ink-muted">
        {emptyText}
      </div>
    );
  }

  const sorted = [...grades].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="bg-surface-alt">
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
              Évaluation
            </th>
            {studentName && (
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                Élève
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
              Matière
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
              Date
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-widest text-ink-muted">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => {
            const max = g.assessment?.maxScore ?? 20;
            return (
              <tr key={g.id} className="border-t border-line transition-colors hover:bg-surface-alt">
                <td className="px-4 py-3 text-sm">
                  <p className="m-0 font-semibold text-ink">
                    {g.assessment?.title ?? 'Évaluation'}
                  </p>
                  {g.remark && <p className="m-0 mt-0.5 text-xs text-ink-muted">{g.remark}</p>}
                </td>
                {studentName && (
                  <td className="px-4 py-3 text-sm font-medium text-ink">
                    {studentName(g.studentId)}
                  </td>
                )}
                <td className="px-4 py-3 text-sm">
                  {subjectName ? subjectName(g.subjectId) : g.subjectId}
                </td>
                <td className="px-4 py-3 text-sm text-ink-muted">{g.date}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${scoreClass(g.score, max)}`}
                  >
                    {g.score} / {max}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
