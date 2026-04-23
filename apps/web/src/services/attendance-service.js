class AttendanceService {
  constructor({ attendanceStore, requireDateString }) {
    this.attendanceStore = attendanceStore;
    this.requireDateString = requireDateString;
  }

  async listAttendance(tenantId, query) {
    const date = query.date ? this.requireDateString(query.date, 'date') : undefined;
    const classRoomId = query.classRoomId || undefined;
    return this.attendanceStore.list(tenantId, { date, classRoomId });
  }

  async upsertForTeacher(tenantId, teacherId, payload) {
    return this.attendanceStore.upsertForClass(tenantId, {
      teacherId,
      classRoomId: payload.classRoomId,
      date: payload.date,
      records: payload.records
    });
  }
}

module.exports = { AttendanceService };
