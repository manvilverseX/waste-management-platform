'use client';

import React, { useState, useEffect } from 'react';
import { CollectionStatus, CollectionRequestDTO } from '@/types';
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

    // Listen for auth state change
    const { data: { subscription } } = supabaseBrowserClient.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (session) {
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        fetchRequests(session);
      } else {
        // If there's no session, check if we should wait for dev auto-login
        const isDevLoginEnabled = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN_IN_PROD === 'true';
        if (!isDevLoginEnabled) {
          setError('You must be logged in to view your history.');
          setLoading(false);
        } else {
          // If dev-login is enabled, we wait for the auth state change to occur.
          // Set a fallback timeout in case the dev-login endpoint fails or is misconfigured.
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
          color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          label: 'Verified'
        };
      case 'COLLECTED':
        return {
          color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
          icon: <Package className="w-3.5 h-3.5" />,
          label: 'Collected'
        };
      case 'ASSIGNED':
        return {
          color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
          icon: <Truck className="w-3.5 h-3.5" />,
          label: 'Assigned'
        };
      case 'PENDING':
        return {
          color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
          icon: <Clock className="w-3.5 h-3.5 animate-pulse" />,
          label: 'Pending'
        };
      case 'REJECTED':
        return {
          color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
          icon: <XCircle className="w-3.5 h-3.5" />,
          label: 'Rejected'
        };
      default:
        return {
          color: 'text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/20',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          label: 'Cancelled'
        };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-450 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="text-xs font-medium">Loading collection history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl text-xs text-rose-600 dark:text-rose-400">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 animate-bounce" />
        <div>
          <span className="font-bold block">Failed to load history</span>
          <p className="text-2xs mt-0.5 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 text-center text-slate-500 dark:text-slate-450">
        <Package className="w-8 h-8 text-slate-350 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No collection requests found</p>
        <p className="text-2xs text-slate-450 dark:text-slate-550 mt-1">Submit your first waste collection request using the button above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => {
        const { color, icon, label } = getStatusDetails(request.status);
        const isExpanded = selectedRequestId === request.id;

        return (
          <div 
            key={request.id} 
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          >
            {/* List Row Header */}
            <div 
              onClick={() => setSelectedRequestId(isExpanded ? null : request.id)}
              className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer select-none"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-400">ID: {request.id}</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold border ${color}`}>
                      {icon}
                      {label}
                    </span>
                  </div>
                  <span className="text-2xs text-slate-500 dark:text-slate-400 block mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Requested on: {isMounted ? new Date(request.requestedAt).toLocaleString() : ''}
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </div>

            {/* Expandable details panel */}
            {isExpanded && (
              <div className="px-5 pb-5 pt-1 border-t border-slate-50 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Location</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{request.communityName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Completed Time</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {request.completedAt ? (isMounted ? new Date(request.completedAt).toLocaleString() : '') : 'N/A'}
                    </span>
                  </div>
                </div>

                {request.status === 'VERIFIED' && (
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <span className="font-bold text-emerald-700 dark:text-emerald-450 block">AI Verified Clean!</span>
                      <p className="text-slate-500 dark:text-slate-400 text-2xs mt-0.5 leading-relaxed">
                        The AI agent compared the BEFORE and AFTER images and verified successful garbage collection. Reward points have been credited to your profile.
                      </p>
                    </div>
                  </div>
                )}

                {request.status === 'PENDING' && (
                  <div className="p-3 bg-slate-100 dark:bg-slate-800/60 rounded-xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-slate-550 dark:text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">Awaiting Collector Assignment</span>
                      <p className="text-slate-500 dark:text-slate-400 text-2xs mt-0.5 leading-relaxed">
                        A waste collector agent will be assigned to your request shortly. You can track progress right here.
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
