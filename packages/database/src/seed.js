const { getPool, closePool } = require('./client');

const classRooms = [
  { id: 'class-a1', tenantId: 'school-a', name: 'A1', gradeLevelId: 'grade-a-1', capacity: 30 },
  { id: 'class-a2', tenantId: 'school-a', name: 'A2', gradeLevelId: 'grade-a-1', capacity: 30 },
  { id: 'class-a3', tenantId: 'school-a', name: 'A3', gradeLevelId: 'grade-a-2', capacity: 28 },
  { id: 'class-b1', tenantId: 'school-b', name: 'B1', gradeLevelId: 'grade-b-1', capacity: 30 }
];

const subjects = [
  { id: 'subject-math-a', tenantId: 'school-a', name: 'Mathematics', code: 'MATH' },
  { id: 'subject-fr-a', tenantId: 'school-a', name: 'French', code: 'FR' },
  { id: 'subject-sci-a', tenantId: 'school-a', name: 'Science', code: 'SCI' },
  { id: 'subject-math-b', tenantId: 'school-b', name: 'Mathematics', code: 'MATH' }
];

const students = [
  {
    id: 'student-a1',
    tenantId: 'school-a',
    firstName: 'Aya',
    lastName: 'Nadir',
    admissionNumber: 'A-001',
    classRoomId: 'class-a1',
    dateOfBirth: '2013-03-09'
  },
  {
    id: 'student-a2',
    tenantId: 'school-a',
    firstName: 'Salim',
    lastName: 'Brahim',
    admissionNumber: 'A-002',
    classRoomId: 'class-a1',
    dateOfBirth: '2013-11-18'
  },
  {
    id: 'student-a3',
    tenantId: 'school-a',
    firstName: 'Lina',
    lastName: 'Kaci',
    admissionNumber: 'A-003',
    classRoomId: 'class-a2',
    dateOfBirth: '2014-02-12'
  },
  {
    id: 'student-a4',
    tenantId: 'school-a',
    firstName: 'Yanis',
    lastName: 'Mebarki',
    admissionNumber: 'A-004',
    classRoomId: 'class-a2',
    dateOfBirth: '2014-07-26'
  },
  {
    id: 'student-a5',
    tenantId: 'school-a',
    firstName: 'Ines',
    lastName: 'Amrani',
    admissionNumber: 'A-005',
    classRoomId: 'class-a3',
    dateOfBirth: '2012-12-03'
  },
  {
    id: 'student-b1',
    tenantId: 'school-b',
    firstName: 'Bilal',
    lastName: 'Haddad',
    admissionNumber: 'B-001',
    classRoomId: 'class-b1',
    dateOfBirth: '2012-12-01'
  }
];

const parents = [
  { id: 'parent-a1', tenantId: 'school-a', firstName: 'Nadia', lastName: 'Nadir', phone: '+213550000001', email: 'nadia.nadir@family.test' },
  { id: 'parent-a2', tenantId: 'school-a', firstName: 'Karim', lastName: 'Brahim', phone: '+213550000002', email: 'karim.brahim@family.test' },
  { id: 'parent-a3', tenantId: 'school-a', firstName: 'Samia', lastName: 'Kaci', phone: '+213550000003', email: 'samia.kaci@family.test' },
  { id: 'parent-b1', tenantId: 'school-b', firstName: 'Meriem', lastName: 'Haddad', phone: '+213550000101', email: 'meriem.haddad@family.test' }
];

const studentParentLinks = [
  { id: 'spl-a1', tenantId: 'school-a', parentId: 'parent-a1', studentId: 'student-a1', relationship: 'mother', isPrimaryContact: true },
  { id: 'spl-a2', tenantId: 'school-a', parentId: 'parent-a2', studentId: 'student-a2', relationship: 'father', isPrimaryContact: true },
  { id: 'spl-a3', tenantId: 'school-a', parentId: 'parent-a3', studentId: 'student-a3', relationship: 'mother', isPrimaryContact: true },
  { id: 'spl-a4', tenantId: 'school-a', parentId: 'parent-a1', studentId: 'student-a4', relationship: 'guardian', isPrimaryContact: false },
  { id: 'spl-b1', tenantId: 'school-b', parentId: 'parent-b1', studentId: 'student-b1', relationship: 'mother', isPrimaryContact: true }
];

