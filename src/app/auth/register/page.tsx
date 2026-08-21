'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2, Eye, EyeOff, AlertCircle, UserPlus, Recycle } from 'lucide-react';
import Link from 'next/link';
import { BackgroundMesh } from '@/features/shared/components/BackgroundMesh';

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
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [communities, setCommunities] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadCommunities = async () => {
      try {
        const res = await fetch('/api/communities');
        const data = await res.json();
        if (active && data.success) {
          setCommunities(data.data || []);
        } else if (active) {
          setCommunitiesError(data.error?.message || 'Failed to load communities.');
        }
      } catch (err) {
        console.error('Failed to load communities index:', err);
        if (active) setCommunitiesError('Could not load communities. Please refresh.');
      } finally {
        if (active) setLoadingCommunities(false);
      }
    };
    loadCommunities();
    return () => { active = false; };
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

    const { fullName, email, password, confirmPassword, communityId } = form;

    if (!fullName || !email || !password || !confirmPassword || !communityId) {
      setError('Please fill in all registration fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password, communityId }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setError(result?.error?.message || 'Registration failed. Email might already be taken.');
        return;
      }

      router.push('/auth/login?registered=true');

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh relative flex items-center justify-center overflow-hidden bg-[#14171A] py-8">
      {/* Jali background texture */}
      <div className="jali-overlay" aria-hidden="true" />

      {/* Aurora mesh background layer */}
      <BackgroundMesh role="auth" />

      <div className="relative z-10 w-full max-w-md mx-4 sc-anim-fade-up">
        {/* Brand mark */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-forest-700 flex items-center justify-center shadow-lg mb-4"
            style={{ boxShadow: '0 8px 32px rgba(22,163,74,0.35)' }}>
            <Recycle className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white">
            Join the Circuit
          </h1>
          <p className="text-charcoal-400 text-sm mt-2 max-w-xs">
            Create your resident account to start making a difference in your community.
          </p>
        </div>

        {/* Form card */}
        <div className="sc-glass sc-shadow-stack p-8" style={{ borderRadius: '24px' }}>
          <p className="text-charcoal-300 text-xs font-bold uppercase tracking-widest mb-6">
            Create your account
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-charcoal-300 text-xs font-semibold mb-1.5">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                name="fullName"
                autoComplete="name"
                value={form.fullName}
                onChange={handleInputChange}
                className="sc-input"
                placeholder="Enter your full name"
                required
              />
            </div>

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
                  name="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleInputChange}
                  className="sc-input pl-10"
                  placeholder="you@example.com"
                  required
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
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleInputChange}
                  className="sc-input pl-10 pr-10"
                  placeholder="Min. 6 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-charcoal-500 hover:text-charcoal-300 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-charcoal-300 text-xs font-semibold mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-500 pointer-events-none" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={handleInputChange}
                  className="sc-input pl-10 pr-10"
                  placeholder="Repeat password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-charcoal-500 hover:text-charcoal-300 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Community */}
            <div>
              <label htmlFor="communityId" className="block text-charcoal-300 text-xs font-semibold mb-1.5">
                Your Community
              </label>
              {loadingCommunities ? (
                <div className="sc-input flex items-center gap-2 text-charcoal-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-forest-500" />
                  Loading communities...
                </div>
              ) : communitiesError ? (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
                  {communitiesError}
                </div>
              ) : (
                <select
                  id="communityId"
                  name="communityId"
                  value={form.communityId}
                  onChange={handleInputChange}
                  className="sc-input"
                  required
                >
                  <option value="">— Select Your Community —</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 flex items-start gap-2.5 sc-anim-fade-up">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-rose-300">{error}</span>
              </div>
            )}

            <button
              type="submit"
              id="register-submit-btn"
              disabled={isLoading || loadingCommunities}
              className="sc-btn-primary w-full mt-2"
              style={{ padding: '0.75rem 1.25rem', fontSize: '0.875rem' }}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</>
              ) : (
                <><UserPlus className="w-4 h-4" /> Create Account</>
              )}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center text-charcoal-500 text-sm mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-forest-400 font-semibold hover:text-forest-300 underline-offset-2 hover:underline transition-colors">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}