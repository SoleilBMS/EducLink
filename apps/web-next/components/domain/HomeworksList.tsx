import type { Homework } from '@/lib/api';

type Props = {
  homeworks: Homework[];
  /** Optional resolver for class room name. */
  classRoomName?: (id: string) => string;
  /** Optional resolver for subject name. */
  subjectName?: (id: string) => string;
  /** When provided, prepends a child name on each row (parent view). */
  studentNameFor?: (homework: Homework) => string | null;
  emptyText?: string;
};

function isOverdue(dueDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export function HomeworksList({
  homeworks,
  classRoomName,
  subjectName,
  studentNameFor,
  emptyText = 'Aucun devoir publié pour l’instant.'
}: Props) {
  if (homeworks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-alt p-6 text-center text-sm italic text-ink-muted">
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="grid gap-3">
      {homeworks.map((h) => {
        const overdue = isOverdue(h.dueDate);
        const childLabel = studentNameFor?.(h) ?? null;
        return (
          <li
            key={h.id}
            className="rounded-xl border border-line bg-white p-4 shadow-soft transition-shadow hover:shadow-card"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-purple">
                {classRoomName ? classRoomName(h.classRoomId) : h.classRoomId}
                {' · '}
                {subjectName ? subjectName(h.subjectId) : h.subjectId}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  overdue
                    ? 'bg-red-100 text-red-800'
                    : 'bg-brand-purple/10 text-brand-purple'
                }`}
              >
                {overdue ? `Retard · ${h.dueDate}` : `À rendre le ${h.dueDate}`}
              </span>
            </div>
            {childLabel && (
              <p className="mt-1 text-xs font-medium text-brand-blue">Pour {childLabel}</p>
            )}
            <p className="mt-2 text-sm font-semibold text-ink">{h.title}</p>
            {h.description && (
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{h.description}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
