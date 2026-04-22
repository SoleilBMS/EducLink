/**
 * @typedef {'school'|'academic_year'|'term'|'grade_level'|'class_room'|'subject'} EntityType
 *
 * @typedef {{
 *  id: string,
 *  tenant_id: string,
 *  name: string,
 *  code?: string,
 *  description?: string,
 *  is_active?: boolean,
 *  created_at: string,
 *  updated_at: string
 * }} School
 *
 * @typedef {{
 *  id: string,
 *  tenant_id: string,
 *  school_id: string,
 *  name: string,
 *  start_date: string,
 *  end_date: string,
 *  is_current: boolean,
 *  created_at: string,
 *  updated_at: string
 * }} AcademicYear
 *
 * @typedef {{
 *  id: string,
 *  tenant_id: string,
 *  academic_year_id: string,
 *  name: string,
 *  start_date: string,
 *  end_date: string,
 *  order_index: number,
 *  created_at: string,
 *  updated_at: string
 * }} Term
 *
 * @typedef {{
 *  id: string,
 *  tenant_id: string,
 *  school_id: string,
 *  name: string,
 *  order_index: number,
 *  created_at: string,
 *  updated_at: string
 * }} GradeLevel
 *
 * @typedef {{
 *  id: string,
 *  tenant_id: string,
 *  school_id: string,
 *  grade_level_id: string,
 *  name: string,
 *  capacity: number,
 *  created_at: string,
 *  updated_at: string
 * }} ClassRoom
 *
 * @typedef {{
 *  id: string,
 *  tenant_id: string,
 *  school_id: string,
 *  name: string,
 *  code: string,
 *  created_at: string,
 *  updated_at: string
 * }} Subject
 */

module.exports = {};
