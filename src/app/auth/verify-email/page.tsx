'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const router = useRouter();

  // Auto-redirect to login after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/auth/login');
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl p-8 text-center">
          <div className="flex flex-col items-center mb-6">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-850 dark:from-white dark:to-slate-200 bg-clip-text text-transparent">
              Check your email
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              We sent a verification link to your email address.
            </p>
          </div>

          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-4 flex items-start gap-3 mb-6">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
                Registration complete
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                Click the verification link in your email to activate your account.
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            Redirecting to login in 5 seconds...
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Waiting for verification</span>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
            <Link
              href="/auth/login"
              className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}