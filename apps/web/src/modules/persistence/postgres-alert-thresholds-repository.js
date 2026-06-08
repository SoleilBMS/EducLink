const { DEFAULT_THRESHOLDS, normalizeThresholds } = require('../attendance-stats');

const SELECT_COLUMNS = `
  tenant_id,
  absent_threshold AS "absentThreshold",
  late_threshold AS "lateThreshold",
  discipline_threshold AS "disciplineThreshold",
  window_days AS "windowDays",
  updated_at
`;

function mapRow(row) {
  return {
    tenant_id: row.tenant_id,
    absentThreshold: row.absentThreshold,
    lateThreshold: row.lateThreshold,
    disciplineThreshold: row.disciplineThreshold,
    windowDays: row.windowDays,
    updated_at: row.updated_at,
    isDefault: false
  };
}

class PostgresAlertThresholdsRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async get(tenantId) {
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM attendance_alert_thresholds WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    if (result.rows.length === 0) {
      return { ...DEFAULT_THRESHOLDS, tenant_id: tenantId, isDefault: true };
    }
    return mapRow(result.rows[0]);
  }

  async upsert(tenantId, input) {
    const normalized = normalizeThresholds(input);
    const result = await this.pool.query(
      `INSERT INTO attendance_alert_thresholds
         (tenant_id, absent_threshold, late_threshold, discipline_threshold, window_days)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id) DO UPDATE SET
         absent_threshold = EXCLUDED.absent_threshold,
         late_threshold = EXCLUDED.late_threshold,
         discipline_threshold = EXCLUDED.discipline_threshold,
         window_days = EXCLUDED.window_days,
         updated_at = NOW()
       RETURNING ${SELECT_COLUMNS}`,
      [tenantId, normalized.absentThreshold, normalized.lateThreshold, normalized.disciplineThreshold, normalized.windowDays]
    );
    return mapRow(result.rows[0]);
  }
}

module.exports = { PostgresAlertThresholdsRepository };
