'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, X, RefreshCw, LogOut, Shield, Leaf, Loader2,
  AlertCircle, Eye, Inbox, FileText, CheckCircle2, MessageSquare, AlertTriangle
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

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

export const MunicipalityDashboard: React.FC = () => {
  const router = useRouter();

  // User states
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Tab State
  const [activeTab, setActiveTab] = useState<'verification' | 'hotspots' | 'campaigns'>('verification');

  // Data states (verification requests)
  const [requests, setRequests] = useState<CollectionRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Data states (hotspots)
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loadingHotspots, setLoadingHotspots] = useState(false);
  const [hotspotsError, setHotspotsError] = useState<string | null>(null);

  // Data states (campaigns)
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  // Modal / Action states
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeActionReqId, setActiveActionReqId] = useState<string | null>(null);
  const [actionDecision, setActionDecision] = useState<'verified' | 'rejected' | null>(null);
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingHotspotId, setConfirmingHotspotId] = useState<string | null>(null);
  const [rejectingHotspotId, setRejectingHotspotId] = useState<string | null>(null);

  // 1. Authenticate user and fetch profile details
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

        if (userError || !userData) {
          throw new Error('Could not retrieve profile information.');
        }

        if (userData.role !== 'municipality') {
          console.warn('Redirecting unauthorized user role:', userData.role);
          if (userData.role === 'collector') {
            router.push('/collector');
          } else {
            router.push('/resident');
          }
          return;
        }

        if (active) {
          setProfile({ name: userData.name, email: userData.email });
        }
      } catch (err) {
        console.error('[MunicipalityAuthError]:', err);
        router.push('/auth/login');
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    };

    checkAuth();
    return () => {
      active = false;
    };
  }, [router]);

  // 2. Fetch pending collected requests
  const fetchCollectedRequests = async () => {
    setLoadingRequests(true);
    setRequestsError(null);
    try {
      // Fetch COLLECTED requests
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

      if (reqError) {
        throw new Error(`Failed to load requests: ${reqError.message}`);
      }

      if (!reqs || reqs.length === 0) {
        setRequests([]);
        return;
      }

      // Fetch evidence records for these requests
      const requestIds = reqs.map(r => r.id);
      const { data: evidence, error: evError } = await supabaseBrowserClient
        .from('evidence')
        .select(`
          id,
          collection_request_id,
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
        .in('collection_request_id', requestIds);

      if (evError) {
        throw new Error(`Failed to load evidence: ${evError.message}`);
      }

      // Map evidence to requests
      const requestsWithEvidence: CollectionRequestItem[] = reqs.map((req: any) => {
        const reqEvidence = evidence?.filter(e => e.collection_request_id === req.id) || [];
        const beforeEvidence = reqEvidence.find(e => e.evidence_type === 'RESIDENT_BEFORE');
        const afterEvidence = reqEvidence.find(e => e.evidence_type === 'COLLECTOR_AFTER');

        return {
          id: req.id,
          status: req.status,
          requested_at: req.requested_at,
          completed_at: req.completed_at,
          resident: req.resident ? { id: req.resident.id, name: req.resident.name } : null,
          collector: req.collector ? { id: req.collector.id, name: req.collector.name } : null,
          beforeEvidence: beforeEvidence ? {
            id: beforeEvidence.id,
            evidence_type: 'RESIDENT_BEFORE',
            image_url: beforeEvidence.image_url,
            verification_status: beforeEvidence.verification_status as any,
            latitude: beforeEvidence.latitude,
            longitude: beforeEvidence.longitude,
            verification_results: beforeEvidence.verification_results as any
          } : undefined,
          afterEvidence: afterEvidence ? {
            id: afterEvidence.id,
            evidence_type: 'COLLECTOR_AFTER',
            image_url: afterEvidence.image_url,
            verification_status: afterEvidence.verification_status as any,
            latitude: afterEvidence.latitude,
            longitude: afterEvidence.longitude,
            verification_results: afterEvidence.verification_results as any
          } : undefined
        };
      });

      setRequests(requestsWithEvidence);
    } catch (err: any) {
      setRequestsError(err.message || 'An error occurred while loading requests.');
    } finally {
      setLoadingRequests(false);
    }
  };

  // 3. Fetch active open-dumping hotspots
  const fetchHotspots = async () => {
    setLoadingHotspots(true);
    setHotspotsError(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/dumping-reports/hotspots', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'Failed to fetch hotspots.');
      }
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
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
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

  // Effect to load data based on active tab
  useEffect(() => {
    if (profile) {
      if (activeTab === 'verification') {
        fetchCollectedRequests();
      } else if (activeTab === 'hotspots') {
        fetchHotspots();
      } else if (activeTab === 'campaigns') {
        fetchCampaigns();
      }
    }
  }, [profile, activeTab]);

  // 4. Handle Sign Out
  const handleSignOut = async () => {
    await supabaseBrowserClient.auth.signOut();
    router.push('/auth/login');
  };

  // 5. Submit manual verification decision
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
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'Verification submission failed.');
      }

      // Close modal and refresh list
      setActiveActionReqId(null);
      setActionDecision(null);
      setNotes('');
      fetchCollectedRequests();
    } catch (err: any) {
      setActionError(err.message || 'Verification action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Handle Confirming Dumping Hotspot
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
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'Failed to confirm hotspot.');
      }

      // Refresh list to update UI
      await fetchHotspots();
    } catch (err: any) {
      alert(err.message || 'An error occurred during confirmation.');
    } finally {
      setConfirmingHotspotId(null);
    }
  };

  // 7. Handle Rejecting Dumping Hotspot
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
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'Failed to reject hotspot.');
      }

      // Refresh list to update UI
      await fetchHotspots();
    } catch (err: any) {
      alert(err.message || 'An error occurred during rejection.');
    } finally {
      setRejectingHotspotId(null);
    }
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm font-medium text-slate-500">Checking credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans antialiased text-slate-900 dark:text-slate-100 pb-16">
      {/* Navbar Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-400 flex items-center justify-center shadow-md shadow-indigo-500/20 ring-1 ring-indigo-500/10">
              <Shield className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-200 bg-clip-text text-transparent">
                EcoClean Hub
              </span>
              <span className="ml-2 text-2xs font-extrabold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border border-indigo-500/10">
                Municipality
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{profile?.name}</span>
              <span className="text-3xs text-slate-400 dark:text-slate-500">{profile?.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center gap-1.5 py-2 px-3.5 border border-slate-200 dark:border-slate-800 hover:border-rose-500/30 hover:bg-rose-500/5 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-455 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        {/* Banner Title */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-855 dark:from-white dark:to-slate-250 bg-clip-text text-transparent">
              {activeTab === 'verification' ? 'Manual Verification Dashboard' : activeTab === 'hotspots' ? 'Open Dumping Intelligence' : 'Community Campaigns Monitor'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {activeTab === 'verification'
                ? 'Review collected requests that triggered automated safety flags or require final approvals.'
                : activeTab === 'hotspots'
                ? 'Aggregated reports of active illegal dumping hotspots clustered across community areas.'
                : 'Monitor environmental cleanliness drives launched and completed by community residents.'}
            </p>
          </div>
          <button
            onClick={activeTab === 'verification' ? fetchCollectedRequests : activeTab === 'hotspots' ? fetchHotspots : fetchCampaigns}
            disabled={activeTab === 'verification' ? loadingRequests : activeTab === 'hotspots' ? loadingHotspots : loadingCampaigns}
            className="flex items-center justify-center gap-1.5 py-2 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl text-xs font-bold shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${(activeTab === 'verification' ? loadingRequests : activeTab === 'hotspots' ? loadingHotspots : loadingCampaigns) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Tab Selection Row */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 mb-8 gap-2">
          <button
            onClick={() => setActiveTab('verification')}
            className={`py-3 px-4 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'verification'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-450 dark:text-slate-500 hover:text-slate-700'
            }`}
          >
            Awaiting Verification ({requests.length})
          </button>
          <button
            onClick={() => setActiveTab('hotspots')}
            className={`py-3 px-4 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'hotspots'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-450 dark:text-slate-500 hover:text-slate-700'
            }`}
          >
            Dumping Hotspots ({hotspots.length})
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`py-3 px-4 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'campaigns'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-450 dark:text-slate-500 hover:text-slate-700'
            }`}
          >
            Community Campaigns ({campaigns.length})
          </button>
        </div>

        {/* Tab content 1: Manual review requests */}
        {activeTab === 'verification' && (
          <>
            {requestsError && (
              <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 p-4 flex gap-3 text-rose-700 dark:text-rose-300 max-w-2xl mb-6">
                <AlertCircle className="w-5.5 h-5.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Failed to load manual review list</p>
                  <p className="text-xs mt-1 opacity-90">{requestsError}</p>
                </div>
              </div>
            )}

            {loadingRequests ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Retrieving pending tickets...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto shadow-sm">
                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto mb-4">
                  <Inbox className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">All caught up!</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  There are currently no collection requests flagged or awaiting manual verification.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {requests.map((req) => {
                  const geminiRes = req.afterEvidence?.verification_results?.[0];
                  const score = geminiRes?.confidence_score ?? 0;
                  const gpsDec = geminiRes?.gps_decision;
                  const gpsDist = geminiRes?.gps_distance;

                  return (
                    <div
                      key={req.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm hover:shadow-md transition-all p-6 flex flex-col lg:flex-row gap-8 items-stretch"
                    >
                      {/* Left Metadata Column */}
                      <div className="flex-1 min-w-[240px] flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-2xs font-extrabold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 tracking-wider">
                              COLLECTED
                            </span>
                            <span className="text-3xs text-slate-400 dark:text-slate-500">ID: {req.id}</span>
                          </div>

                          <div className="mt-4 space-y-2.5">
                            <div>
                              <p className="text-2xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-extrabold">Resident</p>
                              <p className="text-xs font-semibold mt-0.5">{req.resident?.name || 'Unknown'}</p>
                            </div>
                            <div>
                              <p className="text-2xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-extrabold">Collector Assigned</p>
                              <p className="text-xs font-semibold mt-0.5">{req.collector?.name || 'Unassigned'}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-3xs text-slate-400 dark:text-slate-500 space-y-1">
                          <p>Requested: {new Date(req.requested_at).toLocaleString()}</p>
                          {req.completed_at && <p>Completed: {new Date(req.completed_at).toLocaleString()}</p>}
                        </div>
                      </div>

                      {/* Middle Images Column */}
                      <div className="flex flex-row sm:flex-row gap-4 items-center">
                        {/* BEFORE Image */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-3xs font-extrabold text-slate-450 uppercase tracking-wider text-center">BEFORE Evidence</span>
                          {req.beforeEvidence?.image_url ? (
                            <div
                              className="relative h-28 w-28 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 group cursor-pointer"
                              onClick={() => setSelectedImage(req.beforeEvidence?.image_url || null)}
                            >
                              <img
                                src={req.beforeEvidence.image_url}
                                alt="Before waste evidence"
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                <Eye className="w-5 h-5 text-white" />
                              </div>
                            </div>
                          ) : (
                            <div className="h-28 w-28 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-350 bg-slate-50 dark:bg-slate-900/30">
                              <FileText className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        {/* AFTER Image */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-3xs font-extrabold text-slate-450 uppercase tracking-wider text-center">AFTER Evidence</span>
                          {req.afterEvidence?.image_url ? (
                            <div
                              className="relative h-28 w-28 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 group cursor-pointer"
                              onClick={() => setSelectedImage(req.afterEvidence?.image_url || null)}
                            >
                              <img
                                src={req.afterEvidence.image_url}
                                alt="After collection evidence"
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                <Eye className="w-5 h-5 text-white" />
                              </div>
                            </div>
                          ) : (
                            <div className="h-28 w-28 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-350 bg-slate-50 dark:bg-slate-900/30">
                              <FileText className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Gemini & GPS Assessment Column */}
                      <div className="flex-1.5 min-w-[300px] bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-2xs font-bold text-slate-450 uppercase tracking-wider">Automated Verification Signals</span>

                            {/* Status Badge */}
                            {geminiRes ? (
                              <span className={`text-3xs font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                                geminiRes.decision === 'verified'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10'
                                  : geminiRes.decision === 'rejected'
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-455 border-rose-500/10'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-450 border-amber-500/10'
                              }`}>
                                {geminiRes.decision}
                              </span>
                            ) : (
                              <span className="text-3xs font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                                No Scan
                              </span>
                            )}
                          </div>

                          {/* Confidence Indicator */}
                          {geminiRes && (
                            <div className="mt-3.5 flex items-center gap-3">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                              <span className="text-2xs font-extrabold text-slate-655 dark:text-slate-400">{score}% Conf.</span>
                            </div>
                          )}

                          {/* GPS Proximity Check */}
                          {gpsDec && (
                            <div className="mt-3.5 pt-3 border-t border-slate-200/50 dark:border-slate-800/80 flex flex-col gap-2">
                              <div className="flex items-center justify-between text-3xs">
                                <span className="font-extrabold text-slate-450 dark:text-slate-500 uppercase tracking-wider">GPS Verification</span>
                                <span className={`font-black uppercase px-2 py-0.5 rounded text-3xs ${
                                  gpsDec === 'MATCH'
                                    ? 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400'
                                    : gpsDec === 'NEAR'
                                    ? 'text-yellow-600 bg-yellow-500/10 dark:text-yellow-450'
                                    : gpsDec === 'MISMATCH'
                                    ? 'text-rose-600 bg-rose-500/10 dark:text-rose-455 border border-rose-500/10'
                                    : 'text-slate-500 bg-slate-100 dark:bg-slate-800'
                                }`}>
                                  {gpsDec === 'MISMATCH' && <AlertTriangle className="w-3 h-3 inline mr-1 animate-bounce" />}
                                  {gpsDec}
                                </span>
                              </div>
                              {gpsDist !== undefined && gpsDist !== null && (
                                <div className="flex justify-between text-3xs text-slate-500 dark:text-slate-455">
                                  <span>Before vs After Distance:</span>
                                  <span className="font-bold">{gpsDist.toFixed(1)} meters</span>
                                </div>
                              )}
                              {/* Exact coordinates for municipality admins */}
                              <div className="mt-1 bg-slate-100 dark:bg-slate-950 p-2 rounded-xl text-3xs font-mono text-slate-500 dark:text-slate-400 flex flex-col gap-0.5 border border-slate-200/40 dark:border-slate-800/60">
                                <div>Resident: {req.beforeEvidence?.latitude?.toFixed(5) || 'N/A'}, {req.beforeEvidence?.longitude?.toFixed(5) || 'N/A'}</div>
                                <div>Collector: {req.afterEvidence?.latitude?.toFixed(5) || 'N/A'}, {req.afterEvidence?.longitude?.toFixed(5) || 'N/A'}</div>
                              </div>
                            </div>
                          )}

                          {/* Assessment details */}
                          <p className="text-2xs leading-relaxed text-slate-500 dark:text-slate-455 mt-4 italic bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl p-3">
                            {geminiRes?.analysis || 'No automated assessment analysis was generated.'}
                          </p>
                        </div>

                        {/* Actions buttons */}
                        <div className="flex gap-3 mt-6">
                          <button
                            onClick={() => {
                              setActiveActionReqId(req.id);
                              setActionDecision('verified');
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-md active:scale-[0.98] transition-all cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            Verify Pickup
                          </button>
                          <button
                            onClick={() => {
                              setActiveActionReqId(req.id);
                              setActionDecision('rejected');
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 border border-rose-250 dark:border-rose-800 hover:border-rose-500 hover:bg-rose-500/5 text-rose-700 dark:text-rose-455 hover:text-rose-600 dark:hover:text-rose-450 text-xs font-bold rounded-xl active:scale-[0.98] transition-all cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                            Reject Pickup
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Tab content 2: Aggregated Dumping Hotspots */}
        {activeTab === 'hotspots' && (
          <div className="space-y-6">
            {loadingHotspots ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Loading Hotspot aggregation...</p>
              </div>
            ) : hotspotsError ? (
              <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 p-4 flex gap-3 text-rose-700 dark:text-rose-300 max-w-2xl">
                <AlertCircle className="w-5.5 h-5.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Failed to load hotspots</p>
                  <p className="text-xs mt-1 opacity-90">{hotspotsError}</p>
                </div>
              </div>
            ) : hotspots.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto shadow-sm">
                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto mb-4">
                  <Inbox className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">No active hotspots</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  There are no active illegal dumping reports currently clustered.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {hotspots.map((h) => {
                  const priorityColors = {
                    critical: 'bg-red-500/10 text-red-650 dark:text-red-400 border-red-500/20 font-black',
                    high: 'bg-orange-500/10 text-orange-650 dark:text-orange-400 border-orange-500/20 font-bold',
                    medium: 'bg-yellow-500/10 text-yellow-650 dark:text-yellow-450 border-yellow-500/20 font-bold',
                    low: 'bg-slate-550/10 text-slate-600 dark:text-slate-450 border-slate-500/20'
                  };

                  return (
                    <div
                      key={h.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden flex flex-col justify-between group"
                    >
                      <div>
                        {/* Hotspot Image */}
                        <div className="relative aspect-video bg-slate-100 dark:bg-slate-800 overflow-hidden border-b border-slate-100 dark:border-slate-850">
                          {h.representativeImage ? (
                            <img
                              src={h.representativeImage}
                              alt="Hotspot Representative"
                              className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-350 dark:text-slate-600 bg-slate-100 dark:bg-slate-900/30">
                              <FileText className="w-10 h-10 animate-pulse" />
                            </div>
                          )}
                          <div className="absolute top-3 left-3">
                            <span className={`text-3xs px-2.5 py-1 rounded-full border uppercase tracking-widest flex items-center gap-1 ${priorityColors[h.priority]}`}>
                              🔥 {h.priority} — {h.priorityPercentage}%
                            </span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="p-5 space-y-4">
                          <div>
                            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Community Locality</h4>
                            <p className="text-sm font-black text-slate-800 dark:text-white mt-1">{h.communityName}</p>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-950/20 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                            <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-bold">
                              <span>👥</span>
                              <span>{h.uniqueReporters} {h.uniqueReporters === 1 ? 'reporter' : 'reporters'}</span>
                              <span className="text-slate-350 dark:text-slate-700 font-normal">·</span>
                              <span>{h.totalReports} {h.totalReports === 1 ? 'report' : 'reports'}</span>
                            </div>
                          </div>

                          <div className="pt-2">
                            <h5 className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Latest Incident Notes</h5>
                            <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed italic bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-150/40 dark:border-slate-800/80">
                              "{h.latestDescription || 'No description provided'}"
                            </p>
                          </div>

                          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60">
                            {h.reviewStatus === 'confirmed' ? (
                              <div className="flex flex-col items-center justify-center p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl">
                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-450 flex items-center gap-1">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Confirmed ✓
                                </span>
                                <span className="text-3xs text-emerald-650 dark:text-emerald-400/80 mt-0.5 font-bold">
                                  {h.uniqueReporters} {h.uniqueReporters === 1 ? 'reporter' : 'reporters'} rewarded · +5 each
                                </span>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleConfirmDumping(h.id)}
                                  disabled={confirmingHotspotId !== null || rejectingHotspotId !== null}
                                  className="flex-1 flex items-center justify-center gap-1 py-3 px-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-3xs uppercase tracking-wider rounded-2xl transition-all shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                                >
                                  {confirmingHotspotId === h.id ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Confirming...
                                    </>
                                  ) : (
                                    <>
                                      <Check className="w-3 h-3" />
                                      Confirm Dumping
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleRejectDumping(h.id)}
                                  disabled={confirmingHotspotId !== null || rejectingHotspotId !== null}
                                  className="flex-1 flex items-center justify-center gap-1 py-3 px-2 bg-rose-500 hover:bg-rose-605 text-white font-extrabold text-3xs uppercase tracking-wider rounded-2xl transition-all shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                                >
                                  {rejectingHotspotId === h.id ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Rejecting...
                                    </>
                                  ) : (
                                    <>
                                      <X className="w-3 h-3" />
                                      Reject Dumping
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-3xs text-slate-400 dark:text-slate-500 mt-2">
                        <span>Latest: {new Date(h.latestReportAt).toLocaleString()}</span>
                        <span>Coords: {h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab content 3: Cleanliness Campaigns Monitoring */}
        {activeTab === 'campaigns' && (
          <div className="space-y-6">
            {campaignsError && (
              <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 p-4 flex gap-3 text-rose-700 dark:text-rose-300 max-w-2xl">
                <AlertCircle className="w-5.5 h-5.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Failed to load campaigns list</p>
                  <p className="text-xs mt-1 opacity-90">{campaignsError}</p>
                </div>
              </div>
            )}

            {loadingCampaigns ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-xs">Fetching campaigns registry...</span>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-16 text-slate-450 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <p className="text-sm font-black">No cleanliness campaigns found</p>
                <p className="text-2xs mt-1">Campaigns launched by community members will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {campaigns.map((c) => {
                  const statusColors = {
                    draft: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-450 border-slate-200 dark:border-slate-750',
                    published: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-450 border-blue-100 dark:border-blue-900/30',
                    registration_open: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-900/30',
                    completed: 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-450 border-indigo-100 dark:border-indigo-900/30',
                    cancelled: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 border-rose-100 dark:border-rose-900/30'
                  };

                  const formattedStatus = c.status.replace('_', ' ').toUpperCase();

                  return (
                    <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                        <div>
                          <span className={`text-4xs px-2.5 py-0.5 rounded-full border tracking-widest font-extrabold ${statusColors[c.status as keyof typeof statusColors] || ''}`}>
                            {formattedStatus}
                          </span>
                          <h3 className="text-base font-black text-slate-800 dark:text-white mt-2 leading-snug">{c.title}</h3>
                          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">{c.description}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center min-w-[240px]">
                          <div className="bg-slate-50 dark:bg-slate-950/40 p-2 rounded-xl border border-slate-100 dark:border-slate-850">
                            <span className="text-slate-400 text-4xs font-bold block uppercase">Registered</span>
                            <span className="text-xs font-black text-slate-800 dark:text-white mt-0.5 block">{c.registeredCount}</span>
                          </div>
                          <div className="bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
                            <span className="text-emerald-500 text-4xs font-bold block uppercase">Attended</span>
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-450 mt-0.5 block">{c.attendedCount}</span>
                          </div>
                          <div className="bg-rose-500/5 p-2 rounded-xl border border-rose-500/10">
                            <span className="text-rose-500 text-4xs font-bold block uppercase">Cancelled</span>
                            <span className="text-xs font-black text-rose-600 dark:text-rose-450 mt-0.5 block">{c.cancelledCount}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 text-2xs font-semibold text-slate-500 dark:text-slate-400">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span>📅 Date:</span>
                            <span className="text-slate-800 dark:text-slate-200">{new Date(c.campaignDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>⏰ Duration:</span>
                            <span className="text-slate-800 dark:text-slate-200">{c.startTime.substring(0, 5)} – {c.endTime.substring(0, 5)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>📍 Location:</span>
                            <span className="text-slate-800 dark:text-slate-200">{c.location}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span>🏘️ Locality:</span>
                            <span className="text-slate-800 dark:text-slate-200">{c.communityName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>👤 Organizer:</span>
                            <span className="text-slate-800 dark:text-slate-200 font-bold">{c.organizerName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>🎯 Target Turnout:</span>
                            <span className="text-slate-850 dark:text-slate-200">{c.expectedParticipants || '—'}</span>
                          </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850 rounded-2xl p-4 space-y-2 flex flex-col justify-center">
                          <div className="flex justify-between text-3xs font-extrabold uppercase text-slate-400">
                            <span>Organizer Reward:</span>
                            <span className={c.organizerPointsAwarded > 0 ? 'text-emerald-500' : 'text-slate-500'}>
                              {c.organizerPointsAwarded > 0 ? '+1,000 pts' : 'Pending completion'}
                            </span>
                          </div>
                          <div className="flex justify-between text-3xs font-extrabold uppercase text-slate-400 mt-2">
                            <span>Attendee Rewards:</span>
                            <span className={c.participantPointsDistributed > 0 ? 'text-emerald-500' : 'text-slate-500'}>
                              {c.participantPointsDistributed > 0 ? `+${c.participantPointsDistributed.toLocaleString()} pts total` : '0 pts'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Image Preview Overlay Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-800">
            <button
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={selectedImage}
              alt="Expanded preview"
              className="max-w-full max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}

      {/* Verification / Rejection Notes Modal Overlay */}
      {activeActionReqId && actionDecision && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-500" />
              Manual Review Assessment
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Please provide decision justification notes for this ticket.
            </p>

            <form onSubmit={handleVerificationSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                  Review Notes
                </label>
                <textarea
                  required
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={`Reason for marking this pickup as ${actionDecision}...`}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors text-xs"
                />
              </div>

              {actionError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3.5 flex gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                  <span className="text-xs text-rose-700 dark:text-rose-300">{actionError}</span>
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
                  className="py-2 px-4 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`py-2 px-5 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer ${
                    actionDecision === 'verified'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirm {actionDecision === 'verified' ? 'Verify' : 'Reject'}
                    </>
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

export default MunicipalityDashboard;
