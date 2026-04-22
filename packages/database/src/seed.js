const { getPool, closePool } = require('./client');

const classRooms = [
  { id: 'class-a1', tenantId: 'school-a', name: 'A1', gradeLevelId: 'grade-a-1', capacity: 32 },
  { id: 'class-a2', tenantId: 'school-a', name: 'A2', gradeLevelId: 'grade-a-1', capacity: 30 },
  { id: 'class-b1', tenantId: 'school-b', name: 'B1', gradeLevelId: 'grade-b-1', capacity: 30 }
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
    classRoomId: 'class-a2',
    dateOfBirth: '2014-10-22'
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

async function seed() {
  const pool = getPool();

  for (const classRoom of classRooms) {
    await pool.query(
      `INSERT INTO class_rooms (id, tenant_id, name, grade_level_id, capacity)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [classRoom.id, classRoom.tenantId, classRoom.name, classRoom.gradeLevelId, classRoom.capacity]
    );
  }

  for (const student of students) {
    await pool.query(
      `INSERT INTO students (id, tenant_id, first_name, last_name, admission_number, class_room_id, date_of_birth)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [student.id, student.tenantId, student.firstName, student.lastName, student.admissionNumber, student.classRoomId, student.dateOfBirth]
    );
  }
}

seed()
  .then(() => closePool())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
