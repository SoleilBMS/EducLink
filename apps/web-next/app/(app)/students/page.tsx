import { Header } from '@/components/shell/Header';

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  classRoomId: string;
  dateOfBirth: string;
};

const FALLBACK_STUDENTS: Student[] = [
  { id: 'student-a1', firstName: 'Aya', lastName: 'Nadir', admissionNumber: 'A-001', classRoomId: 'class-a1', dateOfBirth: '2013-03-09' },
  { id: 'student-a3', firstName: 'Yanis', lastName: 'Nadir', admissionNumber: 'A-003', classRoomId: 'class-a1', dateOfBirth: '2013-08-14' },
  { id: 'student-a4', firstName: 'Mehdi', lastName: 'Saadi', admissionNumber: 'A-004', classRoomId: 'class-a2', dateOfBirth: '2013-01-22' },
  { id: 'student-a5', firstName: 'Lina', lastName: 'Cherif', admissionNumber: 'A-005', classRoomId: 'class-a3', dateOfBirth: '2012-11-04' }
];

async function fetchStudents(): Promise<{ items: Student[]; live: boolean }> {
  try {
    const res = await fetch('http://localhost:3000/api/v1/students', {
      headers: { 'x-tenant-id': 'school-a' },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items: Student[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    if (!items.length) throw new Error('empty');
    return { items, live: true };
  } catch {
    return { items: FALLBACK_STUDENTS, live: false };
  }
}

function formatAge(dob: string): string {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '—';
  const ms = Date.now() - birth.getTime();
  return `${Math.floor(ms / (365.25 * 24 * 3600 * 1000))} ans`;
}

export default async function StudentsPage() {
  const { items, live } = await fetchStudents();

  return (
    <>
      <Header
        schoolLabel="École Pilote · School A"
        title="Élèves"
        userName="Karim Bouaziz"
        userEmail="admin@school-a.test"
        roleLabel="School Admin"
      />

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2>Liste des élèves</h2>
            <span className={`badge ${live ? '' : 'opacity-70'}`}>
              {live ? `${items.length} live API` : `${items.length} mock data`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Rechercher un élève…"
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-soft focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
            />
            <button className="btn-primary">+ Nouvel élève</button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
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
                  Classe
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                  Âge
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-ink-muted">
                  Statut
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-line transition-colors hover:bg-surface-alt"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-blue-dark">
                        {s.firstName[0]}
                        {s.lastName[0]}
                      </div>
                      <div>
                        <p className="m-0 text-sm font-semibold text-ink">
                          {s.firstName} {s.lastName}
                        </p>
                        <p className="m-0 text-xs text-ink-muted">né(e) le {s.dateOfBirth}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-ink-muted">
                    {s.admissionNumber}
                  </td>
                  <td className="px-4 py-3 text-sm">{s.classRoomId}</td>
                  <td className="px-4 py-3 text-sm">{formatAge(s.dateOfBirth)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Actif
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <a href={`/students/${s.id}`} className="font-medium text-brand-blue">
                      Voir →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!live && (
          <p className="mt-3 text-xs italic text-ink-muted">
            ⚠ Backend non joignable sur <code>localhost:3000</code>. Données de démonstration
            affichées.
          </p>
        )}
      </section>
    </>
  );
}
