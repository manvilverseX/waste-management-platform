'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, LogIn, Loader2, Leaf, Shield, User, Recycle } from 'lucide-react';
import Link from 'next/link';
import { BackgroundMesh } from '@/features/shared/components/BackgroundMesh';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('resident-test@ecoclean.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCommunity, setDevCommunity] = useState('eb888dee-4b1e-4c65-8ffa-351783fd06d1');
  const [devUserIndex, setDevUserIndex] = useState<1 | 2>(1);

  // ── All business logic preserved exactly as-is ─────────────────────────

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

      const { supabaseBrowserClient } = await import('@/lib/supabase/client');
      await supabaseBrowserClient.auth.setSession({
        access_token: result.data.session.accessToken,
        refresh_token: result.data.session.refreshToken,
      });

      const userRole = result.data.role || 'resident';

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
        body: JSON.stringify({
          role: selectedRole,
          communityId: devCommunity,
          userIndex: devUserIndex
        }),
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
    <div className="min-h-dvh relative flex items-center justify-center overflow-hidden bg-[#14171A]">
      {/* Jali background texture */}
      <div className="jali-overlay" aria-hidden="true" />

      {/* Aurora mesh background layer */}
      <BackgroundMesh role="auth" />

      <div className="relative z-10 w-full max-w-md mx-4 sc-anim-fade-up">
        {/* Brand mark */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-forest-700 flex items-center justify-center shadow-lg mb-4 sc-anim-scale-in"
            style={{ boxShadow: '0 8px 32px rgba(22,163,74,0.35)' }}>
            <Recycle className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white">
            Swachh Circuit
          </h1>
          <p className="text-charcoal-400 text-sm mt-2 max-w-xs">
            Community waste management, powered by AI verification and civic action.
          </p>
        </div>

        {/* Form card */}
        <div className="sc-glass sc-shadow-stack p-8" style={{ borderRadius: '24px' }}>
          <p className="text-charcoal-300 text-xs font-bold uppercase tracking-widest mb-6">
            Sign in to your account
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-charcoal-300 text-xs font-semibold mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-500 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="sc-input pl-10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-charcoal-300 text-xs font-semibold mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-500 pointer-events-none" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="sc-input pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 flex items-start gap-2.5 sc-anim-fade-up">
                <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-rose-300">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              id="login-submit-btn"
              className="sc-btn-primary w-full mt-2"
              style={{ padding: '0.75rem 1.25rem', fontSize: '0.875rem' }}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
              ) : (
                <><LogIn className="w-4 h-4" /> Sign In</>
              )}
            </button>
          </form>

          {/* Dev shortcuts */}
          {(process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true') && (
            <div className="mt-6 pt-5 border-t border-charcoal-800 space-y-4">
              <p className="text-charcoal-500 text-2xs font-extrabold uppercase tracking-widest text-center">
                ⚡ Dev Quick Sign-In
              </p>

              {/* Community selector */}
              <div>
                <label className="text-3xs font-bold text-charcoal-500 uppercase tracking-widest block mb-1.5">
                  Demo Community
                </label>
                <select
                  value={devCommunity}
                  onChange={(e) => setDevCommunity(e.target.value)}
                  className="sc-input text-xs"
                  style={{ fontSize: '14px' }}
                >
                  <option value="eb888dee-4b1e-4c65-8ffa-351783fd06d1">Maplewood District (Default)</option>
                  <option value="a1888dee-4b1e-4c65-8ffa-351783fd06d0">Purvankara Apartments, CRPF</option>
                  <option value="b1888dee-4b1e-4c65-8ffa-351783fd06d1">Prestige Elite, Avalahalli</option>
                  <option value="c1888dee-4b1e-4c65-8ffa-351783fd06d2">Concord Silicon Valley, Rajanakunte</option>
                </select>
              </div>

              {/* User index */}
              <div>
                <label className="text-3xs font-bold text-charcoal-500 uppercase tracking-widest block mb-1.5">
                  Demo Identity
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([1, 2] as const).map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setDevUserIndex(idx)}
                      className={`py-2 rounded-xl text-3xs font-extrabold transition-all border ${
                        devUserIndex === idx
                          ? 'border-forest-600/40 bg-forest-600/10 text-forest-400'
                          : 'border-charcoal-700 text-charcoal-500 hover:bg-charcoal-800'
                      }`}
                    >
                      {idx === 1 ? 'Resident 1 / Collector' : 'Resident 2'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Role buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  id="dev-login-resident"
                  onClick={() => handleDevLogin('resident')}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-1.5 py-2.5 border border-charcoal-700 hover:border-forest-600/40 hover:bg-forest-600/8 rounded-xl text-3xs font-extrabold transition-all disabled:opacity-50 text-charcoal-400 hover:text-forest-400"
                >
                  <Leaf className="w-3.5 h-3.5" />
                  Resident
                </button>
                <button
                  type="button"
                  id="dev-login-collector"
                  onClick={() => handleDevLogin('collector')}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-1.5 py-2.5 border border-charcoal-700 hover:border-terra-600/40 hover:bg-terra-600/8 rounded-xl text-3xs font-extrabold transition-all disabled:opacity-50 text-charcoal-400 hover:text-terra-400"
                >
                  <User className="w-3.5 h-3.5" />
                  Collector
                </button>
                <button
                  type="button"
                  id="dev-login-municipality"
                  onClick={() => handleDevLogin('municipality')}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-1.5 py-2.5 border border-charcoal-700 hover:border-indigo-500/40 hover:bg-indigo-500/8 rounded-xl text-3xs font-extrabold transition-all disabled:opacity-50 text-charcoal-400 hover:text-indigo-400"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer link */}
        <p className="text-center text-charcoal-500 text-sm mt-6">
          No account?{' '}
          <Link href="/auth/register" className="text-forest-400 font-semibold hover:text-forest-300 underline-offset-2 hover:underline transition-colors">
            Register as a Resident
          </Link>
        </p>
      </div>
    </div>
  );
}