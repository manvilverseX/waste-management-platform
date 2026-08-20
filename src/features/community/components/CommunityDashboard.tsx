'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Award, 
  Activity, 
  CheckCircle2, 
  Calendar, 
  MapPin, 
  TrendingUp, 
  Leaf, 
  Clock, 
  Loader2, 
  LogOut, 
  ShieldAlert, 
  Sparkles, 
  PieChart, 
  ArrowRight,
  ClipboardList,
  Trophy
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { 
  CollectionRequestDTO, 
  RewardSummaryDTO, 
  CommunityProfileDTO, 
  CommunityScorecardDTO 
} from '@/types';

export const CommunityDashboard: React.FC = () => {
  const router = useRouter();

  // Profile and Role States
  const [profile, setProfile] = useState<{ name: string; email: string; role: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Community-specific States
  const [community, setCommunity] = useState<CommunityProfileDTO | null>(null);
  const [scorecard, setScorecard] = useState<CommunityScorecardDTO | null>(null);
  const [requests, setRequests] = useState<CollectionRequestDTO[]>([]);
  const [rewardsSummary, setRewardsSummary] = useState<RewardSummaryDTO | null>(null);

  // Loading flags
  const [loadingCommunity, setLoadingCommunity] = useState(true);
  const [loadingScorecard, setLoadingScorecard] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingRewards, setLoadingRewards] = useState(true);

  // Error States
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await supabaseBrowserClient.auth.signOut();
      router.push('/auth/login');
    } catch (e) {
      console.error('Logout failed:', e);
      router.push('/auth/login');
    }
  };

  const getGrade = (score: number) => {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'ASSIGNED':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'COLLECTED':
        return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      case 'VERIFIED':
        return 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20';
      case 'REJECTED':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'CANCELLED':
        return 'bg-slate-800 text-slate-400 border border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Pending';
      case 'ASSIGNED': return 'Collector Assigned';
      case 'COLLECTED': return 'Under Verification';
      case 'VERIFIED': return 'Verified';
      case 'REJECTED': return 'Rejected';
      case 'CANCELLED': return 'Cancelled';
      default: return status;
    }
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
          }
        }
      } catch (e) {
        console.error('Auth verification failed:', e);
      }

      if (!currentSession) {
        router.push('/auth/login');
        return;
      }

      // Fetch User details
      try {
        const { data: userData, error: userFetchErr } = await supabaseBrowserClient
          .from('users')
          .select('name, email, role')
          .eq('id', currentSession.user.id)
          .single();

        if (userFetchErr || !userData) {
          throw new Error('User profile not found.');
        }

        setProfile({
          name: userData.name,
          email: userData.email,
          role: userData.role
        });
        setLoadingProfile(false);

        // Fetch Community profile
        fetch('/api/communities/profile', {
          headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setCommunity(result.data);
          }
        }).catch(err => console.error('Error fetching community profile:', err))
          .finally(() => setLoadingCommunity(false));

        // Fetch Community scorecard
        fetch('/api/communities/scorecard', {
          headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setScorecard(result.data);
          }
        }).catch(err => console.error('Error fetching community scorecard:', err))
          .finally(() => setLoadingScorecard(false));

        // Fetch Collection requests
        fetch('/api/collection-requests', {
          headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setRequests(result.data || []);
          }
        }).catch(err => console.error('Error fetching collection requests:', err))
          .finally(() => setLoadingRequests(false));

        // Fetch Reward points summary
        fetch('/api/rewards/summary', {
          headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json();
            setRewardsSummary(result.data);
          }
        }).catch(err => console.error('Error fetching rewards summary:', err))
          .finally(() => setLoadingRewards(false));

      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to initialize community data.');
        setLoadingProfile(false);
        setLoadingCommunity(false);
        setLoadingScorecard(false);
        setLoadingRequests(false);
        setLoadingRewards(false);
      }
    };

    initAuthAndFetch();
  }, [router]);

  if (loadingProfile || loadingCommunity) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Loading Community Hub...</span>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-3xl max-w-md">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h3 className="text-base font-extrabold text-white mb-1">Access Error</h3>
          <p className="text-slate-400 text-xs leading-relaxed mb-4">{errorMsg}</p>
          <button
            onClick={handleLogout}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  // Derived counts for dashboard
  const verifiedCount = requests.filter(r => r.status === 'VERIFIED').length;
  const activeActivityCount = requests.filter(r => ['PENDING', 'ASSIGNED', 'COLLECTED'].includes(r.status)).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-12">
      {/* Header bar */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              EcoClean <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-450 text-3xs font-extrabold uppercase border border-emerald-500/20">Community</span>
            </h1>
            <p className="text-slate-400 text-3xs font-bold flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-500" />
              {community?.name || 'Maplewood District'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2.5 text-right">
            <span className="text-2xs font-extrabold text-slate-200 block">{profile?.name}</span>
            <span className="text-3xs text-slate-500 block font-bold capitalize">{profile?.role} member</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 bg-slate-850 hover:bg-rose-950/20 hover:text-rose-400 rounded-xl transition-all border border-slate-800 hover:border-rose-900/30 text-slate-400 cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-6 mt-8">
        
        {/* Welcome Section */}
        <section className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="text-3xs text-emerald-400 font-extrabold uppercase tracking-widest block mb-1">EcoClean Hub Community Portal</span>
              <h2 className="text-xl md:text-2xl font-black text-white leading-tight">{community?.name} Dashboard</h2>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed max-w-xl">
                Welcome to the shared dashboard for <span className="font-semibold text-white">{community?.name}</span>. 
                Track your neighborhood's active scorecard, recycling progress, and overall cleanup activities.
              </p>
            </div>
            {community?.address && (
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl md:self-center self-start shrink-0 flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="text-3xs">
                  <span className="text-slate-500 block uppercase tracking-wider font-extrabold">Boundaries & Area</span>
                  <span className="text-slate-300 font-bold block mt-0.5">{community.address}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Statistics Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-3xs text-slate-500 uppercase tracking-widest font-black block">Total Members</span>
              <span className="text-2xl font-black text-white mt-1 block">
                {community?.membersCount ?? 0}
              </span>
            </div>
            <Users className="w-8 h-8 text-emerald-500/20 shrink-0" />
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-3xs text-slate-500 uppercase tracking-widest font-black block">
                {profile?.role === 'resident' ? 'My Verified Contributions' : 'Community Verified Pickups'}
              </span>
              <span className="text-2xl font-black text-emerald-450 mt-1 block">
                {loadingRequests ? '...' : verifiedCount}
              </span>
            </div>
            <CheckCircle2 className="w-8 h-8 text-emerald-500/20 shrink-0" />
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-3xs text-slate-500 uppercase tracking-widest font-black block">
                {profile?.role === 'resident' ? 'My Reward Points' : 'Active Balance'}
              </span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">
                {loadingRewards ? '...' : (rewardsSummary?.balancePoints ?? 0)}
              </span>
            </div>
            <Award className="w-8 h-8 text-amber-500/20 shrink-0" />
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-3xs text-slate-500 uppercase tracking-widest font-black block">Active Activity</span>
              <span className="text-2xl font-black text-teal-400 mt-1 block">
                {loadingRequests ? '...' : activeActivityCount}
              </span>
            </div>
            <Activity className="w-8 h-8 text-teal-500/20 shrink-0" />
          </div>
        </section>

        {/* Community Scorecard & Details */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          
          {/* Main Scorecard Panel */}
          <div className="lg:col-span-2 bg-gradient-to-tr from-slate-900 to-slate-800/90 text-white rounded-3xl p-6 border border-slate-800 relative overflow-hidden shadow-md">
            <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-2xs font-extrabold text-slate-400 uppercase tracking-wider">Weekly Scorecard</span>
                <h3 className="text-lg font-black mt-0.5">Community Grade Overview</h3>
              </div>
              {scorecard && (
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-2xl font-black text-emerald-450">
                    {getGrade(scorecard.score)}
                  </span>
                </div>
              )}
            </div>

            {loadingScorecard ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="text-2xs text-slate-400 font-bold">Loading scorecard...</span>
              </div>
            ) : !scorecard ? (
              <div className="py-12 text-center border border-dashed border-slate-850 rounded-2xl">
                <PieChart className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-400">No scorecard data available yet</p>
                <p className="text-3xs text-slate-500 mt-0.5">Calculated scores will appear here weekly.</p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 py-6 border-t border-slate-800">
                  <div>
                    <span className="text-3xs text-slate-400 block uppercase font-extrabold tracking-wider">Active Score</span>
                    <span className="text-3xl font-extrabold text-emerald-450 mt-1 block">
                      {scorecard.score}/100
                    </span>
                  </div>
                  <div>
                    <span className="text-3xs text-slate-400 block uppercase font-extrabold tracking-wider">Period</span>
                    <span className="text-base font-extrabold text-slate-200 mt-2 block capitalize">
                      {scorecard.period}
                    </span>
                  </div>
                  <div>
                    <span className="text-3xs text-slate-400 block uppercase font-extrabold tracking-wider">Last Computed</span>
                    <span className="text-base font-extrabold text-slate-200 mt-2 block">
                      {new Date(scorecard.calculatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Participation Rate</span>
                      <span className="text-white font-extrabold">{scorecard.breakdown.participation}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${scorecard.breakdown.participation}%` }}></div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Segregation Rate</span>
                      <span className="text-white font-extrabold">{scorecard.breakdown.segregation}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${scorecard.breakdown.segregation}%` }}></div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Cleanliness Level</span>
                      <span className="text-white font-extrabold">{scorecard.breakdown.cleanliness}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${scorecard.breakdown.cleanliness}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Info & Standing */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                  <Trophy className="w-6 h-6" />
                </div>
                <span className="text-2xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">Eco Ranking</span>
              </div>
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {rewardsSummary?.rank ? `#${rewardsSummary.rank}` : 'Unranked'}
              </span>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                {rewardsSummary?.rank 
                  ? `You are ranked #${rewardsSummary.rank} among community contributors based on overall reward point accumulation.` 
                  : 'Join waste collection pick-ups or clean illegal dumps to earn points and claim your community ranking!'}
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-850 text-3xs text-slate-500 flex items-center gap-1 font-bold">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>Target: Reach Top 3 this month</span>
            </div>
          </div>
        </section>

        {/* Recent Activity Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
            <ClipboardList className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
              {profile?.role === 'resident' ? 'My Recent Pickup History' : 'Community Recent Requests'}
            </h3>
          </div>

          {loadingRequests ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-2xs text-slate-400 font-bold">Loading activity...</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <ClipboardList className="w-8 h-8 mx-auto text-slate-800 mb-2" />
              <p className="text-xs font-semibold">No recent activity found</p>
              <p className="text-3xs text-slate-600 mt-0.5">Your waste collection history will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {requests.slice(0, 5).map((req) => (
                <div key={req.id} className="p-4 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <span className="font-extrabold text-slate-200 block">
                      {profile?.role === 'resident' ? 'Waste Pickup Request' : `Pickup by ${req.residentName || 'Resident'}`}
                    </span>
                    <span className="text-slate-500 block text-3xs font-semibold">
                      Requested on: {new Date(req.requestedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </span>
                  </div>
                  <span className={`px-2.5 py-1 text-3xs font-bold rounded-lg ${getStatusStyle(req.status)}`}>
                    {getStatusLabel(req.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
