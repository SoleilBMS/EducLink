class AttendanceService {
  constructor({ attendanceStore, attendanceEventsStore = null, requireDateString }) {
    this.attendanceStore = attendanceStore;
    this.attendanceEventsStore = attendanceEventsStore;
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

  async listEvents(tenantId, { date, classRoomId, studentId } = {}) {
    if (!this.attendanceEventsStore) {
      return [];
    }
    const normalizedDate = date ? this.requireDateString(date, 'date') : undefined;
    return this.attendanceEventsStore.list(tenantId, {
      date: normalizedDate,
      classRoomId: classRoomId || undefined,
      studentId: studentId || undefined
    });
  }

  async createEvent(tenantId, payload) {
    if (!this.attendanceEventsStore) {
      throw new Error('attendanceEventsStore is not configured');
    }
    return this.attendanceEventsStore.create(tenantId, payload);
  }

  async deleteEvent(tenantId, eventId, context) {
    if (!this.attendanceEventsStore) {
      throw new Error('attendanceEventsStore is not configured');
    }
    return this.attendanceEventsStore.delete(tenantId, eventId, context);
  }
}

module.exports = { AttendanceService };
