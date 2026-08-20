'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, LogIn, Loader2, Leaf, Shield, User } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('resident-test@ecoclean.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setError(
          result?.error?.message ||
            'Invalid email or password. Please try again.'
        );
        return;
      }

      // Set the session on the browser Supabase client
      const { supabaseBrowserClient } = await import('@/lib/supabase/client');
      await supabaseBrowserClient.auth.setSession({
        access_token: result.data.session.accessToken,
        refresh_token: result.data.session.refreshToken,
      });

      const userRole = result.data.role || 'resident';

      // Role-based redirect
      if (userRole === 'collector') {
        router.push('/collector');
      } else if (userRole === 'municipality') {
        router.push('/municipality');
      } else {
        router.push('/resident');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async (selectedRole: 'resident' | 'collector' | 'municipality') => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Developer auto-sign-in failed.');
      }

      const { supabaseBrowserClient } = await import('@/lib/supabase/client');
      await supabaseBrowserClient.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });

      if (selectedRole === 'collector') {
        router.push('/collector');
      } else if (selectedRole === 'municipality') {
        router.push('/municipality');
      } else {
        router.push('/resident');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Dev login failed.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl p-8">
          {/* Logo & Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/20 ring-1 ring-emerald-500/10 mb-3">
              <Leaf className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-850 dark:from-white dark:to-slate-200 bg-clip-text text-transparent">
              Welcome to EcoClean
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Sign in to manage your waste collection and earn rewards.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3.5 flex items-start gap-2.5">
                <svg
                  className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm text-rose-700 dark:text-rose-300">
                  {error}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:scale-[1.01] transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Dev Shortcuts */}
          {process.env.NODE_ENV === 'development' && (
            <div className="flex flex-col gap-2.5 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/80">
              <p className="text-2xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center">Dev Auto Sign-In</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleDevLogin('resident')}
                  disabled={isLoading}
                  className="py-2.5 px-2 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-450 rounded-xl text-3xs font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <User className="w-3 h-3" />
                  Resident
                </button>
                <button
                  type="button"
                  onClick={() => handleDevLogin('collector')}
                  disabled={isLoading}
                  className="py-2.5 px-2 border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 hover:bg-teal-500/5 text-slate-700 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-450 rounded-xl text-3xs font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Shield className="w-3 h-3" />
                  Collector
                </button>
                <button
                  type="button"
                  onClick={() => handleDevLogin('municipality')}
                  disabled={isLoading}
                  className="py-2.5 px-2 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-450 rounded-xl text-3xs font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Shield className="w-3 h-3" />
                  Mun.
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>
              Don&apos;t have an account?{' '}
              <Link
                href="/auth/register"
                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Register as a Resident
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}