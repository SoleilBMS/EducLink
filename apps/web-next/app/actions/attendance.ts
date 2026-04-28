'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { SESSION_COOKIE } from '@/lib/auth';

const API_BASE =
  process.env.EDUCLINK_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export type SaveAttendanceInput = {
  classRoomId: string;
  date: string;
  records: { studentId: string; status: 'present' | 'absent' | 'late' }[];
};

export type SaveAttendanceResult =
  | { ok: true; saved: number }
  | { ok: false; error: string };

export async function saveAttendance(input: SaveAttendanceInput): Promise<SaveAttendanceResult> {
  if (!input.classRoomId || !input.date || !Array.isArray(input.records) || input.records.length === 0) {
    return { ok: false, error: 'classRoomId, date et records sont requis' };
  }

  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionId) return { ok: false, error: 'Session expirée' };

  try {
    const res = await fetch(`${API_BASE}/api/v1/attendance`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=${sessionId}`
      },
      body: JSON.stringify(input),
      cache: 'no-store'
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    }
    const saved = Array.isArray(json.data) ? json.data.length : 0;
    revalidatePath('/attendance');
    return { ok: true, saved };
  } catch (err) {
    return { ok: false, error: 'Backend EducLink injoignable' };
  }
}
