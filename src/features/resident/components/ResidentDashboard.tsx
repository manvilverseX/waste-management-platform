'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Gift,
  Trophy,
  User,
  MapPin,
  Clock,
  PlusCircle,
  Award,
  TrendingUp,
  Recycle,
  AlertCircle,
  Bell,
  BarChart2,
  Megaphone,
  LogOut,
  Sparkles,
  Loader2
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { BackgroundMesh } from '@/features/shared/components/BackgroundMesh';
import { RequestCollectionForm } from './RequestCollectionForm';
import { RecentRequestsList } from './RecentRequestsList';
import { ReportDumpingForm } from './ReportDumpingForm';
import { LaunchCampaignTab } from './LaunchCampaignTab';
import { NotificationsTab } from './NotificationsTab';
import { EducationCenter } from './EducationCenter';
import {
  RewardTransactionDTO,
  RewardSummaryDTO,
  CommunityProfileDTO,
  CommunityScorecardDTO
} from '@/types';

// Tab Configuration DTO
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Clock, activeClass: 'sc-tab-active-indigo' },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, activeClass: 'sc-tab-active-indigo' },
  { id: 'notifications', label: 'Inbox', icon: Bell, activeClass: 'sc-tab-active-indigo' }
] as const;

type TabId = typeof NAV_ITEMS[number]['id'];

