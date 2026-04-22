function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function requiredString(value, field, min = 2, max = 80) {
  if (typeof value !== 'string') {
    return `${field} must be a string`;
  }

  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return `${field} must be between ${min} and ${max} characters`;
  }

  return null;
}

function optionalNumber(value, field, min = 0, max = 10000) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return `${field} must be a number between ${min} and ${max}`;
  }

  return null;
}

function validatePayload(entityType, payload) {
  const errors = [];

  function add(error) {
    if (error) {
      errors.push(error);
    }
  }

  switch (entityType) {
    case 'school':
      add(requiredString(payload.name, 'name', 2, 120));
      break;
    case 'academic_year':
      add(requiredString(payload.name, 'name', 2, 60));
      add(requiredString(payload.school_id, 'school_id', 2, 80));
      add(isIsoDate(payload.start_date) ? null : 'start_date must use YYYY-MM-DD format');
      add(isIsoDate(payload.end_date) ? null : 'end_date must use YYYY-MM-DD format');
      if (isIsoDate(payload.start_date) && isIsoDate(payload.end_date) && payload.start_date >= payload.end_date) {
        add('start_date must be before end_date');
      }
      break;
    case 'term':
      add(requiredString(payload.name, 'name', 2, 60));
      add(requiredString(payload.academic_year_id, 'academic_year_id', 2, 80));
      add(isIsoDate(payload.start_date) ? null : 'start_date must use YYYY-MM-DD format');
      add(isIsoDate(payload.end_date) ? null : 'end_date must use YYYY-MM-DD format');
      add(optionalNumber(payload.order_index, 'order_index', 1, 12));
      break;
    case 'grade_level':
      add(requiredString(payload.school_id, 'school_id', 2, 80));
      add(requiredString(payload.name, 'name', 1, 60));
      add(optionalNumber(payload.order_index, 'order_index', 1, 30));
      break;
    case 'class_room':
      add(requiredString(payload.school_id, 'school_id', 2, 80));
      add(requiredString(payload.grade_level_id, 'grade_level_id', 2, 80));
      add(requiredString(payload.name, 'name', 1, 80));
      add(optionalNumber(payload.capacity, 'capacity', 1, 120));
      break;
    case 'subject':
      add(requiredString(payload.school_id, 'school_id', 2, 80));
      add(requiredString(payload.name, 'name', 1, 80));
      add(requiredString(payload.code, 'code', 2, 20));
      break;
    default:
      add('Unsupported entity type');
  }

  return errors;
}

module.exports = {
  validatePayload
};
