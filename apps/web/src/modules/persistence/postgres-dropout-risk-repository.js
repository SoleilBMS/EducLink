const crypto = require('node:crypto');

const { buildValidationError } = require('../error-utils');
const { RISK_LEVELS, MAX_SUMMARY_LENGTH, shapeAnalysis } = require('../dropout-risk');

const SELECT_COLUMNS = `
  id,
  tenant_id,
  student_id AS "studentId",
  score,
  level,
  factors_json AS "factorsJson",
  summary,
  generated_by_user_id AS "generatedByUserId",
  ai_provider AS "aiProvider",
  generated_at
`;

function mapRow(row) {
  let factors = null;
  if (row.factorsJson) {
    try {
      factors = JSON.parse(row.factorsJson);
    } catch {
      factors = null;
    }
  }
  return shapeAnalysis({
    id: row.id,
    tenant_id: row.tenant_id,
    studentId: row.studentId,
    score: row.score,
    level: row.level,
    factors,
    summary: row.summary,
    generatedByUserId: row.generatedByUserId,
    aiProvider: row.aiProvider,
    generated_at: row.generated_at
  });
}

class PostgresDropoutRiskRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async list(tenantId, { studentId, minLevel } = {}) {
    const clauses = ['tenant_id = $1'];
    const params = [tenantId];
    if (studentId) {
      params.push(studentId);
      clauses.push(`student_id = $${params.length}`);
    }
    if (minLevel) {
      const idx = RISK_LEVELS.indexOf(minLevel);
      if (idx >= 0) {
        const accepted = RISK_LEVELS.slice(idx);
        params.push(accepted);
        clauses.push(`level = ANY($${params.length}::text[])`);
      }
    }
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM dropout_risk_analyses WHERE ${clauses.join(' AND ')} ORDER BY generated_at DESC`,
      params
    );
    return result.rows.map(mapRow);
  }

  async getLatest(tenantId, studentId) {
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM dropout_risk_analyses
       WHERE tenant_id = $1 AND student_id = $2
       ORDER BY generated_at DESC LIMIT 1`,
      [tenantId, studentId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(tenantId, {
    studentId,
    score,
    level,
    factors,
    summary,
    generatedByUserId,
    aiProvider
  }) {
    if (typeof studentId !== 'string' || studentId.length < 2) {
      throw buildValidationError('studentId is required');
    }
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw buildValidationError('score must be an integer between 0 and 100');
    }
    if (!RISK_LEVELS.includes(level)) {
      throw buildValidationError(`level must be one of: ${RISK_LEVELS.join(', ')}`);
    }
    if (typeof summary !== 'string' || summary.trim().length === 0) {
      throw buildValidationError('summary is required');
    }
    if (summary.length > MAX_SUMMARY_LENGTH) {
      throw buildValidationError(`summary must be at most ${MAX_SUMMARY_LENGTH} characters`);
    }
    if (typeof generatedByUserId !== 'string' || generatedByUserId.length < 2) {
      throw buildValidationError('generatedByUserId is required');
    }
    if (typeof aiProvider !== 'string' || aiProvider.length < 2) {
      throw buildValidationError('aiProvider is required');
    }
    const id = `dropout-risk-${crypto.randomUUID()}`;
    const factorsJson = JSON.stringify(factors || {});
    const result = await this.pool.query(
      `INSERT INTO dropout_risk_analyses
         (id, tenant_id, student_id, score, level, factors_json, summary, generated_by_user_id, ai_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLUMNS}`,
      [id, tenantId, studentId, score, level, factorsJson, summary.trim(), generatedByUserId, aiProvider]
    );
    return mapRow(result.rows[0]);
  }
}

module.exports = { PostgresDropoutRiskRepository };
