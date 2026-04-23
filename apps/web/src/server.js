const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createLogger } = require('./observability/logger');

const { authorizeApiRequest } = require('../../../packages/auth/src/guards/api-guard');
const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { ROLES } = require('../../../packages/auth/src/roles/roles');
const { DEFAULT_SESSION_TTL_MS, SessionStore } = require('../../../packages/auth/src/session/session-store');
const { CoreSchoolStore } = require('./modules/core-school');
const { StudentStore } = require('./modules/student');
const { ParentStore } = require('./modules/parent');
const { TeacherStore } = require('./modules/teacher');
const { AttendanceStore, ATTENDANCE_STATUSES, requireDateString } = require('./modules/attendance');
const { LessonHomeworkStore } = require('./modules/lesson-homework');
const { GradingStore } = require('./modules/grading');
const { MessagingStore } = require('./modules/messaging');
const { AuditLogStore, createAuditEventWriter } = require('./modules/audit');
const { FinanceStore } = require('./modules/finance');
const { AiService, PromptRegistry, TenantAiFeatureFlagStore, AiProviderRegistry, AiLogStore, DevEchoAiProvider } = require('./modules/ai');
const { createStudentRoutes } = require('./routes/student-routes');
const { createParentRoutes } = require('./routes/parent-routes');
const { createTeacherRoutes } = require('./routes/teacher-routes');
const { createAttendanceRoutes } = require('./routes/attendance-routes');
const { parseCookies, parseExtendedForm, parseForm, parseJsonBody: parseJsonBodyRaw, readBody, sendApiError, sendApiSuccess, sendJson } = require('./routes/shared-http');
const { CoreSchoolService } = require('./services/core-school-service');
const { StudentService } = require('./services/student-service');
const { ParentService } = require('./services/parent-service');
const { TeacherService } = require('./services/teacher-service');
const { AttendanceService } = require('./services/attendance-service');
const { getPool, closePool, isPersistenceEnabled } = require('../../../packages/database/src/client');
const { loadRuntimeEnv } = require('../../../packages/core/src/runtime-env');
const { PostgresCoreSchoolRepository } = require('./modules/persistence/postgres-core-school-repository');
const { PostgresStudentRepository } = require('./modules/persistence/postgres-student-repository');
const { buildValidationError, buildForbiddenError } = require('./modules/error-utils');

const users = [
  { id: 'super-admin', email: 'superadmin@platform.test', password: 'password123', role: ROLES.SUPER_ADMIN, tenantId: null },
  { id: 'admin-a', email: 'admin@school-a.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-a' },
  { id: 'admin-b', email: 'admin@school-b.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-b' },
  { id: 'director-a', email: 'director@school-a.test', password: 'password123', role: ROLES.DIRECTOR, tenantId: 'school-a' },
  { id: 'teacher-a1', email: 'teacher@school-a.test', password: 'password123', role: ROLES.TEACHER, tenantId: 'school-a' },
  { id: 'parent-a1', email: 'parent@school-a.test', password: 'password123', role: ROLES.PARENT, tenantId: 'school-a' },
  { id: 'student-a1', email: 'student@school-a.test', password: 'password123', role: ROLES.STUDENT, tenantId: 'school-a' },
  { id: 'accountant-a', email: 'accountant@school-a.test', password: 'password123', role: ROLES.ACCOUNTANT, tenantId: 'school-a' }
];

