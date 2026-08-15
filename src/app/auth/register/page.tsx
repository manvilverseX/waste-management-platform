'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2, Leaf, Eye, EyeOff, AlertCircle, UserPlus } from 'lucide-react';
import Link from 'next/link';

const initialForm = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  communityId: ''
};

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [communities, setCommunities] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchCommunities = async () => {
      try {
        const res = await fetch('/api/communities');
        if (!res.ok) throw new Error('Failed to load communities.');
        const result = await res.json();
        if (result.success && result.data && active) {
          setCommunities(result.data);
        } else if (active) {
          throw new Error(result.error?.message || 'Failed to load communities.');
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Could not load communities. Please refresh.';
          setCommunitiesError(msg);
        }
      } finally {
        if (active) {
          setLoadingCommunities(false);
        }
      }
    };
    fetchCommunities();
    return () => {
      active = false;
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!form.fullName || form.fullName.length < 2) {
      setError('Full Name must be at least 2 characters.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email || !emailRegex.test(form.email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!form.password || form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!form.communityId) {
      setError('Please select a community.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          communityId: form.communityId
        })
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        const message = result?.error?.message || 'Registration failed. Please try again.';
        setError(message);
        return;
      }

      // If email confirmation is required
      if (result.data?.sessionRequired) {
        router.push('/auth/verify-email');
        return;
      }

      // Auto-login if session returned
      if (result.data?.session) {
        const { supabaseBrowserClient } = await import('@/lib/supabase/client');
        await supabaseBrowserClient.auth.setSession({
          access_token: result.data.session.accessToken,
          refresh_token: result.data.session.refreshToken,
        });
        router.push('/resident');
        return;
      }

      // Fallback: ask user to login
      router.push('/auth/login?registered=true');

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
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
              Join EcoClean
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Create your Resident account to start managing waste collection and earning rewards.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                name="fullName"
                autoComplete="name"
                value={form.fullName}
                onChange={handleInputChange}
                className="w-full pl-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                placeholder="Enter your full name"
                required
              />
            </div>

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
                  name="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleInputChange}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                  placeholder="you@example.com"
                  required
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
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleInputChange}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-slate-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-slate-400" />
                </div>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-slate-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="communityId"
                className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Community
              </label>
              {loadingCommunities ? (
                <div className="flex items-center gap-2 py-2.5 px-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span>Loading communities...</span>
                </div>
              ) : communitiesError ? (
                <div className="text-xs text-rose-500 p-3.5 border border-rose-250 dark:border-rose-500/30 rounded-xl bg-rose-50 dark:bg-rose-500/10">
                  {communitiesError}
                </div>
              ) : (
                <select
                  id="communityId"
                  name="communityId"
                  value={form.communityId}
                  onChange={handleInputChange}
                  className="w-full pl-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                  required
                >
                  <option value="">-- Select Your Community --</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {error && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3.5 flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-rose-700 dark:text-rose-300">
                  {error}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || loadingCommunities}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:scale-[1.01] transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  Register
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>
              Already have an account?{' '}
              <Link
                href="/auth/login"
                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}