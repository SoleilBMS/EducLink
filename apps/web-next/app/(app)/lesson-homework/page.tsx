import { Header } from '@/components/shell/Header';
import { getCurrentUser, tenantLabel } from '@/lib/auth';
import {
  apiGetSafe,
  type Homework,
  type LessonLog,
  type TeacherProfile
} from '@/lib/api';
import { LessonLogForm, HomeworkForm } from './LessonHomeworkForms';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t.toISOString().slice(0, 10);
}

export default async function LessonHomeworkPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role !== 'teacher') {
    return (
      <>
        <Header
          schoolLabel={tenantLabel(user.tenantId)}
          title="Cahier de texte & devoirs"
          userName={user.displayName}
          userEmail={user.email}
          roleLabel={user.roleLabel}
        />
        <section className="card p-6">
          <p className="m-0 text-ink-muted">
            Cette page est réservée aux enseignants pour la saisie de leurs cours et devoirs.
          </p>
        </section>
      </>
    );
  }

  const [profile, lessons, homeworks] = await Promise.all([
    apiGetSafe<TeacherProfile>('/api/v1/teachers/me'),
    apiGetSafe<LessonLog[]>('/api/v1/lesson-logs'),
    apiGetSafe<Homework[]>('/api/v1/homeworks')
  ]);

  const classRooms = profile?.classRooms ?? [];
  const subjects = profile?.subjects ?? [];
  const lessonsList = (lessons ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const homeworksList = (homeworks ?? [])
    .slice()
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 8);

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;
  const classRoomName = (id: string) => classRooms.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <Header
        schoolLabel={tenantLabel(user.tenantId)}
        title="Cahier de texte & devoirs"
        userName={user.displayName}
        userEmail={user.email}
        roleLabel={user.roleLabel}
      />

      {classRooms.length === 0 && (
        <section className="card mb-5 p-6">
          <p className="m-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Aucune classe ni matière rattachée à votre profil enseignant. Contactez l’administration.
          </p>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="card p-6">
          <h2>Nouvelle séance</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Consigne le cours du jour dans le cahier de texte de la classe.
          </p>
          <LessonLogForm
            classRooms={classRooms}
            subjects={subjects}
            defaultDate={todayIso()}
          />
        </article>

        <article className="card p-6">
          <h2>Nouveau devoir</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Visible côté élève et parent dès l’enregistrement.
          </p>
          <HomeworkForm
            classRooms={classRooms}
            subjects={subjects}
            defaultDueDate={tomorrowIso()}
          />
        </article>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <article className="card p-6">
          <div className="flex items-center justify-between">
            <h2>Dernières séances</h2>
            <span className="badge">{lessonsList.length}</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {lessonsList.length === 0 && (
              <li className="rounded-xl border border-dashed border-line bg-surface-alt p-4 text-center text-sm italic text-ink-muted">
                Aucune séance enregistrée pour l’instant.
              </li>
            )}
            {lessonsList.map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-line bg-surface-alt p-4 transition-colors hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
                    {classRoomName(l.classRoomId)} · {subjectName(l.subjectId)}
                  </span>
                  <span className="text-xs text-ink-muted">{l.date}</span>
                </div>
                <p className="mt-2 text-sm text-ink">{l.content}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="card p-6">
          <div className="flex items-center justify-between">
            <h2>Derniers devoirs</h2>
            <span className="badge">{homeworksList.length}</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {homeworksList.length === 0 && (
              <li className="rounded-xl border border-dashed border-line bg-surface-alt p-4 text-center text-sm italic text-ink-muted">
                Aucun devoir publié pour l’instant.
              </li>
            )}
            {homeworksList.map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-line bg-surface-alt p-4 transition-colors hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-purple">
                    {classRoomName(h.classRoomId)} · {subjectName(h.subjectId)}
                  </span>
                  <span className="rounded-full bg-brand-purple/10 px-2 py-0.5 text-xs font-semibold text-brand-purple">
                    À rendre le {h.dueDate}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{h.title}</p>
                {h.description && <p className="mt-1 text-sm text-ink-muted">{h.description}</p>}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}
