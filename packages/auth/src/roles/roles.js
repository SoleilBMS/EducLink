const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  SCHOOL_ADMIN: 'school_admin',
  DIRECTOR: 'director',
  TEACHER: 'teacher',
  PARENT: 'parent',
  STUDENT: 'student',
  ACCOUNTANT: 'accountant'
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

/**
 * @param {string} role
 * @returns {boolean}
 */
function isRole(role) {
  return ALL_ROLES.includes(role);
}

module.exports = {
  ROLES,
  ALL_ROLES,
  isRole
};
