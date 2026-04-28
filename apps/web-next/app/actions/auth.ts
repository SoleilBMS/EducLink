'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/lib/auth';

const API_BASE =
  process.env.EDUCLINK_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export type LoginState = { error: string | null };

/**
 * Reads a Set-Cookie header from apps/web and extracts the session value.
 * apps/web emits: `sessionId=<id>; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
 */
function extractSessionCookie(setCookieHeader: string | null): {
  value: string;
  maxAge: number | null;
} | null {
  if (!setCookieHeader) return null;
  const idMatch = setCookieHeader.match(/sessionId=([^;]+)/i);
  if (!idMatch || !idMatch[1] || idMatch[1] === '') return null;
  const maxAgeMatch = setCookieHeader.match(/Max-Age=(\d+)/i);
  return {
    value: idMatch[1],
    maxAge: maxAgeMatch ? Number(maxAgeMatch[1]) : null
  };
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    return { error: 'Email et mot de passe requis.' };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
      cache: 'no-store'
    });
  } catch (err) {
    return {
      error: `Backend EducLink injoignable (${API_BASE}). Démarre apps/web sur :3000.`
    };
  }

  const setCookie = res.headers.get('set-cookie');
  const session = extractSessionCookie(setCookie);

  if (res.status === 401) {
    return { error: 'Identifiants invalides.' };
  }
  if (!res.ok || !session) {
    return { error: `Erreur d'authentification (HTTP ${res.status}).` };
  }

  cookies().set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge ?? 86400
  });

  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (sessionId) {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
        cache: 'no-store'
      });
    } catch {
      // Best-effort: continue clearing the cookie locally.
    }
  }
  cookies().delete(SESSION_COOKIE);
  redirect('/login');
}
