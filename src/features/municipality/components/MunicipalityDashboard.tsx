'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import {
  Check, X, RefreshCw, LogOut, Shield, Loader2,
  AlertCircle, Eye, Inbox, FileText, CheckCircle2, MessageSquare, AlertTriangle,
  Flame, Users, BarChart2, Map
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { BackgroundMesh } from '@/features/shared/components/BackgroundMesh';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

// Dynamically import map component to ensure server side building passes correctly without window issues
const HotspotMap = dynamic(
  () => import('./HotspotMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[300px] bg-white/[0.01] border border-white/[0.04] rounded-3xl flex flex-col items-center justify-center gap-3 text-charcoal-400">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-3xs uppercase font-extrabold tracking-widest">Initializing Map Canvas...</span>
      </div>
    )
  }
);

// ── Types ─────────────────────────────────────────────────────────────────
interface EvidenceRecord {
  id: string;
  evidence_type: 'RESIDENT_BEFORE' | 'COLLECTOR_AFTER';
  image_url: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  latitude?: number | null;
  longitude?: number | null;
  verification_results?: {
    id: string;
    decision: 'verified' | 'rejected' | 'needs_review';
    confidence_score: number;
    analysis: string;
    verified_at: string;
    gps_distance?: number | null;
    gps_decision?: 'MATCH' | 'NEAR' | 'MISMATCH' | 'UNAVAILABLE' | null;
  }[];
}

interface CollectionRequestItem {
  id: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  resident: { id: string; name: string } | null;
  collector: { id: string; name: string } | null;
  beforeEvidence?: EvidenceRecord;
  afterEvidence?: EvidenceRecord;
}

interface HotspotItem {
  id: string;
  uniqueReporters: number;
  totalReports: number;
  latitude: number;
  longitude: number;
  latestReportAt: string;
  representativeImage: string;
  latestDescription: string;
  communityId: string;
  communityName: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  priorityPercentage: number;
  reviewStatus: 'open' | 'confirmed' | 'rejected';
}

type TabId = 'verification' | 'hotspots' | 'campaigns' | 'analytics';

