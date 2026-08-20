'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, X, RefreshCw, LogOut, Shield, Leaf, Loader2,
  AlertCircle, Eye, Inbox, FileText, CheckCircle2, MessageSquare
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

interface EvidenceRecord {
  id: string;
  evidence_type: 'RESIDENT_BEFORE' | 'COLLECTOR_AFTER';
  image_url: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  verification_results?: {
    id: string;
    decision: 'verified' | 'rejected' | 'needs_review';
    confidence_score: number;
    analysis: string;
    verified_at: string;
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

export const MunicipalityDashboard: React.FC = () => {
  const router = useRouter();

  // User states
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Data states
  const [requests, setRequests] = useState<CollectionRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Modal / Action states
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeActionReqId, setActiveActionReqId] = useState<string | null>(null);
  const [actionDecision, setActionDecision] = useState<'verified' | 'rejected' | null>(null);
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
          verification_results (
            id,
            decision,
            confidence_score,
            analysis,
            verified_at
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
            verification_results: beforeEvidence.verification_results as any
          } : undefined,
          afterEvidence: afterEvidence ? {
            id: afterEvidence.id,
            evidence_type: 'COLLECTOR_AFTER',
            image_url: afterEvidence.image_url,
            verification_status: afterEvidence.verification_status as any,
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

  useEffect(() => {
    if (profile) {
      fetchCollectedRequests();
    }
  }, [profile]);

  // 3. Handle Sign Out
  const handleSignOut = async () => {
    await supabaseBrowserClient.auth.signOut();
    router.push('/auth/login');
  };

  // 4. Submit manual verification decision
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
              className="flex items-center justify-center gap-1.5 py-2 px-3.5 border border-slate-200 dark:border-slate-800 hover:border-rose-500/30 hover:bg-rose-500/5 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-450 rounded-xl text-xs font-semibold transition-all cursor-pointer"
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
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-850 dark:from-white dark:to-slate-250 bg-clip-text text-transparent">
              Manual Verification Dashboard
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Review collected requests that triggered automated safety flags or require final approvals before point rewards.
            </p>
          </div>
          <button
            onClick={fetchCollectedRequests}
            disabled={loadingRequests}
            className="flex items-center justify-center gap-1.5 py-2 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl text-xs font-bold shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingRequests ? 'animate-spin' : ''}`} />
            Refresh List
          </button>
        </div>

        {/* Requests Render Logic */}
        {requestsError && (
          <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 p-4 flex gap-3 text-rose-700 dark:text-rose-300 max-w-2xl">
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
              There are currently no collection requests flagged or awaiting manual verification in the system.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {requests.map((req) => {
              // Extract Gemini assessment from afterEvidence verification results
              const geminiRes = req.afterEvidence?.verification_results?.[0];
              const score = geminiRes?.confidence_score ?? 0;

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

                  {/* Right Gemini Assessment & Actions Column */}
                  <div className="flex-1.5 min-w-[280px] bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-2xs font-bold text-slate-450 uppercase tracking-wider">Gemini Automated Report</span>

                        {/* Status Badge */}
                        {geminiRes ? (
                          <span className={`text-3xs font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                            geminiRes.decision === 'verified'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10'
                              : geminiRes.decision === 'rejected'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-450 border-rose-500/10'
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

                      {/* Score Indicator */}
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
                          <span className="text-2xs font-extrabold text-slate-650 dark:text-slate-400">{score}% Conf.</span>
                        </div>
                      )}

                      {/* Assessment details */}
                      <p className="text-2xs leading-relaxed text-slate-500 dark:text-slate-450 mt-4 italic bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-xl p-3">
                        {geminiRes?.analysis || 'No automated assessment analysis was generated for this request.'}
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
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 border border-rose-200 dark:border-rose-800 hover:border-rose-500 hover:bg-rose-500/5 text-rose-700 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-450 text-xs font-bold rounded-xl active:scale-[0.98] transition-all cursor-pointer"
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
