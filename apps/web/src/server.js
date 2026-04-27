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
const { getPool, closePool } = require('../../../packages/database/src/client');
const { loadRuntimeEnv } = require('../../../packages/core/src/runtime-env');
const { PostgresCoreSchoolRepository } = require('./modules/persistence/postgres-core-school-repository');
const { PostgresStudentRepository } = require('./modules/persistence/postgres-student-repository');
const { PostgresParentRepository } = require('./modules/persistence/postgres-parent-repository');
const { PostgresTeacherRepository } = require('./modules/persistence/postgres-teacher-repository');
const { PostgresAttendanceRepository } = require('./modules/persistence/postgres-attendance-repository');
const { PostgresGradingRepository } = require('./modules/persistence/postgres-grading-repository');
const { PostgresMessagingRepository } = require('./modules/persistence/postgres-messaging-repository');
const { PostgresFinanceRepository } = require('./modules/persistence/postgres-finance-repository');
const { buildValidationError, buildForbiddenError } = require('./modules/error-utils');

const users = [
  { id: 'super-admin', email: 'superadmin@platform.test', password: 'password123', role: ROLES.SUPER_ADMIN, tenantId: null },
  { id: 'admin-a', email: 'admin@school-a.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-a' },
  { id: 'admin-b', email: 'admin@school-b.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-b' },
  { id: 'director-a', email: 'director@school-a.test', password: 'password123', role: ROLES.DIRECTOR, tenantId: 'school-a' },
  { id: 'teacher-a1', email: 'teacher@school-a.test', password: 'password123', role: ROLES.TEACHER, tenantId: 'school-a' },
  { id: 'teacher-a2', email: 'teacher2@school-a.test', password: 'password123', role: ROLES.TEACHER, tenantId: 'school-a' },
  { id: 'parent-a1', email: 'parent@school-a.test', password: 'password123', role: ROLES.PARENT, tenantId: 'school-a' },
  { id: 'parent-a2', email: 'parent2@school-a.test', password: 'password123', role: ROLES.PARENT, tenantId: 'school-a' },
  { id: 'student-a1', email: 'student@school-a.test', password: 'password123', role: ROLES.STUDENT, tenantId: 'school-a' },
  { id: 'accountant-a', email: 'accountant@school-a.test', password: 'password123', role: ROLES.ACCOUNTANT, tenantId: 'school-a' }
];

