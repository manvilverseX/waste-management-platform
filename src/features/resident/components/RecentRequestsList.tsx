'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { CollectionStatus, CollectionRequestDTO } from '@/types';
import confetti from 'canvas-confetti';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Truck,
  Package,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  Info,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export const RecentRequestsList: React.FC = () => {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [requests, setRequests] = useState<CollectionRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedVerification, setExpandedVerification] = useState<{
    analysis: string;
    decision: 'verified' | 'rejected' | 'needs_review';
  } | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(false);

  useEffect(() => {
    if (!selectedRequestId) {
      setExpandedVerification(null);
      return;
    }

    let active = true;
    const fetchVerification = async () => {
      setLoadingVerification(true);
      try {
        const { data: evidence, error: fetchErr } = await supabaseBrowserClient
          .from('evidence')
          .select(`
            id,
            verification_results (
              id,
              decision,
              analysis,
              verified_at
            )
          `)
          .eq('collection_request_id', selectedRequestId)
          .eq('evidence_type', 'COLLECTOR_AFTER')
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (active && evidence && evidence.verification_results) {
          const results = Array.isArray(evidence.verification_results)
            ? evidence.verification_results
            : [evidence.verification_results];

          if (results.length > 0) {
            const sorted = [...results].sort((a, b) =>
              new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime()
            );
            setExpandedVerification({
              analysis: sorted[0].analysis,
              decision: sorted[0].decision
            });
          } else {
            setExpandedVerification(null);
          }
        } else {
          setExpandedVerification(null);
        }
      } catch (err) {
        console.error('Error fetching verification details:', err);
        if (active) setExpandedVerification(null);
      } finally {
        if (active) setLoadingVerification(false);
      }
    };

    fetchVerification();
    return () => {
      active = false;
    };
  }, [selectedRequestId]);

  useEffect(() => {
    if (!selectedRequestId) return;
    const req = requests.find(r => r.id === selectedRequestId);
    if (req && req.status === 'VERIFIED') {
      confetti({
        particleCount: 140,
        spread: 85,
        origin: { y: 0.6 }
      });
    }
  }, [selectedRequestId, requests]);

  const formatVerificationAnalysis = (analysisText: string): string => {
    if (!analysisText) return 'No detailed explanation was provided.';

    if (analysisText.includes('Gemini Analysis:')) {
      const reasoningIndex = analysisText.indexOf('Reasoning:');
      if (reasoningIndex !== -1) {
        return analysisText.substring(reasoningIndex + 10).trim();
      }
      if (analysisText.includes('Automated check failed:')) {
        return 'The uploaded before and after images appear to be identical. Verification could not confirm collection.';
      }
      return 'The automated verification scan flagged anomalies in the evidence photos. Awaiting manual confirmation.';
    }

    return analysisText;
  };

  useEffect(() => {
    setIsMounted(true);

    let active = true;
    let fallbackTimeout: NodeJS.Timeout;

    const fetchRequests = async (session: any) => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/collection-requests', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData?.error?.message || 'Failed to fetch collection requests.');
        }

        const result = await res.json();
        if (active) {
          setRequests(result.data || []);
        }
      } catch (err: any) {
        console.error(err);
        if (active) {
          setError(err.message || 'An unexpected error occurred.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabaseBrowserClient.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (session) {
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        fetchRequests(session);
      } else {
        const isDevLoginEnabled = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN_IN_PROD === 'true';
        if (!isDevLoginEnabled) {
          setError('You must be logged in to view your history.');
          setLoading(false);
        } else {
          if (!fallbackTimeout) {
            fallbackTimeout = setTimeout(async () => {
              if (active) {
                const { data: { session: currentSession } } = await supabaseBrowserClient.auth.getSession();
                if (!currentSession) {
                  setError('You must be logged in to view your history.');
                  setLoading(false);
                }
              }
            }, 5000);
          }
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
    };
  }, []);

  const getStatusDetails = (status: CollectionStatus) => {
    switch (status) {
      case 'VERIFIED':
        return {
          pillClass: 'sc-pill sc-pill-verified',
          icon: <CheckCircle2 className="w-3 h-3" />,
          label: 'Verified'
        };
      case 'COLLECTED':
        return {
          pillClass: 'sc-pill sc-pill-collected',
          icon: <Package className="w-3 h-3" />,
          label: 'Verification Scan'
        };
      case 'ASSIGNED':
        return {
          pillClass: 'sc-pill sc-pill-assigned',
          icon: <Truck className="w-3 h-3" />,
          label: 'Assigned'
        };
      case 'PENDING':
        return {
          pillClass: 'sc-pill sc-pill-pending',
          icon: <Clock className="w-3 h-3 animate-pulse" />,
          label: 'Pending'
        };
      case 'REJECTED':
        return {
          pillClass: 'sc-pill sc-pill-rejected',
          icon: <XCircle className="w-3 h-3" />,
          label: 'Rejected'
        };
      default:
        return {
          pillClass: 'sc-pill sc-pill-pending',
          icon: <AlertTriangle className="w-3 h-3" />,
          label: 'Cancelled'
        };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-charcoal-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-forest-500" />
        <span className="text-3xs uppercase tracking-widest font-bold">Loading collection history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-300">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">Failed to load history</span>
          <p className="text-2xs mt-0.5 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="sc-empty rounded-3xl p-8 text-center text-charcoal-500">
        <Package className="w-8 h-8 text-charcoal-700 mx-auto mb-3" />
        <p className="text-xs font-bold text-white">No collection requests found</p>
        <p className="text-2xs text-charcoal-400 mt-1">Submit your first waste collection request using the button above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => {
        const { pillClass, icon, label } = getStatusDetails(request.status);
        const isExpanded = selectedRequestId === request.id;

        return (
          <div
            key={request.id}
            className="sc-card overflow-hidden transition-all duration-200"
          >
            {/* List Row Header */}
            <div
              onClick={() => setSelectedRequestId(isExpanded ? null : request.id)}
              className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/5 text-charcoal-300 rounded-xl border border-white/[0.04]">
                  <Layers className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-3xs font-bold text-charcoal-500">ID: {request.id}</span>
                    <span className={pillClass}>
                      {icon}
                      {label}
                    </span>
                  </div>
                  <span className="text-3xs text-charcoal-400 block mt-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-charcoal-500" />
                    Requested: {isMounted ? new Date(request.requestedAt).toLocaleString() : ''}
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-charcoal-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </div>

            {/* Expandable details panel */}
            {isExpanded && (
              <div className="px-5 pb-5 pt-2 border-t border-white/[0.04] bg-black/10 space-y-4 text-xs sc-anim-fade-up">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-charcoal-500 block text-3xs uppercase tracking-wider font-bold">Location</span>
                    <span className="font-bold text-charcoal-200">{request.communityName}</span>
                  </div>
                  <div>
                    <span className="text-charcoal-500 block text-3xs uppercase tracking-wider font-bold">Completed Time</span>
                    <span className="font-bold text-charcoal-200">
                      {request.completedAt ? (isMounted ? new Date(request.completedAt).toLocaleString() : '') : 'N/A'}
                    </span>
                  </div>
                </div>

                {request.status === 'VERIFIED' && (
                  <div className="p-4 bg-gradient-to-br from-forest-900/40 to-emerald-950/20 border-2 border-forest-500/40 rounded-3xl flex flex-col sm:flex-row items-center gap-4 sc-anim-scale-in text-center sm:text-left relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-forest-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="h-14 w-14 rounded-full bg-forest-600/20 border border-forest-500/30 flex items-center justify-center text-3xl shrink-0 animate-bounce">
                      ✨
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="font-black text-sm text-forest-400 block tracking-tight">Eco-Task Verified! Awesome Job!</span>
                      <p className="text-charcoal-300 text-3xs leading-relaxed max-w-lg">
                        Our AI agent scanned the evidence photos and successfully confirmed the waste was cleaned. You are helping make our city greener!
                      </p>
                    </div>
                    <div className="bg-forest-900/30 border border-forest-500/30 py-2.5 px-4 rounded-2xl flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] text-forest-400 uppercase tracking-widest font-black">Rewarded</span>
                      <span className="text-sm font-black text-white mt-0.5 animate-pulse">+100.00 pts</span>
                    </div>
                  </div>
                )}

                {request.status === 'COLLECTED' && (
                  <div className="space-y-2">
                    <div className="p-3 bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 rounded-2xl flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-[#0EA5E9] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-[#7DD3FC] block">Under Verification Scan</span>
                        <p className="text-charcoal-400 text-3xs mt-0.5 leading-relaxed">
                          Garbage cleanup has been logged. Automated verification checks are running. points will update upon verification success.
                        </p>
                      </div>
                    </div>

                    {!loadingVerification && expandedVerification && expandedVerification.decision === 'needs_review' && (
                      <div className="p-3 bg-marigold-500/10 border border-marigold-500/20 rounded-2xl space-y-1">
                        <span className="font-bold text-marigold-400 block flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-marigold-400" />
                          Verification Progress Details
                        </span>
                        <p className="text-charcoal-400 text-3xs leading-relaxed font-semibold">
                          {formatVerificationAnalysis(expandedVerification.analysis)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {request.status === 'REJECTED' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-1 sc-anim-fade-up">
                    <span className="font-bold text-rose-450 block">Why was this rejected?</span>
                    <p className="text-charcoal-400 text-3xs leading-relaxed font-semibold font-bold">
                      {loadingVerification ? (
                        <span className="flex items-center gap-1.5 text-charcoal-550">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Retrieving verification details...
                        </span>
                      ) : expandedVerification ? (
                        formatVerificationAnalysis(expandedVerification.analysis)
                      ) : (
                        'The uploaded evidence photos did not meet the validation requirements.'
                      )}
                    </p>
                  </div>
                )}

                {request.status === 'PENDING' && (
                  <div className="p-3 bg-white/5 border border-white/[0.04] rounded-2xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-charcoal-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-charcoal-200 block">Awaiting Collector Assignment</span>
                      <p className="text-charcoal-400 text-3xs mt-0.5 leading-relaxed">
                        A collector will claim and pick up this collection ticket shortly. You can track status steps here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
