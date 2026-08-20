'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        const { data: { session } } = await supabaseBrowserClient.auth.getSession();
        if (!session) {
          router.push('/auth/login');
          return;
        }

        // Fetch user role
        const { data: userData, error } = await supabaseBrowserClient
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (error || !userData) {
          router.push('/auth/login');
          return;
        }

        if (userData.role === 'collector') {
          router.push('/collector');
        } else if (userData.role === 'municipality') {
          router.push('/municipality');
        } else {
          router.push('/resident');
        }
      } catch (err) {
        console.error('Redirect error:', err);
        router.push('/auth/login');
      }
    };

    checkAuthAndRedirect();
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Redirecting to Dashboard...</span>
    </div>
  );
}
