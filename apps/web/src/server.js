const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const requestContextStorage = new AsyncLocalStorage();
const { createLogger } = require('./observability/logger');

const { authorizeApiRequest } = require('../../../packages/auth/src/guards/api-guard');
const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { ROLES } = require('../../../packages/auth/src/roles/roles');
const { DEFAULT_SESSION_TTL_MS, SessionStore, signSessionId, verifySignedSessionId } = require('../../../packages/auth/src/session/session-store');
const { compareCsrfTokens } = require('../../../packages/auth/src/csrf/csrf');
const { LoginThrottle } = require('../../../packages/auth/src/rate-limit/login-throttle');
const { CoreSchoolStore } = require('./modules/core-school');
const { StudentStore } = require('./modules/student');
const { ParentStore } = require('./modules/parent');
const { TeacherStore } = require('./modules/teacher');
const { AttendanceStore, ATTENDANCE_STATUSES, requireDateString } = require('./modules/attendance');
const {
  AttendanceEventsStore,
  ATTENDANCE_EVENT_TYPES,
  ATTENDANCE_EVENT_TYPE_LABELS_FR,
  ATTENDANCE_EVENT_TYPE_BADGES,
  MAX_COMMENT_LENGTH: ATTENDANCE_EVENT_MAX_COMMENT_LENGTH
} = require('./modules/attendance-events');
const {
  AbsenceNoticesStore,
  ABSENCE_REASONS,
  ABSENCE_REASON_LABELS_FR,
  ABSENCE_STATUS_LABELS_FR,
  ABSENCE_STATUS_BADGES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_COMMENT_LENGTH: ABSENCE_NOTICE_MAX_COMMENT_LENGTH
} = require('./modules/absence-notices');
const { LessonHomeworkStore } = require('./modules/lesson-homework');
const { GradingStore } = require('./modules/grading');
const { MessagingStore } = require('./modules/messaging');
const { AuditLogStore, createAuditEventWriter } = require('./modules/audit');
const { FinanceStore } = require('./modules/finance');
const { buildReportCard } = require('./modules/bulletin');
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
const { parseMultipart } = require('./routes/multipart');
const { getPool, closePool } = require('../../../packages/database/src/client');
const { loadRuntimeEnv } = require('../../../packages/core/src/runtime-env');
const { PostgresCoreSchoolRepository } = require('./modules/persistence/postgres-core-school-repository');
const { PostgresStudentRepository } = require('./modules/persistence/postgres-student-repository');
const { PostgresParentRepository } = require('./modules/persistence/postgres-parent-repository');
const { PostgresTeacherRepository } = require('./modules/persistence/postgres-teacher-repository');
const { PostgresAttendanceRepository } = require('./modules/persistence/postgres-attendance-repository');
const { PostgresAttendanceEventsRepository } = require('./modules/persistence/postgres-attendance-events-repository');
const { PostgresGradingRepository } = require('./modules/persistence/postgres-grading-repository');
const { PostgresMessagingRepository } = require('./modules/persistence/postgres-messaging-repository');
const { PostgresFinanceRepository } = require('./modules/persistence/postgres-finance-repository');
const { PostgresUserRepository } = require('./modules/persistence/postgres-user-repository');
const { PostgresTenantRepository } = require('./modules/persistence/postgres-tenant-repository');
const { InMemoryTenantStore } = require('./modules/tenants');
const { buildValidationError, buildForbiddenError } = require('./modules/error-utils');
const { InMemoryUserStore, DuplicateEmailError, buildSeedUsersWithHashedPassword, normalizeEmail } = require('../../../packages/auth/src/users/user-store');
const { hashPassword, verifyPassword } = require('../../../packages/auth/src/password/password-hasher');

const DEFAULT_SEED_PASSWORD = 'password123';