export const ResidentDashboard: React.FC = () => {
  const router = useRouter();

  // ── States ──────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showDumpingForm, setShowDumpingForm] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const [transactions, setTransactions] = useState<RewardTransactionDTO[]>([]);
  const [summary, setSummary] = useState<RewardSummaryDTO | null>(null);
  const [community, setCommunity] = useState<CommunityProfileDTO | null>(null);
  const [scorecard, setScorecard] = useState<CommunityScorecardDTO | null>(null);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingCommunity, setLoadingCommunity] = useState(true);
  const [loadingScorecard, setLoadingScorecard] = useState(true);
  const [streakCount, setStreakCount] = useState(0);

  useEffect(() => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastActive = localStorage.getItem('sc_last_active_date');
      const currentStreakVal = localStorage.getItem('sc_streak_count') || '0';
      let streak = parseInt(currentStreakVal, 10);

      if (!lastActive) {
        streak = 1;
      } else {
        const lastDate = new Date(lastActive);
        const todayDate = new Date(todayStr);
        const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          streak += 1;
        } else if (diffDays > 1) {
          streak = 1; // Reset
        }
      }
      localStorage.setItem('sc_last_active_date', todayStr);
      localStorage.setItem('sc_streak_count', streak.toString());
      setStreakCount(streak);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await supabaseBrowserClient.auth.signOut();
      router.push('/auth/login');
    } catch (e) {
      console.error('Logout failed:', e);
      router.push('/auth/login');
    }
  };

  const handlePointsAwarded = (points: number) => {
    if (summary) {
      setSummary({
        ...summary,
        balancePoints: summary.balancePoints + points,
        lifetimePoints: summary.lifetimePoints + points
      });
    }
  };

  const getGrade = (score: number) => {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  };

  useEffect(() => {
    const initAuthAndFetch = async () => {
      let currentSession = null;
      try {
        const { data: { session } } = await supabaseBrowserClient.auth.getSession();
        currentSession = session;
        if (!session) {
          router.push('/auth/login');
          return;
        }

        const { data: userData, error: userError } = await supabaseBrowserClient
          .from('users')
          .select('name, email, role')
          .eq('id', session.user.id)
          .single();

        if (userError || !userData) {
          throw new Error('User record not found in system.');
        }

        if (userData.role !== 'resident') {
          console.warn('Unauthorized resident access redirection from:', userData.role);
          if (userData.role === 'collector') {
            router.push('/collector');
          } else {
            router.push('/municipality');
          }
          return;
        }

        setProfile({ name: userData.name, email: userData.email });
        setLoadingProfile(false);

        fetchRewardsSummary(session);
        fetchCommunityProfile(session);
        fetchCommunityScorecard(session);
        fetchTransactions(session);

      } catch (err) {
        console.error('[ResidentDashboard Init Error]:', err);
        router.push('/auth/login');
      }
    };

    const fetchRewardsSummary = async (session: any) => {
      try {
        const res = await fetch('/api/rewards/summary', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await res.json();
        if (res.ok && result.success) {
          setSummary(result.data);
        }
      } catch (err) {
        console.error('Failed to load summary details:', err);
      } finally {
        setLoadingSummary(false);
      }
    };

    const fetchCommunityProfile = async (session: any) => {
      try {
        const res = await fetch('/api/communities/profile', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await res.json();
        if (res.ok && result.success) {
          setCommunity(result.data);
        }
      } catch (err) {
        console.error('Failed to load community profile:', err);
      } finally {
        setLoadingCommunity(false);
      }
    };

    const fetchCommunityScorecard = async (session: any) => {
      try {
        const res = await fetch('/api/communities/scorecard', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await res.json();
        if (res.ok && result.success) {
          setScorecard(result.data);
        }
      } catch (err) {
        console.error('Failed to load community scorecard:', err);
      } finally {
        setLoadingScorecard(false);
      }
    };

    const fetchTransactions = async (session: any) => {
      try {
        const res = await fetch('/api/rewards', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await res.json();
        if (res.ok && result.success) {
          setTransactions(result.data || []);
        }
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setLoadingTransactions(false);
      }
    };

    initAuthAndFetch();
  }, [router]);

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#14171A] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-forest-500 animate-spin" />
          <p className="text-xs text-charcoal-400 font-bold uppercase tracking-wider">Synchronizing Profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#14171A] text-[#F0F2F5] pb-16 relative overflow-hidden" style={{ fontFamily: 'var(--font-geist-sans)' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#14171A]/90 backdrop-blur-md border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-forest-700 flex items-center justify-center shadow-lg"
              style={{ boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}>
              <Recycle className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <span className="font-display text-lg font-bold text-white">
                EcoClean App
              </span>
              <span className="sc-pill sc-pill-verified ml-2" style={{ fontSize: '0.5rem' }}>
                Resident
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* User chip */}
            <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/[0.06] px-3 py-1.5 rounded-xl">
              <div className="w-5 h-5 rounded-lg bg-forest-700/40 flex items-center justify-center">
                <User className="w-3 h-3 text-forest-400" />
              </div>
              <span className="text-xs font-semibold text-charcoal-200">
                {profile?.name || 'Resident'}
              </span>
            </div>

            <button onClick={handleLogout} className="sc-btn-rose" style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}>
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Background blobs */}
      <div className="relative z-10">
        <BackgroundMesh role="resident" />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        <div className="grid grid-cols-12 gap-6">

          {/* 1. LARGE BENTO TILE: Active Requests Tracker / History List (col-span-12 lg:col-span-8) */}
          <div className="col-span-12 lg:col-span-8 sc-glass sc-shadow-stack p-6 rounded-3xl flex flex-col space-y-4">
            {/* Header & Tabs inside bento */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/[0.05]">
              <div>
                <h2 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-forest-500" />
                  Collection Requests Registry
                </h2>
                <p className="text-3xs text-charcoal-400 mt-0.5">Track status updates and history of garbage collection tickets</p>
              </div>
              
              {/* Tab segment */}
              <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl border border-white/[0.04] self-end sm:self-auto">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all ${activeTab === 'overview' ? 'bg-forest-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  History
                </button>
                <button
                  onClick={() => setActiveTab('campaigns')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all ${activeTab === 'campaigns' ? 'bg-forest-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  Campaigns
                </button>
                <button
                  onClick={() => setActiveTab('notifications')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all relative ${activeTab === 'notifications' ? 'bg-forest-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  Inbox
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  )}
                </button>
              </div>
            </div>

            {/* Tab content inside the main tile */}
            <div className="flex-1 overflow-y-auto max-h-[380px] pr-1 space-y-3">
              {activeTab === 'overview' && <RecentRequestsList />}
              {activeTab === 'campaigns' && (
                <div className="sc-anim-fade-up">
                  <LaunchCampaignTab
                    communityName={community?.name || null}
                    loadingCommunity={loadingCommunity}
                  />
                </div>
              )}
              {activeTab === 'notifications' && (
                <div className="sc-anim-fade-up">
                  <NotificationsTab
                    onUnreadCountChange={(count) => setUnreadNotificationsCount(count)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 2. MEDIUM TILE: Streak & Points Balance (LOUD CELEBRATION TILE) (col-span-12 md:col-span-6 lg:col-span-4) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 sc-glass-forest sc-shadow-stack p-6 rounded-3xl flex flex-col justify-between overflow-hidden relative group">
            {/* Animated neon flame halo */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
            
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-forest-400 font-black uppercase tracking-wider">Citizen Streak</span>
                  <h3 className="text-xl font-black text-white mt-0.5">Keep it burning!</h3>
                </div>
                <div className="relative">
                  <span className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
                  <span className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center text-xl relative border border-amber-500/30">
                    🔥
                  </span>
                </div>
              </div>

              {/* Streak Count Panel */}
              <div className="bg-black/20 border border-white/[0.04] p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="font-mono text-3xl font-black text-white">{streakCount}</span>
                  <span className="text-2xs text-charcoal-400 block font-bold mt-0.5">Consecutive Active Days</span>
                </div>
                <span className="text-3xs uppercase px-2 py-1 rounded bg-amber-500/10 text-amber-400 font-extrabold border border-amber-500/20 animate-pulse">
                  HOT STATE
                </span>
              </div>
            </div>

            {/* Points balance stats */}
            <div className="mt-5 pt-4 border-t border-white/[0.05] flex justify-between items-center">
              <div>
                <span className="text-charcoal-400 text-3xs font-extrabold uppercase tracking-widest block">Available Balance</span>
                <span className="text-lg font-black text-forest-400 flex items-center gap-1.5 mt-0.5">
                  <Award className="w-5 h-5 text-forest-400" />
                  {loadingSummary ? (
                    <span className="sc-skeleton h-5 w-16 block" />
                  ) : (
                    `${summary?.balancePoints ?? 0} pts`
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="text-charcoal-500 text-[9px] uppercase tracking-wider block font-bold">Lifetime Rewards</span>
                <span className="text-2xs font-extrabold text-charcoal-200 mt-1 block">
                  {loadingSummary ? '...' : `${summary?.lifetimePoints ?? 0} pts`}
                </span>
              </div>
            </div>
          </div>

          {/* 3. MEDIUM TILE: Education Tip & Quiz (col-span-12 md:col-span-6 lg:col-span-4) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col">
            <EducationCenter onPointsAwarded={handlePointsAwarded} />
          </div>

          {/* 4. MEDIUM TILE: Quick Actions / Report Buttons (col-span-12 md:col-span-6 lg:col-span-4) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 sc-glass sc-shadow-stack p-6 rounded-3xl flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] text-forest-400 font-black uppercase tracking-wider">Quick Actions</span>
              <h3 className="text-sm font-extrabold text-white mt-0.5">Report or request ticket</h3>
              <p className="text-3xs text-charcoal-400 mt-1">Directly trigger AI-verified garbage cleaning services or report illegal dumpings inside the ward limits.</p>
            </div>
            
            <div className="space-y-2.5">
              <button
                onClick={() => setShowDumpingForm(true)}
                id="report-dumping-btn"
                className="sc-btn-rose w-full py-3 flex items-center justify-center gap-2 text-xs font-black uppercase"
              >
                <AlertCircle className="w-4 h-4" />
                Report Illegal Dumping
              </button>
              <button
                onClick={() => setShowRequestForm(true)}
                id="request-collection-btn"
                className="sc-btn-primary w-full py-3 flex items-center justify-center gap-2 text-xs font-black uppercase"
              >
                <PlusCircle className="w-4 h-4" />
                Request Collection
              </button>
            </div>
          </div>

          {/* 5. SMALL TILE: Community Profile & Scorecard (col-span-12 md:col-span-6 lg:col-span-4) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 sc-glass sc-shadow-stack p-6 rounded-3xl space-y-4">
            <div>
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Community Standings</span>
              <h3 className="text-sm font-extrabold text-white mt-0.5">Locality scorecard</h3>
            </div>

            <div className="space-y-3 font-semibold text-xs">
              <div className="flex justify-between items-center">
                <span className="text-charcoal-400">Community Rank:</span>
                <span className="text-indigo-400 font-bold flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" />
                  {loadingScorecard ? '...' : scorecard ? `${scorecard.score}/100 · Grade ${getGrade(scorecard.score)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-400">My Sector:</span>
                <span className="text-charcoal-200">
                  {loadingCommunity ? '...' : (community?.name || 'Sector 4')}
                </span>
              </div>
            </div>

            {/* Scorecard index bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[10px] font-bold text-charcoal-400">
                <span>Cleanliness Target Index</span>
                <span>{loadingScorecard ? '...' : scorecard ? `${scorecard.score}%` : '0%'}</span>
              </div>
              <div className="sc-progress h-2">
                <div
                  className="sc-progress-fill"
                  style={{
                    width: `${loadingScorecard ? 0 : scorecard ? Math.min(scorecard.score, 100) : 0}%`,
                    background: 'linear-gradient(to right, #6366F1, #818CF8)'
                  }}
                />
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ── Modals ────────────────────────────────────────────────── */}
      {showRequestForm && (
        <RequestCollectionForm onClose={() => setShowRequestForm(false)} />
      )}
      {showDumpingForm && (
        <ReportDumpingForm onClose={() => setShowDumpingForm(false)} />
      )}
    </div>
  );
};
