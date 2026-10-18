'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  X, Camera, RefreshCw, Check, AlertCircle, CheckCircle2, Loader2,
  Leaf, LogOut, MapPin, Inbox, History, Calendar, CheckSquare,
  ChevronRight, Award, Trophy, Clock, TrendingUp, Gift
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { BackgroundMesh } from '@/features/shared/components/BackgroundMesh';
import { CollectionRequestDTO } from '@/types';

// ── Status labels ────────────────────────────────────────────────────────
function getStatusLabel(status: string) {
  switch (status) {
    case 'PENDING': return 'Pending';
    case 'ASSIGNED': return 'Assigned';
    case 'COLLECTED': return 'Under Scan';
    case 'VERIFIED': return 'Verified';
    case 'REJECTED': return 'Rejected';
    default: return status;
  }
}

function getStatusPillClass(status: string) {
  switch (status) {
    case 'PENDING': return 'sc-pill sc-pill-pending';
    case 'ASSIGNED': return 'sc-pill sc-pill-assigned';
    case 'COLLECTED': return 'sc-pill sc-pill-collected';
    case 'VERIFIED': return 'sc-pill sc-pill-verified';
    case 'REJECTED': return 'sc-pill sc-pill-rejected';
    default: return 'sc-pill sc-pill-pending';
  }
}