function createSeedData() {
  const now = new Date().toISOString();
  return {
    classRooms: [
      { id: 'class-a1', tenant_id: 'school-a', name: '6ème A', gradeLevelId: 'grade-a-1', capacity: 32 },
      { id: 'class-a2', tenant_id: 'school-a', name: '6ème B', gradeLevelId: 'grade-a-1', capacity: 30 },
      { id: 'class-a3', tenant_id: 'school-a', name: '5ème A', gradeLevelId: 'grade-a-2', capacity: 30 },
      { id: 'class-b1', tenant_id: 'school-b', name: 'B1', gradeLevelId: 'grade-b-1', capacity: 30 }
    ],
    subjects: [
      { id: 'subject-a-math', tenant_id: 'school-a', name: 'Mathématiques', code: 'MATH' },
      { id: 'subject-a-fr', tenant_id: 'school-a', name: 'Français', code: 'FR' },
      { id: 'subject-a-eng', tenant_id: 'school-a', name: 'Anglais', code: 'ENG' },
      { id: 'subject-a-sci', tenant_id: 'school-a', name: 'Sciences', code: 'SCI' },
      { id: 'subject-a-his', tenant_id: 'school-a', name: 'Histoire-Géo', code: 'HIST' },
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
        created_at: now,
        updated_at: now
      },
      {
        id: 'student-a3',
        tenant_id: 'school-a',
        firstName: 'Yanis',
        lastName: 'Nadir',
        admissionNumber: 'A-003',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-08-14',
        archived_at: null,
        created_at: now,
        updated_at: now
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
        created_at: now,
        updated_at: now
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
        created_at: now,
        updated_at: now
      },
      {
        id: 'student-a4',
        tenant_id: 'school-a',
        firstName: 'Ines',
        lastName: 'Brahim',
        admissionNumber: 'A-004',
        classRoomId: 'class-a2',
        dateOfBirth: '2014-01-19',
        archived_at: null,
        created_at: now,
        updated_at: now
      },
      {
        id: 'student-a5',
        tenant_id: 'school-a',
        firstName: 'Rayan',
        lastName: 'Kaci',
        admissionNumber: 'A-005',
        classRoomId: 'class-a3',
        dateOfBirth: '2012-11-07',
        archived_at: null,
        created_at: now,
        updated_at: now
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
        address: '12 Avenue Centrale, Alger',
        notes: 'Disponible après 18h.',
        archived_at: null,
        created_at: now,
        updated_at: now
      },
      {
        id: 'parent-a2',
        tenant_id: 'school-a',
        firstName: 'Karim',
        lastName: 'Brahim',
        phone: '+1 555-0188',
        email: 'parent2@school-a.test',
        address: '4 Rue des Orangers, Alger',
        notes: 'Préfère les échanges via inbox.',
        archived_at: null,
        created_at: now,
        updated_at: now
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
        created_at: now,
        updated_at: now
      },
      {
        id: 'splink-a2',
        tenant_id: 'school-a',
        parentId: 'parent-a1',
        studentId: 'student-a2',
        relationship: 'mother',
        isPrimaryContact: false,
        created_at: now,
        updated_at: now
      },
      {
        id: 'splink-a3',
        tenant_id: 'school-a',
        parentId: 'parent-a2',
        studentId: 'student-a2',
        relationship: 'father',
        isPrimaryContact: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'splink-a4',
        tenant_id: 'school-a',
        parentId: 'parent-a2',
        studentId: 'student-a4',
        relationship: 'father',
        isPrimaryContact: false,
        created_at: now,
        updated_at: now
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
        notes: 'Prof principale de 6ème A, référente évaluations.',
        classRoomIds: ['class-a1'],
        subjectIds: ['subject-a-math'],
        archived_at: null,
        created_at: now,
        updated_at: now
      },
      {
        id: 'teacher-a2',
        tenant_id: 'school-a',
        firstName: 'Youssef',
        lastName: 'Mansouri',
        email: 'teacher2@school-a.test',
        phone: '+1 555-0111',
        notes: 'Référent FR/Histoire/Sciences pour 6ème B et 5ème A.',
        classRoomIds: ['class-a2', 'class-a3'],
        subjectIds: ['subject-a-fr', 'subject-a-his', 'subject-a-sci'],
        archived_at: null,
        created_at: now,
        updated_at: now
      }
    ],
    attendanceRecords: [
      { id: 'attendance-a1-2026-04-20-s1', tenant_id: 'school-a', date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a1', teacherId: 'teacher-a1', status: 'present', created_at: now, updated_at: now },
      { id: 'attendance-a1-2026-04-20-s3', tenant_id: 'school-a', date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a3', teacherId: 'teacher-a1', status: 'late', created_at: now, updated_at: now },
      { id: 'attendance-a2-2026-04-20-s2', tenant_id: 'school-a', date: '2026-04-20', classRoomId: 'class-a2', studentId: 'student-a2', teacherId: 'teacher-a2', status: 'present', created_at: now, updated_at: now },
      { id: 'attendance-a2-2026-04-20-s4', tenant_id: 'school-a', date: '2026-04-20', classRoomId: 'class-a2', studentId: 'student-a4', teacherId: 'teacher-a2', status: 'absent', created_at: now, updated_at: now }
    ],
    lessonLogs: [
      { id: 'lesson-a1-math-2026-04-18', tenant_id: 'school-a', classRoomId: 'class-a1', subjectId: 'subject-a-math', teacherId: 'teacher-a1', date: '2026-04-18', content: 'Fractions équivalentes et exercices guidés.', created_at: now, updated_at: now },
      { id: 'lesson-a2-sci-2026-04-17', tenant_id: 'school-a', classRoomId: 'class-a2', subjectId: 'subject-a-sci', teacherId: 'teacher-a2', date: '2026-04-17', content: 'Cycle de l’eau + schéma à compléter.', created_at: now, updated_at: now }
    ],
    homeworks: [
      { id: 'homework-a1-math-2026-04-22', tenant_id: 'school-a', assignedDate: '2026-04-18', dueDate: '2026-04-22', classRoomId: 'class-a1', subjectId: 'subject-a-math', teacherId: 'teacher-a1', title: 'Exercices fractions p.42', description: 'Faire ex. 3, 4 et 8. Vérifier les étapes de simplification.', created_at: now, updated_at: now },
      { id: 'homework-a2-sci-2026-04-23', tenant_id: 'school-a', assignedDate: '2026-04-17', dueDate: '2026-04-23', classRoomId: 'class-a2', subjectId: 'subject-a-sci', teacherId: 'teacher-a2', title: 'Mini compte-rendu', description: 'Rédiger 8 lignes sur le cycle de l’eau + un schéma.', created_at: now, updated_at: now }
    ],
    assessments: [
      { id: 'assessment-a1-math-2026-04-15', tenant_id: 'school-a', classRoomId: 'class-a1', subjectId: 'subject-a-math', teacherId: 'teacher-a1', title: 'Contrôle fractions', date: '2026-04-15', coefficient: 2, created_at: now, updated_at: now },
      { id: 'assessment-a2-sci-2026-04-16', tenant_id: 'school-a', classRoomId: 'class-a2', subjectId: 'subject-a-sci', teacherId: 'teacher-a2', title: 'Quiz sciences', date: '2026-04-16', coefficient: 1, created_at: now, updated_at: now }
    ],
    gradeEntries: [
      { id: 'grade-a1-fractions-aya', tenant_id: 'school-a', assessmentId: 'assessment-a1-math-2026-04-15', classRoomId: 'class-a1', subjectId: 'subject-a-math', teacherId: 'teacher-a1', studentId: 'student-a1', date: '2026-04-15', score: 15.5, remark: 'Bonne maîtrise, attention aux détails.', created_at: now, updated_at: now },
      { id: 'grade-a1-fractions-yanis', tenant_id: 'school-a', assessmentId: 'assessment-a1-math-2026-04-15', classRoomId: 'class-a1', subjectId: 'subject-a-math', teacherId: 'teacher-a1', studentId: 'student-a3', date: '2026-04-15', score: 12.25, remark: 'Résultats corrects, revoir la méthode.', created_at: now, updated_at: now },
      { id: 'grade-a2-sci-salim', tenant_id: 'school-a', assessmentId: 'assessment-a2-sci-2026-04-16', classRoomId: 'class-a2', subjectId: 'subject-a-sci', teacherId: 'teacher-a2', studentId: 'student-a2', date: '2026-04-16', score: 14, remark: 'Participation active en classe.', created_at: now, updated_at: now },
      { id: 'grade-a2-sci-ines', tenant_id: 'school-a', assessmentId: 'assessment-a2-sci-2026-04-16', classRoomId: 'class-a2', subjectId: 'subject-a-sci', teacherId: 'teacher-a2', studentId: 'student-a4', date: '2026-04-16', score: 10.5, remark: 'Peut progresser avec plus de rigueur.', created_at: now, updated_at: now }
    ],
    announcements: [
      { id: 'announcement-a1', tenant_id: 'school-a', title: 'Portes ouvertes samedi', body: 'Accueil des familles samedi à 10h. Merci de confirmer la présence.', visibility: 'global', roles: [], authorId: 'admin-a', authorRole: ROLES.SCHOOL_ADMIN, created_at: now, updated_at: now },
      { id: 'announcement-a2', tenant_id: 'school-a', title: 'Rappel documents scolarité', body: 'Parents: merci de déposer les dossiers avant le 30 avril.', visibility: 'roles', roles: [ROLES.PARENT], authorId: 'admin-a', authorRole: ROLES.SCHOOL_ADMIN, created_at: now, updated_at: now }
    ],
    messageThreads: [
      { id: 'thread-demo-parent-followup', tenant_id: 'school-a', subject: 'Suivi Salim Brahim - Devoirs', participantIds: ['admin-a', 'teacher-a2', 'parent-a2'], createdByUserId: 'teacher-a2', created_at: '2026-04-19T08:15:00.000Z', updated_at: '2026-04-20T10:45:00.000Z', last_message_at: '2026-04-20T10:45:00.000Z' }
    ],
    messages: [
      { id: 'message-demo-1', tenant_id: 'school-a', threadId: 'thread-demo-parent-followup', senderId: 'teacher-a2', body: 'Bonjour, Salim progresse bien en sciences. Merci de vérifier le compte-rendu.', created_at: '2026-04-19T08:15:00.000Z' },
      { id: 'message-demo-2', tenant_id: 'school-a', threadId: 'thread-demo-parent-followup', senderId: 'parent-a2', body: 'Merci, nous allons revoir cela ce soir.', created_at: '2026-04-19T19:05:00.000Z' },
      { id: 'message-demo-3', tenant_id: 'school-a', threadId: 'thread-demo-parent-followup', senderId: 'admin-a', body: 'Parfait, je reste disponible en cas de besoin.', created_at: '2026-04-20T10:45:00.000Z' }
    ],
    auditLogs: [
      { id: 'audit-demo-1', tenant_id: 'school-a', actorUserId: 'admin-a', actorRole: ROLES.SCHOOL_ADMIN, eventType: 'student.created', entityType: 'student', entityId: 'student-a5', metadata: { source: 'seed-demo' }, created_at: now },
      { id: 'audit-demo-2', tenant_id: 'school-a', actorUserId: 'teacher-a1', actorRole: ROLES.TEACHER, eventType: 'attendance.updated', entityType: 'attendance', entityId: 'attendance-a1-2026-04-20-s1', metadata: { source: 'seed-demo' }, created_at: now }
    ],
    feePlans: [
      { id: 'feeplan-a-tuition-t3', tenant_id: 'school-a', name: 'Scolarité T3', amountDue: 320, dueDate: '2026-05-10', description: 'Frais de scolarité troisième trimestre.', created_at: now, updated_at: now },
      { id: 'feeplan-a-canteen-apr', tenant_id: 'school-a', name: 'Cantine avril', amountDue: 95, dueDate: '2026-04-30', description: 'Abonnement mensuel cantine.', created_at: now, updated_at: now }
    ],
    invoices: [
      { id: 'invoice-a1-tuition', tenant_id: 'school-a', studentId: 'student-a1', feePlanId: 'feeplan-a-tuition-t3', amountDue: 320, dueDate: '2026-05-10', description: 'Scolarité Aya Nadir - T3', created_at: now, updated_at: now },
      { id: 'invoice-a3-canteen', tenant_id: 'school-a', studentId: 'student-a3', feePlanId: 'feeplan-a-canteen-apr', amountDue: 95, dueDate: '2026-04-30', description: 'Cantine Yanis Nadir - Avril', created_at: now, updated_at: now },
      { id: 'invoice-a2-tuition', tenant_id: 'school-a', studentId: 'student-a2', feePlanId: 'feeplan-a-tuition-t3', amountDue: 320, dueDate: '2026-05-10', description: 'Scolarité Salim Brahim - T3', created_at: now, updated_at: now }
    ],
    payments: [
      { id: 'payment-a1-partial', tenant_id: 'school-a', invoiceId: 'invoice-a1-tuition', studentId: 'student-a1', amountPaid: 120, paidAt: '2026-04-12', method: 'card', note: 'Acompte', created_at: now, updated_at: now },
      { id: 'payment-a3-full', tenant_id: 'school-a', invoiceId: 'invoice-a3-canteen', studentId: 'student-a3', amountPaid: 95, paidAt: '2026-04-10', method: 'bank_transfer', note: 'Réglé en totalité', created_at: now, updated_at: now }
    ]
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

const DESIGN_SYSTEM_CSS = `
:root {
  --el-color-primary-blue: #2563eb;
  --el-color-dark-blue: #1e3a8a;
  --el-color-primary-green: #22c55e;
  --el-color-primary-purple: #7c3aed;
  --el-color-soft-green: #4ade80;
  --el-color-soft-purple: #a78bfa;
  --el-color-bg: #f9fafb;
  --el-color-surface: #ffffff;
  --el-color-text: #111827;
  --el-color-text-secondary: #687280;
  --el-color-border: #e5e7eb;
  --el-color-danger: #dc2626;
  --el-gradient-brand: linear-gradient(95deg, #22c55e 0%, #2563eb 52%, #7c3aed 100%);
  --el-radius-sm: 6px;
  --el-radius-md: 10px;
  --el-radius-lg: 14px;
  --el-shadow-sm: 0 1px 2px rgba(17, 24, 39, 0.06);
  --el-shadow-md: 0 10px 18px rgba(17, 24, 39, 0.08);
  --el-space-1: 0.25rem;
  --el-space-2: 0.5rem;
  --el-space-3: 0.75rem;
  --el-space-4: 1rem;
  --el-space-5: 1.25rem;
  --el-space-6: 1.5rem;
  --el-space-8: 2rem;
  --el-text-xs: 0.75rem;
  --el-text-sm: 0.875rem;
  --el-text-base: 1rem;
  --el-text-lg: 1.125rem;
  --el-text-xl: 1.25rem;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  font-family: Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: var(--el-text-base);
  line-height: 1.5;
  color: var(--el-color-text);
  background-color: var(--el-color-bg);
}

h1, h2, h3 { margin: 0 0 var(--el-space-3); line-height: 1.25; color: var(--el-color-dark-blue); }
p, ul, ol { margin: 0 0 var(--el-space-4); }
a { color: var(--el-color-primary-blue); text-decoration: none; }
a:hover { text-decoration: underline; }
code { padding: 0 var(--el-space-1); border-radius: var(--el-radius-sm); background-color: #eff6ff; }

form { margin: 0; }
label { display: inline-flex; flex-direction: column; gap: var(--el-space-1); margin-bottom: var(--el-space-3); font-size: var(--el-text-sm); color: var(--el-color-text-secondary); }
input, textarea, select {
  min-width: 16rem;
  max-width: 100%;
  padding: var(--el-space-2) var(--el-space-3);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-md);
  background-color: var(--el-color-surface);
  color: var(--el-color-text);
}

button {
  border: 1px solid transparent;
  border-radius: var(--el-radius-md);
  padding: var(--el-space-2) var(--el-space-4);
  font-weight: 600;
  background: var(--el-gradient-brand);
  color: var(--el-color-surface);
  box-shadow: var(--el-shadow-sm);
  cursor: pointer;
}

button:hover { filter: brightness(1.03); }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible {
  outline: 2px solid var(--el-color-primary-blue);
  outline-offset: 2px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: var(--el-space-4);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-md);
  overflow: hidden;
  background-color: var(--el-color-surface);
}

th, td {
  border: 1px solid var(--el-color-border);
  padding: var(--el-space-2) var(--el-space-3);
  text-align: left;
  vertical-align: top;
}

th { font-size: var(--el-text-sm); background-color: #eef2ff; color: var(--el-color-dark-blue); }

.el-shell {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--el-space-6);
  margin-top: var(--el-space-6);
  margin-bottom: var(--el-space-6);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  box-shadow: var(--el-shadow-md);
  background: var(--el-color-surface);
}

.el-badge {
  display: inline-block;
  padding: 0.125rem var(--el-space-2);
  border-radius: 999px;
  font-size: var(--el-text-xs);
  color: var(--el-color-dark-blue);
  background-color: #dbeafe;
}

.el-error {
  color: var(--el-color-danger);
  font-weight: 600;
}

.el-app-shell {
  min-height: 100vh;
  display: flex;
}

.el-sidebar {
  width: 260px;
  border-right: 1px solid var(--el-color-border);
  background: var(--el-color-surface);
  padding: var(--el-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--el-space-5);
}

.el-sidebar-brand {
  padding: var(--el-space-4);
  border-radius: var(--el-radius-md);
  background: #f8fafc;
  box-shadow: var(--el-shadow-sm);
}

.el-brand-title {
  margin: 0 0 var(--el-space-1);
  font-weight: 700;
  color: var(--el-color-dark-blue);
}

.el-brand-subtitle {
  margin: 0;
  font-size: var(--el-text-xs);
  color: var(--el-color-text-secondary);
}

.el-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: var(--el-space-1);
}

.el-nav-link {
  display: block;
  padding: var(--el-space-2) var(--el-space-3);
  border-radius: var(--el-radius-md);
  font-weight: 500;
  color: var(--el-color-text-secondary);
}

.el-nav-link:hover {
  text-decoration: none;
  background: #eef2ff;
  color: var(--el-color-dark-blue);
}

.el-nav-link.is-active {
  background: #dbeafe;
  color: var(--el-color-dark-blue);
}

.el-sidebar-gradient {
  margin-top: auto;
  height: 6px;
  border-radius: 999px;
  background: var(--el-gradient-brand);
}

.el-app-main {
  flex: 1;
  padding: var(--el-space-6);
}

.el-app-header {
  display: flex;
  justify-content: space-between;
  gap: var(--el-space-4);
  padding: var(--el-space-4);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  background: var(--el-color-surface);
  box-shadow: var(--el-shadow-sm);
}

.el-header-school {
  margin: 0;
  font-size: var(--el-text-sm);
  color: var(--el-color-text-secondary);
}

.el-header-title {
  margin: var(--el-space-1) 0 0;
}

.el-user-box {
  text-align: right;
}

.el-user-name, .el-user-email {
  margin: 0;
  font-size: var(--el-text-sm);
}

.el-user-email {
  color: var(--el-color-text-secondary);
}

.el-dashboard-content {
  margin-top: var(--el-space-5);
  display: grid;
  gap: var(--el-space-4);
}

.el-card {
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  background: var(--el-color-surface);
  box-shadow: var(--el-shadow-sm);
  padding: var(--el-space-4);
}

.el-metric-grid {
  display: grid;
  gap: var(--el-space-3);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.el-metric {
  padding: var(--el-space-3);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-md);
  background: #f8fafc;
}

.el-metric-label {
  margin: 0;
  color: var(--el-color-text-secondary);
  font-size: var(--el-text-sm);
}

.el-metric-value {
  margin: var(--el-space-1) 0 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--el-color-dark-blue);
}

.el-split-grid {
  display: grid;
  gap: var(--el-space-4);
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.el-quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--el-space-2);
}

.el-empty-state {
  margin: 0;
  color: var(--el-color-text-secondary);
  font-style: italic;
}

.el-page-intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--el-space-3);
}

.el-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--el-space-3);
  align-items: end;
}

.el-toolbar label {
  margin: 0;
}

.el-status {
  display: inline-block;
  padding: 0.125rem var(--el-space-2);
  border-radius: 999px;
  font-size: var(--el-text-xs);
  font-weight: 600;
}

.el-status.is-success { background: #dcfce7; color: #166534; }
.el-status.is-warning { background: #fef3c7; color: #92400e; }
.el-status.is-danger { background: #fee2e2; color: #991b1b; }
.el-status.is-info { background: #dbeafe; color: #1e3a8a; }

@media (max-width: 920px) {
  .el-app-shell {
    flex-direction: column;
  }

  .el-sidebar {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--el-color-border);
  }

  .el-app-header {
    flex-direction: column;
  }

  .el-user-box {
    text-align: left;
  }
}
`;

function renderPageHead(title) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/assets/design-system.css">`;
}

function renderLoginPage(errorMessage = '') {
  return `<!doctype html><html lang="fr"><head>${renderPageHead('EducLink - Login')}</head><body><main class="el-shell">
    <h1>Connexion EducLink <span class="el-badge">V3 Foundations</span></h1>
    ${errorMessage ? `<p class="el-error">${errorMessage}</p>` : ''}
    <p><strong>Démo pilot-ready:</strong> utilisez les comptes seedés ci-dessous (mot de passe unique: <code>password123</code>).</p>
    <ul>
      <li>Admin: <code>admin@school-a.test</code></li>
      <li>Teacher: <code>teacher@school-a.test</code></li>
      <li>Parent: <code>parent@school-a.test</code></li>
    </ul>
    <p><a href="/demo">Voir le guide de démo complet (tous les comptes + enchaînement recommandé)</a></p>
    <form method="POST" action="/login">
      <label>Email <input type="email" name="email" required /></label><br/>
      <label>Mot de passe <input type="password" name="password" required /></label><br/>
      <button type="submit">Se connecter</button>
    </form>
  </main></body></html>`;
}

function renderDemoGuidePage() {
  return `<!doctype html><html lang="fr"><head>${renderPageHead('Guide de démonstration EducLink')}</head><body><main class="el-shell">
    <h1>Guide de démonstration EducLink</h1>
    <p>Objectif: dérouler une démo complète et stable en <strong>15-20 minutes</strong>, sans connaissance cachée.</p>
    <p>Tenant principal recommandé: <strong>school-a</strong> (jeu de données réaliste préchargé).</p>
    <p>Mot de passe pour tous les comptes de démo: <code>password123</code>.</p>
    <p>Règle de changement de rôle: <strong>Logout</strong> puis reconnectez-vous avec un autre compte via <a href="/login">/login</a>.</p>
    <h2>Démarrage rapide (sans explication développeur)</h2>
    <ol>
      <li>Ouvrez <a href="/login">/login</a> et connectez-vous avec le compte de l'étape 1 (Admin).</li>
      <li>Suivez les sections ci-dessous dans l'ordre (Admin → Teacher → Parent).</li>
      <li>En cas de doute, revenez ici via <a href="/demo">/demo</a> pour reprendre au prochain rôle.</li>
    </ol>

    <h2>Comptes de démo (visibilité rapide)</h2>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>Rôle</th><th>Email</th><th>Entrée recommandée</th></tr></thead>
      <tbody>
        <tr><td>School Admin</td><td><code>admin@school-a.test</code></td><td><a href="/dashboard/admin">/dashboard/admin</a></td></tr>
        <tr><td>Teacher</td><td><code>teacher@school-a.test</code></td><td><a href="/dashboard/teacher">/dashboard/teacher</a></td></tr>
        <tr><td>Parent</td><td><code>parent@school-a.test</code></td><td><a href="/dashboard/parent">/dashboard/parent</a></td></tr>
        <tr><td>Student</td><td><code>student@school-a.test</code></td><td><a href="/dashboard/student">/dashboard/student</a></td></tr>
        <tr><td>Accountant</td><td><code>accountant@school-a.test</code></td><td><a href="/dashboard/accountant">/dashboard/accountant</a></td></tr>
        <tr><td>Director</td><td><code>director@school-a.test</code></td><td><a href="/dashboard/director">/dashboard/director</a></td></tr>
      </tbody>
    </table>
    <p>Conseil pratique: gardez cette page ouverte dans un onglet pour copier rapidement les emails.</p>

    <h2>Navigation démo par étapes</h2>
    <p>
      Aller directement à:
      <a href="#step-admin">Admin</a> ·
      <a href="#step-teacher">Teacher</a> ·
      <a href="#step-parent">Parent</a> ·
      <a href="#step-student">Student</a> ·
      <a href="#step-accountant">Accountant</a> ·
      <a href="#step-director">Director</a>
    </p>

    <h3 id="step-admin">1) School Admin (5 min)</h3>
    <ol>
      <li>Ouvrir le <a href="/dashboard/admin">dashboard admin</a> puis vérifier les métriques globales.</li>
      <li>Cliquer ensuite: <a href="/admin/students">élèves</a> → <a href="/admin/parents">responsables</a> → <a href="/admin/teachers">enseignants</a>.</li>
      <li>Finir par <a href="/admin/finance">finance</a>, <a href="/admin/attendance">attendance</a> puis <a href="/inbox">inbox</a>.</li>
    </ol>
    <p><strong>Ensuite:</strong> Logout puis reconnectez-vous en Teacher. <a href="#step-teacher">Passer à l'étape Teacher</a>.</p>

    <h3 id="step-teacher">2) Teacher (5 min)</h3>
    <ol>
      <li>Aller sur <a href="/dashboard/teacher">dashboard teacher</a>.</li>
      <li>Faire l'appel via <a href="/teacher/attendance">/teacher/attendance</a> (classe assignée uniquement).</li>
      <li>Montrer les contenus de cours via <a href="/teacher/lesson-homework">lesson/homework</a> puis les notes via <a href="/teacher/grades">grades</a>.</li>
      <li>Option IA: ouvrir <a href="/teacher/report-comments">report-comments</a> et générer un brouillon.</li>
    </ol>
    <p><strong>Ensuite:</strong> Logout puis reconnectez-vous en Parent. <a href="#step-parent">Passer à l'étape Parent</a>.</p>

    <h3 id="step-parent">3) Parent (4 min)</h3>
    <ol>
      <li>Ouvrir <a href="/dashboard/parent">dashboard parent</a>.</li>
      <li>Suivre l'ordre: <a href="/parent/homeworks">devoirs</a> → <a href="/parent/grades">notes</a> → <a href="/parent/finance">finance</a> → <a href="/inbox">inbox</a>.</li>
    </ol>
    <p><strong>Ensuite:</strong> Student (optionnel), puis Accountant/Director selon audience.</p>

    <h3 id="step-student">4) Student (2 min, si inclus)</h3>
    <ol>
      <li>Ouvrir <a href="/dashboard/student">dashboard student</a>.</li>
      <li>Montrer <a href="/student/homeworks">devoirs</a> puis <a href="/student/grades">notes</a>.</li>
    </ol>

    <h3 id="step-accountant">5) Accountant (2 min, optionnel)</h3>
    <ol>
      <li>Ouvrir <a href="/dashboard/accountant">dashboard accountant</a> puis <a href="/admin/finance">finance</a>.</li>
    </ol>

    <h3 id="step-director">6) Director (1-2 min, optionnel)</h3>
    <ol>
      <li>Ouvrir <a href="/dashboard/director">dashboard director</a> pour une vue de pilotage synthétique.</li>
      <li>Utiliser ce rôle surtout pour présenter la vision direction, pas pour les actions d'administration détaillées.</li>
    </ol>

    <h2>Conseils anti-friction</h2>
    <ul>
      <li>Si une page renvoie 403, vérifiez le rôle connecté et revenez au compte recommandé.</li>
      <li>Si une liste semble vide, revenez au dashboard du rôle puis relancez le lien depuis cette page (évite les routes non pertinentes pour le rôle).</li>
      <li>Si vous perdez le fil, retournez au guide <a href="/demo">/demo</a> depuis n'importe quel dashboard.</li>
      <li>Les routes sensibles sont volontairement cloisonnées par rôle (comportement attendu en démo).</li>
    </ul>

    <p><a href="/login">Aller à la connexion</a></p>
  </main></body></html>`;
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

function getRoleLabel(role) {
  const labels = {
    [ROLES.SCHOOL_ADMIN]: 'School Admin',
    [ROLES.DIRECTOR]: 'Director',
    [ROLES.TEACHER]: 'Teacher',
    [ROLES.PARENT]: 'Parent',
    [ROLES.STUDENT]: 'Student',
    [ROLES.ACCOUNTANT]: 'Finance',
    [ROLES.SUPER_ADMIN]: 'Super Admin'
  };

  return labels[role] ?? role;
}

function getTenantLabel(tenantId) {
  if (!tenantId) {
    return 'Plateforme EducLink';
  }

  const tenantNames = {
    'school-a': 'École School A',
    'school-b': 'École School B'
  };

  return tenantNames[tenantId] ?? tenantId;
}

function getSessionIdentity(session) {
  const matchedUser = users.find((user) => user.id === session.userId);
  return {
    displayName: matchedUser?.id ?? session.userId,
    email: matchedUser?.email ?? `${session.userId}@educ.link`,
    roleLabel: getRoleLabel(session.role),
    tenantLabel: getTenantLabel(session.tenantId)
  };
}

function buildDashboardNavigation(session, currentPath = '') {
  const navItems = [
    { label: 'Dashboard', href: getDashboardPathForRole(session.role), roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT, ROLES.ACCOUNTANT] },
    { label: 'Élèves', href: '/admin/students', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT] },
    { label: 'Enseignants', href: '/admin/teachers', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR] },
    { label: 'Classes', href: '/admin/students', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER] },
    { label: 'Présences', href: session.role === ROLES.TEACHER ? '/teacher/attendance' : '/admin/attendance', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER] },
    { label: 'Notes', href: session.role === ROLES.TEACHER ? '/teacher/grades' : session.role === ROLES.PARENT ? '/parent/grades' : '/student/grades', roles: [ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT] },
    { label: 'Messagerie', href: '/inbox', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT] },
    { label: 'Finance', href: session.role === ROLES.PARENT ? '/parent/finance' : '/admin/finance', roles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT, ROLES.PARENT] },
    { label: 'Démo', href: '/demo', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT, ROLES.ACCOUNTANT] }
  ];

  return navItems
    .filter((item) => item.roles.includes(session.role))
    .map((item) => `<a class="el-nav-link ${currentPath === item.href ? 'is-active' : ''}" href="${item.href}">${item.label}</a>`)
    .join('');
}

