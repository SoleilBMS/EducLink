class PostgresCoreSchoolRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async listClassRooms(tenantId) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, grade_level_id AS "gradeLevelId", capacity
       FROM class_rooms
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tenantId]
    );
    return result.rows;
  }

  async getClassRoom(tenantId, classRoomId) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, grade_level_id AS "gradeLevelId", capacity
       FROM class_rooms
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, classRoomId]
    );

    return result.rows[0] ?? null;
  }
}

module.exports = {
  PostgresCoreSchoolRepository
};
