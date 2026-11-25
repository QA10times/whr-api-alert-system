'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/** Only same-site paths: a single leading slash, never "//host" or an absolute URL. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

export function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) {
        window.location.assign(safeNext(params.get('next')));
        return;
      }
      if (r.status === 401) setError('That email and password don’t match an account in AUTH_USERS.');
      else if (r.status === 429) setError('Too many attempts. Try again in a minute.');
      else setError('Couldn’t reach the server. Check your connection and try again.');
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.');
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
      {error && (
        <div role="alert" className="rounded-ctl border border-bad bg-bad-bg px-3 py-2 text-meta text-bad">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>
      <Button type="submit" variant="primary" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