function createSeedData() {
  return {
    classRooms: [
      { id: 'class-a1', tenant_id: 'school-a', name: 'A1', gradeLevelId: 'grade-a-1', capacity: 32 },
      { id: 'class-a2', tenant_id: 'school-a', name: 'A2', gradeLevelId: 'grade-a-1', capacity: 30 },
      { id: 'class-b1', tenant_id: 'school-b', name: 'B1', gradeLevelId: 'grade-b-1', capacity: 30 }
    ],
    subjects: [
      { id: 'subject-a-math', tenant_id: 'school-a', name: 'Mathématiques', code: 'MATH' },
      { id: 'subject-a-fr', tenant_id: 'school-a', name: 'Français', code: 'FR' },
      { id: 'subject-b-math', tenant_id: 'school-b', name: 'Mathématiques', code: 'MATH' }
    ],
    students: [
      {
        id: 'student-a1',
        tenant_id: 'school-a',
        firstName: 'Aya',
        lastName: 'Nadir',
        admissionNumber: 'A-001',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-03-09',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'student-b1',
        tenant_id: 'school-b',
        firstName: 'Bilal',
        lastName: 'Haddad',
        admissionNumber: 'B-001',
        classRoomId: 'class-b1',
        dateOfBirth: '2012-12-01',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'student-a2',
        tenant_id: 'school-a',
        firstName: 'Salim',
        lastName: 'Brahim',
        admissionNumber: 'A-002',
        classRoomId: 'class-a2',
        dateOfBirth: '2014-10-22',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    parents: [
      {
        id: 'parent-a1',
        tenant_id: 'school-a',
        firstName: 'Meryem',
        lastName: 'Nadir',
        phone: '+1 555-0134',
        email: 'parent@school-a.test',
        address: '12 Avenue Centrale',
        notes: '',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    studentParentLinks: [
      {
        id: 'splink-a1',
        tenant_id: 'school-a',
        parentId: 'parent-a1',
        studentId: 'student-a1',
        relationship: 'guardian',
        isPrimaryContact: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'splink-a2',
        tenant_id: 'school-a',
        parentId: 'parent-a1',
        studentId: 'student-a2',
        relationship: 'mother',
        isPrimaryContact: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    teachers: [
      {
        id: 'teacher-a1',
        tenant_id: 'school-a',
        firstName: 'Samira',
        lastName: 'Alami',
        email: 'teacher@school-a.test',
        phone: '+1 555-0110',
        notes: 'Prof principale',
        classRoomIds: ['class-a1'],
        subjectIds: ['subject-a-math'],
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    attendanceRecords: [],
    lessonLogs: [],
    homeworks: [],
    assessments: [],
    gradeEntries: [],
    announcements: [],
    messageThreads: [],
    messages: [],
    auditLogs: [],
    feePlans: [],
    invoices: [],
    payments: []
  };
}

function parseJsonBody(request) {
  return parseJsonBodyRaw(request, buildValidationError);
}

function canManageStudents(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canViewStudents(session) {
  return session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.DIRECTOR;
}

function canManageParents(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canManageTeachers(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canTakeAttendance(session) {
  return session.role === ROLES.TEACHER;
}

function canViewAttendanceAdmin(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canManageLessonHomework(session) {
  return session.role === ROLES.TEACHER;
}

function canAccessInbox(session) {
  return [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT].includes(session.role);
}

function canPublishAnnouncements(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canManageFinance(session) {
  return session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.ACCOUNTANT;
}

function canViewParentFinance(session) {
  return session.role === ROLES.PARENT;
}

function canCreateThreads(session) {
  return session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.TEACHER;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}


function buildSessionCookie(sessionId) {
  return [
    `sessionId=${sessionId}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DEFAULT_SESSION_TTL_MS / 1000)}`
  ].join('; ');
}

function clearSessionCookie() {
  return 'sessionId=; HttpOnly; Max-Age=0; Path=/; SameSite=Lax';
}

function renderLoginPage(errorMessage = '') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>EducLink - Login</title></head><body>
    <h1>Connexion EducLink</h1>
    ${errorMessage ? `<p style="color:red">${errorMessage}</p>` : ''}
    <form method="POST" action="/login">
      <label>Email <input type="email" name="email" required /></label><br/>
      <label>Mot de passe <input type="password" name="password" required /></label><br/>
      <button type="submit">Se connecter</button>
    </form>
  </body></html>`;
}

function getDashboardPathForRole(role) {
  const roleToPath = {
    [ROLES.SCHOOL_ADMIN]: '/dashboard/admin',
    [ROLES.DIRECTOR]: '/dashboard/director',
    [ROLES.TEACHER]: '/dashboard/teacher',
    [ROLES.PARENT]: '/dashboard/parent',
    [ROLES.STUDENT]: '/dashboard/student',
    [ROLES.ACCOUNTANT]: '/dashboard/accountant'
  };

  return roleToPath[role] ?? '/dashboard';
}

function renderDashboardLayout(title, session, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head><body>
    <h1>${title}</h1>
    <p>role: ${session.role}</p>
    <p>tenantId: ${session.tenantId}</p>
    ${body}
    <form method="POST" action="/logout"><button type="submit">Logout</button></form>
  </body></html>`;
}

function renderAdminDashboard(session, metrics) {
  return renderDashboardLayout(
    'Dashboard Admin',
    session,
    `<h2>Synthèse établissement</h2>
    <ul>
      <li>Classes actives: ${metrics.classRoomsCount}</li>
      <li>Élèves actifs: ${metrics.studentsCount}</li>
      <li>Responsables actifs: ${metrics.parentsCount}</li>
      <li>Enseignants actifs: ${metrics.teachersCount}</li>
    </ul>
    <h2>Raccourcis</h2>
    <p><a href="/admin/students">Gérer les élèves</a></p>
    <p><a href="/admin/parents">Gérer les responsables</a></p>
    <p><a href="/admin/teachers">Gérer les enseignants</a></p>
    <p><a href="/admin/finance">Suivi finance</a></p>
    <p><a href="/admin/attendance">Consulter les présences</a></p>
    <p><a href="/admin/announcements">Publier une annonce</a></p>
    <p><a href="/inbox">Ouvrir l'inbox</a></p>`
  );
}

function renderDirectorDashboard(session, metrics) {
  return renderDashboardLayout(
    'Dashboard Director',
    session,
    `<h2>Pilotage synthétique</h2>
    <ul>
      <li>Effectif élèves: ${metrics.studentsCount}</li>
      <li>Classes ouvertes: ${metrics.classRoomsCount}</li>
      <li>Enseignants actifs: ${metrics.teachersCount}</li>
    </ul>
    <p><a href="/admin/students">Voir les élèves</a></p>
    <p>Suivi attendance/grading: disponible prochainement.</p>`
  );
}

function renderTeacherDashboard(session, teacher, classRooms, subjects) {
  const classNames = classRooms.map((classRoom) => classRoom.name).join(', ') || 'Aucune classe assignée';
  const subjectNames = subjects.map((subject) => subject.name).join(', ') || 'Aucune matière assignée';

  return renderDashboardLayout(
    'Dashboard Teacher',
    session,
    `<h2>Vue enseignant</h2>
    <p>Classes assignées: ${classNames}</p>
    <p>Matières assignées: ${subjectNames}</p>
    <h2>Raccourcis métier</h2>
    <p><a href="/admin/students">Mes classes</a></p>
    <p><a href="/teacher/attendance">Faire l'appel</a></p>
    <p><a href="/teacher/lesson-homework">Cahier de texte & devoirs</a></p>
    <p><a href="/teacher/grades">Évaluations & notes</a></p>
    <p><a href="/teacher/report-comments">Appréciations IA (brouillon)</a></p>
    <p><a href="/inbox">Ouvrir l'inbox</a></p>
    <p>${teacher ? `Profil: ${teacher.firstName} ${teacher.lastName}` : 'Profil enseignant en cours de liaison.'}</p>`
  );
}

function buildDraftCommentInput({ student, classRoom, grades }) {
  const gradeLines = grades
    .slice(0, 8)
    .map((entry) => {
      const subjectId = entry.assessment?.subjectId ?? entry.subjectId ?? 'matière';
      const title = entry.assessment?.title ?? 'évaluation';
      const remark = entry.remark ? ` remarque: ${entry.remark}` : '';
      return `- ${subjectId} / ${title}: ${entry.score}/20.${remark}`;
    })
    .join('\n');

  return [`Élève: ${student.firstName}.`, classRoom ? `Classe: ${classRoom.name}.` : '', 'Données notes/observations:', gradeLines || '- Aucune note disponible.']
    .filter(Boolean)
    .join('\n');
}

function renderTeacherReportCommentsPage(session, { teacher, students, selectedStudentId, draftText = '', message = '' }) {
  const studentOptions = ['<option value="">Choisir un élève</option>']
    .concat(
      students.map((student) => {
        const label = `${student.firstName} ${student.lastName} (${student.classRoomId})`;
        return `<option value="${student.id}" ${student.id === selectedStudentId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      })
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Brouillon appréciation IA</title></head><body>
    <h1>Brouillon d'appréciation IA</h1>
    <p>Enseignant: ${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}</p>
    <p><strong>Le texte IA est un brouillon. Validation/édition humaine obligatoire avant enregistrement final.</strong></p>
    ${message ? `<p>${escapeHtml(message)}</p>` : ''}
    <form method="POST" action="/teacher/report-comments/generate">
      <label>Élève <select name="studentId" required>${studentOptions}</select></label>
      <button type="submit">Générer un brouillon</button>
    </form>
    <h2>Brouillon éditable</h2>
    <form method="POST" action="/teacher/report-comments/save">
      <input type="hidden" name="studentId" value="${escapeHtml(selectedStudentId || '')}" />
      <label>Brouillon <textarea name="draftText" rows="8" cols="80" required>${escapeHtml(draftText)}</textarea></label><br/>
      <label><input type="checkbox" name="humanValidated" value="true" /> J'ai relu/édité et je valide humainement</label><br/>
      <button type="submit">Enregistrer comme commentaire final</button>
    </form>
    <p><a href="/dashboard/teacher">Retour dashboard</a></p>
  </body></html>`;
}

function renderTeacherAttendancePage(session, { teacher, classRooms, selectedClassRoomId, selectedDate, students, attendanceByStudentId }) {
  const options = classRooms
    .map((classRoom) => `<option value="${classRoom.id}" ${classRoom.id === selectedClassRoomId ? 'selected' : ''}>${classRoom.name}</option>`)
    .join('');

  const rows = students
    .map((student) => {
      const selectedStatus = attendanceByStudentId.get(student.id)?.status ?? 'present';
      const statusOptions = ATTENDANCE_STATUSES
        .map((status) => `<option value="${status}" ${selectedStatus === status ? 'selected' : ''}>${status}</option>`)
        .join('');
      return `<tr>
        <td>${student.firstName} ${student.lastName}</td>
        <td>${student.admissionNumber}</td>
        <td>
          <input type="hidden" name="studentId" value="${student.id}" />
          <select name="status">${statusOptions}</select>
        </td>
      </tr>`;
    })
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Teacher Attendance</title></head><body>
    <h1>Appel enseignant</h1>
    <p>Tenant: ${session.tenantId}</p>
    <p>Enseignant: ${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}</p>
    <form method="GET" action="/teacher/attendance">
      <label>Date <input type="date" name="date" value="${selectedDate}" required /></label>
      <label>Classe
        <select name="classRoomId" required>
          ${options}
        </select>
      </label>
      <button type="submit">Charger</button>
    </form>
    ${
      selectedClassRoomId
        ? `<h2>Liste des élèves</h2>
    <form method="POST" action="/teacher/attendance">
      <input type="hidden" name="date" value="${selectedDate}" />
      <input type="hidden" name="classRoomId" value="${selectedClassRoomId}" />
      <table border="1"><thead><tr><th>Nom</th><th>Matricule</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>
      <button type="submit">Sauvegarder l'appel</button>
    </form>`
        : '<p>Sélectionnez une classe autorisée pour commencer.</p>'
    }
    <p><a href="/dashboard/teacher">Retour dashboard</a></p>
  </body></html>`;
}

function renderAdminAttendancePage(session, { date, classRooms, selectedClassRoomId, records, studentsById, teachersById }) {
  const options = ['<option value="">Toutes les classes</option>']
    .concat(
      classRooms.map(
        (classRoom) => `<option value="${classRoom.id}" ${classRoom.id === selectedClassRoomId ? 'selected' : ''}>${classRoom.name}</option>`
      )
    )
    .join('');

  const rows = records
    .map((record) => {
      const student = studentsById.get(record.studentId);
      const teacher = teachersById.get(record.teacherId);
      return `<tr>
        <td>${record.date}</td>
        <td>${record.classRoomId}</td>
        <td>${student ? `${student.firstName} ${student.lastName}` : record.studentId}</td>
        <td>${record.status}</td>
        <td>${teacher ? `${teacher.firstName} ${teacher.lastName}` : record.teacherId}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Admin Attendance</title></head><body>
    <h1>Présences du jour</h1>
    <p>Tenant: ${session.tenantId}</p>
    <form method="GET" action="/admin/attendance">
      <label>Date <input type="date" name="date" value="${date}" required /></label>
      <label>Classe
        <select name="classRoomId">${options}</select>
      </label>
      <button type="submit">Filtrer</button>
    </form>
    <table border="1"><thead><tr><th>Date</th><th>Classe</th><th>Élève</th><th>Statut</th><th>Saisi par</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard/admin">Retour dashboard</a></p>
  </body></html>`;
}

function renderParentDashboard(session, children) {
  const list = children.length
    ? `<ul>${children.map((student) => `<li>${student.firstName} ${student.lastName} (${student.classRoomId})</li>`).join('')}</ul>`
    : '<p>Aucun enfant lié pour le moment.</p>';

  return renderDashboardLayout(
    'Dashboard Parent',
    session,
    `<h2>Mes enfants</h2>
    ${list}
    <h2>Informations utiles</h2>
    <p><a href="/parent/homeworks">Consulter les devoirs</a></p>
    <p><a href="/parent/grades">Consulter les notes</a></p>
    <p><a href="/parent/finance">Consulter le statut financier</a></p>
    <p><a href="/admin/students">Annuaire élèves (lecture selon permissions)</a></p>
    <p><a href="/inbox">Ouvrir l'inbox</a></p>`
  );
}

function renderStudentDashboard(session, student) {
  return renderDashboardLayout(
    'Dashboard Student',
    session,
    `<h2>Mon espace</h2>
    <p>Nom: ${student ? `${student.firstName} ${student.lastName}` : 'Profil étudiant non trouvé'}</p>
    <p>Classe: ${student?.classRoomId ?? '-'}</p>
    <p>Matricule: ${student?.admissionNumber ?? '-'}</p>
    <p><a href="/student/homeworks">Mes devoirs</a></p>
    <p><a href="/student/grades">Mes notes</a></p>
    <p><a href="/inbox">Ouvrir l'inbox</a></p>`
  );
}

function renderInboxPage(session, inbox) {
  const announcementRows = inbox.announcements
    .map((item) => `<li><strong>${item.title}</strong> (${item.visibility})<br/>${item.body}</li>`)
    .join('');

  const threadRows = inbox.threads
    .map((thread) => `<li><a href="/inbox/threads/${thread.id}">${thread.subject}</a> — ${thread.messageCount} message(s)</li>`)
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Inbox</title></head><body>
    <h1>Inbox interne</h1>
    <p>Tenant: ${session.tenantId}</p>
    <h2>Annonces</h2>
    <ul>${announcementRows || '<li>Aucune annonce</li>'}</ul>
    <h2>Threads</h2>
    <ul>${threadRows || '<li>Aucun thread</li>'}</ul>
    <p><a href="/dashboard">Retour dashboard</a></p>
  </body></html>`;
}

function renderThreadPage(session, thread) {
  const rows = thread.messages
    .map((message) => `<li><strong>${message.senderId}</strong> (${message.created_at}): ${message.body}</li>`)
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Thread</title></head><body>
    <h1>Thread: ${thread.subject}</h1>
    <p>Tenant: ${session.tenantId}</p>
    <p>Participants: ${thread.participantIds.join(', ')}</p>
    <ul>${rows || '<li>Aucun message</li>'}</ul>
    <form method="POST" action="/inbox/threads/${thread.id}/reply">
      <label>Réponse <textarea name="body" required></textarea></label><br/>
      <button type="submit">Envoyer</button>
    </form>
    <p><a href="/inbox">Retour inbox</a></p>
  </body></html>`;
}

function renderAdminAnnouncementsPage(session, announcements) {
  const rows = announcements
    .map((item) => `<li><strong>${item.title}</strong> (${item.visibility}) - ${item.created_at}<br/>${item.body}</li>`)
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Announcements</title></head><body>
    <h1>Publication d'annonces</h1>
    <p>Tenant: ${session.tenantId}</p>
    <form method="POST" action="/admin/announcements">
      <label>Titre <input name="title" required /></label><br/>
      <label>Message <textarea name="body" required></textarea></label><br/>
      <label>Visibilité
        <select name="visibility">
          <option value="global">global</option>
          <option value="roles">roles</option>
        </select>
      </label><br/>
      <label>Rôles (csv si visibility=roles) <input name="roles" /></label><br/>
      <button type="submit">Publier</button>
    </form>
    <h2>Annonces existantes</h2>
    <ul>${rows || '<li>Aucune annonce</li>'}</ul>
    <p><a href="/dashboard/admin">Retour dashboard</a></p>
  </body></html>`;
}

function renderTeacherLessonHomeworkPage(session, { teacher, classRooms, subjects, lessonLogs, homeworks }) {
  const classOptions = classRooms.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
  const subjectOptions = subjects.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
  const lessonRows = lessonLogs
    .map(
      (log) => `<tr><td>${log.date}</td><td>${log.classRoomId}</td><td>${log.subjectId}</td><td>${log.content}</td></tr>`
    )
    .join('');
  const homeworkRows = homeworks
    .map(
      (homework) =>
        `<tr><td>${homework.assignedDate}</td><td>${homework.dueDate}</td><td>${homework.classRoomId}</td><td>${homework.subjectId}</td><td>${homework.title}</td><td>${homework.description}</td></tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Teacher Lesson/Homework</title></head><body>
    <h1>Cahier de texte & devoirs</h1>
    <p>Tenant: ${session.tenantId}</p>
    <p>Enseignant: ${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}</p>
    <h2>Nouveau contenu de cours</h2>
    <form method="POST" action="/teacher/lesson-logs">
      <label>Date <input type="date" name="date" required /></label><br/>
      <label>Classe <select name="classRoomId" required>${classOptions}</select></label><br/>
      <label>Matière <select name="subjectId" required>${subjectOptions}</select></label><br/>
      <label>Contenu <textarea name="content" required></textarea></label><br/>
      <button type="submit">Publier lesson log</button>
    </form>
    <h2>Nouveau devoir</h2>
    <form method="POST" action="/teacher/homeworks">
      <label>Échéance <input type="date" name="dueDate" required /></label><br/>
      <label>Classe <select name="classRoomId" required>${classOptions}</select></label><br/>
      <label>Matière <select name="subjectId" required>${subjectOptions}</select></label><br/>
      <label>Titre <input name="title" required /></label><br/>
      <label>Description <textarea name="description" required></textarea></label><br/>
      <button type="submit">Publier devoir</button>
    </form>
    <h2>Historique lesson logs</h2>
    <table border="1"><thead><tr><th>Date</th><th>Classe</th><th>Matière</th><th>Contenu</th></tr></thead><tbody>${lessonRows}</tbody></table>
    <h2>Historique devoirs</h2>
    <table border="1"><thead><tr><th>Assigné le</th><th>À rendre le</th><th>Classe</th><th>Matière</th><th>Titre</th><th>Description</th></tr></thead><tbody>${homeworkRows}</tbody></table>
    <p><a href="/dashboard/teacher">Retour dashboard</a></p>
  </body></html>`;
}

function renderParentHomeworksPage(session, homeworks) {
  const rows = homeworks
    .map((homework) => {
      const students = homework.students.map((student) => `${student.firstName} ${student.lastName}`).join(', ') || '-';
      return `<tr><td>${homework.dueDate}</td><td>${homework.title}</td><td>${homework.description}</td><td>${homework.classRoomId}</td><td>${students}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parent Homeworks</title></head><body>
    <h1>Devoirs de mes enfants</h1>
    <p>Tenant: ${session.tenantId}</p>
    <table border="1"><thead><tr><th>Échéance</th><th>Titre</th><th>Description</th><th>Classe</th><th>Enfant concerné</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard/parent">Retour dashboard</a></p>
  </body></html>`;
}

function renderStudentHomeworksPage(session, student, homeworks) {
  const rows = homeworks
    .map((homework) => `<tr><td>${homework.dueDate}</td><td>${homework.subjectId}</td><td>${homework.title}</td><td>${homework.description}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Student Homeworks</title></head><body>
    <h1>Mes devoirs</h1>
    <p>Étudiant: ${student ? `${student.firstName} ${student.lastName}` : '-'}</p>
    <table border="1"><thead><tr><th>Échéance</th><th>Matière</th><th>Titre</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard/student">Retour dashboard</a></p>
  </body></html>`;
}

function renderTeacherGradesPage(session, { teacher, classRooms, subjects, assessments, selectedAssessmentId, students, gradesByStudentId }) {
  const classOptions = classRooms.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
  const subjectOptions = subjects.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
  const assessmentOptions = ['<option value="">Choisir une évaluation</option>']
    .concat(
      assessments.map(
        (assessment) =>
          `<option value="${assessment.id}" ${assessment.id === selectedAssessmentId ? 'selected' : ''}>${assessment.date} - ${assessment.title} (${assessment.classRoomId})</option>`
      )
    )
    .join('');
  const rows = students
    .map((student) => {
      const existing = gradesByStudentId.get(student.id);
      return `<tr>
        <td>${student.firstName} ${student.lastName}</td>
        <td>${student.admissionNumber}</td>
        <td><input type="hidden" name="studentId" value="${student.id}" /><input type="number" min="0" max="20" step="0.25" name="score" value="${existing?.score ?? ''}" required /></td>
        <td><input type="text" name="remark" value="${existing?.remark ?? ''}" /></td>
      </tr>`;
    })
    .join('');
  const assessmentRows = assessments
    .map(
      (assessment) =>
        `<tr><td>${assessment.date}</td><td>${assessment.title}</td><td>${assessment.classRoomId}</td><td>${assessment.subjectId}</td><td>${assessment.coefficient}</td></tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Teacher Grades</title></head><body>
    <h1>Évaluations & notes</h1>
    <p>Tenant: ${session.tenantId}</p>
    <p>Enseignant: ${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}</p>
    <h2>Créer une évaluation</h2>
    <form method="POST" action="/teacher/assessments">
      <label>Date <input type="date" name="date" required /></label><br/>
      <label>Classe <select name="classRoomId" required>${classOptions}</select></label><br/>
      <label>Matière <select name="subjectId" required>${subjectOptions}</select></label><br/>
      <label>Titre <input name="title" required /></label><br/>
      <label>Coefficient <input type="number" min="0.1" max="20" step="0.1" name="coefficient" value="1" required /></label><br/>
      <button type="submit">Créer l'évaluation</button>
    </form>
    <h2>Saisie des notes</h2>
    <form method="GET" action="/teacher/grades">
      <label>Évaluation <select name="assessmentId">${assessmentOptions}</select></label>
      <button type="submit">Charger</button>
    </form>
    ${
      selectedAssessmentId
        ? `<form method="POST" action="/teacher/grades">
      <input type="hidden" name="assessmentId" value="${selectedAssessmentId}" />
      <table border="1"><thead><tr><th>Élève</th><th>Matricule</th><th>Note /20</th><th>Remarque</th></tr></thead><tbody>${rows}</tbody></table>
      <button type="submit">Enregistrer les notes</button>
    </form>`
        : '<p>Sélectionnez une évaluation pour saisir des notes.</p>'
    }
    <h2>Mes évaluations</h2>
    <table border="1"><thead><tr><th>Date</th><th>Titre</th><th>Classe</th><th>Matière</th><th>Coeff</th></tr></thead><tbody>${assessmentRows}</tbody></table>
    <p><a href="/dashboard/teacher">Retour dashboard</a></p>
  </body></html>`;
}

function renderParentGradesPage(session, grades) {
  const rows = grades
    .map(
      (entry) =>
        `<tr><td>${entry.date}</td><td>${entry.student?.firstName ?? ''} ${entry.student?.lastName ?? ''}</td><td>${entry.assessment?.subjectId ?? '-'}</td><td>${entry.assessment?.title ?? '-'}</td><td>${entry.score}</td><td>${entry.assessment?.coefficient ?? '-'}</td><td>${entry.remark || '-'}</td></tr>`
    )
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parent Grades</title></head><body>
    <h1>Notes de mes enfants</h1>
    <p>Tenant: ${session.tenantId}</p>
    <table border="1"><thead><tr><th>Date</th><th>Élève</th><th>Matière</th><th>Évaluation</th><th>Note</th><th>Coeff</th><th>Remarque</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard/parent">Retour dashboard</a></p>
  </body></html>`;
}

function renderStudentGradesPage(session, student, grades) {
  const rows = grades
    .map(
      (entry) =>
        `<tr><td>${entry.date}</td><td>${entry.assessment?.subjectId ?? '-'}</td><td>${entry.assessment?.title ?? '-'}</td><td>${entry.score}</td><td>${entry.assessment?.coefficient ?? '-'}</td><td>${entry.remark || '-'}</td></tr>`
    )
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Student Grades</title></head><body>
    <h1>Mes notes</h1>
    <p>Étudiant: ${student ? `${student.firstName} ${student.lastName}` : '-'}</p>
    <table border="1"><thead><tr><th>Date</th><th>Matière</th><th>Évaluation</th><th>Note</th><th>Coeff</th><th>Remarque</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard/student">Retour dashboard</a></p>
  </body></html>`;
}

function renderAdminFinancePage(session, { students, feePlans, invoices, payments }) {
  const studentOptions = students.map((student) => `<option value="${student.id}">${student.firstName} ${student.lastName}</option>`).join('');
  const feePlanOptions = ['<option value="">Aucun plan (facture directe)</option>']
    .concat(feePlans.map((plan) => `<option value="${plan.id}">${plan.name} - ${plan.amountDue}</option>`))
    .join('');
  const feePlanRows = feePlans
    .map((plan) => `<tr><td>${plan.name}</td><td>${plan.amountDue}</td><td>${plan.dueDate}</td><td>${plan.description || '-'}</td></tr>`)
    .join('');
  const invoiceRows = invoices
    .map(
      (invoice) =>
        `<tr><td>${invoice.studentId}</td><td>${invoice.amountDue}</td><td>${invoice.totalPaid}</td><td>${invoice.remainingBalance}</td><td>${invoice.status}</td><td>${invoice.dueDate}</td></tr>`
    )
    .join('');
  const paymentRows = payments
    .map((payment) => `<tr><td>${payment.invoiceId}</td><td>${payment.studentId}</td><td>${payment.amountPaid}</td><td>${payment.paidAt}</td><td>${payment.method}</td></tr>`)
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Finance Admin</title></head><body>
    <h1>Finance - Frais / Factures / Paiements</h1>
    <p>Tenant: ${session.tenantId}</p>
    <h2>Nouveau plan de frais</h2>
    <form method="POST" action="/admin/finance/fee-plans">
      <label>Nom <input name="name" required /></label><br/>
      <label>Montant <input name="amountDue" type="number" step="0.01" min="0" required /></label><br/>
      <label>Échéance <input name="dueDate" type="date" required /></label><br/>
      <label>Description <textarea name="description"></textarea></label><br/>
      <button type="submit">Créer plan de frais</button>
    </form>
    <h2>Nouvelle facture</h2>
    <form method="POST" action="/admin/finance/invoices">
      <label>Élève <select name="studentId" required>${studentOptions}</select></label><br/>
      <label>Plan de frais <select name="feePlanId">${feePlanOptions}</select></label><br/>
      <label>Montant <input name="amountDue" type="number" step="0.01" min="0" required /></label><br/>
      <label>Échéance <input name="dueDate" type="date" required /></label><br/>
      <label>Description <textarea name="description"></textarea></label><br/>
      <button type="submit">Créer facture</button>
    </form>
    <h2>Nouveau paiement</h2>
    <form method="POST" action="/admin/finance/payments">
      <label>Facture <input name="invoiceId" required /></label><br/>
      <label>Montant payé <input name="amountPaid" type="number" step="0.01" min="0.01" required /></label><br/>
      <label>Date paiement <input name="paidAt" type="date" required /></label><br/>
      <label>Méthode <input name="method" value="manual" /></label><br/>
      <label>Note <textarea name="note"></textarea></label><br/>
      <button type="submit">Enregistrer paiement</button>
    </form>
    <h2>Plans de frais</h2>
    <table border="1"><thead><tr><th>Nom</th><th>Montant</th><th>Échéance</th><th>Description</th></tr></thead><tbody>${feePlanRows}</tbody></table>
    <h2>Factures</h2>
    <table border="1"><thead><tr><th>Élève</th><th>Montant</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Échéance</th></tr></thead><tbody>${invoiceRows}</tbody></table>
    <h2>Paiements</h2>
    <table border="1"><thead><tr><th>Facture</th><th>Élève</th><th>Montant</th><th>Date</th><th>Méthode</th></tr></thead><tbody>${paymentRows}</tbody></table>
    <p><a href="/dashboard">Retour dashboard</a></p>
  </body></html>`;
}

function renderParentFinancePage(session, invoices) {
  const rows = invoices
    .map(
      (invoice) =>
        `<tr><td>${invoice.studentId}</td><td>${invoice.amountDue}</td><td>${invoice.totalPaid}</td><td>${invoice.remainingBalance}</td><td>${invoice.status}</td><td>${invoice.dueDate}</td></tr>`
    )
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parent Finance</title></head><body>
    <h1>Statut financier de mes enfants</h1>
    <p>Tenant: ${session.tenantId}</p>
    <table border="1"><thead><tr><th>Élève</th><th>Montant</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Échéance</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard/parent">Retour dashboard</a></p>
  </body></html>`;
}

function renderAccountantDashboard(session) {
  return renderDashboardLayout(
    'Dashboard Accountant',
    session,
    `<h2>Finance</h2>
    <p><a href="/admin/finance">Accéder aux frais, factures et paiements</a></p>`
  );
}

function renderStudentsPage(session, classRooms, students, selectedClassRoomId = '') {
  const options = ['<option value="">Toutes les classes</option>']
    .concat(classRooms.map((classRoom) => `<option value="${classRoom.id}" ${selectedClassRoomId === classRoom.id ? 'selected' : ''}>${classRoom.name}</option>`))
    .join('');

  const rows = students
    .map(
      (student) => `<tr>
        <td><a href="/admin/students/${student.id}">${student.firstName} ${student.lastName}</a></td>
        <td>${student.admissionNumber}</td>
        <td>${student.classRoomId}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Students</title></head><body>
    <h1>Gestion des élèves</h1>
    <p>Tenant: ${session.tenantId}</p>
    <form method="GET" action="/admin/students">
      <label>Filtre classe
        <select name="classRoomId">${options}</select>
      </label>
      <button type="submit">Filtrer</button>
    </form>
    <table border="1"><thead><tr><th>Nom</th><th>Matricule</th><th>Classe</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

function renderStudentProfile(student) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Student profile</title></head><body>
    <h1>Fiche élève</h1>
    <p>id: ${student.id}</p>
    <p>Nom: ${student.firstName} ${student.lastName}</p>
    <p>Matricule: ${student.admissionNumber}</p>
    <p>Classe: ${student.classRoomId}</p>
    <p>Date de naissance: ${student.dateOfBirth || '-'}</p>
    <p>Archivé: ${student.archived_at ? 'oui' : 'non'}</p>
    <p><a href="/admin/students">Retour</a></p>
  </body></html>`;
}

function renderParentsPage(session, parents) {
  const rows = parents
    .map(
      (parent) => `<tr>
        <td><a href="/admin/parents/${parent.id}">${parent.firstName} ${parent.lastName}</a></td>
        <td>${parent.phone || '-'}</td>
        <td>${parent.email || '-'}</td>
        <td>${parent.archived_at ? 'oui' : 'non'}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parents</title></head><body>
    <h1>Gestion des responsables</h1>
    <p>Tenant: ${session.tenantId}</p>
    <h2>Créer un responsable</h2>
    <form method="POST" action="/admin/parents">
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Téléphone <input name="phone" /></label><br/>
      <label>Email <input name="email" type="email" /></label><br/>
      <label>Adresse <input name="address" /></label><br/>
      <label>Notes <textarea name="notes"></textarea></label><br/>
      <button type="submit">Créer</button>
    </form>
    <h2>Liste</h2>
    <table border="1"><thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Archivé</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard">Retour dashboard</a></p>
  </body></html>`;
}

function renderParentProfile(parent, students, links) {
  const studentCheckboxes = students
    .map((student) => `<label><input type="checkbox" name="studentIds" value="${student.id}" /> ${student.firstName} ${student.lastName} (${student.classRoomId})</label><br/>`)
    .join('');
  const linkRows = links
    .map((link) => `<tr><td>${link.student?.firstName ?? '-'} ${link.student?.lastName ?? ''}</td><td>${link.relationship}</td><td>${link.isPrimaryContact ? 'oui' : 'non'}</td></tr>`)
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parent profile</title></head><body>
    <h1>Fiche responsable</h1>
    <p>id: ${parent.id}</p>
    <p>Tenant: ${parent.tenant_id}</p>
    <h2>Informations</h2>
    <form method="POST" action="/admin/parents/${parent.id}/update">
      <label>Prénom <input name="firstName" value="${parent.firstName}" required /></label><br/>
      <label>Nom <input name="lastName" value="${parent.lastName}" required /></label><br/>
      <label>Téléphone <input name="phone" value="${parent.phone}" /></label><br/>
      <label>Email <input name="email" type="email" value="${parent.email}" /></label><br/>
      <label>Adresse <input name="address" value="${parent.address}" /></label><br/>
      <label>Notes <textarea name="notes">${parent.notes}</textarea></label><br/>
      <button type="submit">Enregistrer</button>
    </form>
    <form method="POST" action="/admin/parents/${parent.id}/archive"><button type="submit">Archiver</button></form>
    <h2>Lier à des élèves</h2>
    <form method="POST" action="/admin/parents/${parent.id}/links">
      ${studentCheckboxes}
      <label>Relation
        <select name="relationship">
          <option value="guardian">Responsable</option>
          <option value="mother">Mère</option>
          <option value="father">Père</option>
          <option value="other">Autre</option>
        </select>
      </label><br/>
      <label>Contact principal <input type="checkbox" name="isPrimaryContact" value="true" /></label><br/>
      <button type="submit">Lier</button>
    </form>
    <h2>Liens existants</h2>
    <table border="1"><thead><tr><th>Élève</th><th>Relation</th><th>Principal</th></tr></thead><tbody>${linkRows}</tbody></table>
    <p><a href="/admin/parents">Retour</a></p>
  </body></html>`;
}

function renderTeachersPage(session, teachers) {
  const rows = teachers
    .map(
      (teacher) => `<tr>
        <td><a href="/admin/teachers/${teacher.id}">${teacher.firstName} ${teacher.lastName}</a></td>
        <td>${teacher.email || '-'}</td>
        <td>${teacher.classRoomIds.length}</td>
        <td>${teacher.subjectIds.length}</td>
        <td>${teacher.archived_at ? 'oui' : 'non'}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Teachers</title></head><body>
    <h1>Gestion des enseignants</h1>
    <p>Tenant: ${session.tenantId}</p>
    <h2>Créer un enseignant</h2>
    <form method="POST" action="/admin/teachers">
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Email <input name="email" type="email" /></label><br/>
      <label>Téléphone <input name="phone" /></label><br/>
      <label>Notes <textarea name="notes"></textarea></label><br/>
      <button type="submit">Créer</button>
    </form>
    <h2>Liste</h2>
    <table border="1"><thead><tr><th>Nom</th><th>Email</th><th># Classes</th><th># Matières</th><th>Archivé</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard">Retour dashboard</a></p>
  </body></html>`;
}

function renderTeacherProfile(teacher, classRooms, subjects) {
  const classRoomCheckboxes = classRooms
    .map(
      (classRoom) =>
        `<label><input type="checkbox" name="classRoomIds" value="${classRoom.id}" ${teacher.classRoomIds.includes(classRoom.id) ? 'checked' : ''} /> ${classRoom.name}</label><br/>`
    )
    .join('');
  const subjectCheckboxes = subjects
    .map(
      (subject) =>
        `<label><input type="checkbox" name="subjectIds" value="${subject.id}" ${teacher.subjectIds.includes(subject.id) ? 'checked' : ''} /> ${subject.name}</label><br/>`
    )
    .join('');
  const classNames = teacher.classRoomIds.map((classRoomId) => classRooms.find((item) => item.id === classRoomId)?.name || classRoomId).join(', ') || '-';
  const subjectNames = teacher.subjectIds.map((subjectId) => subjects.find((item) => item.id === subjectId)?.name || subjectId).join(', ') || '-';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Teacher profile</title></head><body>
    <h1>Fiche enseignant</h1>
    <p>id: ${teacher.id}</p>
    <p>Tenant: ${teacher.tenant_id}</p>
    <h2>Informations</h2>
    <form method="POST" action="/admin/teachers/${teacher.id}/update">
      <label>Prénom <input name="firstName" value="${teacher.firstName}" required /></label><br/>
      <label>Nom <input name="lastName" value="${teacher.lastName}" required /></label><br/>
      <label>Email <input name="email" type="email" value="${teacher.email}" /></label><br/>
      <label>Téléphone <input name="phone" value="${teacher.phone}" /></label><br/>
      <label>Notes <textarea name="notes">${teacher.notes}</textarea></label><br/>
      <h3>Classes assignées</h3>
      ${classRoomCheckboxes}
      <h3>Matières assignées</h3>
      ${subjectCheckboxes}
      <button type="submit">Enregistrer</button>
    </form>
    <form method="POST" action="/admin/teachers/${teacher.id}/archive"><button type="submit">Archiver</button></form>
    <h2>Affectations existantes</h2>
    <p>Classes: ${classNames}</p>
    <p>Matières: ${subjectNames}</p>
    <p><a href="/admin/teachers">Retour</a></p>
  </body></html>`;
}

function buildTenantScope(session, params) {
  if (session.role === ROLES.SUPER_ADMIN) {
    return params.tenantId;
  }
  return session.tenantId;
}

function serializeError(error) {
  if (!error) {
    return null;
  }

  return {
    code: error.code || null,
    status: error.status || null,
    message: String(error.message || 'Unknown error').slice(0, 200)
  };
}

function logAuthEvent(logger, message, session) {
  logger.info(message, {
    tenantId: session?.tenantId ?? null,
    userId: session?.userId ?? null,
    role: session?.role ?? null
  });
}

function createServer({ sessionStore = new SessionStore(), seed = createSeedData(), aiConfig = {}, logger = createLogger({ module: 'web.server' }) } = {}) {
  const coreSchoolStore = new CoreSchoolStore({ classRooms: seed.classRooms, subjects: seed.subjects });
  const studentStore = new StudentStore({ students: seed.students, classRoomStore: coreSchoolStore });
  const parentStore = new ParentStore({ parents: seed.parents, links: seed.studentParentLinks, studentStore });
  const teacherStore = new TeacherStore({ teachers: seed.teachers, classRoomStore: coreSchoolStore });
  const attendanceStore = new AttendanceStore({
    records: seed.attendanceRecords,
    studentStore,
    teacherStore,
    classRoomStore: coreSchoolStore
  });
  const lessonHomeworkStore = new LessonHomeworkStore({
    lessonLogs: seed.lessonLogs,
    homeworks: seed.homeworks,
    classRoomStore: coreSchoolStore,
    teacherStore,
    studentStore,
    parentStore
  });
  const gradingStore = new GradingStore({
    assessments: seed.assessments,
    gradeEntries: seed.gradeEntries,
    classRoomStore: coreSchoolStore,
    teacherStore,
    studentStore,
    parentStore
  });
  const messagingStore = new MessagingStore({
    announcements: seed.announcements,
    threads: seed.messageThreads,
    messages: seed.messages
  });
  const financeStore = new FinanceStore({
    feePlans: seed.feePlans,
    invoices: seed.invoices,
    payments: seed.payments,
    studentStore,
    parentStore
  });
  const auditLogStore = new AuditLogStore({ logs: seed.auditLogs });
  const auditWriter = createAuditEventWriter({ auditLogStore });
  const aiPromptRegistry =
    aiConfig.promptRegistry ??
    new PromptRegistry({
      prompts: [
        {
          key: 'report.comment.draft',
          version: 1,
          template:
            'Rédige une appréciation scolaire bienveillante en français, concise (4 phrases max), factuelle à partir des données, en restant au statut brouillon.'
        }
      ]
    });
  const aiFeatureFlags = aiConfig.featureFlags ?? new TenantAiFeatureFlagStore({ tenantFlags: { 'school-a': true, 'school-b': false } });
  const aiProviderRegistry =
    aiConfig.providerRegistry ?? new AiProviderRegistry({ providers: { 'dev-echo': new DevEchoAiProvider() }, defaultProvider: 'dev-echo' });
  const aiLogStore = aiConfig.logStore ?? new AiLogStore();
  const aiService =
    aiConfig.service ??
    new AiService({
      featureFlags: aiFeatureFlags,
      promptRegistry: aiPromptRegistry,
      providerRegistry: aiProviderRegistry,
      logStore: aiLogStore
    });
  const coreSchoolService = new CoreSchoolService({ coreSchoolStore });
  const studentService = new StudentService({ studentStore, coreSchoolService });

  let studentApiService = studentService;
  if (isPersistenceEnabled()) {
    const pool = getPool();
    const persistentCoreSchool = new PostgresCoreSchoolRepository({ pool });
    const persistentStudentStore = new PostgresStudentRepository({ pool, classRoomRepository: persistentCoreSchool });
    const persistentCoreSchoolService = new CoreSchoolService({ coreSchoolStore: persistentCoreSchool });
    studentApiService = new StudentService({ studentStore: persistentStudentStore, coreSchoolService: persistentCoreSchoolService });
  }
  const parentService = new ParentService({ parentStore, studentStore, buildValidationError });
  const teacherService = new TeacherService({ teacherStore });
  const attendanceService = new AttendanceService({ attendanceStore, requireDateString });

  logger.info('Application server initialized', {
    persistenceMode: isPersistenceEnabled() ? 'postgres' : 'memory',
    aiDefaultProvider: aiProviderRegistry.defaultProvider
  });

  if (isPersistenceEnabled()) {
    logger.info('Postgres persistence enabled for student API');
  }

  const reportComments = [];

  const domainRouteHandlers = [
    createStudentRoutes({
      studentService: studentApiService,
      auditWriter,
      sendApiError,
      sendApiSuccess,
      parseJsonBody,
      buildTenantScope
    }),
    createParentRoutes({
      parentService,
      auditWriter,
      sendApiError,
      sendApiSuccess,
      parseJsonBody,
      buildTenantScope
    }),
    createTeacherRoutes({
      teacherService,
      auditWriter,
      sendApiError,
      sendApiSuccess,
      parseJsonBody,
      buildTenantScope
    }),
    createAttendanceRoutes({
      attendanceService,
      sendApiError,
      sendApiSuccess,
      parseJsonBody,
      buildTenantScope
    })
  ];

  async function generateReportCommentDraft({ tenantId, teacherId, studentId }) {
    const teacher = teacherStore.get(tenantId, teacherId, { includeArchived: false });
    const student = studentStore.get(tenantId, studentId, { includeArchived: false });
    if (!teacher || !student) {
      throw buildValidationError('studentId must reference an active student in tenant scope');
    }
    if (!teacher.classRoomIds.includes(student.classRoomId)) {
      throw buildForbiddenError('Teacher is not authorized for this student');
    }

    const classRoom = coreSchoolStore.get('classRooms', tenantId, student.classRoomId);
    const grades = gradingStore.listGradesForTeacher(tenantId, teacherId).filter((entry) => entry.studentId === studentId);
    const input = buildDraftCommentInput({ student, classRoom, grades });
    const result = await aiService.execute({
      tenantId,
      actorUserId: teacherId,
      promptKey: 'report.comment.draft',
      input
    });

    return {
      studentId,
      draft: result.outputText,
      status: 'draft',
      humanValidationRequired: true
    };
  }

  return http.createServer(async (request, response) => {
    const requestStartedAt = Date.now();
    const requestId = request.headers['x-request-id'] || randomUUID();
    response.setHeader('x-request-id', requestId);

    const url = new URL(request.url, 'http://localhost');
    const cookies = parseCookies(request.headers.cookie);
    const rawSessionId = cookies.sessionId;
    const session = sessionStore.get(rawSessionId);
    const hasStaleSessionCookie = Boolean(rawSessionId && !session);
    const requestLogger = logger.child(
      {
        requestId,
        method: request.method,
        path: url.pathname,
        tenantId: session?.tenantId ?? null,
        userId: session?.userId ?? null
      },
      'web.http'
    );

    requestLogger.info('HTTP request received');
    response.on('finish', () => {
      const durationMs = Date.now() - requestStartedAt;
      const level = response.statusCode >= 500 ? 'error' : 'info';
      requestLogger[level]('HTTP request completed', {
        statusCode: response.statusCode,
        durationMs
      });
    });

    if (request.method === 'GET' && url.pathname === '/login') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderLoginPage());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      const form = parseForm(await readBody(request));
      const user = users.find((candidate) => candidate.email === form.email && candidate.password === form.password);
      if (!user) {
        requestLogger.warn('Authentication failed', { actor: form.email || null });
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderLoginPage('Identifiants invalides'));
        return;
      }

      const createdSession = sessionStore.create({ userId: user.id, role: user.role, tenantId: user.tenantId });
      logAuthEvent(requestLogger, 'Authentication succeeded', createdSession);
      auditWriter.writeAuthEvent(createdSession, 'auth.login.success');
      if (rawSessionId) {
        sessionStore.destroy(rawSessionId);
      }

      response.writeHead(302, { location: getDashboardPathForRole(user.role), 'set-cookie': buildSessionCookie(createdSession.id) });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      if (session) {
        auditWriter.writeAuthEvent(session, 'auth.logout');
        logAuthEvent(requestLogger, 'Logout succeeded', session);
      }
      sessionStore.destroy(rawSessionId);
      response.writeHead(302, { location: '/login', 'set-cookie': clearSessionCookie() });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        response.writeHead(302, { location: '/login', ...(hasStaleSessionCookie ? { 'set-cookie': clearSessionCookie() } : {}) });
        response.end();
        return;
      }

      response.writeHead(302, { location: getDashboardPathForRole(auth.context.role) });
      response.end();
      return;
    }

    const dashboardRoleMatch = url.pathname.match(/^\/dashboard\/(admin|director|teacher|parent|student|accountant)$/);
    if (request.method === 'GET' && dashboardRoleMatch) {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        response.writeHead(302, { location: '/login', ...(hasStaleSessionCookie ? { 'set-cookie': clearSessionCookie() } : {}) });
        response.end();
        return;
      }

      const routeRoleKey = dashboardRoleMatch[1];
      const expectedRoleByRoute = {
        admin: ROLES.SCHOOL_ADMIN,
        director: ROLES.DIRECTOR,
        teacher: ROLES.TEACHER,
        parent: ROLES.PARENT,
        student: ROLES.STUDENT,
        accountant: ROLES.ACCOUNTANT
      };

      if (auth.context.role !== expectedRoleByRoute[routeRoleKey]) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const tenantId = auth.context.tenantId;
      const metrics = {
        classRoomsCount: coreSchoolStore.list('classRooms', tenantId).length,
        studentsCount: studentStore.list(tenantId).length,
        parentsCount: parentStore.list(tenantId).length,
        teachersCount: teacherStore.list(tenantId).length
      };

      let html = '';
      if (auth.context.role === ROLES.SCHOOL_ADMIN) {
        html = renderAdminDashboard(auth.context, metrics);
      } else if (auth.context.role === ROLES.DIRECTOR) {
        html = renderDirectorDashboard(auth.context, metrics);
      } else if (auth.context.role === ROLES.TEACHER) {
        const teacher = teacherStore.get(tenantId, auth.context.userId, { includeArchived: false });
        const classRooms = teacher ? teacher.classRoomIds.map((id) => coreSchoolStore.get('classRooms', tenantId, id)).filter(Boolean) : [];
        const subjects = teacher ? teacher.subjectIds.map((id) => coreSchoolStore.get('subjects', tenantId, id)).filter(Boolean) : [];
        html = renderTeacherDashboard(auth.context, teacher, classRooms, subjects);
      } else if (auth.context.role === ROLES.PARENT) {
        const links = parentStore.listLinksByParent(tenantId, auth.context.userId);
        const children = links.map((link) => studentStore.get(tenantId, link.studentId, { includeArchived: false })).filter(Boolean);
        html = renderParentDashboard(auth.context, children);
      } else if (auth.context.role === ROLES.STUDENT) {
        const student = studentStore.get(tenantId, auth.context.userId, { includeArchived: false });
        html = renderStudentDashboard(auth.context, student);
      } else if (auth.context.role === ROLES.ACCOUNTANT) {
        html = renderAccountantDashboard(auth.context);
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/students') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewStudents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const classRoomId = url.searchParams.get('classRoomId') ?? '';
      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const students = studentStore.list(auth.context.tenantId, { classRoomId: classRoomId || undefined });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentsPage(auth.context, classRooms, students, classRoomId));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/teacher/attendance') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canTakeAttendance(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      const classRooms = teacher ? teacher.classRoomIds.map((id) => coreSchoolStore.get('classRooms', auth.context.tenantId, id)).filter(Boolean) : [];
      const selectedDateRaw = url.searchParams.get('date') || todayIsoDate();
      const selectedDate = requireDateString(selectedDateRaw, 'date');
      const selectedClassRoomId = url.searchParams.get('classRoomId') || classRooms[0]?.id || '';

      if (selectedClassRoomId && !classRooms.some((classRoom) => classRoom.id === selectedClassRoomId)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const students = selectedClassRoomId ? studentStore.list(auth.context.tenantId, { classRoomId: selectedClassRoomId }) : [];
      const attendanceByStudentId = new Map(
        attendanceStore
          .list(auth.context.tenantId, { date: selectedDate, classRoomId: selectedClassRoomId })
          .map((record) => [record.studentId, record])
      );

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderTeacherAttendancePage(auth.context, {
          teacher,
          classRooms,
          selectedClassRoomId,
          selectedDate,
          students,
          attendanceByStudentId
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/attendance') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canTakeAttendance(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      let redirectDate = '';
      let redirectClass = '';
      try {
        const form = parseExtendedForm(await readBody(request));
        redirectDate = form.get('date');
        redirectClass = form.get('classRoomId');
        const studentIds = form.getAll('studentId');
        const statuses = form.getAll('status');
        const records = studentIds.map((studentId, index) => ({
          studentId,
          status: statuses[index] ?? ''
        }));
        attendanceStore.upsertForClass(auth.context.tenantId, {
          teacherId: auth.context.userId,
          classRoomId: form.get('classRoomId'),
          date: form.get('date'),
          records
        });
      } catch (error) {
        requestLogger.warn('Unable to persist attendance form submission', { error: serializeError(error) });
      }

      response.writeHead(302, { location: `/teacher/attendance?date=${encodeURIComponent(redirectDate)}&classRoomId=${encodeURIComponent(redirectClass)}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/teacher/lesson-homework') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageLessonHomework(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      const classRooms = teacher ? teacher.classRoomIds.map((id) => coreSchoolStore.get('classRooms', auth.context.tenantId, id)).filter(Boolean) : [];
      const subjects = teacher ? teacher.subjectIds.map((id) => coreSchoolStore.get('subjects', auth.context.tenantId, id)).filter(Boolean) : [];
      const lessonLogs = lessonHomeworkStore.listLessonLogsForTeacher(auth.context.tenantId, auth.context.userId);
      const homeworks = lessonHomeworkStore.listHomeworksForTeacher(auth.context.tenantId, auth.context.userId);

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderTeacherLessonHomeworkPage(auth.context, { teacher, classRooms, subjects, lessonLogs, homeworks }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/lesson-logs') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageLessonHomework(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        lessonHomeworkStore.createLessonLog(auth.context.tenantId, {
          teacherId: auth.context.userId,
          classRoomId: form.get('classRoomId'),
          subjectId: form.get('subjectId'),
          date: form.get('date'),
          content: form.get('content')
        });
      } catch (error) {
        requestLogger.warn('Unable to save teacher lesson log from form', { error: serializeError(error) });
      }

      response.writeHead(302, { location: '/teacher/lesson-homework' });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/homeworks') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageLessonHomework(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        lessonHomeworkStore.createHomework(auth.context.tenantId, {
          teacherId: auth.context.userId,
          classRoomId: form.get('classRoomId'),
          subjectId: form.get('subjectId'),
          dueDate: form.get('dueDate'),
          title: form.get('title'),
          description: form.get('description')
        });
      } catch (error) {
        requestLogger.warn('Unable to save teacher homework from form', { error: serializeError(error) });
      }

      response.writeHead(302, { location: '/teacher/lesson-homework' });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/parent/homeworks') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.PARENT) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const homeworks = lessonHomeworkStore.listHomeworksForParent(auth.context.tenantId, auth.context.userId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentHomeworksPage(auth.context, homeworks));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/student/homeworks') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.STUDENT) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const student = studentStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      const homeworks = lessonHomeworkStore.listHomeworksForStudent(auth.context.tenantId, auth.context.userId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentHomeworksPage(auth.context, student, homeworks));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/teacher/grades') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.TEACHER) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      const classRooms = teacher ? teacher.classRoomIds.map((id) => coreSchoolStore.get('classRooms', auth.context.tenantId, id)).filter(Boolean) : [];
      const subjects = teacher ? teacher.subjectIds.map((id) => coreSchoolStore.get('subjects', auth.context.tenantId, id)).filter(Boolean) : [];
      const assessments = gradingStore.listAssessmentsForTeacher(auth.context.tenantId, auth.context.userId);
      const selectedAssessmentId = url.searchParams.get('assessmentId') || '';
      const selectedAssessment =
        selectedAssessmentId && assessments.find((assessment) => assessment.id === selectedAssessmentId)
          ? assessments.find((assessment) => assessment.id === selectedAssessmentId)
          : null;

      const students = selectedAssessment ? studentStore.list(auth.context.tenantId, { classRoomId: selectedAssessment.classRoomId }) : [];
      const gradesByStudentId = new Map(
        (selectedAssessment
          ? gradingStore
              .listGradesForTeacher(auth.context.tenantId, auth.context.userId)
              .filter((entry) => entry.assessmentId === selectedAssessment.id)
          : []
        ).map((entry) => [entry.studentId, entry])
      );

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderTeacherGradesPage(auth.context, {
          teacher,
          classRooms,
          subjects,
          assessments,
          selectedAssessmentId: selectedAssessment?.id ?? '',
          students,
          gradesByStudentId
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/assessments') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.TEACHER) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        gradingStore.createAssessment(auth.context.tenantId, {
          teacherId: auth.context.userId,
          classRoomId: form.get('classRoomId'),
          subjectId: form.get('subjectId'),
          title: form.get('title'),
          date: form.get('date'),
          coefficient: form.get('coefficient')
        });
      } catch {
        // no-op
      }
      response.writeHead(302, { location: '/teacher/grades' });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/grades') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.TEACHER) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      let assessmentId = '';
      try {
        const form = parseExtendedForm(await readBody(request));
        assessmentId = form.get('assessmentId');
        const studentIds = form.getAll('studentId');
        const scores = form.getAll('score');
        const remarks = form.getAll('remark');
        const entries = studentIds.map((studentId, index) => ({
          studentId,
          score: scores[index] ?? '',
          remark: remarks[index] ?? ''
        }));
        gradingStore.upsertGradesForAssessment(auth.context.tenantId, {
          teacherId: auth.context.userId,
          assessmentId,
          entries
        });
      } catch {
        // no-op
      }

      response.writeHead(302, { location: `/teacher/grades?assessmentId=${encodeURIComponent(assessmentId)}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/teacher/report-comments') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.TEACHER) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      const students = studentStore
        .list(auth.context.tenantId)
        .filter((student) => teacher && teacher.classRoomIds.includes(student.classRoomId));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderTeacherReportCommentsPage(auth.context, {
          teacher,
          students,
          selectedStudentId: url.searchParams.get('studentId') ?? '',
          draftText: url.searchParams.get('draft') ?? '',
          message: url.searchParams.get('message') ?? ''
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/report-comments/generate') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.TEACHER) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const studentId = form.get('studentId');
      try {
        const generated = await generateReportCommentDraft({
          tenantId: auth.context.tenantId,
          teacherId: auth.context.userId,
          studentId
        });
        response.writeHead(
          302,
          { location: `/teacher/report-comments?studentId=${encodeURIComponent(studentId)}&draft=${encodeURIComponent(generated.draft)}` }
        );
      } catch (error) {
        response.writeHead(
          302,
          { location: `/teacher/report-comments?studentId=${encodeURIComponent(studentId)}&message=${encodeURIComponent(error.message)}` }
        );
      }
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/report-comments/save') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.TEACHER) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const studentId = form.get('studentId');
      const draftText = form.get('draftText');
      const humanValidated = form.get('humanValidated') === 'true';
      if (!humanValidated) {
        response.writeHead(
          302,
          { location: `/teacher/report-comments?studentId=${encodeURIComponent(studentId)}&draft=${encodeURIComponent(draftText)}&message=${encodeURIComponent('Validation humaine obligatoire avant enregistrement.')}` }
        );
        response.end();
        return;
      }

      reportComments.push({
        id: `report-comment-${randomUUID()}`,
        tenant_id: auth.context.tenantId,
        teacherId: auth.context.userId,
        studentId,
        commentText: draftText,
        humanValidated: true,
        created_at: new Date().toISOString()
      });
      response.writeHead(302, { location: `/teacher/report-comments?studentId=${encodeURIComponent(studentId)}&message=${encodeURIComponent('Commentaire final enregistré.')}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/parent/grades') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.PARENT) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const grades = gradingStore.listGradesForParent(auth.context.tenantId, auth.context.userId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentGradesPage(auth.context, grades));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/student/grades') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.STUDENT) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const student = studentStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      const grades = gradingStore.listGradesForStudent(auth.context.tenantId, auth.context.userId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentGradesPage(auth.context, student, grades));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/finance') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageFinance(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const students = studentStore.list(auth.context.tenantId);
      const feePlans = financeStore.listFeePlans(auth.context.tenantId);
      const invoices = financeStore.listInvoices(auth.context.tenantId);
      const payments = financeStore.listPayments(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderAdminFinancePage(auth.context, { students, feePlans, invoices, payments }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/finance/fee-plans') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageFinance(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        financeStore.createFeePlan(auth.context.tenantId, {
          name: form.get('name'),
          amountDue: form.get('amountDue'),
          dueDate: form.get('dueDate'),
          description: form.get('description')
        });
      } catch {
        // no-op
      }
      response.writeHead(302, { location: '/admin/finance' });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/finance/invoices') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageFinance(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        financeStore.createInvoice(auth.context.tenantId, {
          studentId: form.get('studentId'),
          feePlanId: form.get('feePlanId'),
          amountDue: form.get('amountDue'),
          dueDate: form.get('dueDate'),
          description: form.get('description')
        });
      } catch {
        // no-op
      }
      response.writeHead(302, { location: '/admin/finance' });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/finance/payments') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageFinance(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        financeStore.recordPayment(auth.context.tenantId, {
          invoiceId: form.get('invoiceId'),
          amountPaid: form.get('amountPaid'),
          paidAt: form.get('paidAt'),
          method: form.get('method'),
          note: form.get('note')
        });
      } catch {
        // no-op
      }
      response.writeHead(302, { location: '/admin/finance' });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/parent/finance') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewParentFinance(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const invoices = financeStore.listParentFinance(auth.context.tenantId, auth.context.userId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentFinancePage(auth.context, invoices));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/attendance') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewAttendanceAdmin(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const selectedDate = requireDateString(url.searchParams.get('date') || todayIsoDate(), 'date');
      const selectedClassRoomId = url.searchParams.get('classRoomId') || '';
      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const records = attendanceStore.list(auth.context.tenantId, {
        date: selectedDate,
        classRoomId: selectedClassRoomId || undefined
      });
      const studentsById = new Map(studentStore.list(auth.context.tenantId, { includeArchived: true }).map((student) => [student.id, student]));
      const teachersById = new Map(teacherStore.list(auth.context.tenantId, { includeArchived: true }).map((teacher) => [teacher.id, teacher]));

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderAdminAttendancePage(auth.context, {
          date: selectedDate,
          classRooms,
          selectedClassRoomId,
          records,
          studentsById,
          teachersById
        })
      );
      return;
    }

    if (request.method === 'GET' && /^\/admin\/students\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewStudents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const studentId = url.pathname.split('/').at(-1);
      const student = studentStore.get(auth.context.tenantId, studentId);
      if (!student) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentProfile(student));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/parents') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const parents = parentStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentsPage(auth.context, parents));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/parents') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        const created = parentStore.create(auth.context.tenantId, {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          phone: form.get('phone'),
          email: form.get('email'),
          address: form.get('address'),
          notes: form.get('notes')
        });
        response.writeHead(302, { location: `/admin/parents/${created.id}` });
      } catch {
        response.writeHead(302, { location: '/admin/parents' });
      }
      response.end();
      return;
    }

    if (request.method === 'GET' && /^\/admin\/parents\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const parentId = url.pathname.split('/').at(-1);
      const parentWithLinks = parentStore.getParentWithLinks(auth.context.tenantId, parentId);
      if (!parentWithLinks) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const students = studentStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentProfile(parentWithLinks, students, parentWithLinks.links));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/teachers') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teachers = teacherStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderTeachersPage(auth.context, teachers));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/teachers') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        const created = teacherStore.create(auth.context.tenantId, {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          email: form.get('email'),
          phone: form.get('phone'),
          notes: form.get('notes'),
          classRoomIds: [],
          subjectIds: []
        });
        response.writeHead(302, { location: `/admin/teachers/${created.id}` });
      } catch {
        response.writeHead(302, { location: '/admin/teachers' });
      }
      response.end();
      return;
    }

    if (request.method === 'GET' && /^\/admin\/teachers\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacherId = url.pathname.split('/').at(-1);
      const teacher = teacherStore.get(auth.context.tenantId, teacherId);
      if (!teacher) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const subjects = coreSchoolStore.list('subjects', auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderTeacherProfile(teacher, classRooms, subjects));
      return;
    }

    const adminTeacherIdMatch = url.pathname.match(/^\/admin\/teachers\/([^/]+)\/(update|archive)$/);
    if (adminTeacherIdMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacherId = adminTeacherIdMatch[1];
      const action = adminTeacherIdMatch[2];
      const form = parseExtendedForm(await readBody(request));

      try {
        if (action === 'update') {
          teacherStore.update(auth.context.tenantId, teacherId, {
            firstName: form.get('firstName'),
            lastName: form.get('lastName'),
            email: form.get('email'),
            phone: form.get('phone'),
            notes: form.get('notes'),
            classRoomIds: form.getAll('classRoomIds'),
            subjectIds: form.getAll('subjectIds')
          });
        } else if (action === 'archive') {
          teacherStore.archive(auth.context.tenantId, teacherId);
        }
      } catch {
        // no-op; keep flow simple
      }

      response.writeHead(302, { location: `/admin/teachers/${teacherId}` });
      response.end();
      return;
    }

    const adminParentIdMatch = url.pathname.match(/^\/admin\/parents\/([^/]+)\/(update|archive|links)$/);
    if (adminParentIdMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const parentId = adminParentIdMatch[1];
      const action = adminParentIdMatch[2];
      const form = parseExtendedForm(await readBody(request));

      try {
        if (action === 'update') {
          parentStore.update(auth.context.tenantId, parentId, {
            firstName: form.get('firstName'),
            lastName: form.get('lastName'),
            phone: form.get('phone'),
            email: form.get('email'),
            address: form.get('address'),
            notes: form.get('notes')
          });
        } else if (action === 'archive') {
          parentStore.archive(auth.context.tenantId, parentId);
        } else if (action === 'links') {
          const studentIds = form.getAll('studentIds');
          for (const studentId of studentIds) {
            parentStore.upsertLink(auth.context.tenantId, parentId, studentId, {
              relationship: form.get('relationship'),
              isPrimaryContact: form.get('isPrimaryContact')
            });
          }
        }
      } catch {
        // no-op; user keeps workflow simple
      }

      response.writeHead(302, { location: `/admin/parents/${parentId}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/inbox') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canAccessInbox(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const inbox = messagingStore.getInbox(auth.context.tenantId, auth.context);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderInboxPage(auth.context, inbox));
      return;
    }

    const inboxThreadMatch = url.pathname.match(/^\/inbox\/threads\/([^/]+)$/);
    if (request.method === 'GET' && inboxThreadMatch) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canAccessInbox(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const thread = messagingStore.getThreadForUser(auth.context.tenantId, inboxThreadMatch[1], auth.context.userId);
      if (!thread) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      if (thread === 'forbidden') {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderThreadPage(auth.context, thread));
      return;
    }

    const inboxReplyMatch = url.pathname.match(/^\/inbox\/threads\/([^/]+)\/reply$/);
    if (request.method === 'POST' && inboxReplyMatch) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canAccessInbox(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        messagingStore.addMessage(auth.context.tenantId, inboxReplyMatch[1], auth.context.userId, { body: form.get('body') });
      } catch {
        // no-op for MVP
      }

      response.writeHead(302, { location: `/inbox/threads/${inboxReplyMatch[1]}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/announcements') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canPublishAnnouncements(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const announcements = messagingStore.listAnnouncementsForUser(auth.context.tenantId, auth.context);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderAdminAnnouncementsPage(auth.context, announcements));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/announcements') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canPublishAnnouncements(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        const rolesRaw = form.get('roles');
        const roles = rolesRaw ? rolesRaw.split(',').map((entry) => entry.trim()).filter(Boolean) : [];
        messagingStore.createAnnouncement(auth.context.tenantId, auth.context, {
          title: form.get('title'),
          body: form.get('body'),
          visibility: form.get('visibility'),
          roles
        });
      } catch {
        // no-op for MVP
      }

      response.writeHead(302, { location: '/admin/announcements' });
      response.end();
      return;
    }

    if (url.pathname === '/api/v1/announcements' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const announcement = messagingStore.createAnnouncement(session.tenantId, session, payload);
        sendApiSuccess(response, announcement, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/announcements' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      sendApiSuccess(response, messagingStore.listAnnouncementsForUser(session.tenantId, session));
      return;
    }

    if (url.pathname === '/api/v1/inbox' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      sendApiSuccess(response, messagingStore.getInbox(session.tenantId, session));
      return;
    }

    if (url.pathname === '/api/v1/message-threads' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const created = messagingStore.createThread(session.tenantId, session, payload);
        sendApiSuccess(response, created, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    const messageThreadByIdMatch = url.pathname.match(/^\/api\/v1\/message-threads\/([^/]+)$/);
    if (messageThreadByIdMatch && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      const thread = messagingStore.getThreadForUser(session.tenantId, messageThreadByIdMatch[1], session.userId);
      if (!thread) {
        sendApiError(response, 404, 'NOT_FOUND', 'Thread not found');
        return;
      }

      if (thread === 'forbidden') {
        sendApiError(response, 403, 'FORBIDDEN', 'Not allowed to access this thread');
        return;
      }

      sendApiSuccess(response, thread);
      return;
    }

    const messageThreadReplyMatch = url.pathname.match(/^\/api\/v1\/message-threads\/([^/]+)\/messages$/);
    if (messageThreadReplyMatch && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const message = messagingStore.addMessage(session.tenantId, messageThreadReplyMatch[1], session.userId, payload);
        if (!message) {
          sendApiError(response, 404, 'NOT_FOUND', 'Thread not found');
          return;
        }

        if (message === 'forbidden') {
          sendApiError(response, 403, 'FORBIDDEN', 'Not allowed to reply in this thread');
          return;
        }

        sendApiSuccess(response, message, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/lesson-logs' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const saved = lessonHomeworkStore.createLessonLog(session.tenantId, {
          teacherId: session.userId,
          classRoomId: payload.classRoomId,
          subjectId: payload.subjectId,
          date: payload.date,
          content: payload.content
        });
        sendApiSuccess(response, saved, 201);
      } catch (error) {
        const status = error.message.startsWith('Teacher is not authorized') ? 403 : error.status ?? 422;
        const code = error.message.startsWith('Teacher is not authorized') ? 'FORBIDDEN' : error.code ?? 'VALIDATION_ERROR';
        requestLogger.warn('Lesson log API request failed', { module: 'lesson-homework', error: serializeError(error) });
        sendApiError(response, status, code, error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/lesson-logs' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      sendApiSuccess(response, lessonHomeworkStore.listLessonLogsForTeacher(session.tenantId, session.userId));
      return;
    }

    if (url.pathname === '/api/v1/homeworks' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const saved = lessonHomeworkStore.createHomework(session.tenantId, {
          teacherId: session.userId,
          classRoomId: payload.classRoomId,
          subjectId: payload.subjectId,
          dueDate: payload.dueDate,
          title: payload.title,
          description: payload.description
        });
        sendApiSuccess(response, saved, 201);
      } catch (error) {
        const status = error.message.startsWith('Teacher is not authorized') ? 403 : error.status ?? 422;
        const code = error.message.startsWith('Teacher is not authorized') ? 'FORBIDDEN' : error.code ?? 'VALIDATION_ERROR';
        requestLogger.warn('Homework API request failed', { module: 'lesson-homework', error: serializeError(error) });
        sendApiError(response, status, code, error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/homeworks' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT, ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      if (session.role === ROLES.TEACHER) {
        sendApiSuccess(response, lessonHomeworkStore.listHomeworksForTeacher(session.tenantId, session.userId));
        return;
      }
      if (session.role === ROLES.PARENT) {
        sendApiSuccess(response, lessonHomeworkStore.listHomeworksForParent(session.tenantId, session.userId));
        return;
      }
      if (session.role === ROLES.STUDENT) {
        sendApiSuccess(response, lessonHomeworkStore.listHomeworksForStudent(session.tenantId, session.userId));
        return;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(
        response,
        lessonHomeworkStore.homeworks.filter((item) => item.tenant_id === tenantId)
      );
      return;
    }

    if (url.pathname === '/api/v1/assessments' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const created = gradingStore.createAssessment(session.tenantId, {
          teacherId: session.userId,
          classRoomId: payload.classRoomId,
          subjectId: payload.subjectId,
          title: payload.title,
          date: payload.date,
          coefficient: payload.coefficient
        });
        sendApiSuccess(response, created, 201);
      } catch (error) {
        const status = error.message.startsWith('Teacher is not authorized') ? 403 : error.status ?? 422;
        const code = error.message.startsWith('Teacher is not authorized') ? 'FORBIDDEN' : error.code ?? 'VALIDATION_ERROR';
        requestLogger.warn('Assessment API request failed', { module: 'grading', error: serializeError(error) });
        sendApiError(response, status, code, error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/assessments' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.TEACHER, ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      if (session.role === ROLES.TEACHER) {
        sendApiSuccess(response, gradingStore.listAssessmentsForTeacher(session.tenantId, session.userId));
        return;
      }

      sendApiSuccess(
        response,
        gradingStore.assessments.filter((item) => item.tenant_id === session.tenantId)
      );
      return;
    }

    const assessmentGradeEntryMatch = url.pathname.match(/^\/api\/v1\/assessments\/([^/]+)\/grades$/);
    if (assessmentGradeEntryMatch && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const saved = gradingStore.upsertGradesForAssessment(session.tenantId, {
          teacherId: session.userId,
          assessmentId: assessmentGradeEntryMatch[1],
          entries: payload.entries
        });
        sendApiSuccess(response, saved, 201);
      } catch (error) {
        const status = error.message.startsWith('Teacher is not authorized') ? 403 : error.status ?? 422;
        const code = error.message.startsWith('Teacher is not authorized') ? 'FORBIDDEN' : error.code ?? 'VALIDATION_ERROR';
        requestLogger.warn('Assessment grades API request failed', { module: 'grading', error: serializeError(error) });
        sendApiError(response, status, code, error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/grades' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT, ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      if (session.role === ROLES.TEACHER) {
        sendApiSuccess(response, gradingStore.listGradesForTeacher(session.tenantId, session.userId));
        return;
      }
      if (session.role === ROLES.PARENT) {
        sendApiSuccess(response, gradingStore.listGradesForParent(session.tenantId, session.userId));
        return;
      }
      if (session.role === ROLES.STUDENT) {
        sendApiSuccess(response, gradingStore.listGradesForStudent(session.tenantId, session.userId));
        return;
      }

      sendApiSuccess(response, gradingStore.listGradesForTenant(session.tenantId));
      return;
    }

    if (url.pathname === '/api/v1/ai/report-comments/draft' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const generated = await generateReportCommentDraft({
          tenantId: session.tenantId,
          teacherId: session.userId,
          studentId: payload.studentId
        });
        requestLogger.info('AI draft generated', { module: 'ai', studentId: payload.studentId });
        sendApiSuccess(response, generated, 201);
      } catch (error) {
        if (error.code === 'AI_DISABLED') {
          sendApiError(response, 403, error.code, error.message);
          return;
        }
        const status = error.message.startsWith('Teacher is not authorized') ? 403 : error.status ?? 422;
        const code = error.message.startsWith('Teacher is not authorized') ? 'FORBIDDEN' : error.code ?? 'VALIDATION_ERROR';
        requestLogger.warn('AI draft generation failed', { module: 'ai', error: serializeError(error) });
        sendApiError(response, status, code, error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/report-comments' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }
      try {
        const payload = await parseJsonBody(request);
        if (payload.humanValidated !== true) {
          throw buildValidationError('humanValidated must be true before final save');
        }
        const student = studentStore.get(session.tenantId, payload.studentId, { includeArchived: false });
        const teacher = teacherStore.get(session.tenantId, session.userId, { includeArchived: false });
        if (!student || !teacher || !teacher.classRoomIds.includes(student.classRoomId)) {
          throw buildForbiddenError('Teacher is not authorized for this student');
        }
        const saved = {
          id: `report-comment-${randomUUID()}`,
          tenant_id: session.tenantId,
          teacherId: session.userId,
          studentId: payload.studentId,
          commentText: String(payload.commentText || '').trim(),
          humanValidated: true,
          created_at: new Date().toISOString()
        };
        reportComments.push(saved);
        sendApiSuccess(response, saved, 201);
      } catch (error) {
        const status = error.message.startsWith('Teacher is not authorized') ? 403 : error.status ?? 422;
        const code = error.message.startsWith('Teacher is not authorized') ? 'FORBIDDEN' : error.code ?? 'VALIDATION_ERROR';
        sendApiError(response, status, code, error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/finance/fee-plans' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }
      sendApiSuccess(response, financeStore.listFeePlans(session.tenantId));
      return;
    }

    if (url.pathname === '/api/v1/finance/fee-plans' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }
      try {
        const payload = await parseJsonBody(request);
        const feePlan = financeStore.createFeePlan(session.tenantId, payload);
        sendApiSuccess(response, feePlan, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/finance/invoices' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT, ROLES.PARENT]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      if (session.role === ROLES.PARENT) {
        sendApiSuccess(response, financeStore.listParentFinance(session.tenantId, session.userId));
        return;
      }

      sendApiSuccess(response, financeStore.listInvoices(session.tenantId));
      return;
    }

    if (url.pathname === '/api/v1/finance/invoices' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }
      try {
        const payload = await parseJsonBody(request);
        const invoice = financeStore.createInvoice(session.tenantId, payload);
        sendApiSuccess(response, invoice, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    if (url.pathname === '/api/v1/finance/payments' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }
      sendApiSuccess(response, financeStore.listPayments(session.tenantId));
      return;
    }

    if (url.pathname === '/api/v1/finance/payments' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }
      try {
        const payload = await parseJsonBody(request);
        const payment = financeStore.recordPayment(session.tenantId, payload);
        sendApiSuccess(response, payment, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    for (const handleDomainRoute of domainRouteHandlers) {
      const handled = await handleDomainRoute({ request, response, url, session });
      if (handled) {
        return;
      }
    }

    if (url.pathname === '/api/v1/audit-logs' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.SUPER_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        requestLogger.warn('Audit log access denied', { module: 'audit', status: auth.status });
        if (session) {
          auditWriter.writeAuthEvent(session, 'auth.access_denied', { path: '/api/v1/audit-logs' });
        }
        return;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      const logs = auditLogStore.listByTenant(tenantId, {
        action: url.searchParams.get('action') ?? undefined,
        targetType: url.searchParams.get('targetType') ?? undefined,
        actorUserId: url.searchParams.get('actorUserId') ?? undefined,
        limit: url.searchParams.get('limit') ?? undefined
      });
      requestLogger.info('Audit logs fetched', { module: 'audit', count: logs.length });
      sendApiSuccess(response, logs);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

module.exports = {
  createServer,
  createSeedData,
  parseCookies
};

if (require.main === module) {
  try {
    const runtimeConfig = loadRuntimeEnv(process.env);
    const server = createServer();
    server.listen(runtimeConfig.port, () => {
      // eslint-disable-next-line no-console
      console.log(`EducLink web app running on http://localhost:${runtimeConfig.port}`);
      // eslint-disable-next-line no-console
      console.log(`Runtime mode: ${runtimeConfig.nodeEnv} | persistence: ${runtimeConfig.persistenceMode}`);
    });

    process.on('SIGTERM', async () => {
      await closePool();
      server.close();
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    process.exitCode = 1;
  }
}