const teachers = [
  {
    id: 'teacher-a1',
    tenantId: 'school-a',
    firstName: 'Amine',
    lastName: 'Rahmani',
    email: 'amine.rahmani@school-a.test',
    classRoomIds: ['class-a1', 'class-a2'],
    subjectIds: ['subject-math-a']
  },
  {
    id: 'teacher-a2',
    tenantId: 'school-a',
    firstName: 'Sarah',
    lastName: 'Bouzid',
    email: 'sarah.bouzid@school-a.test',
    classRoomIds: ['class-a1', 'class-a3'],
    subjectIds: ['subject-fr-a']
  },
  {
    id: 'teacher-a3',
    tenantId: 'school-a',
    firstName: 'Rachid',
    lastName: 'Ouali',
    email: 'rachid.ouali@school-a.test',
    classRoomIds: ['class-a2', 'class-a3'],
    subjectIds: ['subject-sci-a']
  },
  {
    id: 'teacher-b1',
    tenantId: 'school-b',
    firstName: 'Nour',
    lastName: 'Farah',
    email: 'nour.farah@school-b.test',
    classRoomIds: ['class-b1'],
    subjectIds: ['subject-math-b']
  }
];

const assessments = [
  { id: 'assessment-a-math-1', tenantId: 'school-a', classRoomId: 'class-a1', subjectId: 'subject-math-a', teacherId: 'teacher-a1', title: 'Math Quiz - Fractions', date: '2026-03-10', coefficient: '1.50' },
  { id: 'assessment-a-fr-1', tenantId: 'school-a', classRoomId: 'class-a2', subjectId: 'subject-fr-a', teacherId: 'teacher-a2', title: 'French Dictation', date: '2026-03-13', coefficient: '1.00' },
  { id: 'assessment-b-math-1', tenantId: 'school-b', classRoomId: 'class-b1', subjectId: 'subject-math-b', teacherId: 'teacher-b1', title: 'Math Baseline Test', date: '2026-03-11', coefficient: '1.00' }
];

const gradeEntries = [
  { id: 'grade-a1', tenantId: 'school-a', assessmentId: 'assessment-a-math-1', classRoomId: 'class-a1', subjectId: 'subject-math-a', teacherId: 'teacher-a1', studentId: 'student-a1', date: '2026-03-10', score: '16.50', remark: 'Good progress' },
  { id: 'grade-a2', tenantId: 'school-a', assessmentId: 'assessment-a-math-1', classRoomId: 'class-a1', subjectId: 'subject-math-a', teacherId: 'teacher-a1', studentId: 'student-a2', date: '2026-03-10', score: '14.00', remark: 'Needs extra practice on denominators' },
  { id: 'grade-a3', tenantId: 'school-a', assessmentId: 'assessment-a-fr-1', classRoomId: 'class-a2', subjectId: 'subject-fr-a', teacherId: 'teacher-a2', studentId: 'student-a3', date: '2026-03-13', score: '17.00', remark: 'Very accurate spelling' },
  { id: 'grade-b1', tenantId: 'school-b', assessmentId: 'assessment-b-math-1', classRoomId: 'class-b1', subjectId: 'subject-math-b', teacherId: 'teacher-b1', studentId: 'student-b1', date: '2026-03-11', score: '15.00', remark: 'Solid baseline result' }
];

const attendanceRecords = [
  { id: 'att-a1-1', tenantId: 'school-a', date: '2026-03-17', classRoomId: 'class-a1', studentId: 'student-a1', teacherId: 'teacher-a1', status: 'present' },
  { id: 'att-a1-2', tenantId: 'school-a', date: '2026-03-17', classRoomId: 'class-a1', studentId: 'student-a2', teacherId: 'teacher-a1', status: 'late' },
  { id: 'att-a2-1', tenantId: 'school-a', date: '2026-03-17', classRoomId: 'class-a2', studentId: 'student-a3', teacherId: 'teacher-a3', status: 'present' },
  { id: 'att-a2-2', tenantId: 'school-a', date: '2026-03-17', classRoomId: 'class-a2', studentId: 'student-a4', teacherId: 'teacher-a3', status: 'absent' },
  { id: 'att-b1-1', tenantId: 'school-b', date: '2026-03-17', classRoomId: 'class-b1', studentId: 'student-b1', teacherId: 'teacher-b1', status: 'present' }
];

