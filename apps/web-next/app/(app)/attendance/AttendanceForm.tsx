'use client';

import { useState, useTransition } from 'react';
import type { AttendanceStatus } from '@/lib/api';
import { saveAttendance } from '@/app/actions/attendance';

type Student = { id: string; firstName: string; lastName: string; admissionNumber: string };

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; klass: string }[] = [
  { value: 'present', label: 'Présent', klass: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  { value: 'absent', label: 'Absent', klass: 'border-red-300 bg-red-50 text-red-800' },
  { value: 'late', label: 'Retard', klass: 'border-amber-300 bg-amber-50 text-amber-800' }
];

type Props = {
  classRoomId: string;
  date: string;
  students: Student[];
  existing: Record<string, AttendanceStatus>;
};

export function AttendanceForm({ classRoomId, date, students, existing }: Props) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() => {
    const init: Record<string, AttendanceStatus> = {};
    students.forEach((s) => {
      init[s.id] = existing[s.id] ?? 'present';
    });
    return init;
  });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function setAll(value: AttendanceStatus) {
    const next: Record<string, AttendanceStatus> = {};
    students.forEach((s) => (next[s.id] = value));
    setStatuses(next);
    setFeedback(null);
  }

  function setOne(studentId: string, value: AttendanceStatus) {
    setStatuses((prev) => ({ ...prev, [studentId]: value }));
    setFeedback(null);
  }

  function onSubmit(formData: FormData) {
    formData;
    const records = students.map((s) => ({ studentId: s.id, status: statuses[s.id] }));
    startTransition(async () => {
      const res = await saveAttendance({ classRoomId, date, records });
      if (res.ok) setFeedback({ type: 'ok', text: `${res.saved} fiche(s) enregistrée(s).` });
      else setFeedback({ type: 'err', text: res.error });
    });
  }

  const counts = students.reduce(
    (acc, s) => {
      acc[statuses[s.id]] = (acc[statuses[s.id]] || 0) + 1;
      return acc;
    },
    {} as Record<AttendanceStatus, number>
  );

  return (
    <form action={onSubmit} className="mt-5 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-alt px-4 py-3">
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAll('present')} className="btn-secondary">
            Tous présents
          </button>
          <button type="button" onClick={() => setAll('absent')} className="btn-secondary">
            Tous absents
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-surface-alt">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                Élève
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                Matricule
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                Statut
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-3 text-sm">
                  <span className="font-semibold text-ink">
                    {s.firstName} {s.lastName}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-ink-muted">{s.admissionNumber}</td>
                <td className="px-4 py-3">
                  <div className="inline-flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map((opt) => {
                      const active = statuses[s.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setOne(s.id, opt.value)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                            active
                              ? opt.klass + ' shadow-soft'
                              : 'border-line bg-white text-ink-muted hover:border-line-strong hover:text-ink'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {feedback && (
        <p
          className={`rounded-xl border px-4 py-2 text-sm font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {feedback.text}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? 'Enregistrement…' : `Enregistrer ${students.length} fiche(s)`}
        </button>
      </div>
    </form>
  );
}
