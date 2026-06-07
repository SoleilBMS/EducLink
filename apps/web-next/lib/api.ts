import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth';

const API_BASE =
  process.env.EDUCLINK_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type ApiOk<T> = { success: true; data: T; meta?: unknown };
type ApiErr = { success: false; error: { code: string; message: string }; meta?: unknown };

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  return {
    accept: 'application/json',
    ...(sessionId ? { cookie: `${SESSION_COOKIE}=${sessionId}` } : {}),
    ...extra
  };
}

/** Server-side fetch towards apps/web. Throws ApiError on non-2xx, returns data on success. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(),
    cache: 'no-store'
  });
  const json = (await res.json()) as ApiOk<T> | ApiErr;
  if (!res.ok || !json.success) {
    const code = (json as ApiErr).error?.code || 'API_ERROR';
    const msg = (json as ApiErr).error?.message || `HTTP ${res.status}`;
    throw new ApiError(res.status, code, msg);
  }
  return (json as ApiOk<T>).data;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: buildHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  const json = (await res.json()) as ApiOk<T> | ApiErr;
  if (!res.ok || !json.success) {
    const code = (json as ApiErr).error?.code || 'API_ERROR';
    const msg = (json as ApiErr).error?.message || `HTTP ${res.status}`;
    throw new ApiError(res.status, code, msg);
  }
  return (json as ApiOk<T>).data;
}

/** Like apiGet but returns null instead of throwing on errors (best for non-critical reads). */
export async function apiGetSafe<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch {
    return null;
  }
}

// === Domain types =========================================================

export type ClassRoom = {
  id: string;
  tenant_id: string;
  name: string;
  gradeLevelId?: string;
  capacity?: number;
};

export type Subject = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
};

export type Student = {
  id: string;
  tenant_id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  classRoomId: string;
  dateOfBirth: string;
  archived_at?: string | null;
};

export type TeacherProfile = {
  id: string;
  tenant_id: string;
  firstName: string;
  lastName: string;
  email: string;
  classRoomIds: string[];
  subjectIds: string[];
  classRooms: ClassRoom[];
  subjects: Subject[];
};

export type AttendanceStatus = 'present' | 'absent' | 'late';

export type AttendanceRecord = {
  id: string;
  tenant_id: string;
  date: string;
  classRoomId: string;
  studentId: string;
  teacherId: string;
  status: AttendanceStatus;
  created_at: string;
  updated_at: string;
};

export type LessonLog = {
  id: string;
  tenant_id: string;
  teacherId: string;
  classRoomId: string;
  subjectId: string;
  date: string;
  content: string;
  created_at: string;
};

export type Homework = {
  id: string;
  tenant_id: string;
  teacherId: string;
  classRoomId: string;
  subjectId: string;
  dueDate: string;
  assignedDate?: string;
  title: string;
  description: string;
  created_at: string;
  students?: Pick<Student, 'id' | 'firstName' | 'lastName' | 'classRoomId'>[];
};

export type Assessment = {
  id: string;
  tenant_id: string;
  classRoomId: string;
  subjectId: string;
  date: string;
  title: string;
  maxScore?: number;
};

export type Grade = {
  id: string;
  tenant_id: string;
  assessmentId: string;
  classRoomId: string;
  subjectId: string;
  teacherId: string;
  studentId: string;
  date: string;
  score: number;
  remark?: string;
  assessment?: Assessment;
  student?: Pick<Student, 'id' | 'firstName' | 'lastName'>;
};

export type ParentChild = {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  classRoomId: string;
  classRoomName: string | null;
  relationship: string | null;
};

export type ParentProfile = {
  id: string;
  tenantId: string;
  children: ParentChild[];
};

export type StudentProfile = Student & {
  classRoom: ClassRoom | null;
};
