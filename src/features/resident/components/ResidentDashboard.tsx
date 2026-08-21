'use client';

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
  Sparkles,
  TrendingUp,
  Leaf,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { RequestCollectionForm } from './RequestCollectionForm';
import { RecentRequestsList } from './RecentRequestsList';
import { ReportDumpingForm } from './ReportDumpingForm';
import { LaunchCampaignTab } from './LaunchCampaignTab';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { RewardTransactionDTO, RewardSummaryDTO, CommunityProfileDTO, CommunityScorecardDTO } from '@/types';

export const ResidentDashboard: React.FC = () => {
  const router = useRouter();
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showDumpingForm, setShowDumpingForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'rewards' | 'community' | 'campaigns'>('overview');
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [transactions, setTransactions] = useState<RewardTransactionDTO[]>([]);
  const [summary, setSummary] = useState<RewardSummaryDTO | null>(null);
  const [community, setCommunity] = useState<CommunityProfileDTO | null>(null);
  const [scorecard, setScorecard] = useState<CommunityScorecardDTO | null>(null);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingCommunity, setLoadingCommunity] = useState(true);
  const [loadingScorecard, setLoadingScorecard] = useState(true);

  const handleLogout = async () => {
    try {
      await supabaseBrowserClient.auth.signOut();
      router.push('/auth/login');
    } catch (e) {
      console.error('Logout failed:', e);
      router.push('/auth/login');
    }
  };

  const [claimingTip, setClaimingTip] = useState(false);
  const [tipClaimedStatus, setTipClaimedStatus] = useState<string | null>(null);

  const handleClaimTip = async () => {
    setClaimingTip(true);
    setTipClaimedStatus(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) {
        setTipClaimedStatus('You must be logged in.');
        return;
      }
      const res = await fetch('/api/rewards/educational', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setTipClaimedStatus('Points claimed successfully (+10 pts)!');
        if (summary) {
          setSummary({
            ...summary,
            balancePoints: summary.balancePoints + 10,
            lifetimePoints: summary.lifetimePoints + 10
          });
        }
      } else {
        setTipClaimedStatus(result.error?.message || 'Failed to claim points.');
      }
    } catch {
      setTipClaimedStatus('An unexpected error occurred.');
    } finally {
      setClaimingTip(false);
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
        const { data: { session: existingSession } } = await supabaseBrowserClient.auth.getSession();
        currentSession = existingSession;

        if (!currentSession && (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN_IN_PROD === 'true')) {
          console.log('Attempting developer auto-sign-in...');
          const res = await fetch('/api/dev-login', { method: 'POST' });
          if (res.ok) {
            const { accessToken, refreshToken } = await res.json();
            const { data: { session: newSession } } = await supabaseBrowserClient.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            currentSession = newSession;
            console.log('Developer auto-sign-in successful.');
          } else {
            console.error('Developer auto-sign-in endpoint returned error status:', res.status);
          }
        }
      } catch (e) {
        console.error('Auth check / dev login failed:', e);
      }

      if (currentSession) {
        setProfile({
          name: currentSession.user.user_metadata?.name || currentSession.user.email?.split('@')[0] || 'Resident',
          email: currentSession.user.email || ''
        });

        // Fetch transactions in background
        const fetchTxPromise = fetch('/api/rewards', {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`
          }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setTransactions(result.data || []);
          } else {
            console.error('Failed to fetch rewards:', res.status);
          }
        }).catch((err) => {
          console.error('Error fetching rewards:', err);
        }).finally(() => {
          setLoadingTransactions(false);
        });

        // Fetch summary in background
        const fetchSummaryPromise = fetch('/api/rewards/summary', {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`
          }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setSummary(result.data || null);
          } else {
            console.error('Failed to fetch rewards summary:', res.status);
          }
        }).catch((err) => {
          console.error('Error fetching rewards summary:', err);
        }).finally(() => {
          setLoadingSummary(false);
        });

        // Fetch community profile in background
        const fetchCommunityPromise = fetch('/api/communities/profile', {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`
          }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setCommunity(result.data || null);
          } else {
            console.error('Failed to fetch community profile:', res.status);
          }
        }).catch((err) => {
          console.error('Error fetching community profile:', err);
        }).finally(() => {
          setLoadingCommunity(false);
        });

        // Fetch community scorecard in background
        const fetchScorecardPromise = fetch('/api/communities/scorecard', {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`
          }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setScorecard(result.data || null);
          } else {
            console.error('Failed to fetch community scorecard:', res.status);
          }
        }).catch((err) => {
          console.error('Error fetching community scorecard:', err);
        }).finally(() => {
          setLoadingScorecard(false);
        });

        await Promise.all([
          fetchTxPromise,
          fetchSummaryPromise,
          fetchCommunityPromise,
          fetchScorecardPromise
        ]);
      } else {
        setLoadingTransactions(false);
        setLoadingSummary(false);
        setLoadingCommunity(false);
        setLoadingScorecard(false);
      }
    };

    initAuthAndFetch();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-500/20">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/20 ring-1 ring-emerald-500/10">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-slate-850 dark:from-white dark:to-slate-200 bg-clip-text text-transparent">
                EcoClean
              </span>
              <span className="ml-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded bg-emerald-500/5 uppercase tracking-wider">
                Resident
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 shadow-xs">
              <User className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold">{profile?.name || 'Resident'}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-350 border border-rose-500/20 px-3 py-1.5 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 transition-all active:scale-[0.98]"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Top welcome grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Welcome / Profile Card */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            
            <div className="flex items-start justify-between flex-wrap gap-4 relative z-10">
              <div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Welcome back</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 bg-gradient-to-r from-slate-900 to-slate-800 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                  {profile?.name || 'Resident'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  Community Resident at <strong className="font-semibold text-slate-700 dark:text-slate-300">{loadingCommunity ? '...' : (community?.name || 'My Community')}</strong>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDumpingForm(true)}
                  className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-semibold text-sm rounded-2xl flex items-center gap-2 border border-rose-500/20 transition-all active:scale-[0.99]"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Report Dumping
                </button>
                <button
                  onClick={() => setShowRequestForm(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm rounded-2xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:scale-[1.01] flex items-center gap-2 transition-all active:scale-[0.99]"
                >
                  <PlusCircle className="w-4 h-4" />
                  Request Collection
                </button>
              </div>
            </div>

            {/* Quick stats ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/80">
              <div>
                <span className="text-xs text-slate-400 dark:text-slate-500 block">Community</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                  {loadingCommunity ? '...' : (community?.name || 'Sector 4')}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 dark:text-slate-500 block">Reward Balance</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                  <Award className="w-4 h-4" />
                  {loadingSummary ? '...' : (summary?.balancePoints ?? 0)} pts
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-xs text-slate-400 dark:text-slate-500 block">Community Score</span>
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mt-0.5">
                  <Trophy className="w-3.5 h-3.5" />
                  {loadingScorecard ? '...' : scorecard ? `${scorecard.score}/100 Grade ${getGrade(scorecard.score)}` : 'No Score'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Info / Tips Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-lg border border-slate-800">
            <div className="absolute top-0 right-0 h-32 w-32 bg-emerald-500/20 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
            <div className="flex items-center gap-2 text-emerald-400 mb-4">
              <Sparkles className="w-5 h-5 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider">Green Tip of the Day</span>
            </div>
            <h3 className="text-base font-bold mb-2">Wash Recyclables Before Discarding</h3>
            <p className="text-slate-300 text-xs leading-relaxed mb-4">
              Clean containers prevent contamination in the recycling bin, increasing the reuse value and earning you perfect segregation reward points!
            </p>
            
            <button
              onClick={handleClaimTip}
              disabled={claimingTip}
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {claimingTip ? 'Claiming...' : 'Claim Daily Engagement Points (+10 pts)'}
            </button>
            {tipClaimedStatus && (
              <p className="text-2xs mt-2 text-center text-emerald-400 font-semibold">{tipClaimedStatus}</p>
            )}

            <div className="mt-4 flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3">
              <Leaf className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-2xs">
                <span className="text-slate-400 block">Did you know?</span>
                <span className="text-slate-200 font-semibold">Proper sorting can boost our community grade to A+!</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-4 text-sm font-bold border-b-2 transition-all relative ${
              activeTab === 'overview' 
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            My Collections
          </button>
          <button
            onClick={() => setActiveTab('rewards')}
            className={`pb-4 text-sm font-bold border-b-2 transition-all relative ${
              activeTab === 'rewards' 
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            Rewards & History
          </button>
          <button
            onClick={() => setActiveTab('community')}
            className={`pb-4 text-sm font-bold border-b-2 transition-all relative ${
              activeTab === 'community' 
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            Community Scorecard
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`pb-4 text-sm font-bold border-b-2 transition-all relative ${
              activeTab === 'campaigns'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            Launch Campaign
          </button>
        </div>

        {/* Tab Contents */}
        <div className="grid grid-cols-1 gap-8">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Recent Requests Section */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-400" />
                    Collection History
                  </h2>
                </div>
                <RecentRequestsList />
              </div>

              {/* Sidebar Community details */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">My Community Profile</h3>
                  <div className="space-y-4">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-2.5">
                        <MapPin className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{loadingCommunity ? '...' : (community?.name || 'My Community')}</h4>
                          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{loadingCommunity ? '...' : (community?.address || '')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                      <span>Total Active Members</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{loadingCommunity ? '...' : (community?.membersCount || 0)} residents</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rewards' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Rewards Balance Card */}
              <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-3xl p-6 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                      <Gift className="w-6 h-6" />
                    </div>
                    <span className="text-2xs font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Active Balance</span>
                  </div>
                  <span className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                    {loadingSummary ? '...' : (summary?.balancePoints ?? 0)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mt-1">Available reward points</span>
                </div>
                <div className="mt-8 pt-4 border-t border-emerald-500/10 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Lifetime Points Earned:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {loadingSummary ? '...' : (summary?.lifetimePoints ?? 0)}
                  </span>
                </div>
              </div>

              {/* Leaderboard status */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <span className="text-2xs font-bold text-indigo-700 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">Community Rank</span>
                  </div>
                  <span className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                    {loadingSummary ? '...' : (summary?.rank ? `#${summary.rank}` : 'N/A')}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mt-1">Out of {loadingCommunity ? '...' : (community?.membersCount || 0)} residents</span>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Up 3 ranks since last week</span>
                </div>
              </div>

              {/* Reward transaction history list */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Recent Transactions</h3>
                <div className="space-y-3.5">
                  {loadingTransactions ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-500 gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                      <span className="text-2xs">Loading transactions...</span>
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="text-center py-6 text-slate-450 dark:text-slate-500">
                      <p className="text-xs font-semibold">No transactions found</p>
                      <p className="text-2xs mt-0.5">Your points history will appear here.</p>
                    </div>
                  ) : (
                    transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-800/80 last:border-b-0">
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">{tx.reason}</span>
                          <span className="text-slate-400 block mt-0.5">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                          </span>
                        </div>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                          +{tx.points}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'community' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Big Score Card */}
              <div className="lg:col-span-2 bg-gradient-to-tr from-slate-900 to-slate-800 text-white rounded-3xl p-6 border border-slate-800 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Current Period Score</span>
                    <h3 className="text-2xl font-extrabold mt-1">{loadingCommunity ? '...' : (community?.name || 'My Community')}</h3>
                  </div>
                  <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <span className="text-2xl font-black text-emerald-400">
                      {loadingScorecard ? '...' : scorecard ? getGrade(scorecard.score) : '—'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 py-6 border-t border-slate-800">
                  <div>
                    <span className="text-xs text-slate-500 block">Active Score</span>
                    <span className="text-3xl font-extrabold text-emerald-400 mt-1">
                      {loadingScorecard ? '...' : scorecard ? `${scorecard.score}/100` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Weekly Target</span>
                    <span className="text-3xl font-extrabold text-slate-300 mt-1">90</span>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <span className="text-xs text-slate-500 block">Period</span>
                    <span className="text-3xl font-extrabold text-indigo-400 mt-1">
                      {loadingScorecard ? '...' : scorecard ? scorecard.period : '—'}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Target progress</span>
                    <span className="text-emerald-400 font-bold">
                      {loadingScorecard ? '...' : scorecard ? `${scorecard.score}% of target` : '0% of target'}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" 
                      style={{ width: `${loadingScorecard ? 0 : scorecard ? scorecard.score : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Score breakdown metrics */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5">Score Breakdown</h3>
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Waste Segregation Ratio</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {loadingScorecard ? '...' : scorecard ? `${scorecard.breakdown.segregation}%` : '—'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${loadingScorecard ? 0 : scorecard ? scorecard.breakdown.segregation : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Resident Participation</span>
                      <span className="text-amber-600 dark:text-amber-400">
                        {loadingScorecard ? '...' : scorecard ? `${scorecard.breakdown.participation}%` : '—'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${loadingScorecard ? 0 : scorecard ? scorecard.breakdown.participation : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Cleanliness Index</span>
                      <span className="text-indigo-600 dark:text-indigo-400">
                        {loadingScorecard ? '...' : scorecard ? `${scorecard.breakdown.cleanliness}%` : '—'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${loadingScorecard ? 0 : scorecard ? scorecard.breakdown.cleanliness : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'campaigns' && (
            <LaunchCampaignTab
              communityName={community?.name || null}
              loadingCommunity={loadingCommunity}
            />
          )}
        </div>
      </main>

      {/* Slide-over Request Modal Form */}
      {showRequestForm && (
        <RequestCollectionForm onClose={() => setShowRequestForm(false)} />
      )}
      {showDumpingForm && (
        <ReportDumpingForm onClose={() => setShowDumpingForm(false)} />
      )}
    </div>
  );
};
