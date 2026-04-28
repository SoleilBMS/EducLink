'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { SESSION_COOKIE } from '@/lib/auth';

const API_BASE =
  process.env.EDUCLINK_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

async function postJson(path: string, body: unknown): Promise<ActionResult> {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionId) return { ok: false, error: 'Session expirée' };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=${sessionId}`
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    }
    revalidatePath('/lesson-homework');
    return { ok: true, message: 'Enregistré' };
  } catch {
    return { ok: false, error: 'Backend EducLink injoignable' };
  }
}

export async function createLessonLog(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return postJson('/api/v1/lesson-logs', {
    classRoomId: String(formData.get('classRoomId') || ''),
    subjectId: String(formData.get('subjectId') || ''),
    date: String(formData.get('date') || ''),
    content: String(formData.get('content') || '').trim()
  });
}

export async function createHomework(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return postJson('/api/v1/homeworks', {
    classRoomId: String(formData.get('classRoomId') || ''),
    subjectId: String(formData.get('subjectId') || ''),
    dueDate: String(formData.get('dueDate') || ''),
    title: String(formData.get('title') || '').trim(),
    description: String(formData.get('description') || '').trim()
  });
}