const SEED_USERS = [
  { id: 'super-admin', email: 'superadmin@platform.test', role: ROLES.SUPER_ADMIN, tenantId: null },
  { id: 'admin-a', email: 'admin@school-a.test', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-a' },
  { id: 'admin-b', email: 'admin@school-b.test', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-b' },
  { id: 'director-a', email: 'director@school-a.test', role: ROLES.DIRECTOR, tenantId: 'school-a' },
  { id: 'teacher-a1', email: 'teacher@school-a.test', role: ROLES.TEACHER, tenantId: 'school-a' },
  { id: 'teacher-a2', email: 'teacher2@school-a.test', role: ROLES.TEACHER, tenantId: 'school-a' },
  { id: 'parent-a1', email: 'parent@school-a.test', role: ROLES.PARENT, tenantId: 'school-a' },
  { id: 'parent-a2', email: 'parent2@school-a.test', role: ROLES.PARENT, tenantId: 'school-a' },
  { id: 'student-a1', email: 'student@school-a.test', role: ROLES.STUDENT, tenantId: 'school-a' },
  { id: 'accountant-a', email: 'accountant@school-a.test', role: ROLES.ACCOUNTANT, tenantId: 'school-a' }
];

let cachedInMemorySeedUsers = null;
function getInMemorySeedUsers() {
  if (!cachedInMemorySeedUsers) {
    cachedInMemorySeedUsers = buildSeedUsersWithHashedPassword({
      users: SEED_USERS,
      plainPassword: DEFAULT_SEED_PASSWORD
    });
  }
  return cachedInMemorySeedUsers;
}

function createSeedData() {
  const now = new Date().toISOString();
  return {
    academicYears: [
      { id: 'year-a-2025-2026', tenant_id: 'school-a', label: '2025-2026', starts_at: '2025-09-01', ends_at: '2026-07-05', status: 'active', created_at: now, updated_at: now }
    ],
    terms: [
      { id: 'term-a-t1', tenant_id: 'school-a', academicYearId: 'year-a-2025-2026', name: 'Trimestre 1', starts_at: '2025-09-01', ends_at: '2025-12-20', created_at: now, updated_at: now },
      { id: 'term-a-t2', tenant_id: 'school-a', academicYearId: 'year-a-2025-2026', name: 'Trimestre 2', starts_at: '2026-01-06', ends_at: '2026-03-31', created_at: now, updated_at: now },
      { id: 'term-a-t3', tenant_id: 'school-a', academicYearId: 'year-a-2025-2026', name: 'Trimestre 3', starts_at: '2026-04-01', ends_at: '2026-07-05', created_at: now, updated_at: now }
    ],
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
    attendanceEvents: [
      { id: 'attendance-event-demo-1', tenant_id: 'school-a', date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a1', recordedByUserId: 'teacher-a1', recordedByRole: ROLES.TEACHER, eventType: 'encouragement', comment: 'Très bonne participation orale ce matin.', created_at: now, updated_at: now },
      { id: 'attendance-event-demo-2', tenant_id: 'school-a', date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a3', recordedByUserId: 'teacher-a1', recordedByRole: ROLES.TEACHER, eventType: 'observation', comment: 'Arrivé 15 minutes en retard sans justificatif.', created_at: now, updated_at: now },
      { id: 'attendance-event-demo-3', tenant_id: 'school-a', date: '2026-04-20', classRoomId: 'class-a2', studentId: 'student-a2', recordedByUserId: 'teacher-a2', recordedByRole: ROLES.TEACHER, eventType: 'infirmary', comment: 'Maux de tête, envoyé à l\'infirmerie 10h30, retour 11h.', created_at: now, updated_at: now }
    ],
    absenceNotices: [
      { id: 'absence-notice-demo-1', tenant_id: 'school-a', studentId: 'student-a1', createdByUserId: 'parent-a1', startDate: '2026-05-02', endDate: '2026-05-02', reason: 'rdv-medical', comment: 'Rendez-vous orthodontiste prévu le matin.', status: 'pending', documentFileName: null, documentMimeType: null, documentData: null, documentSizeBytes: null, created_at: now, updated_at: now },
      { id: 'absence-notice-demo-2', tenant_id: 'school-a', studentId: 'student-a4', createdByUserId: 'parent-a2', startDate: '2026-04-22', endDate: '2026-04-24', reason: 'maladie', comment: 'Grippe avec fièvre, certificat médical joint.', status: 'pending', documentFileName: 'certif-medecin.pdf', documentMimeType: 'application/pdf', documentData: Buffer.from('%PDF-1.4 demo certif content'), documentSizeBytes: 28, created_at: now, updated_at: now }
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

function canViewTeachers(session) {
  return session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.DIRECTOR;
}

function canAccessBulletinForStudent(session, student, { teacherStore, parentStore }) {
  if (!session || !student) return false;
  if (session.tenantId !== student.tenant_id) return false;
  if (session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.DIRECTOR) return true;
  if (session.role === ROLES.TEACHER) {
    const teacher = teacherStore.get(session.tenantId, session.userId, { includeArchived: false });
    return Boolean(teacher && teacher.classRoomIds.includes(student.classRoomId));
  }
  if (session.role === ROLES.PARENT) {
    return parentStore.listLinksByStudent(session.tenantId, student.id).some((link) => link.parentId === session.userId);
  }
  if (session.role === ROLES.STUDENT) {
    return session.userId === student.id;
  }
  return false;
}

function canManageUsers(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canManageSchoolStructure(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canManageTenants(session) {
  return session.role === ROLES.SUPER_ADMIN;
}

const MIN_PASSWORD_LENGTH = 8;

function isValidEmailFormat(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isValidPasswordFormat(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

function canTakeAttendance(session) {
  return session.role === ROLES.TEACHER;
}

function canViewAttendanceAdmin(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canRecordAttendanceEvent(session) {
  return session.role === ROLES.TEACHER || session.role === ROLES.SCHOOL_ADMIN;
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

function canDeclareAbsence(session) {
  return session.role === ROLES.PARENT;
}

function canCreateThreads(session) {
  return session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.TEACHER;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}


function buildSessionCookie(signedSessionId, { secure = false } = {}) {
  const parts = [
    `sessionId=${signedSessionId}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DEFAULT_SESSION_TTL_MS / 1000)}`
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function clearSessionCookie({ secure = false } = {}) {
  const parts = ['sessionId=', 'HttpOnly', 'Max-Age=0', 'Path=/', 'SameSite=Lax'];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function buildCsrfCookie(csrfToken, { secure = false } = {}) {
  const parts = [
    `csrf=${csrfToken}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DEFAULT_SESSION_TTL_MS / 1000)}`
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function clearCsrfCookie({ secure = false } = {}) {
  const parts = ['csrf=', 'Max-Age=0', 'Path=/', 'SameSite=Lax'];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function applySecurityHeaders(response, { isProduction }) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'SAMEORIGIN');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  response.setHeader(
    'content-security-policy',
    [
      "default-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'"
    ].join('; ')
  );
  if (isProduction) {
    response.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
}

function csrfField(session) {
  return `<input type="hidden" name="_csrf" value="${session.csrfToken}" />`;
}

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.socket?.remoteAddress ?? 'unknown';
}

function readCsrfToken(request, form) {
  const headerToken = request.headers['x-csrf-token'];
  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken;
  }
  if (form && typeof form.get === 'function') {
    const fromForm = form.get('_csrf');
    if (typeof fromForm === 'string' && fromForm.length > 0) {
      return fromForm;
    }
  }
  return '';
}

function isJsonRequest(request) {
  const contentType = request.headers['content-type'];
  if (typeof contentType === 'string' && contentType.includes('application/json')) {
    return true;
  }
  const accept = request.headers.accept;
  return typeof accept === 'string' && accept.includes('application/json');
}

function extractCsrfTokenFromBody(bodyText, contentType) {
  if (typeof bodyText !== 'string' || bodyText.length === 0) {
    return '';
  }
  const ct = typeof contentType === 'string' ? contentType : '';
  if (ct.includes('application/json')) {
    try {
      const parsed = JSON.parse(bodyText);
      const candidate = parsed && typeof parsed === 'object' ? parsed._csrf : '';
      return typeof candidate === 'string' ? candidate : '';
    } catch {
      return '';
    }
  }
  try {
    return new URLSearchParams(bodyText).get('_csrf') ?? '';
  } catch {
    return '';
  }
}

async function enforceCsrf({ request, response, session }) {
  if (request.method !== 'POST') {
    return true;
  }
  // VS-03: multipart/form-data POSTs cannot have their body consumed here
  // (busboy must stream it). Such handlers are responsible for validating
  // the CSRF token themselves after parsing the form.
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (contentType.startsWith('multipart/form-data')) {
    return true;
  }
  const headerToken = request.headers['x-csrf-token'];
  let provided = typeof headerToken === 'string' ? headerToken : '';
  if (!provided) {
    const bodyText = await readBody(request);
    provided = extractCsrfTokenFromBody(bodyText, request.headers['content-type']);
  }
  if (!session || !compareCsrfTokens(session.csrfToken, provided)) {
    sendCsrfFailure(request, response);
    return false;
  }
  return true;
}

function sendCsrfFailure(request, response) {
  if (isJsonRequest(request)) {
    response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ success: false, error: { code: 'csrf_token_invalid', message: 'Missing or invalid CSRF token' } }));
    return;
  }
  response.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html><body><h1>403 - CSRF token invalide</h1><p>Veuillez recharger la page et réessayer.</p></body></html>');
}

const UX_SCRIPT_JS = `(function () {
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    var message = form.getAttribute('data-confirm');
    if (!message) return;
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  });
})();
`;

const DESIGN_SYSTEM_CSS = `
:root {
  --el-color-primary-blue: #2563eb;
  --el-color-dark-blue: #1e3a8a;
  --el-color-primary-green: #22c55e;
  --el-color-primary-purple: #7c3aed;
  --el-color-soft-green: #4ade80;
  --el-color-soft-purple: #a78bfa;
  --el-color-bg: #f9fafb;
  --el-color-bg-soft: #f3f4f6;
  --el-color-surface: #ffffff;
  --el-color-surface-alt: #f8fafc;
  --el-color-text: #111827;
  --el-color-text-secondary: #687280;
  --el-color-border: #e5e7eb;
  --el-color-border-strong: #d1d5db;
  --el-color-danger: #dc2626;
  --el-color-info-bg: #eef2ff;
  --el-gradient-brand: linear-gradient(95deg, #22c55e 0%, #2563eb 52%, #7c3aed 100%);
  --el-gradient-soft: linear-gradient(135deg, rgba(34,197,94,.12) 0%, rgba(37,99,235,.12) 50%, rgba(124,58,237,.14) 100%);
  --el-radius-sm: 6px;
  --el-radius-md: 10px;
  --el-radius-lg: 16px;
  --el-radius-xl: 24px;
  --el-shadow-xs: 0 1px 2px rgba(17, 24, 39, 0.05);
  --el-shadow-sm: 0 2px 6px rgba(17, 24, 39, 0.06);
  --el-shadow-md: 0 12px 24px -8px rgba(17, 24, 39, 0.10);
  --el-shadow-lg: 0 24px 48px -12px rgba(17, 24, 39, 0.18);
  --el-shadow-brand: 0 12px 28px -10px rgba(37, 99, 235, 0.45);
  --el-space-1: 0.25rem;
  --el-space-2: 0.5rem;
  --el-space-3: 0.75rem;
  --el-space-4: 1rem;
  --el-space-5: 1.25rem;
  --el-space-6: 1.5rem;
  --el-space-7: 1.75rem;
  --el-space-8: 2.25rem;
  --el-space-10: 2.75rem;
  --el-text-xs: 0.75rem;
  --el-text-sm: 0.875rem;
  --el-text-base: 1rem;
  --el-text-lg: 1.125rem;
  --el-text-xl: 1.25rem;
  --el-text-2xl: 1.5rem;
  --el-text-3xl: 2rem;
  --el-text-4xl: 2.5rem;
  --el-font-sans: "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --el-transition: 160ms cubic-bezier(.4,0,.2,1);
}

* { box-sizing: border-box; }

html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

body {
  margin: 0;
  padding: 0;
  font-family: var(--el-font-sans);
  font-size: var(--el-text-base);
  line-height: 1.55;
  color: var(--el-color-text);
  background:
    radial-gradient(circle at 0% 0%, rgba(34,197,94,.06), transparent 35%),
    radial-gradient(circle at 100% 0%, rgba(124,58,237,.06), transparent 35%),
    var(--el-color-bg);
  min-height: 100vh;
}

h1, h2, h3, h4 { margin: 0 0 var(--el-space-3); line-height: 1.2; color: var(--el-color-text); font-weight: 700; letter-spacing: -0.01em; }
h1 { font-size: var(--el-text-3xl); font-weight: 800; letter-spacing: -0.025em; }
h2 { font-size: var(--el-text-2xl); font-weight: 700; }
h3 { font-size: var(--el-text-lg); font-weight: 600; }
p, ul, ol { margin: 0 0 var(--el-space-4); }
a { color: var(--el-color-primary-blue); text-decoration: none; font-weight: 500; transition: color var(--el-transition); }
a:hover { color: var(--el-color-primary-purple); text-decoration: none; }
code { padding: 2px 6px; border-radius: var(--el-radius-sm); background: var(--el-color-info-bg); color: var(--el-color-dark-blue); font-size: 0.875em; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
hr { border: 0; border-top: 1px solid var(--el-color-border); margin: var(--el-space-5) 0; }

form { margin: 0; }
label { display: inline-flex; flex-direction: column; gap: var(--el-space-1); margin-bottom: var(--el-space-3); font-size: var(--el-text-sm); font-weight: 500; color: var(--el-color-text); }
input, textarea, select {
  min-width: 16rem;
  max-width: 100%;
  padding: var(--el-space-3) var(--el-space-3);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-md);
  background-color: var(--el-color-surface);
  color: var(--el-color-text);
  font-family: var(--el-font-sans);
  font-size: var(--el-text-base);
  transition: border-color var(--el-transition), box-shadow var(--el-transition);
}
input:hover, textarea:hover, select:hover { border-color: var(--el-color-border-strong); }
input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: none;
  border-color: var(--el-color-primary-blue);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}

button {
  border: 1px solid transparent;
  border-radius: var(--el-radius-md);
  padding: var(--el-space-3) var(--el-space-5);
  font-family: var(--el-font-sans);
  font-weight: 600;
  font-size: var(--el-text-sm);
  letter-spacing: 0.01em;
  background: var(--el-gradient-brand);
  color: #fff;
  box-shadow: var(--el-shadow-brand);
  cursor: pointer;
  transition: transform var(--el-transition), box-shadow var(--el-transition), filter var(--el-transition);
}
button:hover { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 16px 32px -10px rgba(124, 58, 237, 0.5); }
button:active { transform: translateY(0); }
button:focus-visible, a:focus-visible {
  outline: 2px solid var(--el-color-primary-blue);
  outline-offset: 3px;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin-bottom: var(--el-space-4);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  overflow: hidden;
  background-color: var(--el-color-surface);
  box-shadow: var(--el-shadow-xs);
}
th, td {
  padding: var(--el-space-3) var(--el-space-4);
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--el-color-border);
  font-size: var(--el-text-sm);
}
tr:last-child td { border-bottom: 0; }
tbody tr { transition: background-color var(--el-transition); }
tbody tr:hover { background: var(--el-color-bg-soft); }
th {
  font-size: var(--el-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--el-color-bg-soft);
  color: var(--el-color-text-secondary);
}

.el-logo-mark { width: 32px; height: 32px; flex: 0 0 auto; display: block; }
.el-brand-row { display: flex; align-items: center; gap: var(--el-space-2); margin: 0; }
.el-brand-row .el-logo-mark { width: 28px; height: 28px; }

.el-shell {
  max-width: 720px;
  margin: var(--el-space-10) auto;
  padding: var(--el-space-8);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-xl);
  box-shadow: var(--el-shadow-lg);
  background: var(--el-color-surface);
  position: relative;
  overflow: hidden;
}
.el-shell::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: var(--el-gradient-brand);
}
.el-shell h1 { font-size: var(--el-text-2xl); }

.el-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: var(--el-text-xs);
  font-weight: 600;
  color: var(--el-color-dark-blue);
  background: linear-gradient(135deg, rgba(37,99,235,.12), rgba(124,58,237,.12));
  border: 1px solid rgba(37, 99, 235, 0.25);
}

.el-error {
  color: var(--el-color-danger);
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: var(--el-space-3) var(--el-space-4);
  border-radius: var(--el-radius-md);
  font-weight: 500;
  margin-bottom: var(--el-space-4);
}

.el-app-shell {
  min-height: 100vh;
  display: flex;
}

.el-sidebar {
  width: 264px;
  border-right: 1px solid var(--el-color-border);
  background: var(--el-color-surface);
  padding: var(--el-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--el-space-5);
  position: sticky;
  top: 0;
  height: 100vh;
}

.el-sidebar-brand {
  padding: var(--el-space-4);
  border-radius: var(--el-radius-lg);
  background: var(--el-gradient-soft);
  border: 1px solid rgba(37, 99, 235, 0.10);
}

.el-brand-title {
  margin: 0;
  font-weight: 800;
  font-size: var(--el-text-lg);
  letter-spacing: -0.02em;
  background: var(--el-gradient-brand);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.el-brand-subtitle {
  margin: var(--el-space-2) 0 0;
  font-size: var(--el-text-xs);
  line-height: 1.4;
  color: var(--el-color-text-secondary);
}

.el-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.el-nav-link {
  display: block;
  padding: var(--el-space-3) var(--el-space-3);
  border-radius: var(--el-radius-md);
  font-weight: 500;
  font-size: var(--el-text-sm);
  color: var(--el-color-text-secondary);
  transition: all var(--el-transition);
  position: relative;
}
.el-nav-link:hover {
  background: var(--el-color-bg-soft);
  color: var(--el-color-text);
}
.el-nav-link.is-active {
  background: var(--el-color-info-bg);
  color: var(--el-color-primary-blue);
  font-weight: 600;
}
.el-nav-link.is-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--el-gradient-brand);
}

.el-sidebar-gradient {
  margin-top: auto;
  height: 6px;
  border-radius: 999px;
  background: var(--el-gradient-brand);
  opacity: 0.85;
}

.el-app-main {
  flex: 1;
  padding: var(--el-space-6) var(--el-space-8);
  max-width: 100%;
  overflow-x: auto;
}

.el-app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--el-space-4);
  padding: var(--el-space-5) var(--el-space-6);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  background: var(--el-color-surface);
  box-shadow: var(--el-shadow-xs);
  margin-bottom: var(--el-space-5);
}

.el-header-school {
  margin: 0;
  font-size: var(--el-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--el-color-text-secondary);
}

.el-header-title {
  margin: var(--el-space-1) 0 0;
  font-size: var(--el-text-2xl);
  font-weight: 700;
  color: var(--el-color-text);
}

.el-user-box { text-align: right; display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.el-user-name { margin: 0; font-size: var(--el-text-sm); font-weight: 600; color: var(--el-color-text); }
.el-user-email { margin: 0; font-size: var(--el-text-xs); color: var(--el-color-text-secondary); }

.el-dashboard-content { display: grid; gap: var(--el-space-5); }

.el-card {
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  background: var(--el-color-surface);
  box-shadow: var(--el-shadow-xs);
  padding: var(--el-space-6);
  transition: box-shadow var(--el-transition), transform var(--el-transition);
}
.el-card:hover { box-shadow: var(--el-shadow-sm); }
.el-card h2 { font-size: var(--el-text-xl); margin-bottom: var(--el-space-4); }
.el-card h3 { font-size: var(--el-text-base); }

.el-metric-grid { display: grid; gap: var(--el-space-4); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }

.el-metric {
  position: relative;
  padding: var(--el-space-5);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  background: var(--el-color-surface);
  box-shadow: var(--el-shadow-xs);
  overflow: hidden;
  transition: transform var(--el-transition), box-shadow var(--el-transition);
}
.el-metric::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--el-gradient-brand);
  opacity: 0.85;
}
.el-metric:hover { transform: translateY(-2px); box-shadow: var(--el-shadow-md); }

.el-metric-label {
  margin: 0;
  color: var(--el-color-text-secondary);
  font-size: var(--el-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.el-metric-value {
  margin: var(--el-space-2) 0 0;
  font-size: var(--el-text-3xl);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--el-color-text);
}

.el-split-grid { display: grid; gap: var(--el-space-5); grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }

.el-quick-actions { display: flex; flex-wrap: wrap; gap: var(--el-space-2); }

.el-empty-state {
  margin: 0;
  padding: var(--el-space-6);
  text-align: center;
  color: var(--el-color-text-secondary);
  background: var(--el-color-bg-soft);
  border: 1px dashed var(--el-color-border);
  border-radius: var(--el-radius-md);
}

.el-page-intro { display: flex; justify-content: space-between; align-items: center; gap: var(--el-space-3); margin-bottom: var(--el-space-5); }

.el-toolbar { display: flex; flex-wrap: wrap; gap: var(--el-space-3); align-items: end; }
.el-toolbar label { margin: 0; }

.el-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: var(--el-text-xs);
  font-weight: 600;
}
.el-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.el-status.is-success { background: #dcfce7; color: #166534; }
.el-status.is-warning { background: #fef3c7; color: #92400e; }
.el-status.is-danger  { background: #fee2e2; color: #991b1b; }
.el-status.is-info    { background: #dbeafe; color: #1e3a8a; }

.el-landing { max-width: 1140px; margin: 0 auto; padding: var(--el-space-8) var(--el-space-6); display: grid; gap: var(--el-space-7); }

.el-landing-hero {
  position: relative;
  padding: var(--el-space-10) var(--el-space-8);
  border-radius: var(--el-radius-xl);
  border: 1px solid var(--el-color-border);
  background:
    radial-gradient(circle at 90% 0%, rgba(124, 58, 237, 0.18), transparent 42%),
    radial-gradient(circle at 0% 100%, rgba(34, 197, 94, 0.18), transparent 45%),
    var(--el-color-surface);
  box-shadow: var(--el-shadow-lg);
  overflow: hidden;
}
.el-landing-hero::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: var(--el-gradient-brand);
}

.el-landing-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--el-space-3);
  font-weight: 800;
  font-size: var(--el-text-xl);
  color: var(--el-color-text);
  letter-spacing: -0.02em;
}
.el-landing-brand .el-logo-mark { width: 40px; height: 40px; }
.el-landing-brand span {
  background: var(--el-gradient-brand);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.el-landing h1 {
  margin-top: var(--el-space-5);
  font-size: var(--el-text-4xl);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  max-width: 22ch;
}

.el-landing-slogan {
  font-size: var(--el-text-lg);
  color: var(--el-color-text-secondary);
  max-width: 60ch;
  line-height: 1.55;
}

.el-landing-cta { display: flex; flex-wrap: wrap; gap: var(--el-space-3); margin-top: var(--el-space-5); }

.el-button-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--el-space-3) var(--el-space-5);
  border-radius: var(--el-radius-md);
  border: 1px solid var(--el-color-border-strong);
  color: var(--el-color-text);
  background: var(--el-color-surface);
  font-weight: 600;
  font-size: var(--el-text-sm);
  transition: all var(--el-transition);
}
.el-button-secondary:hover {
  text-decoration: none;
  background: var(--el-color-bg-soft);
  border-color: var(--el-color-primary-blue);
  color: var(--el-color-primary-blue);
}

.el-landing-grid { display: grid; gap: var(--el-space-4); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

.el-landing-card {
  padding: var(--el-space-5);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  background: var(--el-color-surface);
  box-shadow: var(--el-shadow-xs);
  transition: transform var(--el-transition), box-shadow var(--el-transition), border-color var(--el-transition);
}
.el-landing-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--el-shadow-md);
  border-color: rgba(37, 99, 235, 0.3);
}
.el-landing-card h3 { margin-bottom: var(--el-space-2); font-size: var(--el-text-base); font-weight: 700; }
.el-landing-card p { color: var(--el-color-text-secondary); font-size: var(--el-text-sm); margin: 0; }

.el-landing-note {
  border-left: 4px solid var(--el-color-primary-purple);
  padding: var(--el-space-4) var(--el-space-5);
  border-radius: var(--el-radius-md);
  background: linear-gradient(90deg, rgba(124,58,237,.06), transparent);
  color: var(--el-color-text-secondary);
}
.el-landing-note p { margin: 0; }

@media (max-width: 920px) {
  .el-app-shell { flex-direction: column; }
  .el-sidebar { width: 100%; height: auto; position: static; border-right: 0; border-bottom: 1px solid var(--el-color-border); }
  .el-app-main { padding: var(--el-space-4); }
  .el-app-header { flex-direction: column; align-items: flex-start; }
  .el-user-box { text-align: left; align-items: flex-start; }
  .el-landing { padding: var(--el-space-5) var(--el-space-4); }
  .el-landing-hero { padding: var(--el-space-7) var(--el-space-5); }
  .el-landing h1 { font-size: var(--el-text-3xl); }
  .el-shell { margin: var(--el-space-5) var(--el-space-4); padding: var(--el-space-6); }
}
`;

const EDUCLINK_LOGO_SVG = `<svg class="el-logo-mark" viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="el-logo-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#22c55e"/><stop offset="55%" stop-color="#2563eb"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><path d="M24 8 4 18l20 10 16-8v10a1.5 1.5 0 0 0 3 0V18z" fill="url(#el-logo-grad)"/><path d="M12 24v6c0 3 5.4 6 12 6s12-3 12-6v-6l-12 6z" fill="url(#el-logo-grad)" opacity=".85"/><circle cx="41.5" cy="29.5" r="2.2" fill="#7c3aed"/></svg>`;

function renderPageHead(title) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><link rel="stylesheet" href="/assets/design-system.css"><script src="/assets/ux.js" defer></script>`;
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

function renderLandingPage() {
  const productSections = [
    { title: 'Gestion administrative', description: 'Admissions, classes, enseignants, dossiers élèves et suivi des opérations quotidiennes sur une base unifiée.' },
    { title: 'Suivi pédagogique', description: 'Notes, assiduité, devoirs, évaluations et visibilité continue pour accompagner la réussite des élèves.' },
    { title: 'Communication école-parents', description: 'Annonces, messagerie et partage d’informations structurées entre l’établissement et les familles.' },
    { title: 'Finance & paiements', description: 'Frais, factures, paiements et suivi des soldes avec une vue claire pour l’administration et les parents.' },
    { title: 'IA intégrée', description: 'Fonctions IA orientées productivité pédagogique et administrative, pensées pour un déploiement progressif.' }
  ];

  const audience = ['Direction', 'Administration', 'Enseignants', 'Parents', 'Élèves'];
  const benefits = [
    'Centraliser la gestion de l’école sur une seule plateforme.',
    'Gagner du temps sur les opérations administratives et le suivi.',
    'Améliorer le pilotage pédagogique avec des données structurées.',
    'Fluidifier la communication école-parents au quotidien.',
    'Préparer l’école au digital et à l’IA avec un cadre maîtrisé.'
  ];

  return `<!doctype html><html lang="fr"><head>${renderPageHead('EducLink - L’école connectée, intelligente et simplifiée')}</head><body>
    <main class="el-landing">
      <section class="el-landing-hero">
        <p class="el-landing-brand">${EDUCLINK_LOGO_SVG}<span>EducLink</span></p>
        <h1>L’école connectée, intelligente et simplifiée</h1>
        <p class="el-landing-slogan">La solution SaaS pensée pour les établissements privés: gestion scolaire, communication et IA dans une expérience moderne, rassurante et orientée pilotage.</p>
        <p><strong>Positionnement:</strong> EducLink se situe entre les usages de Pronote, TouteMonAnnée et des assistants IA, adapté aux besoins des écoles privées en Algérie et en Afrique francophone.</p>
        <div class="el-landing-cta">
          <a href="/demo"><button type="button">Voir la démo</button></a>
          <a class="el-button-secondary" href="/login">Se connecter</a>
        </div>
      </section>

      <section class="el-card">
        <h2>Produit</h2>
        <div class="el-landing-grid">
          ${productSections.map((section) => `<article class="el-landing-card"><h3>${section.title}</h3><p>${section.description}</p></article>`).join('')}
        </div>
      </section>

      <section class="el-card">
        <h2>Pour qui ?</h2>
        <div class="el-landing-grid">
          ${audience.map((profile) => `<article class="el-landing-card"><h3>${profile}</h3><p>Expérience dédiée et workflows adaptés au rôle dans l’établissement.</p></article>`).join('')}
        </div>
      </section>

      <section class="el-card">
        <h2>Bénéfices clés</h2>
        <ul>
          ${benefits.map((benefit) => `<li>${benefit}</li>`).join('')}
        </ul>
      </section>

      <section class="el-card">
        <h2>Démo commerciale</h2>
        <p>Vous pouvez explorer un parcours démonstration de bout en bout pour valider l’adéquation métier avec votre établissement.</p>
        <p>Des comptes de démo sont disponibles pour la direction, l’administration, les enseignants, les parents, les élèves et la finance.</p>
        <p><a href="/demo">Accéder à la page /demo</a></p>
      </section>

      <section class="el-landing-note">
        <p><strong>Note de transparence:</strong> cette version est pilot/demo-ready. Certaines fonctionnalités restent en évolution avant une mise en production généralisée.</p>
      </section>
    </main>
  </body></html>`;
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
    [ROLES.ACCOUNTANT]: '/dashboard/accountant',
    [ROLES.SUPER_ADMIN]: '/admin/tenants'
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

const userDisplayCache = new Map();

function rememberUserIdentity(user) {
  if (!user || typeof user.id !== 'string') return;
  userDisplayCache.set(user.id, {
    displayName: user.id,
    email: typeof user.email === 'string' ? user.email : `${user.id}@educ.link`
  });
}

function getSessionIdentity(session) {
  const cached = userDisplayCache.get(session.userId);
  return {
    displayName: cached?.displayName ?? session.userId,
    email: cached?.email ?? `${session.userId}@educ.link`,
    roleLabel: getRoleLabel(session.role),
    tenantLabel: getTenantLabel(session.tenantId)
  };
}

function isNavLinkActive(currentPath, href) {
  if (!currentPath || !href) return false;
  if (currentPath === href) return true;
  // prefix match avec séparateur "/" pour éviter qu'/admin/students matche /admin/students-other
  return currentPath.startsWith(`${href}/`);
}

function buildDashboardNavigation(session, currentPath = '') {
  const navItems = [
    { label: 'Dashboard', href: getDashboardPathForRole(session.role), roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT, ROLES.ACCOUNTANT] },
    { label: 'Élèves', href: '/admin/students', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR] },
    { label: 'Enseignants', href: '/admin/teachers', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR] },
    { label: 'Comptes', href: '/admin/users', roles: [ROLES.SCHOOL_ADMIN] },
    { label: 'Établissement', href: '/admin/school-settings', roles: [ROLES.SCHOOL_ADMIN] },
    { label: 'Années scolaires', href: '/admin/school-years', roles: [ROLES.SCHOOL_ADMIN] },
    { label: 'Niveaux & classes', href: '/admin/classes', roles: [ROLES.SCHOOL_ADMIN] },
    { label: 'Matières', href: '/admin/subjects', roles: [ROLES.SCHOOL_ADMIN] },
    { label: 'Tenants', href: '/admin/tenants', roles: [ROLES.SUPER_ADMIN] },
    { label: 'Présences', href: session.role === ROLES.TEACHER ? '/teacher/attendance' : '/admin/attendance', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER] },
    { label: 'Absences', href: '/parent/absences', roles: [ROLES.PARENT] },
    { label: 'Notes', href: session.role === ROLES.TEACHER ? '/teacher/grades' : session.role === ROLES.PARENT ? '/parent/grades' : '/student/grades', roles: [ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT] },
    { label: 'Messagerie', href: '/inbox', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT] },
    { label: 'Finance', href: session.role === ROLES.PARENT ? '/parent/finance' : '/admin/finance', roles: [ROLES.SCHOOL_ADMIN, ROLES.ACCOUNTANT, ROLES.PARENT] },
    { label: 'Démo', href: '/demo', roles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT, ROLES.ACCOUNTANT] }
  ];

  return navItems
    .filter((item) => item.roles.includes(session.role))
    .map((item) => `<a class="el-nav-link ${isNavLinkActive(currentPath, item.href) ? 'is-active' : ''}" href="${item.href}">${item.label}</a>`)
    .join('');
}

function renderDashboardLayout(title, session, body) {
  const identity = getSessionIdentity(session);
  const requestPath = requestContextStorage.getStore()?.pathname || getDashboardPathForRole(session.role);
  const navigation = buildDashboardNavigation(session, requestPath);

  return `<!doctype html><html lang="fr"><head>${renderPageHead(title)}</head><body><div class="el-app-shell">
    <aside class="el-sidebar">
      <div class="el-sidebar-brand">
        <div class="el-brand-row">${EDUCLINK_LOGO_SVG}<p class="el-brand-title">EducLink</p></div>
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
          <form method="POST" action="/logout">${csrfField(session)}<button type="submit">Logout</button></form>
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
        <a href="/teacher/lesson-homework">Cahier de texte / devoirs</a>
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
    <form method="POST" action="/teacher/report-comments/generate">${csrfField(session)}
      <label>Élève <select name="studentId" required>${studentOptions}</select></label>
      <button type="submit">Générer un brouillon</button>
    </form>
    <h2>Brouillon éditable</h2>
    <form method="POST" action="/teacher/report-comments/save">${csrfField(session)}
      <input type="hidden" name="studentId" value="${escapeHtml(selectedStudentId || '')}" />
      <label>Brouillon <textarea name="draftText" rows="8" cols="80" required>${escapeHtml(draftText)}</textarea></label><br/>
      <label><input type="checkbox" name="humanValidated" value="true" /> J'ai relu/édité et je valide humainement</label><br/>
      <button type="submit">Enregistrer comme commentaire final</button>
    </form>
    <p><a href="/dashboard/teacher">Retour dashboard</a></p>
  </body></html>`;
}

function renderAttendanceEventBadge(event) {
  const label = ATTENDANCE_EVENT_TYPE_LABELS_FR[event.eventType] || event.eventType;
  const tone = ATTENDANCE_EVENT_TYPE_BADGES[event.eventType] || 'is-info';
  return `<span class="el-badge ${tone}">${label}</span>`;
}

function renderTeacherAttendancePage(session, { teacher, classRooms, selectedClassRoomId, selectedDate, students, attendanceByStudentId, eventsByStudentId = new Map(), successMessage = null, errorMessage = null }) {
  const options = classRooms
    .map((classRoom) => `<option value="${classRoom.id}" ${classRoom.id === selectedClassRoomId ? 'selected' : ''}>${classRoom.name}</option>`)
    .join('');

  const statusLabel = (status) => ATTENDANCE_STATUS_LABELS[status] || status;

  const rows = students
    .map((student) => {
      const selectedStatus = attendanceByStudentId.get(student.id)?.status ?? 'present';
      const statusOptions = ATTENDANCE_STATUSES
        .map((status) => `<option value="${status}" ${selectedStatus === status ? 'selected' : ''}>${statusLabel(status)}</option>`)
        .join('');
      return `<tr>
        <td><a href="/teacher/students/${student.id}">${student.firstName} ${student.lastName}</a></td>
        <td>${student.admissionNumber}</td>
        <td>
          <input type="hidden" name="studentId" value="${student.id}" />
          <select name="status">${statusOptions}</select>
        </td>
      </tr>`;
    })
    .join('');

  const banner =
    (successMessage ? `<div class="el-banner is-success" role="status">${successMessage}</div>` : '') +
    (errorMessage ? `<div class="el-banner is-error" role="alert">${errorMessage}</div>` : '');

  const eventTypeOptions = ATTENDANCE_EVENT_TYPES
    .map((type) => `<option value="${type}">${ATTENDANCE_EVENT_TYPE_LABELS_FR[type] || type}</option>`)
    .join('');

  const eventsBlock = selectedClassRoomId
    ? `<section class="el-card">
        <h2>Événements du jour</h2>
        <p class="el-muted">Consignez en marge de l'appel les passages infirmerie, observations, encouragements ou sanctions. Les événements s'enregistrent un par un.</p>
        ${students.map((student) => {
          const events = eventsByStudentId.get(student.id) || [];
          const eventsList = events.length === 0
            ? '<p class="el-empty-state">Aucun événement pour ce jour.</p>'
            : `<ul class="el-event-list">${events
                .map((event) => {
                  const isOwner = event.recordedByUserId === session.userId;
                  const deleteBtn = isOwner
                    ? `<form method="POST" action="/teacher/attendance/events/${event.id}/delete" style="display:inline" data-confirm="Supprimer cet événement ?">${csrfField(session)}<input type="hidden" name="date" value="${selectedDate}" /><input type="hidden" name="classRoomId" value="${selectedClassRoomId}" /><button type="submit" class="el-button-link">Supprimer</button></form>`
                    : '';
                  return `<li>${renderAttendanceEventBadge(event)} ${event.comment ? escapeHtml(event.comment) : '<span class="el-muted">(sans commentaire)</span>'} ${deleteBtn}</li>`;
                })
                .join('')}</ul>`;
          return `<details class="el-event-block">
            <summary><strong>${student.firstName} ${student.lastName}</strong> ${events.length ? `<span class="el-badge">${events.length}</span>` : ''}</summary>
            ${eventsList}
            <form method="POST" action="/teacher/attendance/events" class="el-form-inline">${csrfField(session)}
              <input type="hidden" name="date" value="${selectedDate}" />
              <input type="hidden" name="classRoomId" value="${selectedClassRoomId}" />
              <input type="hidden" name="studentId" value="${student.id}" />
              <label>Type
                <select name="eventType" required>${eventTypeOptions}</select>
              </label>
              <label>Commentaire (optionnel, ${ATTENDANCE_EVENT_MAX_COMMENT_LENGTH} car. max)
                <textarea name="comment" maxlength="${ATTENDANCE_EVENT_MAX_COMMENT_LENGTH}" rows="2"></textarea>
              </label>
              <button type="submit">Ajouter un événement</button>
            </form>
          </details>`;
        }).join('')}
      </section>`
    : '';

  return renderDashboardLayout(
    'Appel enseignant',
    session,
    `${banner}<section class="el-card">
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
          ? `<form method="POST" action="/teacher/attendance">${csrfField(session)}
      <input type="hidden" name="date" value="${selectedDate}" />
      <input type="hidden" name="classRoomId" value="${selectedClassRoomId}" />
      <table><thead><tr><th>Nom</th><th>Matricule</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>
      <button type="submit">Sauvegarder l'appel</button>
    </form>`
          : '<p class="el-empty-state">Sélectionnez une classe autorisée pour commencer.</p>'
      }
    </section>
    ${eventsBlock}`
  );
}

function renderTeacherStudentHomeworkSection(homeworks, subjectsById) {
  if (homeworks.length === 0) {
    return `<section class="el-card"><h3>Devoirs (mes matières)</h3><p class="el-empty-state">Aucun devoir pour cette classe sur vos matières.</p></section>`;
  }
  const rows = homeworks
    .map((homework) => {
      const subjectName = subjectsById.get(homework.subjectId)?.name || homework.subjectId;
      return `<tr>
        <td>${homework.dueDate}</td>
        <td>${subjectName}</td>
        <td>${homework.title}</td>
        <td>${homework.description}</td>
      </tr>`;
    })
    .join('');
  return `<section class="el-card">
    <h3>Devoirs (mes matières) <span class="el-badge">${homeworks.length}</span></h3>
    <table><thead><tr><th>Échéance</th><th>Matière</th><th>Titre</th><th>Consigne</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderTeacherStudentView(session, { student, classRoom, recentAttendance, recentGrades, recentEvents = [], homeworks, classRooms, subjects }) {
  const classRoomsById = new Map(classRooms.map((room) => [room.id, room]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const classRoomName = classRoom?.name || student.classRoomId;
  return renderDashboardLayout(
    'Fiche élève',
    session,
    `<section class="el-card">
      <h2>${student.firstName} ${student.lastName}</h2>
      <p><strong>Matricule:</strong> ${student.admissionNumber}</p>
      <p><strong>Classe:</strong> <span class="el-badge">${classRoomName}</span></p>
      <p><strong>Date de naissance:</strong> ${student.dateOfBirth || '-'}</p>
      <p class="el-muted">Vue lecture seule — accès limité à vos classes et matières.</p>
      <p><a href="/teacher/attendance">Retour à l'appel</a> · <a href="/bulletins/students/${student.id}">Voir bulletin</a></p>
    </section>
    ${renderStudentAttendanceSection(recentAttendance, classRoomsById)}
    ${renderStudentEventsSection(recentEvents)}
    ${renderStudentGradesSection(recentGrades, subjectsById)}
    ${renderTeacherStudentHomeworkSection(homeworks, subjectsById)}`
  );
}

function renderBulletinIndexPage(session, { student, classRoom, terms }) {
  const classRoomName = classRoom?.name || student.classRoomId;
  const termRows = terms.length === 0
    ? '<p class="el-empty-state">Aucun trimestre configuré. Demandez à un administrateur de créer une année scolaire avec ses trimestres.</p>'
    : `<table><thead><tr><th>Trimestre</th><th>Période</th><th></th></tr></thead><tbody>${
        terms
          .map(
            (term) => `<tr>
              <td>${term.name}</td>
              <td>${term.starts_at} → ${term.ends_at}</td>
              <td><a href="/bulletins/students/${student.id}/terms/${term.id}">Voir le bulletin</a></td>
            </tr>`
          )
          .join('')
      }</tbody></table>`;

  return renderDashboardLayout(
    'Bulletins',
    session,
    `<section class="el-card">
      <h2>Bulletins de ${student.firstName} ${student.lastName}</h2>
      <p><strong>Classe:</strong> <span class="el-badge">${classRoomName}</span></p>
      <p><strong>Matricule:</strong> ${student.admissionNumber}</p>
    </section>
    <section class="el-card">
      <h3>Trimestres disponibles</h3>
      ${termRows}
    </section>`
  );
}

function formatAverage(value) {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(2)}/20`;
}

function renderReportCardPage(session, { reportCard, schoolName, limitedScope = false }) {
  const { student, classRoom, term, subjects, overallAverage, evaluatedSubjectCount, totalGradeCount, reportComments } = reportCard;
  const averageLabel = limitedScope ? 'Moyenne sur vos matières' : 'Moyenne générale';
  const scopeNote = limitedScope
    ? '<p class="el-muted"><em>Vue restreinte aux matières que vous enseignez.</em></p>'
    : '';
  const subjectsTable = subjects.length === 0
    ? '<p class="el-empty-state">Aucune note enregistrée pour ce trimestre.</p>'
    : `<table><thead><tr><th>Matière</th><th>Notes</th><th>Moyenne</th></tr></thead><tbody>${
        subjects
          .map(
            (subject) => `<tr>
              <td><strong>${subject.subjectName}</strong>${subject.subjectCode ? ` <span class="el-badge">${subject.subjectCode}</span>` : ''}</td>
              <td>${subject.grades.length}</td>
              <td><strong>${formatAverage(subject.average)}</strong></td>
            </tr>`
          )
          .join('')
      }</tbody></table>`;

  const subjectDetails = subjects
    .map(
      (subject) => `<section class="el-card">
        <h3>${subject.subjectName}</h3>
        <table><thead><tr><th>Date</th><th>Évaluation</th><th>Coef.</th><th>Note</th><th>Appréciation</th></tr></thead><tbody>${
          subject.grades
            .map(
              (grade) => `<tr>
                <td>${grade.date}</td>
                <td>${grade.assessment?.title || '-'}</td>
                <td>${grade.assessment?.coefficient ?? '-'}</td>
                <td><strong>${grade.score}</strong>/20</td>
                <td>${grade.remark || ''}</td>
              </tr>`
            )
            .join('')
        }</tbody></table>
        <p class="el-muted">Moyenne pondérée: <strong>${formatAverage(subject.average)}</strong></p>
      </section>`
    )
    .join('');

  const commentsSection = reportComments.length === 0
    ? '<p class="el-empty-state">Aucune appréciation enregistrée pour cet élève.</p>'
    : `<ul>${
        reportComments
          .map((comment) => `<li><em>${comment.created_at.slice(0, 10)}</em> — ${comment.commentText}</li>`)
          .join('')
      }</ul>`;

  return renderDashboardLayout(
    `Bulletin ${term.name}`,
    session,
    `<section class="el-card">
      <h2>Bulletin — ${term.name}</h2>
      ${schoolName ? `<p class="el-muted">${schoolName}</p>` : ''}
      <p><strong>Élève:</strong> ${student.firstName} ${student.lastName} (${student.admissionNumber})</p>
      <p><strong>Classe:</strong> <span class="el-badge">${classRoom?.name || student.classRoomId}</span></p>
      <p><strong>Période:</strong> ${term.starts_at} → ${term.ends_at}</p>
      <p><a href="/bulletins/students/${student.id}">← Retour aux trimestres</a></p>
    </section>
    <section class="el-card">
      <h3>Synthèse</h3>
      ${scopeNote}
      ${subjectsTable}
      <p class="el-muted">Matières évaluées: <strong>${evaluatedSubjectCount}</strong> · Notes prises en compte: <strong>${totalGradeCount}</strong></p>
      <p><strong>${averageLabel}: ${formatAverage(overallAverage)}</strong></p>
    </section>
    ${subjectDetails}
    <section class="el-card">
      <h3>Appréciations</h3>
      ${commentsSection}
    </section>`
  );
}

function renderAdminAttendancePage(session, { date, classRooms, selectedClassRoomId, records, studentsById, teachersById, events = [] }) {
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
    </section>
    <section class="el-card">
      <h3>Événements de vie scolaire <span class="el-badge">${events.length}</span></h3>
      ${events.length === 0
        ? '<p class="el-empty-state">Aucun événement (infirmerie, observation, sanction, encouragement) consigné pour ce filtre.</p>'
        : `<table><thead><tr><th>Date</th><th>Classe</th><th>Élève</th><th>Type</th><th>Commentaire</th></tr></thead><tbody>${events
            .map((event) => {
              const student = studentsById.get(event.studentId);
              const label = ATTENDANCE_EVENT_TYPE_LABELS_FR[event.eventType] || event.eventType;
              const tone = ATTENDANCE_EVENT_TYPE_BADGES[event.eventType] || 'is-info';
              return `<tr>
                <td>${event.date}</td>
                <td>${event.classRoomId}</td>
                <td>${student ? `${student.firstName} ${student.lastName}` : event.studentId}</td>
                <td><span class="el-badge ${tone}">${label}</span></td>
                <td>${event.comment ? escapeHtml(event.comment) : '<span class="el-muted">—</span>'}</td>
              </tr>`;
            })
            .join('')}</tbody></table>`}
    </section>`
  );
}

function renderParentDashboard(session, dashboard) {
  const { children } = dashboard;
  const list = children.length
    ? `<ul>${children.map((student) => `<li>${student.firstName} ${student.lastName} (${student.classRoomId}) — <a href="/bulletins/students/${student.id}">bulletins</a></li>`).join('')}</ul>`
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
        <a href="/parent/grades">View grades</a>
        <a href="/parent/attendance">View attendance</a>
        <a href="/parent/homeworks">View homeworks</a>
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

function renderInboxPage(session, inbox, { recipients = [], errorCode = null, successMessage = null } = {}) {
  const announcementRows = inbox.announcements
    .map((item) => `<li><strong>${item.title}</strong> (${item.visibility})<br/>${item.body}</li>`)
    .join('');

  const threadRows = inbox.threads
    .map((thread) => `<li><a href="/inbox/threads/${thread.id}">${thread.subject}</a> — ${thread.messageCount} message(s)</li>`)
    .join('');

  const recipientCheckboxes = recipients.length === 0
    ? '<p class="el-empty-state">Aucun destinataire disponible dans votre tenant.</p>'
    : recipients
        .map((user) => `<label><input type="checkbox" name="participantIds" value="${user.id}" /> ${user.displayName || user.email} <span class="el-muted">— ${user.roleLabel}</span></label><br/>`)
        .join('');

  return renderDashboardLayout(
    'Inbox interne',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
      <h2>Annonces</h2>
      <ul>${announcementRows || '<li class="el-empty-state">Aucune annonce.</li>'}</ul>
    </section>
    <section class="el-card">
      <h2>Threads</h2>
      <ul>${threadRows || '<li class="el-empty-state">Aucun thread. Démarre une nouvelle conversation ci-dessous.</li>'}</ul>
    </section>
    <section class="el-card">
      <h2>Nouvelle conversation</h2>
      <form method="POST" action="/inbox/threads">${csrfField(session)}
        <label>Sujet <input name="subject" required minlength="3" maxlength="200" /></label><br/>
        <fieldset><legend>Destinataires (au moins 1)</legend>${recipientCheckboxes}</fieldset>
        <label>Message <textarea name="body" required minlength="1" maxlength="4000"></textarea></label><br/>
        <button type="submit">Envoyer</button>
      </form>
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
      <form method="POST" action="/inbox/threads/${thread.id}/reply">${csrfField(session)}
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
    <form method="POST" action="/admin/announcements">${csrfField(session)}
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
    <form method="POST" action="/teacher/lesson-logs">${csrfField(session)}
      <label>Date <input type="date" name="date" required /></label><br/>
      <label>Classe <select name="classRoomId" required>${classOptions}</select></label><br/>
      <label>Matière <select name="subjectId" required>${subjectOptions}</select></label><br/>
      <label>Contenu <textarea name="content" required></textarea></label><br/>
      <button type="submit">Publier lesson log</button>
    </form>
    <h2>Nouveau devoir</h2>
    <form method="POST" action="/teacher/homeworks">${csrfField(session)}
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
    <form method="POST" action="/teacher/assessments">${csrfField(session)}
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
        ? `<form method="POST" action="/teacher/grades">${csrfField(session)}
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
  const bulletinLink = student ? `<p><a href="/bulletins/students/${student.id}">Voir mes bulletins par trimestre</a></p>` : '';
  return renderDashboardLayout(
    'Mes notes',
    session,
    `<section class="el-card">
      <p>Étudiant: ${student ? `${student.firstName} ${student.lastName}` : '-'}</p>
      ${bulletinLink}
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
    <form method="POST" action="/admin/finance/fee-plans">${csrfField(session)}
      <label>Nom <input name="name" required /></label><br/>
      <label>Montant <input name="amountDue" type="number" step="0.01" min="0" required /></label><br/>
      <label>Échéance <input name="dueDate" type="date" required /></label><br/>
      <label>Description <textarea name="description"></textarea></label><br/>
      <button type="submit">Créer plan de frais</button>
    </form>
    </section><section class="el-card"><h2>Nouvelle facture</h2>
    <form method="POST" action="/admin/finance/invoices">${csrfField(session)}
      <label>Élève <select name="studentId" required>${studentOptions}</select></label><br/>
      <label>Plan de frais <select name="feePlanId">${feePlanOptions}</select></label><br/>
      <label>Montant <input name="amountDue" type="number" step="0.01" min="0" required /></label><br/>
      <label>Échéance <input name="dueDate" type="date" required /></label><br/>
      <label>Description <textarea name="description"></textarea></label><br/>
      <button type="submit">Créer facture</button>
    </form>
    </section><section class="el-card"><h2>Nouveau paiement</h2>
    <form method="POST" action="/admin/finance/payments">${csrfField(session)}
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

function renderStudentsPage(session, classRooms, students, selectedClassRoomId = '', { errorCode = null, successMessage = null, canCreate = false } = {}) {
  const filterOptions = ['<option value="">Toutes les classes</option>']
    .concat(classRooms.map((classRoom) => `<option value="${classRoom.id}" ${selectedClassRoomId === classRoom.id ? 'selected' : ''}>${classRoom.name}</option>`))
    .join('');
  const createOptions = ['<option value="">— sélectionner —</option>']
    .concat(classRooms.map((classRoom) => `<option value="${classRoom.id}">${classRoom.name}</option>`))
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

  const createCard = canCreate
    ? `<section class="el-card"><h2>Créer un élève</h2>
    <p class="el-muted">Crée la fiche élève. Cochez « Créer un accès élève » uniquement si l'élève doit pouvoir se connecter (collège/lycée).</p>
    <form method="POST" action="/admin/students">${csrfField(session)}
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Matricule <input name="admissionNumber" required /></label><br/>
      <label>Date de naissance <input name="dateOfBirth" type="date" /></label><br/>
      <label>Classe
        <select name="classRoomId" required>${createOptions}</select>
      </label><br/>
      <label><input type="checkbox" name="createAccess" value="1" /> Créer un accès élève (login)</label><br/>
      <label>Email (si accès) <input name="email" type="email" /></label><br/>
      <label>Mot de passe temporaire (si accès) <input name="password" type="password" minlength="${MIN_PASSWORD_LENGTH}" /></label><br/>
      <button type="submit">Créer</button>
    </form>
    </section>`
    : '';

  return renderDashboardLayout(
    'Gestion des élèves',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    ${createCard}
    <section class="el-card">
    <div class="el-page-intro">
      <h2>Liste des élèves</h2>
      <span class="el-badge">${students.length} élève(s)</span>
    </div>
    <form class="el-toolbar" method="GET" action="/admin/students">
      <label>Filtre classe
        <select name="classRoomId">${filterOptions}</select>
      </label>
      <button type="submit">Filtrer</button>
    </form>
    <table><thead><tr><th>Nom</th><th>Matricule</th><th>Classe</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Aucun élève trouvé.</td></tr>'}</tbody></table>
    </section>`
  );
}

const PARENT_RELATIONSHIP_LABELS = {
  mother: 'Mère',
  father: 'Père',
  guardian: 'Responsable',
  other: 'Autre'
};

const ATTENDANCE_STATUS_LABELS = {
  present: 'Présent',
  late: 'Retard',
  absent: 'Absent',
  excused: 'Excusé'
};

const ATTENDANCE_STATUS_TONES = {
  present: 'is-success',
  late: 'is-warning',
  absent: 'is-error',
  excused: 'is-info'
};

function renderStudentParentsSection(parentLinks) {
  if (parentLinks.length === 0) {
    return `<section class="el-card"><h3>Responsables liés</h3><p class="el-empty-state">Aucun responsable rattaché à cet élève.</p></section>`;
  }
  const rows = parentLinks
    .map((link) => {
      const parent = link.parent;
      const relationLabel = PARENT_RELATIONSHIP_LABELS[link.relationship] || link.relationship;
      const primaryBadge = link.isPrimaryContact ? '<span class="el-badge">contact principal</span>' : '';
      return `<tr>
        <td><a href="/admin/parents/${parent.id}">${parent.firstName} ${parent.lastName}</a> ${primaryBadge}</td>
        <td>${relationLabel}</td>
        <td>${parent.phone || '-'}</td>
        <td>${parent.email || '-'}</td>
      </tr>`;
    })
    .join('');
  return `<section class="el-card">
    <h3>Responsables liés <span class="el-badge">${parentLinks.length}</span></h3>
    <table><thead><tr><th>Responsable</th><th>Relation</th><th>Téléphone</th><th>Email</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderStudentAttendanceSection(records, classRoomsById) {
  if (records.length === 0) {
    return `<section class="el-card"><h3>Présences récentes</h3><p class="el-empty-state">Aucune présence enregistrée.</p></section>`;
  }
  const rows = records
    .map((record) => {
      const label = ATTENDANCE_STATUS_LABELS[record.status] || record.status;
      const tone = ATTENDANCE_STATUS_TONES[record.status] || 'is-info';
      const classRoomName = classRoomsById.get(record.classRoomId)?.name || record.classRoomId;
      return `<tr>
        <td>${record.date}</td>
        <td><span class="el-badge ${tone}">${label}</span></td>
        <td>${classRoomName}</td>
      </tr>`;
    })
    .join('');
  return `<section class="el-card">
    <h3>Présences récentes <span class="el-badge">${records.length}</span></h3>
    <table><thead><tr><th>Date</th><th>Statut</th><th>Classe</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderStudentGradesSection(grades, subjectsById) {
  if (grades.length === 0) {
    return `<section class="el-card"><h3>Notes récentes</h3><p class="el-empty-state">Aucune note saisie.</p></section>`;
  }
  const rows = grades
    .map((grade) => {
      const subjectName = subjectsById.get(grade.subjectId)?.name || grade.subjectId;
      const assessmentTitle = grade.assessment?.title || '-';
      return `<tr>
        <td>${grade.date}</td>
        <td>${subjectName}</td>
        <td>${assessmentTitle}</td>
        <td><strong>${grade.score}</strong>/20</td>
        <td>${grade.remark || ''}</td>
      </tr>`;
    })
    .join('');
  return `<section class="el-card">
    <h3>Notes récentes <span class="el-badge">${grades.length}</span></h3>
    <table><thead><tr><th>Date</th><th>Matière</th><th>Évaluation</th><th>Note</th><th>Appréciation</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderStudentEventsSection(events, { title = 'Événements récents' } = {}) {
  if (!events || events.length === 0) {
    return `<section class="el-card"><h3>${title}</h3><p class="el-empty-state">Aucun événement consigné pour cet élève.</p></section>`;
  }
  const rows = events
    .map((event) => {
      const label = ATTENDANCE_EVENT_TYPE_LABELS_FR[event.eventType] || event.eventType;
      const tone = ATTENDANCE_EVENT_TYPE_BADGES[event.eventType] || 'is-info';
      const comment = event.comment ? escapeHtml(event.comment) : '<span class="el-muted">—</span>';
      return `<tr>
        <td>${event.date}</td>
        <td><span class="el-badge ${tone}">${label}</span></td>
        <td>${comment}</td>
      </tr>`;
    })
    .join('');
  return `<section class="el-card">
    <h3>${title} <span class="el-badge">${events.length}</span></h3>
    <table><thead><tr><th>Date</th><th>Type</th><th>Commentaire</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderAbsenceNoticeStatusBadge(status) {
  const label = ABSENCE_STATUS_LABELS_FR[status] || status;
  const tone = ABSENCE_STATUS_BADGES[status] || 'is-info';
  return `<span class="el-badge ${tone}">${label}</span>`;
}

function renderStudentAbsenceNoticesSection(notices, { title = 'Absences déclarées par les parents' } = {}) {
  if (!notices || notices.length === 0) {
    return `<section class="el-card"><h3>${title}</h3><p class="el-empty-state">Aucune absence déclarée par les parents.</p></section>`;
  }
  const rows = notices
    .map((notice) => {
      const reasonLabel = ABSENCE_REASON_LABELS_FR[notice.reason] || notice.reason;
      const period = notice.startDate === notice.endDate ? notice.startDate : `${notice.startDate} → ${notice.endDate}`;
      const doc = notice.hasDocument ? '<span class="el-badge is-info">PDF/Image</span>' : '<span class="el-muted">—</span>';
      const comment = notice.comment ? escapeHtml(notice.comment) : '<span class="el-muted">—</span>';
      return `<tr>
        <td>${period}</td>
        <td>${reasonLabel}</td>
        <td>${comment}</td>
        <td>${doc}</td>
        <td>${renderAbsenceNoticeStatusBadge(notice.status)}</td>
      </tr>`;
    })
    .join('');
  return `<section class="el-card">
    <h3>${title} <span class="el-badge">${notices.length}</span></h3>
    <p class="el-muted">Déclarations transmises par les responsables (validation à venir en VS-04).</p>
    <table><thead><tr><th>Période</th><th>Motif</th><th>Commentaire</th><th>Justificatif</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderParentAbsencesListPage(session, notices, studentById, { successMessage = null, errorMessage = null } = {}) {
  const rows = notices
    .map((notice) => {
      const student = studentById.get(notice.studentId);
      const studentName = student ? `${student.firstName} ${student.lastName}` : notice.studentId;
      const reasonLabel = ABSENCE_REASON_LABELS_FR[notice.reason] || notice.reason;
      const period = notice.startDate === notice.endDate ? notice.startDate : `${notice.startDate} → ${notice.endDate}`;
      return `<tr>
        <td>${period}</td>
        <td>${escapeHtml(studentName)}</td>
        <td>${reasonLabel}</td>
        <td>${renderAbsenceNoticeStatusBadge(notice.status)}</td>
        <td>${notice.hasDocument ? '✓' : '—'}</td>
        <td><a href="/parent/absences/${notice.id}">Voir</a></td>
      </tr>`;
    })
    .join('');
  const banner = successMessage
    ? `<p class="el-success-banner">${escapeHtml(successMessage)}</p>`
    : errorMessage
    ? `<p class="el-error-banner">${escapeHtml(errorMessage)}</p>`
    : '';
  return renderDashboardLayout(
    'Absences déclarées',
    session,
    `${banner}
    <section class="el-card">
      <h2>Mes déclarations d'absence</h2>
      <p class="el-muted">Prévenez l'école d'une absence à venir et joignez un justificatif (PDF, PNG ou JPG, 3 Mo max).</p>
      <p><a href="/parent/absences/new" class="el-button">Déclarer une nouvelle absence</a></p>
      <table>
        <thead><tr><th>Période</th><th>Élève</th><th>Motif</th><th>Statut</th><th>Justif.</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Aucune absence déclarée pour le moment.</td></tr>'}</tbody>
      </table>
    </section>`
  );
}

function renderParentAbsenceFormPage(session, students, { errorMessage = null, prefill = {} } = {}) {
  const studentOptions = students
    .map((s) => `<option value="${s.id}" ${prefill.studentId === s.id ? 'selected' : ''}>${escapeHtml(`${s.firstName} ${s.lastName}`)}</option>`)
    .join('');
  const reasonOptions = ABSENCE_REASONS
    .map((r) => `<option value="${r}" ${prefill.reason === r ? 'selected' : ''}>${ABSENCE_REASON_LABELS_FR[r]}</option>`)
    .join('');
  const allowedAccept = ALLOWED_DOCUMENT_MIME_TYPES.join(',');
  const banner = errorMessage ? `<p class="el-error-banner">${escapeHtml(errorMessage)}</p>` : '';
  const today = todayIsoDate();

  return renderDashboardLayout(
    'Déclarer une absence',
    session,
    `${banner}
    <section class="el-card">
      <h2>Déclarer une absence</h2>
      <p class="el-muted">Cette déclaration sera transmise à l'administration. Statut initial : "En attente". L'école pourra valider ou demander un complément.</p>
      <form method="POST" action="/parent/absences" enctype="multipart/form-data">${csrfField(session)}
        <label>Élève
          <select name="studentId" required>${studentOptions}</select>
        </label><br/>
        <label>Du <input type="date" name="startDate" min="${today}" value="${escapeHtml(prefill.startDate || today)}" required /></label>
        <label>Au <input type="date" name="endDate" min="${today}" value="${escapeHtml(prefill.endDate || today)}" required /></label><br/>
        <label>Motif
          <select name="reason" required>${reasonOptions}</select>
        </label><br/>
        <label>Commentaire (optionnel, ${ABSENCE_NOTICE_MAX_COMMENT_LENGTH} car. max)
          <textarea name="comment" rows="3" maxlength="${ABSENCE_NOTICE_MAX_COMMENT_LENGTH}">${escapeHtml(prefill.comment || '')}</textarea>
        </label><br/>
        <label>Justificatif (optionnel, PDF / PNG / JPG, ${Math.round(MAX_DOCUMENT_SIZE_BYTES / 1024 / 1024)} Mo max)
          <input type="file" name="document" accept="${allowedAccept}" />
        </label><br/>
        <button type="submit">Envoyer la déclaration</button>
        <a href="/parent/absences">Annuler</a>
      </form>
    </section>`
  );
}

function renderParentAbsenceDetailPage(session, notice, student) {
  const studentName = student ? `${student.firstName} ${student.lastName}` : notice.studentId;
  const reasonLabel = ABSENCE_REASON_LABELS_FR[notice.reason] || notice.reason;
  const period = notice.startDate === notice.endDate ? notice.startDate : `${notice.startDate} → ${notice.endDate}`;
  const documentBlock = notice.hasDocument
    ? `<p><a href="/parent/absences/${notice.id}/document" target="_blank">Voir le justificatif (${escapeHtml(notice.documentFileName)}, ${Math.round((notice.documentSizeBytes || 0) / 1024)} Ko)</a></p>`
    : '<p class="el-muted">Aucun justificatif joint.</p>';
  return renderDashboardLayout(
    'Détail de l\'absence',
    session,
    `<section class="el-card">
      <h2>Absence déclarée</h2>
      <p><strong>Élève :</strong> ${escapeHtml(studentName)}</p>
      <p><strong>Période :</strong> ${period}</p>
      <p><strong>Motif :</strong> ${reasonLabel}</p>
      <p><strong>Statut :</strong> ${renderAbsenceNoticeStatusBadge(notice.status)}</p>
      <p><strong>Commentaire :</strong> ${notice.comment ? escapeHtml(notice.comment) : '<span class="el-muted">—</span>'}</p>
      ${documentBlock}
      <p><a href="/parent/absences">← Retour à la liste</a></p>
    </section>`
  );
}

function renderStudentProfile(session, student, classRooms = [], {
  canManage = false,
  errorCode = null,
  successMessage = null,
  parentLinks = [],
  recentAttendance = [],
  recentGrades = [],
  recentEvents = [],
  recentAbsenceNotices = [],
  subjects = []
} = {}) {
  const classRoomName = classRooms.find((room) => room.id === student.classRoomId)?.name || student.classRoomId;
  const classRoomsById = new Map(classRooms.map((room) => [room.id, room]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const editForm = canManage
    ? `<section class="el-card">
        <h3>Modifier la fiche</h3>
        <form method="POST" action="/admin/students/${student.id}/update">${csrfField(session)}
          <label>Prénom <input name="firstName" value="${student.firstName}" required /></label><br/>
          <label>Nom <input name="lastName" value="${student.lastName}" required /></label><br/>
          <label>Matricule <input name="admissionNumber" value="${student.admissionNumber}" required /></label><br/>
          <label>Date de naissance <input name="dateOfBirth" type="date" value="${student.dateOfBirth || ''}" /></label><br/>
          <label>Classe
            <select name="classRoomId" required>
              ${classRooms.map((room) => `<option value="${room.id}" ${room.id === student.classRoomId ? 'selected' : ''}>${room.name}</option>`).join('')}
            </select>
          </label><br/>
          <button type="submit">Enregistrer</button>
        </form>
      </section>`
    : '';
  const archiveForm = canManage && !student.archived_at
    ? `<section class="el-card">
        <h3>Archiver</h3>
        <p class="el-muted">L'élève disparaît des listes actives mais reste consultable.</p>
        <form method="POST" action="/admin/students/${student.id}/archive" data-confirm="Archiver cet élève ? Il disparaîtra des listes actives mais restera consultable.">${csrfField(session)}<button type="submit">Archiver l'élève</button></form>
      </section>`
    : '';

  return renderDashboardLayout(
    'Fiche élève',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
      <h2>${student.firstName} ${student.lastName}</h2>
      <p><strong>Matricule:</strong> ${student.admissionNumber}</p>
      <p><strong>Classe:</strong> <span class="el-badge">${classRoomName}</span></p>
      <p><strong>Date de naissance:</strong> ${student.dateOfBirth || '-'}</p>
      <p><strong>Statut:</strong> ${renderStatusBadge(student.archived_at ? 'archivé' : 'actif', { actif: 'is-success', archivé: 'is-warning' })}</p>
      <p><strong>ID:</strong> ${student.id}</p>
      <p><a href="/admin/students">Retour à la liste</a> · <a href="/bulletins/students/${student.id}">Voir bulletins</a></p>
    </section>
    ${renderStudentParentsSection(parentLinks)}
    ${renderStudentAttendanceSection(recentAttendance, classRoomsById)}
    ${renderStudentEventsSection(recentEvents)}
    ${renderStudentAbsenceNoticesSection(recentAbsenceNotices)}
    ${renderStudentGradesSection(recentGrades, subjectsById)}
    ${editForm}
    ${archiveForm}`
  );
}

function renderParentsPage(session, parents, { errorCode = null, successMessage = null } = {}) {
  const rows = parents
    .map(
      (parent) => `<tr>
        <td><a href="/admin/parents/${parent.id}">${parent.firstName} ${parent.lastName}</a></td>
        <td>${parent.phone || '-'}</td>
        <td>${parent.email || '-'}</td>
        <td>${renderStatusBadge(parent.archived_at ? 'archivé' : 'actif', { actif: 'is-success', archivé: 'is-warning' })}</td>
      </tr>`
    )
    .join('');

  return renderDashboardLayout(
    'Gestion des responsables',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card"><h2>Créer un responsable</h2>
    <p class="el-muted">Crée à la fois la fiche parent et le compte de connexion (rôle parent).</p>
    <form method="POST" action="/admin/parents">${csrfField(session)}
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Email <input name="email" type="email" required /></label><br/>
      <label>Mot de passe temporaire <input name="password" type="password" minlength="${MIN_PASSWORD_LENGTH}" required /></label><br/>
      <label>Téléphone <input name="phone" /></label><br/>
      <label>Adresse <input name="address" /></label><br/>
      <label>Notes <textarea name="notes"></textarea></label><br/>
      <button type="submit">Créer</button>
    </form>
    </section><section class="el-card">
    <h2>Liste</h2>
    <table><thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Statut</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Aucun responsable.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderParentProfile(session, parent, students, links) {
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
    <form method="POST" action="/admin/parents/${parent.id}/update">${csrfField(session)}
      <label>Prénom <input name="firstName" value="${parent.firstName}" required /></label><br/>
      <label>Nom <input name="lastName" value="${parent.lastName}" required /></label><br/>
      <label>Téléphone <input name="phone" value="${parent.phone}" /></label><br/>
      <label>Email <input name="email" type="email" value="${parent.email}" /></label><br/>
      <label>Adresse <input name="address" value="${parent.address}" /></label><br/>
      <label>Notes <textarea name="notes">${parent.notes}</textarea></label><br/>
      <button type="submit">Enregistrer</button>
    </form>
    <form method="POST" action="/admin/parents/${parent.id}/archive" data-confirm="Archiver ce responsable ? Il disparaîtra des listes actives.">${csrfField(session)}<button type="submit">Archiver</button></form>
    <h2>Lier à des élèves</h2>
    <form method="POST" action="/admin/parents/${parent.id}/links">${csrfField(session)}
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

const ADMIN_ERROR_MESSAGES = {
  email_required: "L'email est requis pour créer un compte.",
  email_invalid: "L'email saisi est invalide.",
  password_required: `Le mot de passe temporaire doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
  email_duplicate: 'Cet email est déjà utilisé par un autre compte.',
  invalid_input: 'Les informations saisies sont invalides.',
  cannot_self_deactivate: 'Vous ne pouvez pas désactiver votre propre compte.',
  user_not_found: 'Compte introuvable.',
  forbidden: 'Action non autorisée.',
  slug_required: 'Le slug du tenant est requis (lettres minuscules, chiffres, tirets).',
  slug_invalid: 'Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets (ex : ecole-pilote).',
  slug_duplicate: 'Un tenant utilise déjà ce slug.',
  tenant_required: 'Le nom du tenant est requis.',
  not_found: 'Ressource introuvable.',
  reference_invalid: 'Une référence (niveau ou année) est invalide ou manquante.'
};

function renderErrorPage(session, { status, title, message }) {
  const dashboardLink = session && session.role
    ? `<a class="el-btn-primary" href="${getDashboardPathForRole(session.role)}">Retour au tableau de bord</a>`
    : `<a class="el-btn-primary" href="/login">Aller à la page de connexion</a>`;
  const body = `<section class="el-card">
      <p class="el-badge">Code ${status}</p>
      <h2>${title}</h2>
      <p>${message}</p>
      <p>${dashboardLink}</p>
    </section>`;
  if (session && session.role) {
    return renderDashboardLayout(title, session, body);
  }
  return `<!doctype html><html lang="fr"><head>${renderPageHead(`${title} — EducLink`)}</head><body><main class="el-shell">${body}</main></body></html>`;
}

function sendForbiddenPage(response, session) {
  if (response.headersSent) return;
  response.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
  response.end(
    renderErrorPage(session, {
      status: 403,
      title: 'Accès refusé',
      message: "Vous n'avez pas l'autorisation d'accéder à cette section. Si vous pensez qu'il s'agit d'une erreur, contactez votre administrateur."
    })
  );
}

function sendNotFoundPage(response, session) {
  if (response.headersSent) return;
  response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  response.end(
    renderErrorPage(session, {
      status: 404,
      title: 'Page introuvable',
      message: "La page que vous cherchez n'existe pas ou a été déplacée."
    })
  );
}

function sendServerErrorPage(response, session) {
  if (response.headersSent) return;
  response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
  response.end(
    renderErrorPage(session, {
      status: 500,
      title: 'Erreur serveur',
      message: "Une erreur inattendue est survenue. L'équipe a été notifiée. Merci de réessayer dans un instant."
    })
  );
}

function renderAdminErrorBanner(errorCode) {
  if (!errorCode) return '';
  const message = ADMIN_ERROR_MESSAGES[errorCode] || ADMIN_ERROR_MESSAGES.invalid_input;
  return `<div class="el-banner is-error" role="alert">${message}</div>`;
}

function renderAdminSuccessBanner(message) {
  if (!message) return '';
  return `<div class="el-banner is-success" role="status">${message}</div>`;
}

function renderTeachersPage(session, teachers, { errorCode = null, successMessage = null, canManage = false } = {}) {
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
  const createCard = canManage
    ? `<section class="el-card"><h2>Créer un enseignant</h2>
    <p class="el-muted">Crée à la fois la fiche enseignant et le compte de connexion (rôle enseignant).</p>
    <form method="POST" action="/admin/teachers">${csrfField(session)}
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Email <input name="email" type="email" required /></label><br/>
      <label>Mot de passe temporaire <input name="password" type="password" minlength="${MIN_PASSWORD_LENGTH}" required /></label><br/>
      <label>Téléphone <input name="phone" /></label><br/>
      <label>Notes <textarea name="notes"></textarea></label><br/>
      <button type="submit">Créer</button>
    </form>
    </section>`
    : '';
  return renderDashboardLayout(
    'Gestion des enseignants',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    ${createCard}<section class="el-card">
    <h2>Liste</h2>
    <table><thead><tr><th>Nom</th><th>Email</th><th># Classes</th><th># Matières</th><th>Statut</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucun enseignant.</td></tr>'}</tbody></table>
    </section>`
  );
}

function renderTeacherProfile(session, teacher, classRooms, subjects, { canManage = false } = {}) {
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
  const manageForm = canManage
    ? `<h3>Informations</h3>
    <form method="POST" action="/admin/teachers/${teacher.id}/update">${csrfField(session)}
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
    <form method="POST" action="/admin/teachers/${teacher.id}/archive" data-confirm="Archiver cet enseignant ? Il disparaîtra des listes actives.">${csrfField(session)}<button type="submit">Archiver</button></form>`
    : `<p class="el-muted">Vue lecture seule. Seul un administrateur peut modifier ces informations.</p>
    <p><strong>Prénom:</strong> ${teacher.firstName}</p>
    <p><strong>Nom:</strong> ${teacher.lastName}</p>
    <p><strong>Email:</strong> ${teacher.email || '-'}</p>
    <p><strong>Téléphone:</strong> ${teacher.phone || '-'}</p>
    <p><strong>Notes:</strong> ${teacher.notes || '-'}</p>`;

  return renderDashboardLayout(
    'Fiche enseignant',
    session,
    `<section class="el-card">
    <h2>${teacher.firstName} ${teacher.lastName}</h2>
    <p><strong>ID:</strong> ${teacher.id}</p>
    <p><strong>Statut:</strong> ${renderStatusBadge(teacher.archived_at ? 'archivé' : 'actif', { actif: 'is-success', archivé: 'is-warning' })}</p>
    ${manageForm}
    </section>
    <section class="el-card">
    <h2>Affectations existantes</h2>
    <p><strong>Classes:</strong> ${classNames}</p>
    <p><strong>Matières:</strong> ${subjectNames}</p>
    <p><a href="/admin/teachers">Retour</a></p>
    </section>`
  );
}

function renderUsersPage(session, users, { errorCode = null, successMessage = null } = {}) {
  const rows = users
    .map((user) => {
      const statusBadge = renderStatusBadge(user.isActive ? 'actif' : 'désactivé', {
        actif: 'is-success',
        'désactivé': 'is-warning'
      });
      const isSelf = user.id === session.userId;
      const toggleAction = user.isActive ? 'deactivate' : 'activate';
      const toggleLabel = user.isActive ? 'Désactiver' : 'Réactiver';
      const toggleForm = isSelf && user.isActive
        ? '<span class="el-muted">— (vous)</span>'
        : `<form method="POST" action="/admin/users/${user.id}/${toggleAction}" style="display:inline">${csrfField(session)}<button type="submit">${toggleLabel}</button></form>`;
      const resetForm = `<form method="POST" action="/admin/users/${user.id}/reset-password" style="display:inline">${csrfField(session)}<input name="password" type="password" minlength="${MIN_PASSWORD_LENGTH}" placeholder="Nouveau mot de passe" required /><button type="submit">Réinitialiser</button></form>`;
      return `<tr>
        <td>${user.email}${isSelf ? ' <span class="el-badge">vous</span>' : ''}</td>
        <td>${getRoleLabel(user.role)}</td>
        <td>${statusBadge}</td>
        <td>${toggleForm}</td>
        <td>${resetForm}</td>
      </tr>`;
    })
    .join('');

  return renderDashboardLayout(
    'Gestion des comptes',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
    <div class="el-page-intro">
      <h2>Comptes utilisateurs</h2>
      <span class="el-badge">${users.length} compte(s)</span>
    </div>
    <p class="el-muted">Activez/désactivez l'accès des comptes ou réinitialisez leur mot de passe. Un utilisateur désactivé ne peut plus se connecter.</p>
    <table>
      <thead><tr><th>Email</th><th>Rôle</th><th>Statut</th><th>Accès</th><th>Mot de passe</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Aucun compte.</td></tr>'}</tbody>
    </table>
    <p class="el-muted">Pour créer un nouvel utilisateur, utilisez les pages <a href="/admin/teachers">Enseignants</a>, <a href="/admin/parents">Responsables</a> ou <a href="/admin/students">Élèves</a>.</p>
    </section>`
  );
}

function renderSchoolSettingsPage(session, school, { errorCode = null, successMessage = null } = {}) {
  const existing = school
    ? `<p class="el-muted">Identifiant interne : <code>${escapeHtml(school.id)}</code></p>`
    : '<p class="el-muted">Aucune fiche établissement créée pour ce tenant.</p>';

  return renderDashboardLayout(
    'Paramètres de l\'établissement',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
      <h2>Identité de l'établissement</h2>
      ${existing}
      <form method="POST" action="/admin/school-settings">${csrfField(session)}
        <label>Nom <input name="name" required minlength="2" maxlength="120" value="${escapeHtml(school?.name ?? '')}" /></label><br/>
        <label>Code <input name="code" required minlength="1" maxlength="30" value="${escapeHtml(school?.code ?? '')}" /></label><br/>
        <label>Ville <input name="city" maxlength="120" value="${escapeHtml(school?.city ?? '')}" /></label><br/>
        <label>Pays <input name="country" maxlength="80" value="${escapeHtml(school?.country ?? '')}" /></label><br/>
        <button type="submit">${school ? 'Mettre à jour' : 'Créer la fiche école'}</button>
      </form>
    </section>`
  );
}

function renderSchoolYearsPage(session, years, terms, { errorCode = null, successMessage = null } = {}) {
  const yearsRows = years
    .map((year) => {
      const yearTerms = terms.filter((term) => term.academicYearId === year.id);
      const termsList = yearTerms.length
        ? `<ul>${yearTerms
            .map(
              (term) => `<li>${escapeHtml(term.name)} (${escapeHtml(term.startsAt)} → ${escapeHtml(term.endsAt)})
                <form method="POST" action="/admin/school-years/${term.id}/term-delete" style="display:inline">${csrfField(session)}<button type="submit">supprimer</button></form>
              </li>`
            )
            .join('')}</ul>`
        : '<p class="el-muted">Aucun trimestre/semestre déclaré pour cette année.</p>';

      return `<tr>
        <td>${escapeHtml(year.label)}</td>
        <td>${escapeHtml(year.startsAt)}</td>
        <td>${escapeHtml(year.endsAt)}</td>
        <td>${renderStatusBadge(year.status || 'draft', { active: 'is-success', closed: 'is-warning', draft: 'is-info' })}</td>
        <td>
          ${termsList}
          <form method="POST" action="/admin/school-years/${year.id}/terms">${csrfField(session)}
            <input name="name" placeholder="Nom (ex : Trimestre 1)" required minlength="2" maxlength="60" />
            <input name="startsAt" type="date" required />
            <input name="endsAt" type="date" required />
            <button type="submit">Ajouter trimestre</button>
          </form>
          <form method="POST" action="/admin/school-years/${year.id}/delete" style="display:inline" data-confirm="Supprimer cette année scolaire ET tous ses trimestres ? Action irréversible.">${csrfField(session)}<button type="submit">Supprimer l'année</button></form>
        </td>
      </tr>`;
    })
    .join('');

  return renderDashboardLayout(
    'Années scolaires',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
      <h2>Créer une année scolaire</h2>
      <form method="POST" action="/admin/school-years">${csrfField(session)}
        <label>Libellé (ex : 2025-2026) <input name="label" required minlength="2" maxlength="60" /></label><br/>
        <label>Date de début <input name="startsAt" type="date" required /></label><br/>
        <label>Date de fin <input name="endsAt" type="date" required /></label><br/>
        <label>Statut
          <select name="status">
            <option value="draft">Brouillon</option>
            <option value="active">Active</option>
            <option value="closed">Clôturée</option>
          </select>
        </label><br/>
        <button type="submit">Créer</button>
      </form>
    </section>
    <section class="el-card">
      <h2>Années existantes</h2>
      <table>
        <thead><tr><th>Libellé</th><th>Début</th><th>Fin</th><th>Statut</th><th>Trimestres / Actions</th></tr></thead>
        <tbody>${yearsRows || '<tr><td colspan="5">Aucune année scolaire.</td></tr>'}</tbody>
      </table>
    </section>`
  );
}

function renderClassesPage(session, gradeLevels, classRooms, { errorCode = null, successMessage = null } = {}) {
  const gradeOptions = gradeLevels
    .map((grade) => `<option value="${escapeHtml(grade.id)}">${escapeHtml(grade.name)}</option>`)
    .join('');
  const gradeRows = gradeLevels
    .map(
      (grade) => `<tr>
        <td>${escapeHtml(grade.name)}</td>
        <td>${Number.isFinite(Number(grade.order)) ? Number(grade.order) : '-'}</td>
        <td>
          <form method="POST" action="/admin/grade-levels/${grade.id}/delete" style="display:inline" data-confirm="Supprimer ce niveau ? Les classes rattachées doivent être supprimées d'abord.">${csrfField(session)}<button type="submit">Supprimer</button></form>
        </td>
      </tr>`
    )
    .join('');

  const classRows = classRooms
    .map((classRoom) => {
      const grade = gradeLevels.find((item) => item.id === classRoom.gradeLevelId);
      return `<tr>
        <td>${escapeHtml(classRoom.name)}</td>
        <td>${grade ? escapeHtml(grade.name) : '<span class="el-muted">niveau supprimé</span>'}</td>
        <td>${Number(classRoom.capacity) || 0}</td>
        <td><form method="POST" action="/admin/classes/${classRoom.id}/delete" style="display:inline" data-confirm="Supprimer cette classe ?">${csrfField(session)}<button type="submit">Supprimer</button></form></td>
      </tr>`;
    })
    .join('');

  const classFormFooter = gradeLevels.length === 0
    ? '<p class="el-muted">Crée d\'abord un niveau pour pouvoir y rattacher des classes.</p>'
    : '';

  return renderDashboardLayout(
    'Niveaux & classes',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
      <h2>Niveaux (ex : 6ème, 5ème)</h2>
      <form method="POST" action="/admin/grade-levels">${csrfField(session)}
        <label>Nom <input name="name" required minlength="1" maxlength="60" /></label>
        <label>Ordre <input name="order" type="number" min="0" max="30" value="0" /></label>
        <button type="submit">Ajouter niveau</button>
      </form>
      <table>
        <thead><tr><th>Nom</th><th>Ordre</th><th>Action</th></tr></thead>
        <tbody>${gradeRows || '<tr><td colspan="3">Aucun niveau.</td></tr>'}</tbody>
      </table>
    </section>
    <section class="el-card">
      <h2>Classes (ex : 6ème A, 6ème B)</h2>
      <form method="POST" action="/admin/classes">${csrfField(session)}
        <label>Nom <input name="name" required minlength="1" maxlength="80" /></label>
        <label>Niveau
          <select name="gradeLevelId" required ${gradeLevels.length === 0 ? 'disabled' : ''}>
            ${gradeOptions || '<option value="">— Aucun niveau —</option>'}
          </select>
        </label>
        <label>Capacité <input name="capacity" type="number" min="0" max="200" value="30" /></label>
        <button type="submit" ${gradeLevels.length === 0 ? 'disabled' : ''}>Ajouter classe</button>
      </form>
      ${classFormFooter}
      <table>
        <thead><tr><th>Classe</th><th>Niveau</th><th>Capacité</th><th>Action</th></tr></thead>
        <tbody>${classRows || '<tr><td colspan="4">Aucune classe.</td></tr>'}</tbody>
      </table>
    </section>`
  );
}

function renderSubjectsPage(session, subjects, { errorCode = null, successMessage = null } = {}) {
  const rows = subjects
    .map(
      (subject) => `<tr>
        <td>${escapeHtml(subject.name)}</td>
        <td><code>${escapeHtml(subject.code)}</code></td>
        <td><form method="POST" action="/admin/subjects/${subject.id}/delete" style="display:inline" data-confirm="Supprimer cette matière ?">${csrfField(session)}<button type="submit">Supprimer</button></form></td>
      </tr>`
    )
    .join('');

  return renderDashboardLayout(
    'Matières',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
      <h2>Créer une matière</h2>
      <form method="POST" action="/admin/subjects">${csrfField(session)}
        <label>Nom <input name="name" required minlength="1" maxlength="80" /></label>
        <label>Code court <input name="code" required minlength="1" maxlength="20" placeholder="ex : MATH" /></label>
        <button type="submit">Ajouter</button>
      </form>
    </section>
    <section class="el-card">
      <h2>Matières existantes</h2>
      <table>
        <thead><tr><th>Nom</th><th>Code</th><th>Action</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">Aucune matière.</td></tr>'}</tbody>
      </table>
    </section>`
  );
}

function renderTenantsPage(session, tenants, { errorCode = null, successMessage = null } = {}) {
  const rows = tenants
    .map(
      (tenant) => `<tr>
        <td>${escapeHtml(tenant.name)}</td>
        <td><code>${escapeHtml(tenant.slug)}</code></td>
        <td>${escapeHtml(String(tenant.created_at ?? '-').slice(0, 10))}</td>
      </tr>`
    )
    .join('');

  return renderDashboardLayout(
    'Tenants (établissements)',
    session,
    `${renderAdminErrorBanner(errorCode)}${renderAdminSuccessBanner(successMessage)}
    <section class="el-card">
      <h2>Créer un nouvel établissement</h2>
      <p class="el-muted">Crée le tenant <strong>et</strong> son premier compte school_admin. L'admin pourra se connecter avec l'email fourni puis créer les autres comptes depuis l'UI.</p>
      <form method="POST" action="/admin/tenants">${csrfField(session)}
        <label>Nom de l'établissement <input name="name" required minlength="2" maxlength="120" /></label><br/>
        <label>Slug (identifiant URL, lettres/chiffres/tirets) <input name="slug" required minlength="3" maxlength="60" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="ex : ecole-pilote" /></label><br/>
        <label>Email de l'admin <input name="adminEmail" type="email" required /></label><br/>
        <label>Mot de passe temporaire <input name="adminPassword" type="password" minlength="${MIN_PASSWORD_LENGTH}" required /></label><br/>
        <button type="submit">Créer le tenant + admin</button>
      </form>
    </section>
    <section class="el-card">
      <h2>Tenants existants</h2>
      <table>
        <thead><tr><th>Nom</th><th>Slug</th><th>Créé le</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">Aucun tenant.</td></tr>'}</tbody>
      </table>
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
  allowPublicDemoGuide = runtimeEnv.nodeEnv === 'development' || runtimeEnv.nodeEnv === 'test',
  userStore,
  tenantStore,
  loginThrottle = new LoginThrottle()
} = {}) {
  const sessionSecret = runtimeEnv.sessionSecret;
  if (!sessionSecret || typeof sessionSecret !== 'string') {
    throw new Error('createServer requires runtimeEnv.sessionSecret');
  }
  const isProductionEnv = runtimeEnv.nodeEnv === 'production';
  const secureCookies = isProductionEnv;
  if (runtimeEnv.sessionSecretIsFallback) {
    logger.warn('SESSION_SECRET is using a development fallback. Set SESSION_SECRET in the environment for any deployed instance.');
  }
  const memorySeededUsers = getInMemorySeedUsers();
  for (const user of memorySeededUsers) {
    rememberUserIdentity(user);
  }
  const inMemoryUserStore = new InMemoryUserStore({ users: memorySeededUsers });
  const activeUserStore =
    userStore ?? (runtimeEnv.persistenceMode === 'postgres' ? new PostgresUserRepository({ pool: getPool() }) : inMemoryUserStore);
  const inMemoryTenantStore = new InMemoryTenantStore([
    { id: 'school-a', slug: 'school-a', name: 'Lycée Démo A', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'school-b', slug: 'school-b', name: 'Lycée Démo B', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ]);
  const activeTenantStore =
    tenantStore ?? (runtimeEnv.persistenceMode === 'postgres' ? new PostgresTenantRepository({ pool: getPool() }) : inMemoryTenantStore);
  const coreSchoolStore = new CoreSchoolStore({
    classRooms: seed.classRooms,
    subjects: seed.subjects,
    academicYears: seed.academicYears,
    terms: seed.terms,
    schools: seed.schools,
    gradeLevels: seed.gradeLevels
  });
  const studentStore = new StudentStore({ students: seed.students, classRoomStore: coreSchoolStore });
  const parentStore = new ParentStore({ parents: seed.parents, links: seed.studentParentLinks, studentStore });
  const teacherStore = new TeacherStore({ teachers: seed.teachers, classRoomStore: coreSchoolStore });
  const attendanceStore = new AttendanceStore({
    records: seed.attendanceRecords,
    studentStore,
    teacherStore,
    classRoomStore: coreSchoolStore
  });
  const attendanceEventsStore = new AttendanceEventsStore({
    events: seed.attendanceEvents || [],
    studentStore,
    classRoomStore: coreSchoolStore
  });
  const absenceNoticesStore = new AbsenceNoticesStore({
    notices: seed.absenceNotices || [],
    parentStore,
    studentStore
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
  const attendanceService = new AttendanceService({ attendanceStore, attendanceEventsStore, requireDateString });

  let studentApiService = studentService;
  let parentApiService = parentService;
  let teacherApiService = teacherService;
  let attendanceApiService = attendanceService;
  let gradingApiStore = gradingStore;
  let messagingApiStore = messagingStore;
  let financeApiStore = financeStore;
  let schoolStructureAdminStore = coreSchoolStore;
  if (runtimeEnv.persistenceMode === 'postgres') {
    const pool = getPool();
    const persistentCoreSchool = new PostgresCoreSchoolRepository({ pool });
    const persistentStudentStore = new PostgresStudentRepository({ pool, classRoomRepository: persistentCoreSchool });
    const persistentParentStore = new PostgresParentRepository({ pool, studentStore: persistentStudentStore });
    const persistentTeacherStore = new PostgresTeacherRepository({ pool, classRoomStore: persistentCoreSchool });
    const persistentAttendanceStore = new PostgresAttendanceRepository({ pool, studentStore: persistentStudentStore, teacherStore: persistentTeacherStore, classRoomStore: persistentCoreSchool });
    const persistentAttendanceEventsStore = new PostgresAttendanceEventsRepository({ pool, studentStore: persistentStudentStore, classRoomStore: persistentCoreSchool });
    const persistentGradingStore = new PostgresGradingRepository({ pool, classRoomStore: persistentCoreSchool, teacherStore: persistentTeacherStore, studentStore: persistentStudentStore, parentStore: persistentParentStore });
    const persistentMessagingStore = new PostgresMessagingRepository({ pool });
    const persistentFinanceStore = new PostgresFinanceRepository({ pool, studentStore: persistentStudentStore, parentStore: persistentParentStore });
    const persistentCoreSchoolService = new CoreSchoolService({ coreSchoolStore: persistentCoreSchool });
    studentApiService = new StudentService({ studentStore: persistentStudentStore, coreSchoolService: persistentCoreSchoolService });
    parentApiService = new ParentService({ parentStore: persistentParentStore, studentStore: persistentStudentStore, buildValidationError });
    teacherApiService = new TeacherService({ teacherStore: persistentTeacherStore });
    attendanceApiService = new AttendanceService({ attendanceStore: persistentAttendanceStore, attendanceEventsStore: persistentAttendanceEventsStore, requireDateString });
    gradingApiStore = persistentGradingStore;
    messagingApiStore = persistentMessagingStore;
    financeApiStore = persistentFinanceStore;
    schoolStructureAdminStore = persistentCoreSchool;
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
    applySecurityHeaders(response, { isProduction: isProductionEnv });

    const url = new URL(request.url, 'http://localhost');
    return requestContextStorage.run({ pathname: url.pathname }, async () => {
    const cookies = parseCookies(request.headers.cookie);
    const rawCookieValue = cookies.sessionId;
    const verifiedSessionId = rawCookieValue ? verifySignedSessionId(rawCookieValue, sessionSecret) : null;
    const session = sessionStore.get(verifiedSessionId);
    const hasStaleSessionCookie = Boolean(rawCookieValue && !session);
    const rawSessionId = verifiedSessionId;
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

    try {

    if (request.method === 'POST' && url.pathname !== '/login') {
      const csrfOk = await enforceCsrf({ request, response, session });
      if (!csrfOk) {
        return;
      }
    }

    if (request.method === 'GET' && url.pathname === '/assets/design-system.css') {
      response.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      response.end(DESIGN_SYSTEM_CSS);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/assets/ux.js') {
      response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      response.end(UX_SCRIPT_JS);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && (url.pathname === '/api/health' || url.pathname === '/healthz')) {
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

    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('EducLink API is running 🚀');
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
          response.writeHead(302, { location: '/login', ...(hasStaleSessionCookie ? { 'set-cookie': clearSessionCookie({ secure: secureCookies }) } : {}) });
          response.end();
          return;
        }
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderDemoGuidePage());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      const clientIp = getClientIp(request);
      if (loginThrottle.isLocked(clientIp)) {
        const retryAfter = loginThrottle.retryAfterSeconds(clientIp);
        requestLogger.warn('Login attempt blocked by throttle', { clientIp, retryAfter });
        response.writeHead(429, {
          'content-type': 'text/html; charset=utf-8',
          'retry-after': String(retryAfter)
        });
        response.end(renderLoginPage(`Trop de tentatives. Réessayez dans ${Math.ceil(retryAfter / 60)} minute(s).`));
        return;
      }
      const form = parseForm(await readBody(request));
      const candidate = await activeUserStore.findByEmail(form.email);
      const passwordOk = await verifyPassword(form.password, candidate?.passwordHash);
      if (!candidate || !passwordOk) {
        loginThrottle.recordFailure(clientIp);
        requestLogger.warn('Authentication failed', { actor: form.email || null });
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderLoginPage('Identifiants invalides'));
        return;
      }

      loginThrottle.reset(clientIp);
      const user = candidate;
      rememberUserIdentity(user);
      const createdSession = sessionStore.create({ userId: user.id, role: user.role, tenantId: user.tenantId });
      logAuthEvent(requestLogger, 'Authentication succeeded', createdSession);
      auditWriter.writeAuthEvent(createdSession, 'auth.login.success');
      if (rawSessionId) {
        sessionStore.destroy(rawSessionId);
      }

      const signedCookieValue = signSessionId(createdSession.id, sessionSecret);
      response.writeHead(302, {
        location: getDashboardPathForRole(user.role),
        'set-cookie': [
          buildSessionCookie(signedCookieValue, { secure: secureCookies }),
          buildCsrfCookie(createdSession.csrfToken, { secure: secureCookies })
        ]
      });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      if (session) {
        auditWriter.writeAuthEvent(session, 'auth.logout');
        logAuthEvent(requestLogger, 'Logout succeeded', session);
      }
      sessionStore.destroy(rawSessionId);
      response.writeHead(302, {
        location: '/login',
        'set-cookie': [
          clearSessionCookie({ secure: secureCookies }),
          clearCsrfCookie({ secure: secureCookies })
        ]
      });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        response.writeHead(302, { location: '/login', ...(hasStaleSessionCookie ? { 'set-cookie': clearSessionCookie({ secure: secureCookies }) } : {}) });
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
        response.writeHead(302, { location: '/login', ...(hasStaleSessionCookie ? { 'set-cookie': clearSessionCookie({ secure: secureCookies }) } : {}) });
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
        return;
      }

      const classRoomId = url.searchParams.get('classRoomId') ?? '';
      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const students = studentStore.list(auth.context.tenantId, { classRoomId: classRoomId || undefined });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderStudentsPage(auth.context, classRooms, students, classRoomId, {
          errorCode: url.searchParams.get('error'),
          successMessage: url.searchParams.get('created') === '1' ? 'Élève créé avec succès.' : null,
          canCreate: canManageStudents(auth.context)
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/students') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageStudents(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const wantsAccess = form.get('createAccess') === '1';
      const email = normalizeEmail(form.get('email'));
      const password = form.get('password');

      if (wantsAccess) {
        if (!email) {
          response.writeHead(302, { location: '/admin/students?error=email_required' });
          response.end();
          return;
        }
        if (!isValidEmailFormat(email)) {
          response.writeHead(302, { location: '/admin/students?error=email_invalid' });
          response.end();
          return;
        }
        if (!isValidPasswordFormat(password)) {
          response.writeHead(302, { location: '/admin/students?error=password_required' });
          response.end();
          return;
        }
        const existing = await activeUserStore.findByEmail(email);
        if (existing) {
          response.writeHead(302, { location: '/admin/students?error=email_duplicate' });
          response.end();
          return;
        }
      }

      let created;
      try {
        created = studentStore.create(auth.context.tenantId, {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          admissionNumber: form.get('admissionNumber'),
          classRoomId: form.get('classRoomId'),
          dateOfBirth: form.get('dateOfBirth')
        });
      } catch {
        response.writeHead(302, { location: '/admin/students?error=invalid_input' });
        response.end();
        return;
      }

      if (wantsAccess) {
        try {
          const passwordHash = await hashPassword(password);
          const createdUser = await activeUserStore.create({
            id: created.id,
            tenantId: auth.context.tenantId,
            email,
            role: ROLES.STUDENT,
            passwordHash
          });
          rememberUserIdentity({ id: createdUser.id, email: createdUser.email });
          auditWriter.writeEntityEvent(auth.context, 'user.created', 'user', createdUser.id, {
            role: ROLES.STUDENT,
            email
          });
        } catch (error) {
          studentStore.archive(auth.context.tenantId, created.id);
          const isDuplicate = error instanceof DuplicateEmailError || error?.code === 'DUPLICATE_EMAIL';
          const errorCode = isDuplicate ? 'email_duplicate' : 'invalid_input';
          response.writeHead(302, { location: `/admin/students?error=${errorCode}` });
          response.end();
          return;
        }
      }

      response.writeHead(302, { location: '/admin/students?created=1' });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/teacher/attendance') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canTakeAttendance(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      const classRooms = teacher ? teacher.classRoomIds.map((id) => coreSchoolStore.get('classRooms', auth.context.tenantId, id)).filter(Boolean) : [];
      const selectedDateRaw = url.searchParams.get('date') || todayIsoDate();
      const selectedDate = requireDateString(selectedDateRaw, 'date');
      const selectedClassRoomId = url.searchParams.get('classRoomId') || classRooms[0]?.id || '';

      if (selectedClassRoomId && !classRooms.some((classRoom) => classRoom.id === selectedClassRoomId)) {
        sendForbiddenPage(response, session);
        return;
      }

      const students = selectedClassRoomId ? studentStore.list(auth.context.tenantId, { classRoomId: selectedClassRoomId }) : [];
      const attendanceByStudentId = new Map(
        attendanceStore
          .list(auth.context.tenantId, { date: selectedDate, classRoomId: selectedClassRoomId })
          .map((record) => [record.studentId, record])
      );

      const eventsByStudentId = new Map();
      if (selectedClassRoomId) {
        for (const event of attendanceEventsStore.list(auth.context.tenantId, { date: selectedDate, classRoomId: selectedClassRoomId })) {
          if (!eventsByStudentId.has(event.studentId)) {
            eventsByStudentId.set(event.studentId, []);
          }
          eventsByStudentId.get(event.studentId).push(event);
        }
      }

      const statusParam = url.searchParams.get('status');
      const successMessage = statusParam === 'saved'
        ? 'Appel enregistré pour la classe sélectionnée.'
        : statusParam === 'event_saved'
        ? 'Événement enregistré.'
        : statusParam === 'event_deleted'
        ? 'Événement supprimé.'
        : null;
      const errorMessage = statusParam === 'error'
        ? "Impossible d'enregistrer l'appel. Vérifiez la classe et la date."
        : statusParam === 'event_error'
        ? "Impossible d'enregistrer l'événement. Vérifiez le type et l'élève."
        : null;

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderTeacherAttendancePage(auth.context, {
          teacher,
          classRooms,
          selectedClassRoomId,
          selectedDate,
          students,
          attendanceByStudentId,
          eventsByStudentId,
          successMessage,
          errorMessage
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/attendance') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canTakeAttendance(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      let redirectDate = '';
      let redirectClass = '';
      let statusParam = 'saved';
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
        statusParam = 'error';
      }

      response.writeHead(302, { location: `/teacher/attendance?date=${encodeURIComponent(redirectDate)}&classRoomId=${encodeURIComponent(redirectClass)}&status=${statusParam}` });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/teacher/attendance/events') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canRecordAttendanceEvent(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const redirectDate = form.get('date') || '';
      const redirectClass = form.get('classRoomId') || '';
      let statusParam = 'event_saved';

      try {
        const classRoomId = form.get('classRoomId');
        const isTeacher = auth.context.role === ROLES.TEACHER;
        if (isTeacher) {
          const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
          if (!teacher || !teacher.classRoomIds.includes(classRoomId)) {
            sendForbiddenPage(response, session);
            return;
          }
        }
        const created = attendanceEventsStore.create(auth.context.tenantId, {
          date: form.get('date'),
          classRoomId,
          studentId: form.get('studentId'),
          recordedByUserId: auth.context.userId,
          recordedByRole: auth.context.role,
          eventType: form.get('eventType'),
          comment: form.get('comment') || ''
        });
        auditWriter.writeEntityEvent(auth.context, 'attendance_event.created', 'attendance_event', created.id);
      } catch (error) {
        requestLogger.warn('Unable to persist attendance event', { error: serializeError(error) });
        statusParam = 'event_error';
      }

      response.writeHead(302, { location: `/teacher/attendance?date=${encodeURIComponent(redirectDate)}&classRoomId=${encodeURIComponent(redirectClass)}&status=${statusParam}` });
      response.end();
      return;
    }

    const teacherAttendanceEventDeleteMatch = url.pathname.match(/^\/teacher\/attendance\/events\/([^/]+)\/delete$/);
    if (teacherAttendanceEventDeleteMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canRecordAttendanceEvent(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const eventId = teacherAttendanceEventDeleteMatch[1];
      const form = parseExtendedForm(await readBody(request));
      const redirectDate = form.get('date') || '';
      const redirectClass = form.get('classRoomId') || '';
      let statusParam = 'event_deleted';

      try {
        const existing = attendanceEventsStore.get(auth.context.tenantId, eventId);
        if (!existing) {
          response.writeHead(302, { location: `/teacher/attendance?date=${encodeURIComponent(redirectDate)}&classRoomId=${encodeURIComponent(redirectClass)}&status=event_error` });
          response.end();
          return;
        }
        attendanceEventsStore.delete(auth.context.tenantId, eventId, {
          actorUserId: auth.context.userId,
          actorRole: auth.context.role
        });
        auditWriter.writeEntityEvent(auth.context, 'attendance_event.deleted', 'attendance_event', eventId);
      } catch (error) {
        requestLogger.warn('Unable to delete attendance event', { error: serializeError(error) });
        statusParam = 'event_error';
      }

      response.writeHead(302, { location: `/teacher/attendance?date=${encodeURIComponent(redirectDate)}&classRoomId=${encodeURIComponent(redirectClass)}&status=${statusParam}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && /^\/teacher\/students\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canTakeAttendance(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const studentId = url.pathname.split('/').at(-1);
      const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
      if (!teacher) {
        sendNotFoundPage(response, session);
        return;
      }

      const student = studentStore.get(auth.context.tenantId, studentId);
      if (!student || !teacher.classRoomIds.includes(student.classRoomId)) {
        sendForbiddenPage(response, session);
        return;
      }

      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const subjects = coreSchoolStore.list('subjects', auth.context.tenantId);
      const classRoom = classRooms.find((room) => room.id === student.classRoomId) || null;
      const teacherSubjectIds = new Set(teacher.subjectIds);

      const recentAttendance = attendanceStore
        .list(auth.context.tenantId)
        .filter((record) => record.studentId === studentId)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 10);

      const recentGrades = gradingStore
        .listGradesForStudent(auth.context.tenantId, studentId)
        .filter((grade) => teacherSubjectIds.has(grade.subjectId))
        .slice(0, 10);

      const recentEvents = attendanceEventsStore
        .list(auth.context.tenantId, { studentId })
        .slice(0, 10);

      const homeworks = lessonHomeworkStore
        .listHomeworksForStudent(auth.context.tenantId, studentId)
        .filter((homework) => teacherSubjectIds.has(homework.subjectId))
        .slice(0, 10);

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderTeacherStudentView(auth.context, {
          student,
          classRoom,
          recentAttendance,
          recentGrades,
          recentEvents,
          homeworks,
          classRooms,
          subjects
        })
      );
      return;
    }

    const bulletinIndexMatch = url.pathname.match(/^\/bulletins\/students\/([^/]+)$/);
    if (bulletinIndexMatch && request.method === 'GET') {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        sendForbiddenPage(response, session);
        return;
      }
      const studentId = bulletinIndexMatch[1];
      const student = studentStore.get(auth.context.tenantId, studentId);
      if (!student) {
        sendNotFoundPage(response, session);
        return;
      }
      if (!canAccessBulletinForStudent(auth.context, student, { teacherStore, parentStore })) {
        sendForbiddenPage(response, session);
        return;
      }
      const classRoom = coreSchoolStore.get('classRooms', auth.context.tenantId, student.classRoomId);
      const terms = coreSchoolStore
        .list('terms', auth.context.tenantId)
        .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderBulletinIndexPage(auth.context, { student, classRoom, terms }));
      return;
    }

    const bulletinReportMatch = url.pathname.match(/^\/bulletins\/students\/([^/]+)\/terms\/([^/]+)$/);
    if (bulletinReportMatch && request.method === 'GET') {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        sendForbiddenPage(response, session);
        return;
      }
      const studentId = bulletinReportMatch[1];
      const termId = bulletinReportMatch[2];
      const student = studentStore.get(auth.context.tenantId, studentId);
      const term = coreSchoolStore.get('terms', auth.context.tenantId, termId);
      if (!student || !term) {
        sendNotFoundPage(response, session);
        return;
      }
      if (!canAccessBulletinForStudent(auth.context, student, { teacherStore, parentStore })) {
        sendForbiddenPage(response, session);
        return;
      }

      const classRoom = coreSchoolStore.get('classRooms', auth.context.tenantId, student.classRoomId);
      const subjects = coreSchoolStore.list('subjects', auth.context.tenantId);
      const allGrades = gradingStore.listGradesForStudent(auth.context.tenantId, studentId);

      let scopedGrades = allGrades;
      let limitedScope = false;
      if (auth.context.role === ROLES.TEACHER) {
        const teacher = teacherStore.get(auth.context.tenantId, auth.context.userId, { includeArchived: false });
        const teacherSubjectIds = new Set(teacher?.subjectIds ?? []);
        scopedGrades = allGrades.filter((grade) => teacherSubjectIds.has(grade.subjectId));
        limitedScope = true;
      }

      const studentReportComments = reportComments.filter(
        (comment) => comment.tenant_id === auth.context.tenantId && comment.studentId === studentId
      );
      const school = coreSchoolStore.list('schools', auth.context.tenantId)[0] ?? null;
      const reportCard = buildReportCard({
        student,
        classRoom,
        term,
        grades: scopedGrades,
        subjects,
        reportComments: studentReportComments
      });

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderReportCardPage(auth.context, { reportCard, schoolName: school?.name ?? null, limitedScope }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/teacher/lesson-homework') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageLessonHomework(auth.context)) {
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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

    // ============================================================
    // VS-03 — Parent prévient absence + upload justificatif
    // ============================================================

    if (request.method === 'GET' && url.pathname === '/parent/absences') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canDeclareAbsence(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const linkedStudents = parentStore
        .listLinksByParent(auth.context.tenantId, auth.context.userId)
        .map((link) => studentStore.get(auth.context.tenantId, link.studentId, { includeArchived: false }))
        .filter(Boolean);
      const studentById = new Map(linkedStudents.map((s) => [s.id, s]));
      const notices = absenceNoticesStore.listForParent(auth.context.tenantId, auth.context.userId);

      const statusParam = url.searchParams.get('status');
      const successMessage =
        statusParam === 'created'
          ? 'Absence déclarée. L\'école va la traiter.'
          : null;
      const errorMessage =
        statusParam === 'error'
          ? "Impossible d'enregistrer la déclaration. Vérifiez les champs et le justificatif."
          : null;

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentAbsencesListPage(auth.context, notices, studentById, { successMessage, errorMessage }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/parent/absences/new') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canDeclareAbsence(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const linkedStudents = parentStore
        .listLinksByParent(auth.context.tenantId, auth.context.userId)
        .map((link) => studentStore.get(auth.context.tenantId, link.studentId, { includeArchived: false }))
        .filter(Boolean);
      if (linkedStudents.length === 0) {
        response.writeHead(302, { location: '/parent/absences?status=error' });
        response.end();
        return;
      }
      const errorParam = url.searchParams.get('error');
      const errorMessage =
        errorParam === 'invalid_dates'
          ? 'La date de fin doit être postérieure ou égale à la date de début.'
          : errorParam === 'invalid_payload'
          ? 'Formulaire invalide : vérifiez les champs et le justificatif.'
          : errorParam === 'not_linked'
          ? 'Vous ne pouvez déclarer une absence que pour vos enfants.'
          : errorParam === 'file_too_large'
          ? `Justificatif trop volumineux (max ${Math.round(MAX_DOCUMENT_SIZE_BYTES / 1024 / 1024)} Mo).`
          : errorParam === 'invalid_mime'
          ? 'Format de fichier non autorisé. Acceptés : PDF, PNG, JPG.'
          : null;
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentAbsenceFormPage(auth.context, linkedStudents, { errorMessage }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/parent/absences') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canDeclareAbsence(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      // CSRF check via parseMultipart fields (token first part of the form)
      let fields;
      let file;
      try {
        const parsed = await parseMultipart(request, {
          maxFileSize: MAX_DOCUMENT_SIZE_BYTES,
          allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES
        });
        fields = parsed.fields;
        file = parsed.file;
      } catch (error) {
        requestLogger.warn('Unable to parse multipart absence-notice form', { error: serializeError(error) });
        const message = (error && typeof error.message === 'string') ? error.message : '';
        let errorCode = 'invalid_payload';
        if (message.includes('File too large')) {
          errorCode = 'file_too_large';
        } else if (message.includes('mime type')) {
          errorCode = 'invalid_mime';
        }
        response.writeHead(302, { location: `/parent/absences/new?error=${errorCode}` });
        response.end();
        return;
      }

      const csrfToken = fields.get('_csrf') || fields.get('csrfToken') || '';
      if (!compareCsrfTokens(csrfToken, session.csrfToken)) {
        sendForbiddenPage(response, session);
        return;
      }

      const studentId = fields.get('studentId') || '';
      const startDate = fields.get('startDate') || '';
      const endDate = fields.get('endDate') || '';
      const reason = fields.get('reason') || '';
      const comment = fields.get('comment') || '';

      try {
        const document = file
          ? { fileName: file.fileName, mimeType: file.mimeType, data: file.data }
          : null;
        const created = absenceNoticesStore.create(auth.context.tenantId, {
          studentId,
          createdByUserId: auth.context.userId,
          startDate,
          endDate,
          reason,
          comment,
          document
        });
        auditWriter.writeEntityEvent(auth.context, 'absence_notice.created', 'absence_notice', created.id);
      } catch (error) {
        requestLogger.warn('Unable to persist absence notice', { error: serializeError(error) });
        const message = (error && typeof error.message === 'string') ? error.message : '';
        let errorCode = 'invalid_payload';
        if (message.includes('endDate must be greater')) {
          errorCode = 'invalid_dates';
        } else if (message.includes('parent linked to this student')) {
          errorCode = 'not_linked';
        } else if (message.includes('document.data must be at most')) {
          errorCode = 'file_too_large';
        } else if (message.includes('document.mimeType must be one of')) {
          errorCode = 'invalid_mime';
        }
        response.writeHead(302, { location: `/parent/absences/new?error=${errorCode}` });
        response.end();
        return;
      }

      response.writeHead(302, { location: '/parent/absences?status=created' });
      response.end();
      return;
    }

    const parentAbsenceDocMatch = url.pathname.match(/^\/parent\/absences\/([^/]+)\/document$/);
    if (parentAbsenceDocMatch && request.method === 'GET') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canDeclareAbsence(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const noticeId = parentAbsenceDocMatch[1];
      const notice = absenceNoticesStore.get(auth.context.tenantId, noticeId);
      if (!notice || notice.createdByUserId !== auth.context.userId) {
        sendNotFoundPage(response, session);
        return;
      }
      const doc = absenceNoticesStore.getDocument(auth.context.tenantId, noticeId);
      if (!doc) {
        sendNotFoundPage(response, session);
        return;
      }
      response.writeHead(200, {
        'content-type': doc.mimeType,
        'content-length': doc.sizeBytes,
        'content-disposition': `inline; filename="${doc.fileName.replace(/"/g, '')}"`
      });
      response.end(doc.data);
      return;
    }

    const parentAbsenceDetailMatch = url.pathname.match(/^\/parent\/absences\/([^/]+)$/);
    if (parentAbsenceDetailMatch && request.method === 'GET' && parentAbsenceDetailMatch[1] !== 'new') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canDeclareAbsence(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const noticeId = parentAbsenceDetailMatch[1];
      const notice = absenceNoticesStore.get(auth.context.tenantId, noticeId);
      if (!notice || notice.createdByUserId !== auth.context.userId) {
        sendNotFoundPage(response, session);
        return;
      }
      const student = studentStore.get(auth.context.tenantId, notice.studentId, { includeArchived: true });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentAbsenceDetailPage(auth.context, notice, student));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/student/grades') {
      const auth = requireAuth(session);
      if (!auth.allowed || auth.context.role !== ROLES.STUDENT) {
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
        return;
      }

      const selectedDate = requireDateString(url.searchParams.get('date') || todayIsoDate(), 'date');
      const selectedClassRoomId = url.searchParams.get('classRoomId') || '';
      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const records = attendanceStore.list(auth.context.tenantId, {
        date: selectedDate,
        classRoomId: selectedClassRoomId || undefined
      });
      const events = attendanceEventsStore.list(auth.context.tenantId, {
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
          teachersById,
          events
        })
      );
      return;
    }

    if (request.method === 'GET' && /^\/admin\/students\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewStudents(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const studentId = url.pathname.split('/').at(-1);
      const student = studentStore.get(auth.context.tenantId, studentId);
      if (!student) {
        sendNotFoundPage(response, session);
        return;
      }

      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const subjects = coreSchoolStore.list('subjects', auth.context.tenantId);
      const successParam = url.searchParams.get('success');
      const successMessage =
        successParam === 'updated'
          ? 'Élève mis à jour.'
          : successParam === 'archived'
          ? 'Élève archivé.'
          : null;

      const parentLinks = parentStore
        .listLinksByStudent(auth.context.tenantId, studentId)
        .map((link) => ({ ...link, parent: parentStore.get(auth.context.tenantId, link.parentId) }))
        .filter((entry) => entry.parent);

      const recentAttendance = attendanceStore
        .list(auth.context.tenantId)
        .filter((record) => record.studentId === studentId)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 10);

      const recentGrades = gradingStore
        .listGradesForStudent(auth.context.tenantId, studentId)
        .slice(0, 10);

      const recentEvents = attendanceEventsStore
        .list(auth.context.tenantId, { studentId })
        .slice(0, 10);

      const recentAbsenceNotices = absenceNoticesStore
        .listForStudent(auth.context.tenantId, studentId)
        .slice(0, 10);

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderStudentProfile(auth.context, student, classRooms, {
          canManage: canManageStudents(auth.context),
          errorCode: url.searchParams.get('error'),
          successMessage,
          parentLinks,
          recentAttendance,
          recentGrades,
          recentEvents,
          recentAbsenceNotices,
          subjects
        })
      );
      return;
    }

    const adminStudentIdMatch = url.pathname.match(/^\/admin\/students\/([^/]+)\/(update|archive)$/);
    if (adminStudentIdMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageStudents(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const studentId = adminStudentIdMatch[1];
      const action = adminStudentIdMatch[2];

      const existing = studentStore.get(auth.context.tenantId, studentId);
      if (!existing) {
        response.writeHead(302, { location: '/admin/students?error=not_found' });
        response.end();
        return;
      }

      const form = parseExtendedForm(await readBody(request));

      try {
        if (action === 'update') {
          const updated = studentStore.update(auth.context.tenantId, studentId, {
            firstName: form.get('firstName'),
            lastName: form.get('lastName'),
            admissionNumber: form.get('admissionNumber'),
            classRoomId: form.get('classRoomId'),
            dateOfBirth: form.get('dateOfBirth')
          });
          if (updated) {
            auditWriter.writeEntityEvent(auth.context, 'student.update', 'student', updated.id);
          }
        } else if (action === 'archive') {
          const archived = studentStore.archive(auth.context.tenantId, studentId);
          if (archived) {
            auditWriter.writeEntityEvent(auth.context, 'student.archive', 'student', archived.id);
          }
        }
      } catch {
        response.writeHead(302, { location: `/admin/students/${studentId}?error=invalid_input` });
        response.end();
        return;
      }

      const successCode = action === 'update' ? 'updated' : 'archived';
      response.writeHead(302, { location: `/admin/students/${studentId}?success=${successCode}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/parents') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const parents = parentStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderParentsPage(auth.context, parents, {
          errorCode: url.searchParams.get('error'),
          successMessage: url.searchParams.get('created') === '1' ? 'Responsable créé. Le compte peut désormais se connecter.' : null
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/parents') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const email = normalizeEmail(form.get('email'));
      const password = form.get('password');

      if (!email) {
        response.writeHead(302, { location: '/admin/parents?error=email_required' });
        response.end();
        return;
      }
      if (!isValidEmailFormat(email)) {
        response.writeHead(302, { location: '/admin/parents?error=email_invalid' });
        response.end();
        return;
      }
      if (!isValidPasswordFormat(password)) {
        response.writeHead(302, { location: '/admin/parents?error=password_required' });
        response.end();
        return;
      }

      const existing = await activeUserStore.findByEmail(email);
      if (existing) {
        response.writeHead(302, { location: '/admin/parents?error=email_duplicate' });
        response.end();
        return;
      }

      let created;
      try {
        created = parentStore.create(auth.context.tenantId, {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          phone: form.get('phone'),
          email,
          address: form.get('address'),
          notes: form.get('notes')
        });
      } catch {
        response.writeHead(302, { location: '/admin/parents?error=invalid_input' });
        response.end();
        return;
      }

      try {
        const passwordHash = await hashPassword(password);
        const createdUser = await activeUserStore.create({
          id: created.id,
          tenantId: auth.context.tenantId,
          email,
          role: ROLES.PARENT,
          passwordHash
        });
        rememberUserIdentity({ id: createdUser.id, email: createdUser.email });
        auditWriter.writeEntityEvent(auth.context, 'user.created', 'user', createdUser.id, {
          role: ROLES.PARENT,
          email
        });
      } catch (error) {
        parentStore.archive(auth.context.tenantId, created.id);
        const isDuplicate = error instanceof DuplicateEmailError || error?.code === 'DUPLICATE_EMAIL';
        const errorCode = isDuplicate ? 'email_duplicate' : 'invalid_input';
        response.writeHead(302, { location: `/admin/parents?error=${errorCode}` });
        response.end();
        return;
      }

      response.writeHead(302, { location: `/admin/parents/${created.id}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && /^\/admin\/parents\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const parentId = url.pathname.split('/').at(-1);
      const parentWithLinks = parentStore.getParentWithLinks(auth.context.tenantId, parentId);
      if (!parentWithLinks) {
        sendNotFoundPage(response, session);
        return;
      }

      const students = studentStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentProfile(auth.context, parentWithLinks, students, parentWithLinks.links));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/teachers') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewTeachers(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const teachers = teacherStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderTeachersPage(auth.context, teachers, {
          errorCode: url.searchParams.get('error'),
          successMessage: url.searchParams.get('created') === '1' ? 'Enseignant créé. Le compte peut désormais se connecter.' : null,
          canManage: canManageTeachers(auth.context)
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/teachers') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const email = normalizeEmail(form.get('email'));
      const password = form.get('password');

      if (!email) {
        response.writeHead(302, { location: '/admin/teachers?error=email_required' });
        response.end();
        return;
      }
      if (!isValidEmailFormat(email)) {
        response.writeHead(302, { location: '/admin/teachers?error=email_invalid' });
        response.end();
        return;
      }
      if (!isValidPasswordFormat(password)) {
        response.writeHead(302, { location: '/admin/teachers?error=password_required' });
        response.end();
        return;
      }

      const existing = await activeUserStore.findByEmail(email);
      if (existing) {
        response.writeHead(302, { location: '/admin/teachers?error=email_duplicate' });
        response.end();
        return;
      }

      let created;
      try {
        created = teacherStore.create(auth.context.tenantId, {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          email,
          phone: form.get('phone'),
          notes: form.get('notes'),
          classRoomIds: [],
          subjectIds: []
        });
      } catch {
        response.writeHead(302, { location: '/admin/teachers?error=invalid_input' });
        response.end();
        return;
      }

      try {
        const passwordHash = await hashPassword(password);
        const createdUser = await activeUserStore.create({
          id: created.id,
          tenantId: auth.context.tenantId,
          email,
          role: ROLES.TEACHER,
          passwordHash
        });
        rememberUserIdentity({ id: createdUser.id, email: createdUser.email });
        auditWriter.writeEntityEvent(auth.context, 'user.created', 'user', createdUser.id, {
          role: ROLES.TEACHER,
          email
        });
      } catch (error) {
        teacherStore.archive(auth.context.tenantId, created.id);
        const isDuplicate = error instanceof DuplicateEmailError || error?.code === 'DUPLICATE_EMAIL';
        const errorCode = isDuplicate ? 'email_duplicate' : 'invalid_input';
        response.writeHead(302, { location: `/admin/teachers?error=${errorCode}` });
        response.end();
        return;
      }

      response.writeHead(302, { location: `/admin/teachers/${created.id}` });
      response.end();
      return;
    }

    if (request.method === 'GET' && /^\/admin\/teachers\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewTeachers(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const teacherId = url.pathname.split('/').at(-1);
      const teacher = teacherStore.get(auth.context.tenantId, teacherId);
      if (!teacher) {
        sendNotFoundPage(response, session);
        return;
      }

      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const subjects = coreSchoolStore.list('subjects', auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderTeacherProfile(auth.context, teacher, classRooms, subjects, { canManage: canManageTeachers(auth.context) }));
      return;
    }

    const adminTeacherIdMatch = url.pathname.match(/^\/admin\/teachers\/([^/]+)\/(update|archive)$/);
    if (adminTeacherIdMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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

    if (request.method === 'GET' && url.pathname === '/admin/users') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageUsers(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const users = await activeUserStore.listByTenant(auth.context.tenantId);
      const success = url.searchParams.get('success');
      const successMessage =
        success === 'deactivated' ? 'Compte désactivé.'
        : success === 'activated' ? 'Compte réactivé.'
        : success === 'password_reset' ? 'Mot de passe réinitialisé.'
        : null;
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderUsersPage(auth.context, users, {
          errorCode: url.searchParams.get('error'),
          successMessage
        })
      );
      return;
    }

    const adminUserActionMatch = url.pathname.match(/^\/admin\/users\/([^/]+)\/(deactivate|activate|reset-password)$/);
    if (adminUserActionMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageUsers(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const targetUserId = adminUserActionMatch[1];
      const action = adminUserActionMatch[2];
      const form = parseExtendedForm(await readBody(request));

      const target = await activeUserStore.getById(targetUserId);
      if (!target) {
        response.writeHead(302, { location: '/admin/users?error=user_not_found' });
        response.end();
        return;
      }
      const targetTenant = target.tenantId ?? null;
      const sessionTenant = auth.context.tenantId ?? null;
      if (targetTenant !== sessionTenant) {
        sendForbiddenPage(response, session);
        return;
      }

      if (action === 'deactivate') {
        if (target.id === auth.context.userId) {
          response.writeHead(302, { location: '/admin/users?error=cannot_self_deactivate' });
          response.end();
          return;
        }
        await activeUserStore.update(target.id, { isActive: false });
        auditWriter.writeEntityEvent(auth.context, 'user.deactivated', 'user', target.id, { email: target.email });
        response.writeHead(302, { location: '/admin/users?success=deactivated' });
        response.end();
        return;
      }

      if (action === 'activate') {
        await activeUserStore.update(target.id, { isActive: true });
        auditWriter.writeEntityEvent(auth.context, 'user.activated', 'user', target.id, { email: target.email });
        response.writeHead(302, { location: '/admin/users?success=activated' });
        response.end();
        return;
      }

      // reset-password
      const newPassword = form.get('password');
      if (!isValidPasswordFormat(newPassword)) {
        response.writeHead(302, { location: '/admin/users?error=password_required' });
        response.end();
        return;
      }
      const passwordHash = await hashPassword(newPassword);
      await activeUserStore.update(target.id, { passwordHash });
      auditWriter.writeEntityEvent(auth.context, 'user.password_reset_by_admin', 'user', target.id, { email: target.email });
      response.writeHead(302, { location: '/admin/users?success=password_reset' });
      response.end();
      return;
    }

    // ====================================================================
    // Sprint 3 — Structure école depuis l'interface (SCH-01..SCH-06)
    // ====================================================================

    if (url.pathname === '/admin/school-settings') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const tenantId = auth.context.tenantId;

      if (request.method === 'GET') {
        const schools = await schoolStructureAdminStore.list('schools', tenantId);
        const school = schools[0] ?? null;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          renderSchoolSettingsPage(auth.context, school, {
            errorCode: url.searchParams.get('error'),
            successMessage: url.searchParams.get('success') === 'saved' ? 'Paramètres enregistrés.' : null
          })
        );
        return;
      }

      if (request.method === 'POST') {
        const form = parseExtendedForm(await readBody(request));
        const payload = {
          name: form.get('name'),
          code: form.get('code'),
          city: form.get('city'),
          country: form.get('country')
        };

        const existingList = await schoolStructureAdminStore.list('schools', tenantId);
        const existing = existingList[0] ?? null;

        try {
          if (existing) {
            await schoolStructureAdminStore.update('schools', tenantId, existing.id, payload);
          } else {
            await schoolStructureAdminStore.create('schools', tenantId, payload);
          }
        } catch (error) {
          const code = error?.code === 'VALIDATION_ERROR' ? 'invalid_input' : 'invalid_input';
          response.writeHead(302, { location: `/admin/school-settings?error=${code}` });
          response.end();
          return;
        }

        auditWriter.writeEntityEvent(auth.context, 'school.updated', 'school', existing?.id ?? 'new', { name: payload.name });
        response.writeHead(302, { location: '/admin/school-settings?success=saved' });
        response.end();
        return;
      }
    }

    if (url.pathname === '/admin/school-years' && (request.method === 'GET' || request.method === 'POST')) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const tenantId = auth.context.tenantId;

      if (request.method === 'GET') {
        const [years, terms] = await Promise.all([
          schoolStructureAdminStore.list('academicYears', tenantId),
          schoolStructureAdminStore.list('terms', tenantId)
        ]);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          renderSchoolYearsPage(auth.context, years, terms, {
            errorCode: url.searchParams.get('error'),
            successMessage:
              url.searchParams.get('success') === 'year_created' ? 'Année scolaire créée.'
              : url.searchParams.get('success') === 'year_deleted' ? 'Année supprimée.'
              : url.searchParams.get('success') === 'term_created' ? 'Trimestre créé.'
              : url.searchParams.get('success') === 'term_deleted' ? 'Trimestre supprimé.'
              : null
          })
        );
        return;
      }

      // POST: create academic year
      const form = parseExtendedForm(await readBody(request));
      try {
        const created = await schoolStructureAdminStore.create('academicYears', tenantId, {
          label: form.get('label'),
          startsAt: form.get('startsAt'),
          endsAt: form.get('endsAt'),
          status: form.get('status') || 'draft'
        });
        auditWriter.writeEntityEvent(auth.context, 'academic_year.created', 'academic_year', created.id, { label: created.label });
        response.writeHead(302, { location: '/admin/school-years?success=year_created' });
        response.end();
        return;
      } catch {
        response.writeHead(302, { location: '/admin/school-years?error=invalid_input' });
        response.end();
        return;
      }
    }

    const adminYearActionMatch = url.pathname.match(/^\/admin\/school-years\/([^/]+)\/(delete|terms|term-delete)$/);
    if (adminYearActionMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const tenantId = auth.context.tenantId;
      const targetId = adminYearActionMatch[1];
      const action = adminYearActionMatch[2];
      const form = parseExtendedForm(await readBody(request));

      if (action === 'delete') {
        const existing = await schoolStructureAdminStore.get('academicYears', tenantId, targetId);
        if (!existing) {
          response.writeHead(302, { location: '/admin/school-years?error=not_found' });
          response.end();
          return;
        }
        await schoolStructureAdminStore.delete('academicYears', tenantId, targetId);
        // delete any in-memory orphan terms (postgres cascades via FK)
        const terms = await schoolStructureAdminStore.list('terms', tenantId);
        for (const term of terms.filter((t) => t.academicYearId === targetId)) {
          await schoolStructureAdminStore.delete('terms', tenantId, term.id);
        }
        auditWriter.writeEntityEvent(auth.context, 'academic_year.deleted', 'academic_year', targetId, {});
        response.writeHead(302, { location: '/admin/school-years?success=year_deleted' });
        response.end();
        return;
      }

      if (action === 'terms') {
        try {
          const created = await schoolStructureAdminStore.create('terms', tenantId, {
            academicYearId: targetId,
            name: form.get('name'),
            startsAt: form.get('startsAt'),
            endsAt: form.get('endsAt')
          });
          auditWriter.writeEntityEvent(auth.context, 'term.created', 'term', created.id, { name: created.name });
          response.writeHead(302, { location: '/admin/school-years?success=term_created' });
          response.end();
          return;
        } catch (error) {
          const code = String(error?.message || '').includes('academicYearId') ? 'reference_invalid' : 'invalid_input';
          response.writeHead(302, { location: `/admin/school-years?error=${code}` });
          response.end();
          return;
        }
      }

      if (action === 'term-delete') {
        // targetId here is the term id
        await schoolStructureAdminStore.delete('terms', tenantId, targetId);
        auditWriter.writeEntityEvent(auth.context, 'term.deleted', 'term', targetId, {});
        response.writeHead(302, { location: '/admin/school-years?success=term_deleted' });
        response.end();
        return;
      }
    }

    if (url.pathname === '/admin/classes' && (request.method === 'GET' || request.method === 'POST')) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const tenantId = auth.context.tenantId;

      if (request.method === 'GET') {
        const [gradeLevels, classRooms] = await Promise.all([
          schoolStructureAdminStore.list('gradeLevels', tenantId),
          schoolStructureAdminStore.list('classRooms', tenantId)
        ]);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          renderClassesPage(auth.context, gradeLevels, classRooms, {
            errorCode: url.searchParams.get('error'),
            successMessage:
              url.searchParams.get('success') === 'class_created' ? 'Classe créée.'
              : url.searchParams.get('success') === 'class_deleted' ? 'Classe supprimée.'
              : null
          })
        );
        return;
      }

      // POST: create classroom
      const form = parseExtendedForm(await readBody(request));
      try {
        const created = await schoolStructureAdminStore.create('classRooms', tenantId, {
          name: form.get('name'),
          gradeLevelId: form.get('gradeLevelId'),
          capacity: form.get('capacity')
        });
        auditWriter.writeEntityEvent(auth.context, 'class_room.created', 'class_room', created.id, { name: created.name });
        response.writeHead(302, { location: '/admin/classes?success=class_created' });
        response.end();
        return;
      } catch (error) {
        const code = String(error?.message || '').includes('gradeLevelId') ? 'reference_invalid' : 'invalid_input';
        response.writeHead(302, { location: `/admin/classes?error=${code}` });
        response.end();
        return;
      }
    }

    const adminClassDeleteMatch = url.pathname.match(/^\/admin\/classes\/([^/]+)\/delete$/);
    if (adminClassDeleteMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const tenantId = auth.context.tenantId;
      const targetId = adminClassDeleteMatch[1];
      await schoolStructureAdminStore.delete('classRooms', tenantId, targetId);
      auditWriter.writeEntityEvent(auth.context, 'class_room.deleted', 'class_room', targetId, {});
      response.writeHead(302, { location: '/admin/classes?success=class_deleted' });
      response.end();
      return;
    }

    if (url.pathname === '/admin/grade-levels' && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const tenantId = auth.context.tenantId;
      const form = parseExtendedForm(await readBody(request));
      try {
        const created = await schoolStructureAdminStore.create('gradeLevels', tenantId, {
          name: form.get('name'),
          order: form.get('order')
        });
        auditWriter.writeEntityEvent(auth.context, 'grade_level.created', 'grade_level', created.id, { name: created.name });
        response.writeHead(302, { location: '/admin/classes?success=class_created' });
        response.end();
        return;
      } catch {
        response.writeHead(302, { location: '/admin/classes?error=invalid_input' });
        response.end();
        return;
      }
    }

    const adminGradeDeleteMatch = url.pathname.match(/^\/admin\/grade-levels\/([^/]+)\/delete$/);
    if (adminGradeDeleteMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const tenantId = auth.context.tenantId;
      const targetId = adminGradeDeleteMatch[1];
      await schoolStructureAdminStore.delete('gradeLevels', tenantId, targetId);
      auditWriter.writeEntityEvent(auth.context, 'grade_level.deleted', 'grade_level', targetId, {});
      response.writeHead(302, { location: '/admin/classes?success=class_deleted' });
      response.end();
      return;
    }

    if (url.pathname === '/admin/subjects' && (request.method === 'GET' || request.method === 'POST')) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const tenantId = auth.context.tenantId;

      if (request.method === 'GET') {
        const subjects = await schoolStructureAdminStore.list('subjects', tenantId);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          renderSubjectsPage(auth.context, subjects, {
            errorCode: url.searchParams.get('error'),
            successMessage:
              url.searchParams.get('success') === 'created' ? 'Matière créée.'
              : url.searchParams.get('success') === 'deleted' ? 'Matière supprimée.'
              : null
          })
        );
        return;
      }

      // POST: create subject
      const form = parseExtendedForm(await readBody(request));
      try {
        const created = await schoolStructureAdminStore.create('subjects', tenantId, {
          name: form.get('name'),
          code: form.get('code')
        });
        auditWriter.writeEntityEvent(auth.context, 'subject.created', 'subject', created.id, { name: created.name });
        response.writeHead(302, { location: '/admin/subjects?success=created' });
        response.end();
        return;
      } catch {
        response.writeHead(302, { location: '/admin/subjects?error=invalid_input' });
        response.end();
        return;
      }
    }

    const adminSubjectDeleteMatch = url.pathname.match(/^\/admin\/subjects\/([^/]+)\/delete$/);
    if (adminSubjectDeleteMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageSchoolStructure(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }
      const tenantId = auth.context.tenantId;
      const targetId = adminSubjectDeleteMatch[1];
      await schoolStructureAdminStore.delete('subjects', tenantId, targetId);
      auditWriter.writeEntityEvent(auth.context, 'subject.deleted', 'subject', targetId, {});
      response.writeHead(302, { location: '/admin/subjects?success=deleted' });
      response.end();
      return;
    }

    // SCH-06 — Super admin: créer un nouveau tenant école
    if (url.pathname === '/admin/tenants' && (request.method === 'GET' || request.method === 'POST')) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTenants(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      if (request.method === 'GET') {
        const tenants = await activeTenantStore.list();
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          renderTenantsPage(auth.context, tenants, {
            errorCode: url.searchParams.get('error'),
            successMessage: url.searchParams.get('success') === 'created' ? 'Tenant + compte admin créés.' : null
          })
        );
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const name = (form.get('name') || '').trim();
      const slug = (form.get('slug') || '').trim().toLowerCase();
      const adminEmail = normalizeEmail(form.get('adminEmail'));
      const adminPassword = form.get('adminPassword');

      if (!name) {
        response.writeHead(302, { location: '/admin/tenants?error=tenant_required' });
        response.end();
        return;
      }
      if (!slug) {
        response.writeHead(302, { location: '/admin/tenants?error=slug_required' });
        response.end();
        return;
      }
      if (!adminEmail || !isValidEmailFormat(adminEmail)) {
        response.writeHead(302, { location: '/admin/tenants?error=email_invalid' });
        response.end();
        return;
      }
      if (!isValidPasswordFormat(adminPassword)) {
        response.writeHead(302, { location: '/admin/tenants?error=password_required' });
        response.end();
        return;
      }
      const duplicateEmail = await activeUserStore.findByEmail(adminEmail);
      if (duplicateEmail) {
        response.writeHead(302, { location: '/admin/tenants?error=email_duplicate' });
        response.end();
        return;
      }

      let createdTenant;
      try {
        createdTenant = await activeTenantStore.create({ slug, name });
      } catch (error) {
        if (error?.code === 'DUPLICATE_SLUG') {
          response.writeHead(302, { location: '/admin/tenants?error=slug_duplicate' });
          response.end();
          return;
        }
        if (String(error?.message || '').toLowerCase().includes('slug')) {
          response.writeHead(302, { location: '/admin/tenants?error=slug_invalid' });
          response.end();
          return;
        }
        response.writeHead(302, { location: '/admin/tenants?error=invalid_input' });
        response.end();
        return;
      }

      try {
        const passwordHash = await hashPassword(adminPassword);
        const adminUserId = `admin-${createdTenant.slug}`;
        const createdUser = await activeUserStore.create({
          id: adminUserId,
          tenantId: createdTenant.slug,
          email: adminEmail,
          role: ROLES.SCHOOL_ADMIN,
          passwordHash
        });
        rememberUserIdentity({ id: createdUser.id, email: createdUser.email });
        auditWriter.writeEntityEvent(auth.context, 'tenant.created', 'tenant', createdTenant.slug, { slug: createdTenant.slug, adminEmail });
        auditWriter.writeEntityEvent(auth.context, 'user.created', 'user', createdUser.id, { role: ROLES.SCHOOL_ADMIN, email: adminEmail, tenantId: createdTenant.slug });
      } catch (error) {
        // Note: we don't roll back the tenant (idempotent create can be retried with a different email)
        const isDuplicate = error instanceof DuplicateEmailError || error?.code === 'DUPLICATE_EMAIL';
        const code = isDuplicate ? 'email_duplicate' : 'invalid_input';
        response.writeHead(302, { location: `/admin/tenants?error=${code}` });
        response.end();
        return;
      }

      response.writeHead(302, { location: '/admin/tenants?success=created' });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/inbox') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canAccessInbox(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const inbox = messagingStore.getInbox(auth.context.tenantId, auth.context);
      const tenantUsers = await activeUserStore.listByTenant(auth.context.tenantId);
      const recipients = tenantUsers
        .filter((user) => user.id !== auth.context.userId && user.isActive !== false)
        .map((user) => ({
          id: user.id,
          email: user.email,
          displayName: user.email || user.id,
          roleLabel: getRoleLabel(user.role)
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));

      const successParam = url.searchParams.get('success');
      const successMessage = successParam === 'sent' ? 'Message envoyé.' : null;

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderInboxPage(auth.context, inbox, {
        recipients,
        errorCode: url.searchParams.get('error'),
        successMessage
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/inbox/threads') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canAccessInbox(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const form = parseExtendedForm(await readBody(request));
      const subject = (form.get('subject') || '').trim();
      const body = (form.get('body') || '').trim();
      const participantIds = form.getAll('participantIds').filter((id) => typeof id === 'string' && id.length > 0);

      if (!subject || subject.length < 3) {
        response.writeHead(302, { location: '/inbox?error=invalid_input' });
        response.end();
        return;
      }
      if (!body) {
        response.writeHead(302, { location: '/inbox?error=invalid_input' });
        response.end();
        return;
      }
      if (participantIds.length === 0) {
        response.writeHead(302, { location: '/inbox?error=invalid_input' });
        response.end();
        return;
      }

      try {
        const tenantUsers = await activeUserStore.listByTenant(auth.context.tenantId);
        const allowedIds = new Set(tenantUsers.map((u) => u.id));
        const sanitizedParticipants = participantIds.filter((id) => allowedIds.has(id) && id !== auth.context.userId);
        if (sanitizedParticipants.length === 0) {
          response.writeHead(302, { location: '/inbox?error=invalid_input' });
          response.end();
          return;
        }
        const { thread } = messagingStore.createThread(auth.context.tenantId, auth.context, {
          subject,
          participantIds: sanitizedParticipants,
          initialMessage: body
        });
        auditWriter.writeEntityEvent(auth.context, 'message.thread_created', 'thread', thread.id);
        response.writeHead(302, { location: '/inbox?success=sent' });
        response.end();
        return;
      } catch (error) {
        requestLogger.warn('Unable to create thread', { error: serializeError(error) });
        response.writeHead(302, { location: '/inbox?error=invalid_input' });
        response.end();
        return;
      }
    }

    const inboxThreadMatch = url.pathname.match(/^\/inbox\/threads\/([^/]+)$/);
    if (request.method === 'GET' && inboxThreadMatch) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canAccessInbox(auth.context)) {
        sendForbiddenPage(response, session);
        return;
      }

      const thread = messagingStore.getThreadForUser(auth.context.tenantId, inboxThreadMatch[1], auth.context.userId);
      if (!thread) {
        sendNotFoundPage(response, session);
        return;
      }

      if (thread === 'forbidden') {
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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
        sendForbiddenPage(response, session);
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

    sendNotFoundPage(response, session);
    } catch (error) {
      requestLogger.error('Unhandled request error', { error: serializeError(error) });
      if (!response.headersSent) {
        if (url.pathname.startsWith('/api/v1/')) {
          sendApiError(response, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred');
        } else {
          sendServerErrorPage(response, session);
        }
      } else {
        response.end();
      }
    }
    });
  });
}

module.exports = {
  createServer,
  createSeedData,
  parseCookies,
  startServer
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
      startupLogger.warn('Database connectivity check failed at startup; continuing in degraded mode', {
        persistenceMode: runtimeConfig.persistenceMode,
        error: serializeError(error)
      });
    }
  }

  const host = runtimeConfig.host;
  const port = runtimeConfig.port;
  server.listen(port, host, () => {
    console.log(`🚀 API running on http://${host}:${port}`);
    startupLogger.info('EducLink web app running', {
      host,
      port,
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