function renderDashboardLayout(title, session, body) {
  const identity = getSessionIdentity(session);
  const currentPath = getDashboardPathForRole(session.role);
  const navigation = buildDashboardNavigation(session, currentPath);

  return `<!doctype html><html lang="fr"><head>${renderPageHead(title)}</head><body><div class="el-app-shell">
    <aside class="el-sidebar">
      <div class="el-sidebar-brand">
        <p class="el-brand-title">🎓 EducLink</p>
        <p class="el-brand-subtitle">L’école connectée, intelligente et simplifiée</p>
      </div>
      <nav class="el-sidebar-nav">${navigation}</nav>
      <div class="el-sidebar-gradient"></div>
    </aside>
    <div class="el-app-main">
      <header class="el-app-header">
        <div>
          <p class="el-header-school">${identity.tenantLabel}</p>
          <h1 class="el-header-title">${title}</h1>
        </div>
        <div class="el-user-box">
          <p class="el-user-name">${identity.displayName}</p>
          <p class="el-user-email">${identity.email}</p>
          <p><span class="el-badge">${identity.roleLabel}</span></p>
          <form method="POST" action="/logout"><button type="submit">Logout</button></form>
        </div>
      </header>
      <main class="el-dashboard-content">
        ${body}
      </main>
    </div>
  </div></body></html>`;
}

