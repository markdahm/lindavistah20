'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && !d.configured) setNotConfigured(d.missing);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Sign in failed.');
      }
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Linda Vista Water</h1>
        <p className="text-sm text-[var(--muted)] mb-6">Sign in to continue.</p>

        {notConfigured && (
          <div className="mb-4 p-4 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200">
            <p className="font-semibold">Not configured</p>
            <p className="text-sm">
              This deployment is missing {notConfigured.join(' and ')}. Set{' '}
              {notConfigured.length === 1 ? 'it' : 'them'} in the Vercel project settings and
              redeploy.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            className="w-full px-3 py-3 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-[var(--foreground)] text-base"
          />

          {error && (
            <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="mt-5 w-full px-6 py-3 rounded-lg bg-[var(--primary)] text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
