'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/app/actions/auth';

const INITIAL_STATE: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-6 grid gap-4">
      {state.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      <label className="grid gap-1.5 text-sm font-medium">
        Email
        <input
          type="email"
          name="email"
          required
          defaultValue="admin@school-a.test"
          autoComplete="email"
          className="rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink shadow-soft transition-all focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Mot de passe
        <input
          type="password"
          name="password"
          required
          defaultValue="password123"
          autoComplete="current-password"
          className="rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink shadow-soft transition-all focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.18)] focus:outline-none"
        />
      </label>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary mt-2 disabled:opacity-60" disabled={pending}>
      {pending ? 'Connexion…' : 'Se connecter'}
    </button>
  );
}