export const MunicipalityDashboard: React.FC = () => {
  const router = useRouter();

  // ── User States ─────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // ── Tab State ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('verification');

  // ── Data States ─────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<CollectionRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loadingHotspots, setLoadingHotspots] = useState(false);
  const [hotspotsError, setHotspotsError] = useState<string | null>(null);
  const [hotspotViewMode, setHotspotViewMode] = useState<'list' | 'map'>('map');

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const [requestsStats, setRequestsStats] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // ── Modals & Actions States ─────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeActionReqId, setActiveActionReqId] = useState<string | null>(null);
  const [actionDecision, setActionDecision] = useState<'verified' | 'rejected' | null>(null);
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingHotspotId, setConfirmingHotspotId] = useState<string | null>(null);
  const [rejectingHotspotId, setRejectingHotspotId] = useState<string | null>(null);

  // ── Fetch Operations ────────────────────────────────────────────────────
  const fetchCollectedRequests = async () => {
    setLoadingRequests(true);
    setRequestsError(null);
    try {
      const { data: reqs, error: reqError } = await supabaseBrowserClient
        .from('collection_requests')
        .select(`
          id,
          status,
          requested_at,
          completed_at,
          resident:users!collection_requests_resident_id_fkey (id, name),
          collector:users!collection_requests_collector_id_fkey (id, name)
        `)
        .eq('status', 'COLLECTED')
        .order('completed_at', { ascending: false });

      if (reqError) throw reqError;

      const formatted = await Promise.all((reqs || []).map(async (r: any) => {
        const { data: evidence } = await supabaseBrowserClient
          .from('evidence')
          .select(`
            id,
            evidence_type,
            image_url,
            verification_status,
            latitude,
            longitude,
            verification_results (
              id,
              decision,
              confidence_score,
              analysis,
              verified_at,
              gps_distance,
              gps_decision
            )
          `)
          .eq('collection_request_id', r.id);

        const before = evidence?.find(e => e.evidence_type === 'RESIDENT_BEFORE');
        const after = evidence?.find(e => e.evidence_type === 'COLLECTOR_AFTER');

        return {
          id: r.id,
          status: r.status,
          requested_at: r.requested_at,
          completed_at: r.completed_at,
          resident: r.resident ? { id: r.resident.id, name: r.resident.name } : null,
          collector: r.collector ? { id: r.collector.id, name: r.collector.name } : null,
          beforeEvidence: before ? {
            id: before.id,
            evidence_type: before.evidence_type as any,
            image_url: before.image_url,
            verification_status: before.verification_status as any,
            latitude: before.latitude,
            longitude: before.longitude,
            verification_results: before.verification_results as any
          } : undefined,
          afterEvidence: after ? {
            id: after.id,
            evidence_type: after.evidence_type as any,
            image_url: after.image_url,
            verification_status: after.verification_status as any,
            latitude: after.latitude,
            longitude: after.longitude,
            verification_results: after.verification_results as any
          } : undefined
        };
      }));

      setRequests(formatted);
    } catch (err: any) {
      setRequestsError(err.message || 'Failed to fetch pending requests.');
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchHotspots = async () => {
    setLoadingHotspots(true);
    setHotspotsError(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/dumping-reports/hotspots', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'Failed to fetch hotspots.');
      setHotspots(result.data || []);
    } catch (err: any) {
      setHotspotsError(err.message || 'An error occurred loading hotspots.');
    } finally {
      setLoadingHotspots(false);
    }
  };

  const fetchCampaigns = async () => {
    setLoadingCampaigns(true);
    setCampaignsError(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/municipality/campaigns', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setCampaigns(result.data || []);
      } else {
        setCampaignsError(result.error?.message || 'Failed to load campaigns.');
      }
    } catch (err: any) {
      setCampaignsError(err.message || 'An error occurred loading campaigns.');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const { data: stats, error: statsErr } = await supabaseBrowserClient
        .from('collection_requests')
        .select('status, requested_at');

      if (statsErr) throw statsErr;
      setRequestsStats(stats || []);
    } catch (err: any) {
      setStatsError(err.message || 'Failed to load statistics.');
    } finally {
      setLoadingStats(false);
    }
  };

  const getOutcomeBreakdownData = () => {
    const counts = {
      VERIFIED: 0,
      REJECTED: 0,
      COLLECTED: 0,
      ASSIGNED: 0,
      PENDING: 0
    };
    requestsStats.forEach(r => {
      if (counts[r.status as keyof typeof counts] !== undefined) {
        counts[r.status as keyof typeof counts]++;
      }
    });
    return [
      { name: 'Verified', value: counts.VERIFIED, color: '#4ADE80' },
      { name: 'Rejected', value: counts.REJECTED, color: '#FB7185' },
      { name: 'Under Scan', value: counts.COLLECTED, color: '#38BDF8' },
      { name: 'Assigned', value: counts.ASSIGNED, color: '#818CF8' },
      { name: 'Pending', value: counts.PENDING, color: '#FCD34D' }
    ].filter(d => d.value > 0);
  };

  const getRequestsOverTimeData = () => {
    const days = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - idx);
      return d.toISOString().split('T')[0];
    }).reverse();

    const counts: Record<string, number> = {};
    days.forEach(day => { counts[day] = 0; });

    requestsStats.forEach(r => {
      if (!r.requested_at) return;
      const day = r.requested_at.split('T')[0];
      if (counts[day] !== undefined) {
        counts[day]++;
      }
    });

    return days.map(day => ({
      date: new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      Requests: counts[day]
    }));
  };

  useEffect(() => {
    if (profile) {
      fetchCollectedRequests();
      fetchHotspots();
      fetchCampaigns();
      fetchStats();
    }
  }, [profile]);

  const handleSignOut = async () => {
    await supabaseBrowserClient.auth.signOut();
    router.push('/auth/login');
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeActionReqId || !actionDecision) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Authentication session expired.');

      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          collectionRequestId: activeActionReqId,
          manualDecision: actionDecision,
          notes: notes.trim() || undefined
        })
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'Verification submission failed.');

      setActiveActionReqId(null);
      setActionDecision(null);
      setNotes('');
      await fetchCollectedRequests();
    } catch (err: any) {
      setActionError(err.message || 'Verification update error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDumping = async (hotspotId: string) => {
    if (confirmingHotspotId) return;
    setConfirmingHotspotId(hotspotId);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Authentication session expired.');

      const res = await fetch('/api/dumping-reports/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ hotspotId })
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'Failed to confirm hotspot.');
      await fetchHotspots();
    } catch (err: any) {
      alert(err.message || 'An error occurred during confirmation.');
    } finally {
      setConfirmingHotspotId(null);
    }
  };

  const handleRejectDumping = async (hotspotId: string) => {
    if (rejectingHotspotId) return;
    setRejectingHotspotId(hotspotId);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Authentication session expired.');

      const res = await fetch('/api/dumping-reports/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ hotspotId })
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'Failed to reject hotspot.');
      await fetchHotspots();
    } catch (err: any) {
      alert(err.message || 'An error occurred during rejection.');
    } finally {
      setRejectingHotspotId(null);
    }
  };

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      setLoadingProfile(true);
      try {
        const { data: { session } } = await supabaseBrowserClient.auth.getSession();
        if (!session) {
          router.push('/auth/login');
          return;
        }

        const { data: userData, error: userError } = await supabaseBrowserClient
          .from('users')
          .select('name, email, role')
          .eq('id', session.user.id)
          .single();

        if (userError || !userData) throw new Error('Could not retrieve profile information.');

        if (userData.role !== 'municipality') {
          console.warn('Redirecting unauthorized user role:', userData.role);
          if (userData.role === 'collector') {
            router.push('/collector');
          } else {
            router.push('/resident');
          }
          return;
        }

        if (active) setProfile({ name: userData.name, email: userData.email });
      } catch (err) {
        console.error('[MunicipalityAuthError]:', err);
        router.push('/auth/login');
      } finally {
        if (active) setLoadingProfile(false);
      }
    };

    checkAuth();
    return () => { active = false; };
  }, [router]);

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#14171A] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-xs text-charcoal-400 font-bold uppercase tracking-wider">Loading Administration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#14171A] text-[#F0F2F5] pb-16 relative overflow-hidden" style={{ fontFamily: 'var(--font-geist-sans)' }}>
      {/* Aurora mesh background layer */}
      <BackgroundMesh role="municipality" />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#14171A]/90 backdrop-blur-md border-b border-white/[0.07] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg"
              style={{ boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              <Shield className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <span className="font-display text-lg font-bold text-white">
                EcoClean Hub
              </span>
              <span className="sc-pill sc-pill-assigned ml-2" style={{ fontSize: '0.5rem' }}>
                Municipality
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-charcoal-100">{profile?.name}</span>
              <span className="text-3xs text-charcoal-500 font-mono">{profile?.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="sc-btn-rose"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container structured as Bento Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 relative z-10">
        <div className="grid grid-cols-12 gap-6">

          {/* 1. LARGE BENTO TILE: Verification Review Queue (FROSTED GLASS CONTAINER) (col-span-12 lg:col-span-8) */}
          <div className="col-span-12 lg:col-span-8 sc-glass sc-shadow-stack p-6 rounded-3xl flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/[0.05]">
              <div>
                <h2 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-400" />
                  Manual Verification queue
                </h2>
                <p className="text-3xs text-charcoal-400 mt-0.5">Strict, high-density listing of collected requests awaiting confirmation</p>
              </div>

              {/* Tab control inside Bento grid */}
              <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl border border-white/[0.04]">
                <button
                  onClick={() => setActiveTab('verification')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all ${activeTab === 'verification' ? 'bg-indigo-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  Verification Queue ({requests.length})
                </button>
                <button
                  onClick={() => setActiveTab('campaigns')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all ${activeTab === 'campaigns' ? 'bg-indigo-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  Campaigns Registry
                </button>
              </div>
            </div>

            {/* List block */}
            <div className="flex-1 overflow-y-auto max-h-[500px] pr-1 space-y-3.5">
              {activeTab === 'verification' && (
                <>
                  {requestsError && (
                    <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-rose-300">
                      <AlertCircle className="w-5 h-5 shrink-0 inline mr-2" />
                      <span>{requestsError}</span>
                    </div>
                  )}

                  {loadingRequests ? (
                    <div className="py-20 flex flex-col items-center justify-center text-charcoal-550">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                      <span className="text-3xs uppercase tracking-widest font-black">Retrieving queue...</span>
                    </div>
                  ) : requests.length === 0 ? (
                    <div className="sc-empty py-20 text-center text-charcoal-500 bg-white/[0.01] border border-white/[0.04] rounded-3xl">
                      <Inbox className="w-10 h-10 mx-auto text-charcoal-600 mb-3" />
                      <p className="text-xs font-semibold text-white">All clean!</p>
                      <p className="text-2xs mt-1">There are no collection tickets awaiting manual review.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {requests.map((req) => {
                        const beforeEv = req.beforeEvidence;
                        const afterEv = req.afterEvidence;
                        const geminiRes = afterEv?.verification_results ? (
                          Array.isArray(afterEv.verification_results)
                            ? afterEv.verification_results[0]
                            : afterEv.verification_results
                        ) : null;

                        const score = geminiRes?.confidence_score ?? 0;
                        const gpsDist = geminiRes?.gps_distance;
                        const gpsDec = geminiRes?.gps_decision;

                        return (
                          <div
                            key={req.id}
                            className="bg-black/20 p-5 rounded-2xl border border-white/[0.04] space-y-4"
                          >
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                              <div>
                                <span className="font-mono text-3xs text-charcoal-500 block">TICKET ID: {req.id}</span>
                                <span className="text-xs font-bold text-white block mt-0.5">
                                  Resident: {req.resident?.name || 'Unknown'} · Collector: {req.collector?.name || 'Unassigned'}
                                </span>
                              </div>
                              <span className="text-3xs text-charcoal-400 font-mono">
                                Submitted: {new Date(req.completed_at || req.requested_at).toLocaleString()}
                              </span>
                            </div>

                            {/* Before/After comparisons */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <span className="text-3xs text-charcoal-500 uppercase tracking-wider block font-bold mb-1.5">Before (Resident Evidence)</span>
                                {beforeEv?.image_url ? (
                                  <div
                                    className="relative aspect-video rounded-xl overflow-hidden cursor-pointer bg-black border border-white/[0.04]"
                                    onClick={() => setSelectedImage(beforeEv.image_url)}
                                  >
                                    <Image
                                      src={beforeEv.image_url}
                                      alt="Resident Before photo"
                                      fill
                                      sizes="200px"
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                ) : (
                                  <div className="aspect-video bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-center justify-center text-charcoal-600 text-3xs">
                                    No Image Provided
                                  </div>
                                )}
                              </div>

                              <div>
                                <span className="text-3xs text-charcoal-500 uppercase tracking-wider block font-bold mb-1.5">After (Collector Evidence)</span>
                                {afterEv?.image_url ? (
                                  <div
                                    className="relative aspect-video rounded-xl overflow-hidden cursor-pointer bg-black border border-white/[0.04]"
                                    onClick={() => setSelectedImage(afterEv.image_url)}
                                  >
                                    <Image
                                      src={afterEv.image_url}
                                      alt="Collector After photo"
                                      fill
                                      sizes="200px"
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                ) : (
                                  <div className="aspect-video bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-center justify-center text-charcoal-600 text-3xs">
                                    No Image Provided
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Verification outcome stats */}
                            <div className="bg-black/35 p-3 rounded-xl border border-white/[0.03] space-y-2">
                              {geminiRes && (
                                <div className="flex justify-between items-center text-3xs">
                                  <span className="font-extrabold text-charcoal-450 uppercase tracking-wider">Gemini Scan Confidence</span>
                                  <span className={`sc-pill font-black text-[9px] ${
                                    score >= 80 ? 'bg-forest-500/10 text-forest-400 border border-forest-500/20' : score >= 60 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}>
                                    {score}% Confidence
                                  </span>
                                </div>
                              )}
                              {gpsDec && (
                                <div className="flex justify-between items-center text-3xs pt-1 border-t border-white/[0.03]">
                                  <span className="font-extrabold text-charcoal-450 uppercase tracking-wider">GPS Delta Proximity</span>
                                  <span className="font-bold text-white">
                                    {gpsDec} ({gpsDist !== null && gpsDist !== undefined ? `${gpsDist.toFixed(1)}m` : 'N/A'})
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Verification action choices */}
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => {
                                  setActiveActionReqId(req.id);
                                  setActionDecision('verified');
                                }}
                                className="sc-btn-primary flex-1 py-2 text-3xs uppercase font-extrabold"
                              >
                                <Check className="w-3.5 h-3.5" /> Approve Pickup
                              </button>
                              <button
                                onClick={() => {
                                  setActiveActionReqId(req.id);
                                  setActionDecision('rejected');
                                }}
                                className="sc-btn-rose flex-1 py-2 text-3xs uppercase font-extrabold"
                              >
                                <X className="w-3.5 h-3.5" /> Reject Cleanup
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'campaigns' && (
                <div className="space-y-4">
                  {campaignsError && (
                    <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-rose-300">
                      {campaignsError}
                    </div>
                  )}

                  {loadingCampaigns ? (
                    <div className="py-16 flex flex-col items-center justify-center">
                      <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
                      <span className="text-3xs uppercase font-bold text-charcoal-400 mt-2">Loading registry...</span>
                    </div>
                  ) : campaigns.length === 0 ? (
                    <div className="sc-empty py-16 text-center text-charcoal-550">
                      No campaigns scheduled.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {campaigns.map((c) => (
                        <div key={c.id} className="bg-black/20 p-5 rounded-2xl border border-white/[0.04] space-y-3">
                          <div className="flex justify-between items-start border-b border-white/[0.04] pb-2">
                            <div>
                              <span className="sc-pill sc-pill-verified text-[8px]">{c.status.toUpperCase()}</span>
                              <h3 className="font-display text-sm font-bold text-white mt-1.5">{c.title}</h3>
                            </div>
                            <span className="text-3xs font-mono text-charcoal-500">ID: {c.id}</span>
                          </div>
                          <p className="text-3xs text-charcoal-400">{c.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 2. MEDIUM BENTO TILE: Hotspots map preview & KPIs (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 sc-glass sc-shadow-stack p-6 rounded-3xl flex flex-col justify-between space-y-4">
            <div className="border-b border-white/[0.05] pb-3">
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Live Hotspot Canvas</span>
              <h3 className="text-sm font-extrabold text-white mt-0.5">Dumping Clustering</h3>
            </div>

            {/* Dynamic Map Tile */}
            <div className="h-[300px] rounded-2xl overflow-hidden relative border border-white/[0.05]">
              <HotspotMap hotspots={hotspots} />
            </div>

            <div className="bg-black/20 p-3.5 rounded-2xl border border-white/[0.03] flex justify-between items-center text-xs font-bold text-charcoal-400">
              <span>Active Hotspots Count:</span>
              <span className="text-rose-400">{hotspots.length} clusters</span>
            </div>
          </div>

          {/* 3. CHARTS CONTAINER TILES: Recharts Metrics (col-span-12) */}
          <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Outcome Pie Chart Bento Tile */}
            <div className="sc-glass sc-shadow-stack p-6 rounded-3xl space-y-4">
              <div>
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">Verification Outcomes Ratio</h3>
                <p className="text-3xs text-charcoal-400 mt-0.5">Overall verification statuses breakdown index</p>
              </div>
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={getOutcomeBreakdownData()}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {getOutcomeBreakdownData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#1B1F22',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        color: '#F0F2F5',
                        fontSize: '11px'
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconSize={10}
                      formatter={(value) => <span className="text-[11px] text-charcoal-300 font-semibold">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Weekly Trend Bar Chart Bento Tile */}
            <div className="sc-glass sc-shadow-stack p-6 rounded-3xl space-y-4">
              <div>
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">Weekly Submission Logs</h3>
                <p className="text-3xs text-charcoal-400 mt-0.5">Volume log history of daily requests in the last 7 days</p>
              </div>
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getRequestsOverTimeData()} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      stroke="rgba(255,255,255,0.3)"
                      fontSize={9}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.3)"
                      fontSize={9}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1B1F22',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        color: '#F0F2F5',
                        fontSize: '11px'
                      }}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="Requests" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Image Preview Overlay Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 sc-anim-fade-up"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/[0.1] bg-black">
            <button
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-4 h-4" />
            </button>
            <Image
              src={selectedImage}
              alt="Expanded preview"
              width={1024}
              height={768}
              className="max-w-full max-h-[80vh] object-contain"
              unoptimized
            />
          </div>
        </div>
      )}

      {/* Manual verification feedback Modal */}
      {activeActionReqId && actionDecision && (
        <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="sc-card w-full max-w-md p-6 sc-anim-scale-in">
            <h3 className="font-display text-lg font-bold flex items-center gap-2 text-white">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              Manual Review Assessment
            </h3>
            <p className="text-xs text-charcoal-400 mt-2">
              Provide justification notes for marking this pickup request as <span className="font-bold text-white uppercase">{actionDecision}</span>.
            </p>

            <form onSubmit={handleVerificationSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-3xs font-extrabold text-charcoal-450 uppercase mb-1.5">
                  Review Notes
                </label>
                <textarea
                  required
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={`Justification explanation for marking this request as ${actionDecision}...`}
                  className="sc-input text-xs"
                  style={{ fontSize: '14px' }}
                />
              </div>

              {actionError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 flex gap-2.5 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveActionReqId(null);
                    setActionDecision(null);
                    setNotes('');
                  }}
                  className="sc-btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="sc-btn-primary text-xs"
                >
                  {actionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    'Confirm decision'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