const announcements = [
  {
    id: 'announcement-a1',
    tenantId: 'school-a',
    title: 'Parent-Teacher Meeting',
    body: 'Meetings are scheduled next Tuesday at 15:30 in each classroom.',
    visibility: 'school',
    roles: ['admin', 'teacher', 'parent'],
    authorId: 'admin-school-a',
    authorRole: 'admin'
  },
  {
    id: 'announcement-b1',
    tenantId: 'school-b',
    title: 'Welcome Week',
    body: 'Welcome activities begin Monday morning in the school courtyard.',
    visibility: 'school',
    roles: ['admin', 'teacher', 'parent', 'student'],
    authorId: 'admin-school-b',
    authorRole: 'admin'
  }
];

const messageThreads = [
  {
    id: 'thread-a1',
    tenantId: 'school-a',
    subject: 'Homework follow-up: Aya Nadir',
    participantIds: ['teacher-a1', 'parent-a1'],
    createdByUserId: 'teacher-a1',
    lastMessageAt: '2026-03-18T10:30:00.000Z'
  }
];

const messages = [
  {
    id: 'message-a1-1',
    tenantId: 'school-a',
    threadId: 'thread-a1',
    senderId: 'teacher-a1',
    body: 'Aya completed the worksheet, please revise question 5 at home.',
    createdAt: '2026-03-18T09:00:00.000Z'
  },
  {
    id: 'message-a1-2',
    tenantId: 'school-a',
    threadId: 'thread-a1',
    senderId: 'parent-a1',
    body: 'Thank you, we will review it this evening.',
    createdAt: '2026-03-18T10:30:00.000Z'
  }
];

const feePlans = [
  { id: 'fee-a-term1', tenantId: 'school-a', name: 'Term 1 Tuition', amountDue: '18000.00', dueDate: '2026-01-15', description: 'Tuition fees - first term' },
  { id: 'fee-a-transport', tenantId: 'school-a', name: 'School Transport', amountDue: '6000.00', dueDate: '2026-01-20', description: 'Optional bus service' },
  { id: 'fee-b-term1', tenantId: 'school-b', name: 'Term 1 Tuition', amountDue: '14000.00', dueDate: '2026-01-18', description: 'Tuition fees - first term' }
];

const invoices = [
  { id: 'invoice-a1', tenantId: 'school-a', studentId: 'student-a1', feePlanId: 'fee-a-term1', amountDue: '18000.00', dueDate: '2026-01-15', description: 'Tuition invoice A-001' },
  { id: 'invoice-a2', tenantId: 'school-a', studentId: 'student-a2', feePlanId: 'fee-a-term1', amountDue: '18000.00', dueDate: '2026-01-15', description: 'Tuition invoice A-002' },
  { id: 'invoice-a3', tenantId: 'school-a', studentId: 'student-a3', feePlanId: 'fee-a-transport', amountDue: '6000.00', dueDate: '2026-01-20', description: 'Transport invoice A-003' },
  { id: 'invoice-b1', tenantId: 'school-b', studentId: 'student-b1', feePlanId: 'fee-b-term1', amountDue: '14000.00', dueDate: '2026-01-18', description: 'Tuition invoice B-001' }
];

const payments = [
  { id: 'payment-a1', tenantId: 'school-a', invoiceId: 'invoice-a1', studentId: 'student-a1', amountPaid: '18000.00', paidAt: '2026-01-14', method: 'card', note: 'Paid in full before due date' },
  { id: 'payment-a2', tenantId: 'school-a', invoiceId: 'invoice-a3', studentId: 'student-a3', amountPaid: '3000.00', paidAt: '2026-01-25', method: 'cash', note: 'Partial payment' },
  { id: 'payment-b1', tenantId: 'school-b', invoiceId: 'invoice-b1', studentId: 'student-b1', amountPaid: '14000.00', paidAt: '2026-01-16', method: 'bank_transfer', note: 'Paid in full' }
];

async function insertMany(pool, query, rows, mapper) {
  for (const row of rows) {
    await pool.query(query, mapper(row));
  }
}

