const test = require('node:test');
const assert = require('node:assert/strict');

const { canReadClassRoom, canReadStudent } = require('./permissions');

test('parent ne peut pas lire un élève non lié', () => {
  const allowed = canReadStudent(
    { id: 'student-b', tenant_id: 'school-a', class_id: 'class-a' },
    { role: 'parent', userId: 'parent-1', tenantId: 'school-a' },
    {
      parentStudentLinks: [{ parentId: 'parent-1', studentId: 'student-a' }],
      teacherClassAssignments: []
    }
  );

  assert.equal(allowed, false);
});

test('teacher ne peut lire que les élèves de ses classes', () => {
  const context = {
    parentStudentLinks: [],
    teacherClassAssignments: [{ teacherId: 'teacher-1', classId: 'class-a' }]
  };

  assert.equal(
    canReadStudent(
      { id: 'student-a', tenant_id: 'school-a', class_id: 'class-a' },
      { role: 'teacher', userId: 'teacher-1', tenantId: 'school-a' },
      context
    ),
    true
  );

  assert.equal(
    canReadStudent(
      { id: 'student-b', tenant_id: 'school-a', class_id: 'class-b' },
      { role: 'teacher', userId: 'teacher-1', tenantId: 'school-a' },
      context
    ),
    false
  );
});

test('school_admin est limité à son tenant', () => {
  assert.equal(
    canReadClassRoom(
      { id: 'class-b', tenant_id: 'school-b', teacher_id: 'teacher-b' },
      { role: 'school_admin', userId: 'admin-a', tenantId: 'school-a' }
    ),
    false
  );
});

test('super_admin peut accéder aux ressources cross-tenant', () => {
  assert.equal(
    canReadClassRoom(
      { id: 'class-b', tenant_id: 'school-b', teacher_id: 'teacher-b' },
      { role: 'super_admin', userId: 'super-1', tenantId: 'platform' }
    ),
    true
  );
});
