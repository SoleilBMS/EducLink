'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { ClassRoom, Subject } from '@/lib/api';
import {
  createHomework,
  createLessonLog,
  type ActionResult
} from '@/app/actions/lesson-homework';

const inputCls =
  'rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink shadow-soft transition-all focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none';

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
        result.ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
      {pending ? 'Enregistrement…' : label}
    </button>
  );
}

type FormProps = { classRooms: ClassRoom[]; subjects: Subject[] };

export function LessonLogForm({
  classRooms,
  subjects,
  defaultDate
}: FormProps & { defaultDate: string }) {
  const [state, action] = useFormState<ActionResult | null, FormData>(createLessonLog, null);
  return (
    <form action={action} className="mt-4 grid gap-3">
      <Feedback result={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Classe
          <select name="classRoomId" required className={inputCls}>
            {classRooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Matière
          <select name="subjectId" required className={inputCls}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        Date
        <input type="date" name="date" required defaultValue={defaultDate} className={inputCls} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Contenu
        <textarea
          name="content"
          required
          rows={4}
          placeholder="Notions abordées, exercices faits en classe, supports…"
          className={`${inputCls} min-h-[100px] resize-y`}
        />
      </label>
      <div className="flex justify-end">
        <SubmitButton label="Enregistrer la séance" />
      </div>
    </form>
  );
}

export function HomeworkForm({
  classRooms,
  subjects,
  defaultDueDate
}: FormProps & { defaultDueDate: string }) {
  const [state, action] = useFormState<ActionResult | null, FormData>(createHomework, null);
  return (
    <form action={action} className="mt-4 grid gap-3">
      <Feedback result={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Classe
          <select name="classRoomId" required className={inputCls}>
            {classRooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Matière
          <select name="subjectId" required className={inputCls}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Titre
          <input
            type="text"
            name="title"
            required
            placeholder="Ex. Exercices p.42"
            className={inputCls}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          À rendre le
          <input
            type="date"
            name="dueDate"
            required
            defaultValue={defaultDueDate}
            className={inputCls}
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        Description
        <textarea
          name="description"
          rows={3}
          placeholder="Consignes, ressources, critères…"
          className={`${inputCls} min-h-[80px] resize-y`}
        />
      </label>
      <div className="flex justify-end">
        <SubmitButton label="Publier le devoir" />
      </div>
    </form>
  );
}