export const CollectorDashboard: React.FC = () => {
  const router = useRouter();

  // ── States ──────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<{ name: string; email: string; communityName: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'assignments' | 'history' | 'rewards'>('available');

  const [requests, setRequests] = useState<CollectionRequestDTO[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [rewardsSummary, setRewardsSummary] = useState<{ balancePoints: number; lifetimePoints: number; rank: number } | null>(null);
  const [loadingRewards, setLoadingRewards] = useState(true);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  // ── Modal / Evidence uploads ───────────────────────────────────────────
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<CollectionRequestDTO | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [isSubmittingEvidence, setIsSubmittingEvidence] = useState(false);
  const [isSuccessState, setIsSuccessState] = useState(false);

  // Camera states
  const [cameraState, setCameraState] = useState<'off' | 'on' | 'captured'>('off');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [collectorLatitude, setCollectorLatitude] = useState<number | null>(null);
  const [collectorLongitude, setCollectorLongitude] = useState<number | null>(null);
  const [collectorGpsAccuracy, setCollectorGpsAccuracy] = useState<number | null>(null);
  const [collectorGpsTimestamp, setCollectorGpsTimestamp] = useState<string | null>(null);

  // Loading UI actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // ── Auth and fetch hooks ───────────────────────────────────────────────
  const handleLogout = async () => {
    await supabaseBrowserClient.auth.signOut();
    router.push('/auth/login');
  };

  const fetchRequests = async () => {
    try {
      setLoadingRequests(true);
      setRequestsError(null);
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/collection-requests', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'Failed to fetch collection requests.');
      setRequests(result.data || []);
    } catch (err: any) {
      setRequestsError(err.message || 'An error occurred loading tasks list.');
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchRewardsSummary = async () => {
    try {
      setLoadingRewards(true);
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/rewards/summary', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (res.ok && result.success) setRewardsSummary(result.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRewards(false);
    }
  };

  const fetchRewardsHistory = async () => {
    try {
      setLoadingTransactions(true);
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/rewards', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (res.ok && result.success) setTransactions(result.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTransactions(false);
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
          .select('name, email, role, community_memberships(communities(name))')
          .eq('id', session.user.id)
          .single();

        if (userError || !userData) throw new Error('Could not retrieve user record.');

        if (userData.role !== 'collector') {
          console.warn('Unauthorized collector redirection from:', userData.role);
          if (userData.role === 'resident') {
            router.push('/resident');
          } else {
            router.push('/municipality');
          }
          return;
        }

        const rawMemberships = userData.community_memberships as any;
        const membershipsArray = Array.isArray(rawMemberships) ? rawMemberships : [rawMemberships].filter(Boolean);
        const communityObj = membershipsArray[0]?.communities;
        const communityName = Array.isArray(communityObj) ? communityObj[0]?.name : communityObj?.name;

        if (active) {
          setProfile({
            name: userData.name,
            email: userData.email,
            communityName: communityName || 'My Community'
          });
        }
      } catch (err) {
        console.error('[CollectorDashboard AuthError]:', err);
        router.push('/auth/login');
      } finally {
        if (active) setLoadingProfile(false);
      }
    };

    checkAuth();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (profile) {
      fetchRequests();
      fetchRewardsSummary();
      fetchRewardsHistory();
    }
  }, [profile]);

  // ── Work flow handlers ──────────────────────────────────────────────────
  const handleClaim = async (requestId: string) => {
    setActionLoading(requestId);
    setActionError(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Not authenticated.');

      const res = await fetch(`/api/collection-requests/${requestId}/claim`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'Collection claim failed.');
      await fetchRequests();
    } catch (err: any) {
      setActionError(err.message || 'Failed to claim task.');
    } finally {
      setActionLoading(null);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      setCameraState('on');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCollectorLatitude(position.coords.latitude);
          setCollectorLongitude(position.coords.longitude);
          setCollectorGpsAccuracy(position.coords.accuracy);
          setCollectorGpsTimestamp(new Date(position.timestamp).toISOString());
        },
        (err) => {
          console.warn('GPS capture warning:', err);
          setCameraError('GPS coordinates capture failed. Proceeding with evidence upload...');
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );

    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Failed to initialize device camera stream. Please upload photo manually.');
      setCameraState('off');
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    setCameraState('off');
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `evidence_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedFile(file);
          const url = URL.createObjectURL(blob);
          setImagePreview(url);
          setCameraState('captured');
        }
      }, 'image/jpeg', 0.85);
    }
    stopCamera();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
      setCameraState('captured');
    }
  };

  const handleEvidenceSubmit = async () => {
    if (!selectedFile || !activeRequest) return;

    setIsSubmittingEvidence(true);
    setEvidenceError(null);

    // A collector may upload a photo instead of using the live camera. In that
    // case, request GPS here as well so evidence can still carry location metadata.
    let submissionLatitude = collectorLatitude;
    let submissionLongitude = collectorLongitude;
    let submissionAccuracy = collectorGpsAccuracy;
    let submissionTimestamp = collectorGpsTimestamp;

    try {
      if (submissionLatitude === null || submissionLongitude === null) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('Geolocation is not supported by this browser.'));
              return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0
            });
          });
          submissionLatitude = position.coords.latitude;
          submissionLongitude = position.coords.longitude;
          submissionAccuracy = position.coords.accuracy;
          submissionTimestamp = new Date(position.timestamp).toISOString();
          setCollectorLatitude(submissionLatitude);
          setCollectorLongitude(submissionLongitude);
          setCollectorGpsAccuracy(submissionAccuracy);
          setCollectorGpsTimestamp(submissionTimestamp);
        } catch (gpsError) {
          console.warn('GPS capture at evidence submission failed:', gpsError);
          setCameraError('GPS could not be captured. Evidence will be submitted without GPS coordinates.');
        }
      }

      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Session expired. Log in again.');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('collectionRequestId', activeRequest.id);
      formData.append('evidenceType', 'COLLECTOR_AFTER');

      if (submissionLatitude !== null && submissionLongitude !== null) {
        formData.append('latitude', submissionLatitude.toString());
        formData.append('longitude', submissionLongitude.toString());
        if (submissionAccuracy !== null) formData.append('gpsAccuracy', submissionAccuracy.toString());
        if (submissionTimestamp !== null) formData.append('gpsCapturedAt', submissionTimestamp);
      }

      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'Failed to submit collected evidence.');

      setIsSuccessState(true);
      await fetchRequests();
      fetchRewardsSummary();
      fetchRewardsHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error uploading evidence.';
      setEvidenceError(msg);
    } finally {
      setIsSubmittingEvidence(false);
    }
  };

  const closeCollectModal = () => {
    stopCamera();
    setSelectedFile(null);
    setImagePreview(null);
    setActiveRequest(null);
    setIsCollectModalOpen(false);
    setIsSuccessState(false);
    setEvidenceError(null);
  };

  const getFilteredRequests = () => {
    return requests.filter(req => {
      if (activeTab === 'available') return req.status === 'PENDING';
      if (activeTab === 'assignments') return req.status === 'ASSIGNED';
      if (activeTab === 'history') return ['COLLECTED', 'VERIFIED', 'REJECTED'].includes(req.status);
      return false;
    });
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[#14171A] flex flex-col items-center justify-center text-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-terra-500 mb-4" />
        <p className="text-xs text-charcoal-400 font-bold uppercase tracking-widest">Loading Collector Dashboard...</p>
      </div>
    );
  }

  const filteredRequests = getFilteredRequests();

  return (
    <div className="min-h-screen bg-[#14171A] text-[#F0F2F5] pb-12 relative overflow-hidden" style={{ fontFamily: 'var(--font-geist-sans)' }}>
      {/* Aurora mesh background layer */}
      <BackgroundMesh role="collector" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#14171A]/90 backdrop-blur-md border-b border-white/[0.07] px-6 py-4 flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-terra-600 flex items-center justify-center shadow-lg"
            style={{ boxShadow: '0 4px 14px rgba(194,83,42,0.3)' }}>
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-base font-black tracking-tight text-white flex items-center gap-1.5">
              Swachh Circuit <span className="sc-pill sc-pill-assigned text-[8px] font-black uppercase">Collector</span>
            </h1>
            <p className="text-charcoal-400 text-3xs font-bold flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-terra-500" />
              {profile?.communityName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-2xs font-extrabold text-slate-200">{profile?.name}</span>
            <span className="text-3xs text-charcoal-500 font-mono">{profile?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="sc-btn-rose"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log Out</span>
          </button>
        </div>
      </header>

      {/* Main Body structured as a Bento Grid */}
      <main className="max-w-7xl mx-auto px-6 mt-8 relative z-10">
        <div className="grid grid-cols-12 gap-6">

          {/* 1. LARGE BENTO TILE: Claimable Jobs List (col-span-12 lg:col-span-8) */}
          <div className="col-span-12 lg:col-span-8 sc-glass sc-shadow-stack p-6 rounded-3xl flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/[0.05]">
              <div>
                <h2 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-terra-500" />
                  Active Assignments Queue
                </h2>
                <p className="text-3xs text-charcoal-400 mt-0.5">Claim garbage pick up tasks and upload cleanup evidence</p>
              </div>

              {/* Tab Selector */}
              <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl border border-white/[0.04] self-end sm:self-auto">
                <button
                  onClick={() => setActiveTab('available')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all ${activeTab === 'available' ? 'bg-terra-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  Available ({requests.filter(r => r.status === 'PENDING').length})
                </button>
                <button
                  onClick={() => setActiveTab('assignments')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all ${activeTab === 'assignments' ? 'bg-terra-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  Claimed ({requests.filter(r => r.status === 'ASSIGNED').length})
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all ${activeTab === 'history' ? 'bg-terra-600 text-white shadow-sm' : 'text-charcoal-400 hover:text-charcoal-200'}`}
                >
                  History
                </button>
              </div>
            </div>

            {/* Error indicators */}
            {actionError && (
              <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-300">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Request Card render list */}
            <div className="flex-1 overflow-y-auto max-h-[460px] pr-1 space-y-3">
              {loadingRequests ? (
                <div className="py-20 flex flex-col items-center justify-center text-charcoal-550">
                  <Loader2 className="w-8 h-8 animate-spin text-terra-500 mb-2" />
                  <span className="text-3xs uppercase tracking-widest font-black">Retrieving queue...</span>
                </div>
              ) : requestsError ? (
                <div className="py-16 text-center text-charcoal-500 bg-white/[0.01] border border-white/[0.04] rounded-2xl">
                  <AlertCircle className="w-9 h-9 mx-auto text-charcoal-600 mb-2" />
                  <p className="text-xs font-semibold">{requestsError}</p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="sc-empty py-20 text-center text-charcoal-500 bg-white/[0.01] border border-white/[0.04] rounded-3xl">
                  <Inbox className="w-10 h-10 mx-auto text-charcoal-600 mb-3" />
                  <p className="text-xs font-semibold text-white">No active requests</p>
                  <p className="text-2xs mt-1">Assignments claimed or waiting for citizen uploads will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map((req) => {
                    const isExpanded = selectedRequestId === req.id;
                    return (
                      <div
                        key={req.id}
                        className={`sc-card p-4 flex flex-col gap-3 transition-all hover:border-white/[0.12] ${
                          activeTab === 'history' ? 'cursor-pointer select-none' : ''
                        }`}
                        onClick={() => {
                          if (activeTab === 'history') {
                            setSelectedRequestId(isExpanded ? null : req.id);
                          }
                        }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white block">{req.residentName || 'Resident'}</span>
                              <span className={getStatusPillClass(req.status)}>
                                {getStatusLabel(req.status)}
                              </span>
                            </div>
                            <span className="text-3xs text-charcoal-400 block mt-0.5 flex items-center gap-1 font-mono">
                              ID: {req.id} · Requested: {new Date(req.requestedAt).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 self-end sm:self-center">
                            {req.status === 'PENDING' && (
                              <button
                                onClick={() => handleClaim(req.id)}
                                disabled={actionLoading !== null}
                                className="sc-btn-primary py-2 px-3 text-2xs"
                              >
                                {actionLoading === req.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  'Claim Task'
                                )}
                              </button>
                            )}
                            {req.status === 'ASSIGNED' && (
                              <button
                                onClick={() => {
                                  setActiveRequest(req);
                                  setIsCollectModalOpen(true);
                                }}
                                className="sc-btn-primary py-2 px-3 text-2xs"
                              >
                                <Camera className="w-3.5 h-3.5" /> Submit Evidence
                              </button>
                            )}
                          </div>
                        </div>

                        {/* History expansion details */}
                        {isExpanded && activeTab === 'history' && (
                          <div className="mt-3 pt-3 border-t border-white/[0.04] text-xs text-charcoal-450 grid grid-cols-2 gap-4 font-semibold">
                            <div>
                              <span>Assigned to you:</span>
                              <span className="text-white block mt-0.5">Community Collector</span>
                            </div>
                            <div>
                              <span>Completion status:</span>
                              <span className="text-white block mt-0.5">Verification Scan Complete</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 2. MEDIUM BENTO TILE: Today's Assignment statistics (col-span-12 md:col-span-6 lg:col-span-4) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 sc-glass sc-shadow-stack p-6 rounded-3xl flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-terra-400 font-black uppercase tracking-wider">Today&apos;s Action Summary</span>
              <h3 className="text-sm font-extrabold text-white mt-0.5">Operations ledger</h3>
            </div>

            <div className="space-y-3.5 my-4">
              <div className="bg-black/20 p-3.5 rounded-2xl border border-white/[0.03] flex justify-between items-center">
                <div>
                  <span className="text-3xs text-charcoal-550 block font-bold uppercase tracking-wider">Pending Available</span>
                  <span className="text-xl font-black text-white mt-0.5 block">
                    {requests.filter(r => r.status === 'PENDING').length}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-3xs text-charcoal-550 block font-bold uppercase tracking-wider">Active Tasks</span>
                  <span className="text-xl font-black text-terra-400 mt-0.5 block">
                    {requests.filter(r => r.status === 'ASSIGNED').length}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-bold text-charcoal-400 px-1">
                <span>Completed verification scans:</span>
                <span className="text-forest-400">
                  {requests.filter(r => ['COLLECTED', 'VERIFIED'].includes(r.status)).length} tasks
                </span>
              </div>
            </div>

            <button
              onClick={fetchRequests}
              className="sc-btn-ghost w-full py-2.5 flex items-center justify-center gap-2 text-3xs font-black uppercase tracking-wider border-white/[0.05]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Synchronize List
            </button>
          </div>

          {/* 3. SMALL BENTO TILE: Rewards / Standing Summary (col-span-12 md:col-span-6 lg:col-span-4) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 sc-glass sc-shadow-stack p-6 rounded-3xl flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-marigold-500 font-black uppercase tracking-wider">Earnings Summary</span>
                <h3 className="text-sm font-extrabold text-white mt-0.5">Points Ledger</h3>
              </div>
              <div className="h-10 w-10 rounded-full bg-marigold-500/15 flex items-center justify-center text-lg border border-marigold-500/20">
                ⭐
              </div>
            </div>

            <div className="bg-black/20 p-4 rounded-2xl border border-white/[0.03] my-4 flex items-center justify-between">
              <div>
                <span className="text-3xs text-charcoal-500 font-black uppercase">Points Balance</span>
                <span className="text-2xl font-black text-marigold-400 mt-0.5 block">
                  {loadingRewards ? '...' : (rewardsSummary?.balancePoints ?? 0)} pts
                </span>
              </div>
              <div className="text-right">
                <span className="text-3xs text-charcoal-550 font-black uppercase block">Lifetime</span>
                <span className="text-2xs font-extrabold text-charcoal-300 block mt-1">
                  {loadingRewards ? '...' : (rewardsSummary?.lifetimePoints ?? 0)}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs font-bold text-charcoal-400 pt-2 px-1 border-t border-white/[0.04]">
              <span>Eco-Hero Standing:</span>
              <span className="text-forest-400">Top 3% performer</span>
            </div>
          </div>

        </div>
      </main>

      {/* ── Evidence upload camera modal ───────────────────────────── */}
      {isCollectModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="sc-glass sc-shadow-stack w-full max-w-lg p-6 rounded-3xl flex flex-col space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-white">Collector Evidence Submission</h3>
                <p className="text-3xs text-charcoal-400 mt-0.5">Request ID: {activeRequest.id}</p>
              </div>
              <button onClick={closeCollectModal} className="text-charcoal-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* OPAQUE LIVE VIDEO FEED / STATIC PHOTO PREVIEW */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/[0.08]">
              {cameraState === 'on' ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : imagePreview ? (
                <Image
                  src={imagePreview}
                  alt="Captured evidence preview"
                  fill
                  sizes="400px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-charcoal-550 text-3xs font-bold uppercase tracking-wider gap-2">
                  <Camera className="w-8 h-8" />
                  Camera Feed Closed
                </div>
              )}
            </div>

            {/* ERROR STATS BAR */}
            {(cameraError || evidenceError) && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3.5 rounded-2xl flex items-start gap-2.5">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{cameraError || evidenceError}</span>
              </div>
            )}

            {/* CONTROLS (Frosted chrome area surrounding video) */}
            <div className="pt-2 flex flex-col gap-2.5">
              <div className="flex justify-center gap-2">
                {cameraState === 'off' && !imagePreview && (
                  <button onClick={startCamera} className="sc-btn-primary py-2.5 px-4 text-xs font-bold">
                    <Camera className="w-4 h-4" /> Start Device Camera
                  </button>
                )}
                {cameraState === 'on' && (
                  <button onClick={capturePhoto} className="sc-btn-primary py-2.5 px-4 text-xs font-bold bg-terra-600 hover:bg-terra-500">
                    Capture Photo
                  </button>
                )}
                {cameraState === 'captured' && (
                  <button onClick={startCamera} className="sc-btn-ghost py-2.5 px-4 text-xs font-bold border-white/[0.08]">
                    Retake Photo
                  </button>
                )}
              </div>

              {cameraState === 'off' && (
                <div className="flex flex-col items-center text-center">
                  <span className="text-charcoal-500 text-[10px] uppercase tracking-widest font-black">Or upload file</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="evidence-file-input"
                  />
                  <label
                    htmlFor="evidence-file-input"
                    className="sc-btn-ghost mt-2 py-2 px-4 text-2xs font-extrabold cursor-pointer border-white/[0.08]"
                  >
                    Select File
                  </label>
                </div>
              )}

              {imagePreview && cameraState === 'captured' && (
                <button
                  onClick={handleEvidenceSubmit}
                  disabled={isSubmittingEvidence}
                  className="sc-btn-primary w-full py-3 mt-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider"
                >
                  {isSubmittingEvidence ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                  ) : (
                    'Submit Verification Scan'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