async function seed() {
  const pool = getPool();

  await insertMany(
    pool,
    `INSERT INTO class_rooms (id, tenant_id, name, grade_level_id, capacity)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    classRooms,
    (row) => [row.id, row.tenantId, row.name, row.gradeLevelId, row.capacity]
  );

  await insertMany(
    pool,
    `INSERT INTO subjects (id, tenant_id, name, code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    subjects,
    (row) => [row.id, row.tenantId, row.name, row.code]
  );

  await insertMany(
    pool,
    `INSERT INTO students (id, tenant_id, first_name, last_name, admission_number, class_room_id, date_of_birth)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    students,
    (row) => [row.id, row.tenantId, row.firstName, row.lastName, row.admissionNumber, row.classRoomId, row.dateOfBirth]
  );

  await insertMany(
    pool,
    `INSERT INTO parents (id, tenant_id, first_name, last_name, phone, email)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    parents,
    (row) => [row.id, row.tenantId, row.firstName, row.lastName, row.phone, row.email]
  );

  await insertMany(
    pool,
    `INSERT INTO student_parent_links (id, tenant_id, parent_id, student_id, relationship, is_primary_contact)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    studentParentLinks,
    (row) => [row.id, row.tenantId, row.parentId, row.studentId, row.relationship, row.isPrimaryContact]
  );

  await insertMany(
    pool,
    `INSERT INTO teachers (id, tenant_id, first_name, last_name, email, class_room_ids, subject_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    teachers,
    (row) => [row.id, row.tenantId, row.firstName, row.lastName, row.email, row.classRoomIds, row.subjectIds]
  );

  await insertMany(
    pool,
    `INSERT INTO assessments (id, tenant_id, class_room_id, subject_id, teacher_id, title, date, coefficient)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    assessments,
    (row) => [row.id, row.tenantId, row.classRoomId, row.subjectId, row.teacherId, row.title, row.date, row.coefficient]
  );

  await insertMany(
    pool,
    `INSERT INTO grade_entries (id, tenant_id, assessment_id, class_room_id, subject_id, teacher_id, student_id, date, score, remark)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO NOTHING`,
    gradeEntries,
    (row) => [row.id, row.tenantId, row.assessmentId, row.classRoomId, row.subjectId, row.teacherId, row.studentId, row.date, row.score, row.remark]
  );

  await insertMany(
    pool,
    `INSERT INTO attendance_records (id, tenant_id, date, class_room_id, student_id, teacher_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    attendanceRecords,
    (row) => [row.id, row.tenantId, row.date, row.classRoomId, row.studentId, row.teacherId, row.status]
  );

  await insertMany(
    pool,
    `INSERT INTO announcements (id, tenant_id, title, body, visibility, roles, author_id, author_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    announcements,
    (row) => [row.id, row.tenantId, row.title, row.body, row.visibility, row.roles, row.authorId, row.authorRole]
  );

  await insertMany(
    pool,
    `INSERT INTO message_threads (id, tenant_id, subject, participant_ids, created_by_user_id, last_message_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    messageThreads,
    (row) => [row.id, row.tenantId, row.subject, row.participantIds, row.createdByUserId, row.lastMessageAt]
  );

  await insertMany(
    pool,
    `INSERT INTO messages (id, tenant_id, thread_id, sender_id, body, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    messages,
    (row) => [row.id, row.tenantId, row.threadId, row.senderId, row.body, row.createdAt]
  );

  await insertMany(
    pool,
    `INSERT INTO fee_plans (id, tenant_id, name, amount_due, due_date, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    feePlans,
    (row) => [row.id, row.tenantId, row.name, row.amountDue, row.dueDate, row.description]
  );

  await insertMany(
    pool,
    `INSERT INTO invoices (id, tenant_id, student_id, fee_plan_id, amount_due, due_date, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    invoices,
    (row) => [row.id, row.tenantId, row.studentId, row.feePlanId, row.amountDue, row.dueDate, row.description]
  );

  await insertMany(
    pool,
    `INSERT INTO payments (id, tenant_id, invoice_id, student_id, amount_paid, paid_at, method, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    payments,
    (row) => [row.id, row.tenantId, row.invoiceId, row.studentId, row.amountPaid, row.paidAt, row.method, row.note]
  );
}

seed()
  .then(() => closePool())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
