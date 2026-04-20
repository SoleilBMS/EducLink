const { isSameTenant } = require('../../../core/src/tenantScope');
const { ROLES } = require('../roles/roles');

/**
 * @param {{ role: string }} session
 * @returns {boolean}
 */
function isSuperAdmin(session) {
  return session.role === ROLES.SUPER_ADMIN;
}

/**
 * @param {{ tenant_id: string }} resource
 * @param {{ role: string, tenantId: string }} session
 * @param {{ allowSuperAdminGlobal?: boolean }} [options]
 * @returns {boolean}
 */
function canAccessTenantResource(resource, session, options = {}) {
  if (options.allowSuperAdminGlobal && isSuperAdmin(session)) {
    return true;
  }

  return isSameTenant(resource, session.tenantId);
}

/**
 * @param {{ id: string, tenant_id: string, class_id: string }} student
 * @param {{ role: string, userId: string, tenantId: string }} session
 * @param {{ parentStudentLinks: { parentId: string, studentId: string }[], teacherClassAssignments: { teacherId: string, classId: string }[] }} context
 * @returns {boolean}
 */
function canReadStudent(student, session, context) {
  if (!canAccessTenantResource(student, session, { allowSuperAdminGlobal: true })) {
    return false;
  }

  switch (session.role) {
    case ROLES.SUPER_ADMIN:
      return true;
    case ROLES.SCHOOL_ADMIN:
    case ROLES.DIRECTOR:
      return true;
    case ROLES.TEACHER:
      return context.teacherClassAssignments.some(
        (assignment) => assignment.teacherId === session.userId && assignment.classId === student.class_id
      );
    case ROLES.PARENT:
      return context.parentStudentLinks.some(
        (link) => link.parentId === session.userId && link.studentId === student.id
      );
    case ROLES.STUDENT:
      return session.userId === student.id;
    default:
      return false;
  }
}

/**
 * @param {{ id: string, tenant_id: string, teacher_id: string }} classRoom
 * @param {{ role: string, userId: string, tenantId: string }} session
 * @returns {boolean}
 */
function canReadClassRoom(classRoom, session) {
  if (!canAccessTenantResource(classRoom, session, { allowSuperAdminGlobal: true })) {
    return false;
  }

  switch (session.role) {
    case ROLES.SUPER_ADMIN:
      return true;
    case ROLES.SCHOOL_ADMIN:
    case ROLES.DIRECTOR:
      return true;
    case ROLES.TEACHER:
      return classRoom.teacher_id === session.userId;
    default:
      return false;
  }
}

module.exports = {
  isSuperAdmin,
  canAccessTenantResource,
  canReadStudent,
  canReadClassRoom
};
