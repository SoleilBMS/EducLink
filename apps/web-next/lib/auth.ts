import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'sessionId';

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  school_admin: 'School admin',
  director: 'Direction',
  teacher: 'Enseignant',
  parent: 'Parent',
  student: 'Élève',
  accountant: 'Comptable'
};

export type AuthRole = keyof typeof ROLE_LABELS | string;

export type CurrentUser = {
  id: string;
  email: string;
  role: AuthRole;
  tenantId: string | null;
  sessionId: string;
  displayName: string;
  roleLabel: string;
};

const API_BASE =
  process.env.EDUCLINK_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function deriveDisplayName(email: string): string {
  const local = (email.split('@')[0] || email).replace(/[._-]+/g, ' ');
  return local
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Reads the sessionId cookie and validates it against apps/web /api/v1/auth/me.
 * Returns null if no cookie or invalid session.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success || !json.data) return null;
    const data = json.data as {
      id: string;
      email: string;
      role: string;
      tenantId: string | null;
      sessionId: string;
    };
    return {
      ...data,
      displayName: deriveDisplayName(data.email),
      roleLabel: ROLE_LABELS[data.role] || data.role
    };
  } catch {
    return null;
  }
}

/** Best-effort tenant label for the header. Replace later with real /api/v1/schools/:id call. */
export function tenantLabel(tenantId: string | null): string {
  if (!tenantId) return 'Plateforme';
  if (tenantId === 'school-a') return 'École Pilote · School A';
  if (tenantId === 'school-b') return 'École Pilote · School B';
  return tenantId;
}