function summarizeAttendance(records) {
  const summary = { total: records.length, present: 0, late: 0, absent: 0 };
  for (const record of records) {
    if (record.status === 'present') {
      summary.present += 1;
    } else if (record.status === 'late') {
      summary.late += 1;
    } else if (record.status === 'absent') {
      summary.absent += 1;
    }
  }
  return summary;
}

function summarizeFinance(invoices, payments) {
  const totalDue = invoices.reduce((sum, invoice) => sum + Number(invoice.amountDue || 0), 0);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  return {
    invoiceCount: invoices.length,
    totalDue: Number(totalDue.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    remainingBalance: Number(Math.max(0, totalDue - totalPaid).toFixed(2))
  };
}

function formatCurrency(amount) {
  return `${Number(amount || 0).toFixed(2)} €`;
}

function renderStatusBadge(value, mapper = {}) {
  const normalized = String(value || '').toLowerCase();
  const tone = mapper[normalized] ?? 'is-info';
  return `<span class="el-status ${tone}">${escapeHtml(String(value || '-'))}</span>`;
}

function toDashboardTimestampLabel(rawTimestamp) {
  if (!rawTimestamp) {
    return 'date inconnue';
  }
  const date = new Date(rawTimestamp);
  if (Number.isNaN(date.getTime())) {
    return rawTimestamp;
  }
  return date.toISOString().slice(0, 10);
}

function buildRecentActivity(logs, tenantId, limit = 5) {
  return logs
    .filter((entry) => (entry.tenantId ?? entry.tenant_id) === tenantId)
    .sort((a, b) => String(b.timestamp ?? b.created_at ?? '').localeCompare(String(a.timestamp ?? a.created_at ?? '')))
    .slice(0, limit)
    .map((entry) => ({
      action: entry.action ?? entry.eventType ?? 'event',
      actorRole: entry.actorRole ?? entry.actor_role ?? 'system',
      targetId: entry.targetId ?? entry.entityId ?? null,
      timestampLabel: toDashboardTimestampLabel(entry.timestamp ?? entry.created_at)
    }));
}

function renderMetricCard(label, value) {
  return `<div class="el-metric"><p class="el-metric-label">${label}</p><p class="el-metric-value">${value}</p></div>`;
}

function renderAdminDashboard(session, dashboard) {
  const attendance = dashboard.attendanceSummary;
  const finance = dashboard.financeSummary;
  const recentActivityItems = dashboard.recentActivity.length
    ? `<ul>${dashboard.recentActivity
        .map(
          (entry) =>
            `<li><strong>${entry.action}</strong> · ${entry.actorRole} · ${entry.timestampLabel}${entry.targetId ? ` · ${entry.targetId}` : ''}</li>`
        )
        .join('')}</ul>`
    : '<p class="el-empty-state">Aucune activité récente.</p>';

  return renderDashboardLayout(
    'Dashboard Admin',
    session,
    `<section class="el-card">
      <h2>Synthèse établissement</h2>
      <div class="el-metric-grid">
        ${renderMetricCard('Classes actives', dashboard.metrics.classRoomsCount)}
        ${renderMetricCard('Élèves actifs', dashboard.metrics.studentsCount)}
        ${renderMetricCard('Responsables actifs', dashboard.metrics.parentsCount)}
        ${renderMetricCard('Enseignants actifs', dashboard.metrics.teachersCount)}
      </div>
    </section>
    <section class="el-card">
      <h2>Attendance summary</h2>
      <div class="el-metric-grid">
        ${renderMetricCard('Présences enregistrées', attendance.total)}
        ${renderMetricCard('Présents', attendance.present)}
        ${renderMetricCard('En retard', attendance.late)}
        ${renderMetricCard('Absents', attendance.absent)}
      </div>
    </section>
    <section class="el-card">
      <h2>Finance summary</h2>
      ${
        finance.invoiceCount === 0
          ? '<p class="el-empty-state">Aucune donnée finance disponible.</p>'
          : `<div class="el-metric-grid">
              ${renderMetricCard('Factures', finance.invoiceCount)}
              ${renderMetricCard('Montant dû', `${finance.totalDue} €`)}
              ${renderMetricCard('Montant payé', `${finance.totalPaid} €`)}
              ${renderMetricCard('Reste à encaisser', `${finance.remainingBalance} €`)}
            </div>`
      }
    </section>
    <section class="el-card">
      <h2>Activité récente</h2>
      ${recentActivityItems}
    </section>
    <section class="el-card">
      <h2>Quick actions</h2>
      <div class="el-quick-actions">
        <a href="/admin/students">Manage students</a>
        <a href="/admin/teachers">Manage teachers</a>
        <a href="/admin/attendance">View attendance</a>
        <a href="/admin/finance">View finance</a>
        <a href="/demo">Open demo guide</a>
      </div>
    </section>`
  );
}

function renderDirectorDashboard(session, dashboard) {
  return renderDashboardLayout(
    'Dashboard Director',
    session,
    `<section class="el-card">
      <h2>Pilotage synthétique</h2>
      <div class="el-metric-grid">
        ${renderMetricCard('Effectif élèves', dashboard.metrics.studentsCount)}
        ${renderMetricCard('Classes ouvertes', dashboard.metrics.classRoomsCount)}
        ${renderMetricCard('Enseignants actifs', dashboard.metrics.teachersCount)}
      </div>
      <p><a href="/admin/students">Voir les élèves</a></p>
      <p>Suivi attendance/grading: disponible prochainement.</p>
    </section>`
  );
}

function renderTeacherDashboard(session, dashboard) {
  const { teacher, classRooms, subjects } = dashboard;
  const classNames = classRooms.map((classRoom) => classRoom.name).join(', ') || 'Aucune classe assignée';
  const subjectNames = subjects.map((subject) => subject.name).join(', ') || 'Aucune matière assignée';

  return renderDashboardLayout(
    'Dashboard Teacher',
    session,
    `<section class="el-card">
      <h2>Vue enseignant</h2>
      <div class="el-metric-grid">
        ${renderMetricCard('Assigned classes', classRooms.length)}
        ${renderMetricCard('Students in scope', dashboard.studentsInScope)}
        ${renderMetricCard('Attendance to record', dashboard.attendanceToRecord)}
        ${renderMetricCard('Recent grades', dashboard.recentGrades.length)}
      </div>
      <p>Classes assignées: ${classNames}</p>
      <p>Matières assignées: ${subjectNames}</p>
      <p>${teacher ? `Profil: ${teacher.firstName} ${teacher.lastName}` : 'Profil enseignant en cours de liaison.'}</p>
    </section>
    <section class="el-card">
      <h2>Recent assessments</h2>
      ${
        dashboard.recentGrades.length
          ? `<ul>${dashboard.recentGrades.map((entry) => `<li>${entry.assessmentTitle} · ${entry.studentName} · ${entry.score}/20</li>`).join('')}</ul>`
          : '<p class="el-empty-state">Aucune note récente à afficher.</p>'
      }
    </section>
    <section class="el-card">
      <h2>Quick actions</h2>
      <div class="el-quick-actions">
        <a href="/teacher/attendance">Record attendance</a>
        <a href="/teacher/grades">Add grade/comment</a>
        <a href="/admin/students">View class students</a>
      </div>
    </section>`
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

  return renderDashboardLayout(
    'Appel enseignant',
    session,
    `<section class="el-card">
      <div class="el-page-intro">
        <div>
          <h2>Prise de présence</h2>
          <p>Enseignant: ${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}</p>
        </div>
        <span class="el-badge">Classe assignée uniquement</span>
      </div>
      <form class="el-toolbar" method="GET" action="/teacher/attendance">
        <label>Date <input type="date" name="date" value="${selectedDate}" required /></label>
        <label>Classe
          <select name="classRoomId" required>
            ${options}
          </select>
        </label>
        <button type="submit">Charger</button>
      </form>
    </section>
    <section class="el-card">
      <h2>Liste des élèves</h2>
      ${
        selectedClassRoomId
          ? `<form method="POST" action="/teacher/attendance">
      <input type="hidden" name="date" value="${selectedDate}" />
      <input type="hidden" name="classRoomId" value="${selectedClassRoomId}" />
      <table><thead><tr><th>Nom</th><th>Matricule</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>
      <button type="submit">Sauvegarder l'appel</button>
    </form>`
          : '<p class="el-empty-state">Sélectionnez une classe autorisée pour commencer.</p>'
      }
    </section>`
  );
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
        <td>${renderStatusBadge(record.status, { present: 'is-success', late: 'is-warning', absent: 'is-danger' })}</td>
        <td>${teacher ? `${teacher.firstName} ${teacher.lastName}` : record.teacherId}</td>
      </tr>`;
    })
    .join('');

  const summary = summarizeAttendance(records);
  return renderDashboardLayout(
    'Présences du jour',
    session,
    `<section class="el-card">
      <div class="el-metric-grid">
        ${renderMetricCard('Total', summary.total)}
        ${renderMetricCard('Présents', summary.present)}
        ${renderMetricCard('Retards', summary.late)}
        ${renderMetricCard('Absents', summary.absent)}
      </div>
      <form class="el-toolbar" method="GET" action="/admin/attendance">
        <label>Date <input type="date" name="date" value="${date}" required /></label>
        <label>Classe
          <select name="classRoomId">${options}</select>
        </label>
        <button type="submit">Filtrer</button>
      </form>
    </section>
    <section class="el-card">
      <table><thead><tr><th>Date</th><th>Classe</th><th>Élève</th><th>Statut</th><th>Saisi par</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucune présence enregistrée pour ce filtre.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderParentDashboard(session, dashboard) {
  const { children } = dashboard;
  const list = children.length
    ? `<ul>${children.map((student) => `<li>${student.firstName} ${student.lastName} (${student.classRoomId})</li>`).join('')}</ul>`
    : '<p>Aucun enfant lié pour le moment.</p>';

  return renderDashboardLayout(
    'Dashboard Parent',
    session,
    `<section class="el-card">
      <h2>Mes enfants</h2>
      <div class="el-metric-grid">
        ${renderMetricCard('Linked children', children.length)}
        ${renderMetricCard('Latest grades', dashboard.latestGrades.length)}
        ${renderMetricCard('Attendance records', dashboard.attendanceSummary.total)}
        ${renderMetricCard('Messages & annonces', dashboard.messagesCount)}
      </div>
      ${list}
    </section>
    <section class="el-card">
      <h2>Latest grades</h2>
      ${
        dashboard.latestGrades.length
          ? `<ul>${dashboard.latestGrades.map((entry) => `<li>${entry.studentName} · ${entry.assessmentTitle} · ${entry.score}/20</li>`).join('')}</ul>`
          : '<p class="el-empty-state">Aucune note disponible pour le moment.</p>'
      }
    </section>
    <section class="el-card">
      <h2>Attendance summary</h2>
      ${
        dashboard.attendanceSummary.total
          ? `<p>Présents: ${dashboard.attendanceSummary.present} · Retards: ${dashboard.attendanceSummary.late} · Absents: ${dashboard.attendanceSummary.absent}</p>`
          : '<p class="el-empty-state">Aucune donnée de présence disponible.</p>'
      }
    </section>
    <section class="el-card">
      <h2>Messages / annonces</h2>
      ${
        dashboard.latestAnnouncements.length
          ? `<ul>${dashboard.latestAnnouncements.map((item) => `<li>${item.title}</li>`).join('')}</ul>`
          : '<p class="el-empty-state">Aucun message ou annonce disponible.</p>'
      }
    </section>
    <section class="el-card">
      <h2>Quick actions</h2>
      <div class="el-quick-actions">
        <a href="/admin/students">View child profile</a>
        <a href="/parent/grades">View grades</a>
        <a href="/parent/attendance">View attendance</a>
        <a href="/inbox">Open messages</a>
      </div>
    </section>`
  );
}

function renderStudentDashboard(session, dashboard) {
  const { student } = dashboard;
  return renderDashboardLayout(
    'Dashboard Student',
    session,
    `<section class="el-card">
      <h2>Mon espace</h2>
      <div class="el-metric-grid">
        ${renderMetricCard('My class', student?.classRoomId ?? '-')}
        ${renderMetricCard('Latest grades', dashboard.latestGrades.length)}
        ${renderMetricCard('Attendance records', dashboard.attendanceSummary.total)}
        ${renderMetricCard('Homework & announcements', dashboard.homeworkCount + dashboard.announcementCount)}
      </div>
      <p>Nom: ${student ? `${student.firstName} ${student.lastName}` : 'Profil étudiant non trouvé'}</p>
      <p>Classe: ${student?.classRoomId ?? '-'}</p>
      <p>Matricule: ${student?.admissionNumber ?? '-'}</p>
    </section>
    <section class="el-card">
      <h2>Latest grades</h2>
      ${
        dashboard.latestGrades.length
          ? `<ul>${dashboard.latestGrades.map((entry) => `<li>${entry.assessmentTitle} · ${entry.score}/20</li>`).join('')}</ul>`
          : '<p class="el-empty-state">Aucune note disponible.</p>'
      }
    </section>
    <section class="el-card">
      <h2>Attendance summary</h2>
      ${
        dashboard.attendanceSummary.total
          ? `<p>Présents: ${dashboard.attendanceSummary.present} · Retards: ${dashboard.attendanceSummary.late} · Absents: ${dashboard.attendanceSummary.absent}</p>`
          : '<p class="el-empty-state">Aucune donnée de présence disponible.</p>'
      }
    </section>
    <section class="el-card">
      <h2>Homework / announcements</h2>
      ${
        dashboard.latestHomeworks.length
          ? `<ul>${dashboard.latestHomeworks.map((entry) => `<li>${entry.title} (échéance ${entry.dueDate})</li>`).join('')}</ul>`
          : '<p class="el-empty-state">Aucun devoir ou message disponible.</p>'
      }
    </section>
    <section class="el-card">
      <h2>Mes accès rapides</h2>
      <p><a href="/student/homeworks">Mes devoirs</a> · <a href="/student/grades">Mes notes</a> · <a href="/inbox">Ouvrir l'inbox</a></p>
    </section>`
  );
}

function renderInboxPage(session, inbox) {
  const announcementRows = inbox.announcements
    .map((item) => `<li><strong>${item.title}</strong> (${item.visibility})<br/>${item.body}</li>`)
    .join('');

  const threadRows = inbox.threads
    .map((thread) => `<li><a href="/inbox/threads/${thread.id}">${thread.subject}</a> — ${thread.messageCount} message(s)</li>`)
    .join('');

  return renderDashboardLayout(
    'Inbox interne',
    session,
    `<section class="el-card">
      <h2>Annonces</h2>
      <ul>${announcementRows || '<li class="el-empty-state">Aucune annonce.</li>'}</ul>
    </section>
    <section class="el-card">
      <h2>Threads</h2>
      <ul>${threadRows || '<li class="el-empty-state">Aucun thread.</li>'}</ul>
    </section>`
  );
}

function renderThreadPage(session, thread) {
  const rows = thread.messages
    .map((message) => `<li><strong>${message.senderId}</strong> (${message.created_at}): ${message.body}</li>`)
    .join('');

  return renderDashboardLayout(
    `Thread: ${thread.subject}`,
    session,
    `<section class="el-card">
      <p>Participants: ${thread.participantIds.join(', ')}</p>
      <ul>${rows || '<li class="el-empty-state">Aucun message.</li>'}</ul>
    </section>
    <section class="el-card">
      <form method="POST" action="/inbox/threads/${thread.id}/reply">
        <label>Réponse <textarea name="body" required></textarea></label><br/>
        <button type="submit">Envoyer</button>
      </form>
      <p><a href="/inbox">Retour inbox</a></p>
    </section>`
  );
}

function renderAdminAnnouncementsPage(session, announcements) {
  const rows = announcements
    .map((item) => `<li><strong>${item.title}</strong> (${item.visibility}) - ${item.created_at}<br/>${item.body}</li>`)
    .join('');

  return renderDashboardLayout(
    'Publication d’annonces',
    session,
    `<section class="el-card">
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
    </section>
    <section class="el-card">
    <h2>Annonces existantes</h2>
    <ul>${rows || '<li>Aucune annonce</li>'}</ul>
    </section>`
  );
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

  return renderDashboardLayout(
    'Évaluations & notes',
    session,
    `<section class="el-card">
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
    </section>
    <section class="el-card">
    <h2>Saisie des notes</h2>
    <form method="GET" action="/teacher/grades">
      <label>Évaluation <select name="assessmentId">${assessmentOptions}</select></label>
      <button type="submit">Charger</button>
    </form>
    ${
      selectedAssessmentId
        ? `<form method="POST" action="/teacher/grades">
      <input type="hidden" name="assessmentId" value="${selectedAssessmentId}" />
      <table><thead><tr><th>Élève</th><th>Matricule</th><th>Note /20</th><th>Remarque</th></tr></thead><tbody>${rows}</tbody></table>
      <button type="submit">Enregistrer les notes</button>
    </form>`
        : '<p class="el-empty-state">Sélectionnez une évaluation pour saisir des notes.</p>'
    }
    </section>
    <section class="el-card">
    <h2>Mes évaluations</h2>
    <table><thead><tr><th>Date</th><th>Titre</th><th>Classe</th><th>Matière</th><th>Coeff</th></tr></thead><tbody>${assessmentRows || '<tr><td colspan="5">Aucune évaluation créée.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderParentGradesPage(session, grades) {
  const rows = grades
    .map(
      (entry) =>
        `<tr><td>${entry.date}</td><td>${entry.student?.firstName ?? ''} ${entry.student?.lastName ?? ''}</td><td>${entry.assessment?.subjectId ?? '-'}</td><td>${entry.assessment?.title ?? '-'}</td><td>${renderStatusBadge(`${entry.score}/20`, { '': 'is-info' })}</td><td>${entry.assessment?.coefficient ?? '-'}</td><td>${entry.remark || '-'}</td></tr>`
    )
    .join('');
  return renderDashboardLayout(
    'Notes de mes enfants',
    session,
    `<section class="el-card">
      <table><thead><tr><th>Date</th><th>Élève</th><th>Matière</th><th>Évaluation</th><th>Note</th><th>Coeff</th><th>Remarque</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Aucune note disponible.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderParentAttendancePage(session, records, studentById) {
  const rows = records
    .map((record) => {
      const student = studentById.get(record.studentId);
      return `<tr><td>${record.date}</td><td>${student ? `${student.firstName} ${student.lastName}` : record.studentId}</td><td>${record.classRoomId}</td><td>${record.status}</td></tr>`;
    })
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parent Attendance</title></head><body>
    <h1>Présences de mes enfants</h1>
    <p>Tenant: ${session.tenantId}</p>
    <table border="1"><thead><tr><th>Date</th><th>Élève</th><th>Classe</th><th>Statut</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Aucune donnée de présence disponible.</td></tr>'}</tbody></table>
    <p><a href="/dashboard/parent">Retour dashboard</a></p>
  </body></html>`;
}

function renderStudentGradesPage(session, student, grades) {
  const rows = grades
    .map(
      (entry) =>
        `<tr><td>${entry.date}</td><td>${entry.assessment?.subjectId ?? '-'}</td><td>${entry.assessment?.title ?? '-'}</td><td>${renderStatusBadge(`${entry.score}/20`, { '': 'is-info' })}</td><td>${entry.assessment?.coefficient ?? '-'}</td><td>${entry.remark || '-'}</td></tr>`
    )
    .join('');
  return renderDashboardLayout(
    'Mes notes',
    session,
    `<section class="el-card">
      <p>Étudiant: ${student ? `${student.firstName} ${student.lastName}` : '-'}</p>
      <table><thead><tr><th>Date</th><th>Matière</th><th>Évaluation</th><th>Note</th><th>Coeff</th><th>Remarque</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Aucune note disponible.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderAdminFinancePage(session, { students, feePlans, invoices, payments }) {
  const studentOptions = students.map((student) => `<option value="${student.id}">${student.firstName} ${student.lastName}</option>`).join('');
  const feePlanOptions = ['<option value="">Aucun plan (facture directe)</option>']
    .concat(feePlans.map((plan) => `<option value="${plan.id}">${plan.name} - ${plan.amountDue}</option>`))
    .join('');
  const feePlanRows = feePlans
    .map((plan) => `<tr><td>${plan.name}</td><td>${formatCurrency(plan.amountDue)}</td><td>${plan.dueDate}</td><td>${plan.description || '-'}</td></tr>`)
    .join('');
  const invoiceRows = invoices
    .map(
      (invoice) =>
        `<tr><td>${invoice.studentId}</td><td>${formatCurrency(invoice.amountDue)}</td><td>${formatCurrency(invoice.totalPaid)}</td><td>${formatCurrency(invoice.remainingBalance)}</td><td>${renderStatusBadge(invoice.status, { paid: 'is-success', partial: 'is-warning', unpaid: 'is-danger' })}</td><td>${invoice.dueDate}</td></tr>`
    )
    .join('');
  const paymentRows = payments
    .map((payment) => `<tr><td>${payment.invoiceId}</td><td>${payment.studentId}</td><td>${formatCurrency(payment.amountPaid)}</td><td>${payment.paidAt}</td><td>${payment.method}</td></tr>`)
    .join('');
  const financeSummary = summarizeFinance(invoices, payments);
  return renderDashboardLayout(
    'Finance - Frais / Factures / Paiements',
    session,
    `<section class="el-card">
    <div class="el-metric-grid">
      ${renderMetricCard('Factures', financeSummary.invoiceCount)}
      ${renderMetricCard('Montant dû', formatCurrency(financeSummary.totalDue))}
      ${renderMetricCard('Montant payé', formatCurrency(financeSummary.totalPaid))}
      ${renderMetricCard('Reste', formatCurrency(financeSummary.remainingBalance))}
    </div>
    </section>
    <section class="el-card"><h2>Nouveau plan de frais</h2>
    <form method="POST" action="/admin/finance/fee-plans">
      <label>Nom <input name="name" required /></label><br/>
      <label>Montant <input name="amountDue" type="number" step="0.01" min="0" required /></label><br/>
      <label>Échéance <input name="dueDate" type="date" required /></label><br/>
      <label>Description <textarea name="description"></textarea></label><br/>
      <button type="submit">Créer plan de frais</button>
    </form>
    </section><section class="el-card"><h2>Nouvelle facture</h2>
    <form method="POST" action="/admin/finance/invoices">
      <label>Élève <select name="studentId" required>${studentOptions}</select></label><br/>
      <label>Plan de frais <select name="feePlanId">${feePlanOptions}</select></label><br/>
      <label>Montant <input name="amountDue" type="number" step="0.01" min="0" required /></label><br/>
      <label>Échéance <input name="dueDate" type="date" required /></label><br/>
      <label>Description <textarea name="description"></textarea></label><br/>
      <button type="submit">Créer facture</button>
    </form>
    </section><section class="el-card"><h2>Nouveau paiement</h2>
    <form method="POST" action="/admin/finance/payments">
      <label>Facture <input name="invoiceId" required /></label><br/>
      <label>Montant payé <input name="amountPaid" type="number" step="0.01" min="0.01" required /></label><br/>
      <label>Date paiement <input name="paidAt" type="date" required /></label><br/>
      <label>Méthode <input name="method" value="manual" /></label><br/>
      <label>Note <textarea name="note"></textarea></label><br/>
      <button type="submit">Enregistrer paiement</button>
    </form>
    </section><section class="el-card"><h2>Plans de frais</h2>
    <table><thead><tr><th>Nom</th><th>Montant</th><th>Échéance</th><th>Description</th></tr></thead><tbody>${feePlanRows || '<tr><td colspan="4">Aucun plan de frais.</td></tr>'}</tbody></table>
    <h2>Factures</h2>
    <table><thead><tr><th>Élève</th><th>Montant</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Échéance</th></tr></thead><tbody>${invoiceRows || '<tr><td colspan="6">Aucune facture.</td></tr>'}</tbody></table>
    <h2>Paiements</h2>
    <table><thead><tr><th>Facture</th><th>Élève</th><th>Montant</th><th>Date</th><th>Méthode</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="5">Aucun paiement.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderParentFinancePage(session, invoices) {
  const rows = invoices
    .map(
      (invoice) =>
        `<tr><td>${invoice.studentId}</td><td>${formatCurrency(invoice.amountDue)}</td><td>${formatCurrency(invoice.totalPaid)}</td><td>${formatCurrency(invoice.remainingBalance)}</td><td>${renderStatusBadge(invoice.status, { paid: 'is-success', partial: 'is-warning', unpaid: 'is-danger' })}</td><td>${invoice.dueDate}</td></tr>`
    )
    .join('');
  return renderDashboardLayout(
    'Statut financier de mes enfants',
    session,
    `<section class="el-card">
      <table><thead><tr><th>Élève</th><th>Montant</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Échéance</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Aucune facture disponible.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderAccountantDashboard(session, dashboard) {
  return renderDashboardLayout(
    'Dashboard Accountant',
    session,
    `<section class="el-card">
      <h2>Finance</h2>
      ${
        dashboard.financeSummary.invoiceCount
          ? `<div class="el-metric-grid">
              ${renderMetricCard('Factures', dashboard.financeSummary.invoiceCount)}
              ${renderMetricCard('Montant dû', `${dashboard.financeSummary.totalDue} €`)}
              ${renderMetricCard('Montant payé', `${dashboard.financeSummary.totalPaid} €`)}
              ${renderMetricCard('Reste à encaisser', `${dashboard.financeSummary.remainingBalance} €`)}
            </div>`
          : '<p class="el-empty-state">Aucune donnée finance disponible.</p>'
      }
      <p><a href="/admin/finance">Accéder aux frais, factures et paiements</a></p>
    </section>`
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
        <td><span class="el-badge">${student.classRoomId}</span></td>
      </tr>`
    )
    .join('');
  return renderDashboardLayout(
    'Gestion des élèves',
    session,
    `<section class="el-card">
    <div class="el-page-intro">
      <h2>Liste des élèves</h2>
      <span class="el-badge">${students.length} élève(s)</span>
    </div>
    <form class="el-toolbar" method="GET" action="/admin/students">
      <label>Filtre classe
        <select name="classRoomId">${options}</select>
      </label>
      <button type="submit">Filtrer</button>
    </form>
    <table><thead><tr><th>Nom</th><th>Matricule</th><th>Classe</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Aucun élève trouvé.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderStudentProfile(session, student) {
  return renderDashboardLayout(
    'Fiche élève',
    session,
    `<section class="el-card">
      <h2>${student.firstName} ${student.lastName}</h2>
      <p><strong>Matricule:</strong> ${student.admissionNumber}</p>
      <p><strong>Classe:</strong> <span class="el-badge">${student.classRoomId}</span></p>
      <p><strong>Date de naissance:</strong> ${student.dateOfBirth || '-'}</p>
      <p><strong>Statut:</strong> ${renderStatusBadge(student.archived_at ? 'archivé' : 'actif', { actif: 'is-success', archivé: 'is-warning' })}</p>
      <p><strong>ID:</strong> ${student.id}</p>
      <p><a href="/admin/students">Retour à la liste</a></p>
    </section>`
  );
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
        <td><span class="el-badge">${teacher.classRoomIds.length}</span></td>
        <td><span class="el-badge">${teacher.subjectIds.length}</span></td>
        <td>${renderStatusBadge(teacher.archived_at ? 'archivé' : 'actif', { actif: 'is-success', archivé: 'is-warning' })}</td>
      </tr>`
    )
    .join('');
  return renderDashboardLayout(
    'Gestion des enseignants',
    session,
    `<section class="el-card"><h2>Créer un enseignant</h2>
    <form method="POST" action="/admin/teachers">
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Email <input name="email" type="email" /></label><br/>
      <label>Téléphone <input name="phone" /></label><br/>
      <label>Notes <textarea name="notes"></textarea></label><br/>
      <button type="submit">Créer</button>
    </form>
    </section><section class="el-card">
    <h2>Liste</h2>
    <table><thead><tr><th>Nom</th><th>Email</th><th># Classes</th><th># Matières</th><th>Statut</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucun enseignant.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderTeacherProfile(session, teacher, classRooms, subjects) {
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

  return renderDashboardLayout(
    'Fiche enseignant',
    session,
    `<section class="el-card">
    <h2>${teacher.firstName} ${teacher.lastName}</h2>
    <p><strong>ID:</strong> ${teacher.id}</p>
    <p><strong>Statut:</strong> ${renderStatusBadge(teacher.archived_at ? 'archivé' : 'actif', { actif: 'is-success', archivé: 'is-warning' })}</p>
    <h3>Informations</h3>
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
    </section>
    <section class="el-card">
    <h2>Affectations existantes</h2>
    <p><strong>Classes:</strong> ${classNames}</p>
    <p><strong>Matières:</strong> ${subjectNames}</p>
    <p><a href="/admin/teachers">Retour</a></p>
    </section>`
  );
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

async function checkHealth(runtimeEnv) {
  if (runtimeEnv.persistenceMode !== 'postgres') {
    return { status: 'ok', persistence: { mode: 'memory' } };
  }

  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return { status: 'ok', persistence: { mode: 'postgres', database: 'up' } };
  } catch (error) {
    return {
      status: 'degraded',
      persistence: { mode: 'postgres', database: 'down', reason: String(error.message || 'Database check failed') }
    };
  }
}

function createServer({
  sessionStore = new SessionStore(),
  seed = createSeedData(),
  aiConfig = {},
  logger = createLogger({ module: 'web.server' }),
  runtimeEnv = loadRuntimeEnv(process.env),
  allowPublicDemoGuide = runtimeEnv.nodeEnv === 'development' || runtimeEnv.nodeEnv === 'test'
} = {}) {
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
  const parentService = new ParentService({ parentStore, studentStore, buildValidationError });
  const teacherService = new TeacherService({ teacherStore });
  const attendanceService = new AttendanceService({ attendanceStore, requireDateString });

  let studentApiService = studentService;
  let parentApiService = parentService;
  let teacherApiService = teacherService;
  let attendanceApiService = attendanceService;
  let gradingApiStore = gradingStore;
  let messagingApiStore = messagingStore;
  let financeApiStore = financeStore;
  if (runtimeEnv.persistenceMode === 'postgres') {
    const pool = getPool();
    const persistentCoreSchool = new PostgresCoreSchoolRepository({ pool });
    const persistentStudentStore = new PostgresStudentRepository({ pool, classRoomRepository: persistentCoreSchool });
    const persistentParentStore = new PostgresParentRepository({ pool, studentStore: persistentStudentStore });
    const persistentTeacherStore = new PostgresTeacherRepository({ pool, classRoomStore: persistentCoreSchool });
    const persistentAttendanceStore = new PostgresAttendanceRepository({ pool, studentStore: persistentStudentStore, teacherStore: persistentTeacherStore, classRoomStore: persistentCoreSchool });
    const persistentGradingStore = new PostgresGradingRepository({ pool, classRoomStore: persistentCoreSchool, teacherStore: persistentTeacherStore, studentStore: persistentStudentStore, parentStore: persistentParentStore });
    const persistentMessagingStore = new PostgresMessagingRepository({ pool });
    const persistentFinanceStore = new PostgresFinanceRepository({ pool, studentStore: persistentStudentStore, parentStore: persistentParentStore });
    const persistentCoreSchoolService = new CoreSchoolService({ coreSchoolStore: persistentCoreSchool });
    studentApiService = new StudentService({ studentStore: persistentStudentStore, coreSchoolService: persistentCoreSchoolService });
    parentApiService = new ParentService({ parentStore: persistentParentStore, studentStore: persistentStudentStore, buildValidationError });
    teacherApiService = new TeacherService({ teacherStore: persistentTeacherStore });
    attendanceApiService = new AttendanceService({ attendanceStore: persistentAttendanceStore, requireDateString });
    gradingApiStore = persistentGradingStore;
    messagingApiStore = persistentMessagingStore;
    financeApiStore = persistentFinanceStore;
  }

  logger.info('Application server initialized', {
    nodeEnv: runtimeEnv.nodeEnv,
    persistenceMode: runtimeEnv.persistenceMode,
    aiDefaultProvider: aiProviderRegistry.defaultProvider,
    logFormat: process.env.LOG_FORMAT || (runtimeEnv.nodeEnv === 'production' ? 'json' : 'pretty'),
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  if (runtimeEnv.persistenceMode === 'postgres') {
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
      parentService: parentApiService,
      auditWriter,
      sendApiError,
      sendApiSuccess,
      parseJsonBody,
      buildTenantScope
    }),
    createTeacherRoutes({
      teacherService: teacherApiService,
      auditWriter,
      sendApiError,
      sendApiSuccess,
      parseJsonBody,
      buildTenantScope
    }),
    createAttendanceRoutes({
      attendanceService: attendanceApiService,
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
    response.locals = { requestId, requestLogger };

    requestLogger.info('HTTP request received');
    response.on('finish', () => {
      const durationMs = Date.now() - requestStartedAt;
      const level = response.statusCode >= 500 ? 'error' : 'info';
      requestLogger[level]('HTTP request completed', {
        statusCode: response.statusCode,
        durationMs
      });
    });

    if (request.method === 'GET' && url.pathname === '/assets/design-system.css') {
      response.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      response.end(DESIGN_SYSTEM_CSS);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/healthz') {
      const health = await checkHealth(runtimeEnv);
      const statusCode = health.status === 'ok' ? 200 : 503;
      sendJson(response, statusCode, {
        status: health.status,
        nodeEnv: runtimeEnv.nodeEnv,
        uptimeSec: Math.floor(process.uptime()),
        persistence: health.persistence
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/login') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderLoginPage());
      return;
    }

    if (request.method === 'GET' && url.pathname === '/demo') {
      if (!allowPublicDemoGuide) {
        const auth = requireAuth(session);
        if (!auth.allowed) {
          response.writeHead(302, { location: '/login', ...(hasStaleSessionCookie ? { 'set-cookie': clearSessionCookie() } : {}) });
          response.end();
          return;
        }
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderDemoGuidePage());
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
      const tenantAttendanceRecords = attendanceStore.list(tenantId);
      const tenantInvoices = financeStore.listInvoices(tenantId);
      const tenantPayments = financeStore.listPayments(tenantId);
      const dashboardBase = {
        metrics,
        attendanceSummary: summarizeAttendance(tenantAttendanceRecords),
        financeSummary: summarizeFinance(tenantInvoices, tenantPayments),
        recentActivity: buildRecentActivity(auditLogStore.logs, tenantId, 6)
      };

      let html = '';
      if (auth.context.role === ROLES.SCHOOL_ADMIN) {
        html = renderAdminDashboard(auth.context, dashboardBase);
      } else if (auth.context.role === ROLES.DIRECTOR) {
        html = renderDirectorDashboard(auth.context, dashboardBase);
      } else if (auth.context.role === ROLES.TEACHER) {
        const teacher = teacherStore.get(tenantId, auth.context.userId, { includeArchived: false });
        const classRooms = teacher ? teacher.classRoomIds.map((id) => coreSchoolStore.get('classRooms', tenantId, id)).filter(Boolean) : [];
        const subjects = teacher ? teacher.subjectIds.map((id) => coreSchoolStore.get('subjects', tenantId, id)).filter(Boolean) : [];
        const studentScope = teacher
          ? studentStore
              .list(tenantId)
              .filter((student) => teacher.classRoomIds.includes(student.classRoomId))
          : [];
        const grades = gradingStore.listGradesForTeacher(tenantId, auth.context.userId);
        const studentsById = new Map(studentStore.list(tenantId, { includeArchived: true }).map((student) => [student.id, student]));
        html = renderTeacherDashboard(auth.context, {
          teacher,
          classRooms,
          subjects,
          studentsInScope: studentScope.length,
          attendanceToRecord: studentScope.length,
          recentGrades: grades.slice(0, 5).map((entry) => ({
            studentName: studentsById.has(entry.studentId)
              ? `${studentsById.get(entry.studentId).firstName} ${studentsById.get(entry.studentId).lastName}`
              : entry.studentId,
            assessmentTitle: entry.assessment?.title ?? 'Évaluation',
            score: entry.score
          }))
        });
      } else if (auth.context.role === ROLES.PARENT) {
        const links = parentStore.listLinksByParent(tenantId, auth.context.userId);
        const children = links.map((link) => studentStore.get(tenantId, link.studentId, { includeArchived: false })).filter(Boolean);
        const childIds = new Set(children.map((child) => child.id));
        const studentById = new Map(children.map((student) => [student.id, student]));
        const grades = gradingStore.listGradesForParent(tenantId, auth.context.userId).slice(0, 5);
        const attendance = tenantAttendanceRecords.filter((record) => childIds.has(record.studentId));
        const inbox = messagingStore.getInbox(tenantId, auth.context);
        html = renderParentDashboard(auth.context, {
          children,
          latestGrades: grades.map((entry) => ({
            studentName: studentById.has(entry.studentId)
              ? `${studentById.get(entry.studentId).firstName} ${studentById.get(entry.studentId).lastName}`
              : entry.studentId,
            assessmentTitle: entry.assessment?.title ?? 'Évaluation',
            score: entry.score
          })),
          attendanceSummary: summarizeAttendance(attendance),
          latestAnnouncements: inbox.announcements.slice(0, 3),
          messagesCount: inbox.announcements.length + inbox.threads.length
        });
      } else if (auth.context.role === ROLES.STUDENT) {
        const student = studentStore.get(tenantId, auth.context.userId, { includeArchived: false });
        const grades = gradingStore.listGradesForStudent(tenantId, auth.context.userId).slice(0, 5);
        const attendance = tenantAttendanceRecords.filter((record) => record.studentId === auth.context.userId);
        const homeworks = lessonHomeworkStore.listHomeworksForStudent(tenantId, auth.context.userId).slice(0, 4);
        const inbox = messagingStore.getInbox(tenantId, auth.context);
        html = renderStudentDashboard(auth.context, {
          student,
          latestGrades: grades.map((entry) => ({ assessmentTitle: entry.assessment?.title ?? 'Évaluation', score: entry.score })),
          attendanceSummary: summarizeAttendance(attendance),
          latestHomeworks: homeworks,
          homeworkCount: homeworks.length,
          announcementCount: inbox.announcements.length
        });
      } else if (auth.context.role === ROLES.ACCOUNTANT) {
        html = renderAccountantDashboard(auth.context, dashboardBase);
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
      const student = studentStore.get(auth.context.tenantId, studentId, { includeArchived: false });
      const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      if (!student || !teacher || !teacher.classRoomIds.includes(student.classRoomId)) {
        response.writeHead(
          302,
          {
            location: `/teacher/report-comments?studentId=${encodeURIComponent(studentId)}&draft=${encodeURIComponent(draftText)}&message=${encodeURIComponent('Accès refusé pour cet élève.')}`
          }
        );
        response.end();
        return;
      }
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

    if (request.method === 'GET' && url.pathname === '/parent/attendance') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.PARENT) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const linkedStudents = parentStore
        .listLinksByParent(auth.context.tenantId, auth.context.userId)
        .map((link) => studentStore.get(auth.context.tenantId, link.studentId, { includeArchived: false }))
        .filter(Boolean);
      const linkedStudentIds = new Set(linkedStudents.map((student) => student.id));
      const records = attendanceStore
        .list(auth.context.tenantId)
        .filter((record) => linkedStudentIds.has(record.studentId))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const studentById = new Map(linkedStudents.map((student) => [student.id, student]));

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentAttendancePage(auth.context, records, studentById));
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
      response.end(renderStudentProfile(auth.context, student));
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
      response.end(renderTeacherProfile(auth.context, teacher, classRooms, subjects));
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
        const announcement = await messagingApiStore.createAnnouncement(session.tenantId, session, payload);
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

      sendApiSuccess(response, await messagingApiStore.listAnnouncementsForUser(session.tenantId, session));
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

      sendApiSuccess(response, await messagingApiStore.getInbox(session.tenantId, session));
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
        const created = await messagingApiStore.createThread(session.tenantId, session, payload);
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

      const thread = await messagingApiStore.getThreadForUser(session.tenantId, messageThreadByIdMatch[1], session.userId);
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
        const message = await messagingApiStore.addMessage(session.tenantId, messageThreadReplyMatch[1], session.userId, payload);
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
        const created = await gradingApiStore.createAssessment(session.tenantId, {
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
        sendApiSuccess(response, await gradingApiStore.listAssessmentsForTeacher(session.tenantId, session.userId));
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
        const saved = await gradingApiStore.upsertGradesForAssessment(session.tenantId, {
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
        sendApiSuccess(response, await gradingApiStore.listGradesForTeacher(session.tenantId, session.userId));
        return;
      }
      if (session.role === ROLES.PARENT) {
        sendApiSuccess(response, await gradingApiStore.listGradesForParent(session.tenantId, session.userId));
        return;
      }
      if (session.role === ROLES.STUDENT) {
        sendApiSuccess(response, await gradingApiStore.listGradesForStudent(session.tenantId, session.userId));
        return;
      }

      sendApiSuccess(response, await gradingApiStore.listGradesForTenant(session.tenantId));
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
      sendApiSuccess(response, await financeApiStore.listFeePlans(session.tenantId));
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
        const feePlan = await financeApiStore.createFeePlan(session.tenantId, payload);
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
        sendApiSuccess(response, await financeApiStore.listParentFinance(session.tenantId, session.userId));
        return;
      }

      sendApiSuccess(response, await financeApiStore.listInvoices(session.tenantId));
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
        const invoice = await financeApiStore.createInvoice(session.tenantId, payload);
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
      sendApiSuccess(response, await financeApiStore.listPayments(session.tenantId));
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
        const payment = await financeApiStore.recordPayment(session.tenantId, payload);
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

    if (url.pathname.startsWith('/api/v1/')) {
      sendApiError(response, 404, 'NOT_FOUND', 'Resource not found');
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

async function startServer() {
  const runtimeConfig = loadRuntimeEnv(process.env);
  const startupLogger = createLogger({ module: 'web.startup' });
  const server = createServer({ runtimeEnv: runtimeConfig, logger: startupLogger.child({}, 'web.server') });

  if (runtimeConfig.persistenceMode === 'postgres') {
    const pool = getPool();
    try {
      await pool.query('SELECT 1');
      startupLogger.info('Database connectivity check passed', { persistenceMode: runtimeConfig.persistenceMode });
    } catch (error) {
      startupLogger.error('Database connectivity check failed', {
        persistenceMode: runtimeConfig.persistenceMode,
        error: serializeError(error)
      });
      throw new Error('Startup aborted: postgres connectivity check failed');
    }
  }

  server.listen(runtimeConfig.port, () => {
    startupLogger.info('EducLink web app running', {
      url: `http://localhost:${runtimeConfig.port}`,
      nodeEnv: runtimeConfig.nodeEnv,
      persistenceMode: runtimeConfig.persistenceMode
    });
  });

  process.on('SIGTERM', async () => {
    startupLogger.info('SIGTERM received, shutting down web server');
    await closePool();
    server.close();
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    const startupLogger = createLogger({ module: 'web.startup' });
    startupLogger.error('Server startup failed', { error: serializeError(error) });
    process.exitCode = 1;
  });
}
