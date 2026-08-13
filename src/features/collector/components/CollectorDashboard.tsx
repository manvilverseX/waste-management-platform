'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CollectionRequestDTO } from '@/types';
import { CollectionRequestCard } from './CollectionRequestCard';
import { Truck, RefreshCw, Layers, CheckCircle2, Clock, PackageCheck, Filter, AlertTriangle } from 'lucide-react';

export const CollectorDashboard: React.FC = () => {
  const [requests, setRequests] = useState<CollectionRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const url = activeFilter === 'ALL' 
        ? '/api/collection-requests' 
        : `/api/collection-requests?status=${activeFilter}`;

      const res = await fetch(url);
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        setRequests(json.data);
      } else {
        setRequests([]);
        if (json.error?.message) {
          setErrorMessage(json.error.message);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to fetch requests:', err);
      const msg = err instanceof Error ? err.message : 'Failed to fetch collection requests';
      setErrorMessage(msg);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const url = activeFilter === 'ALL' 
          ? '/api/collection-requests' 
          : `/api/collection-requests?status=${activeFilter}`;

        const res = await fetch(url);
        const json = await res.json();

        if (!ignore) {
          if (json.success && Array.isArray(json.data)) {
            setRequests(json.data);
          } else {
            setRequests([]);
            if (json.error?.message) {
              setErrorMessage(json.error.message);
            }
          }
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to fetch requests:', err);
          const msg = err instanceof Error ? err.message : 'Failed to fetch collection requests';
          setErrorMessage(msg);
          setRequests([]);
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [activeFilter]);

  // Statistics calculation
  const totalCount = requests.length;
  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'WASTE_READY').length;
  const assignedCount = requests.filter(r => r.status === 'ASSIGNED').length;
  const verifiedCount = requests.filter(r => r.status === 'VERIFIED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Truck className="w-8 h-8 text-emerald-600" />
            Collector Dashboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage authorized waste collection requests, submit evidence, and execute state machine workflow.
          </p>
        </div>

        <button
          onClick={fetchRequests}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 shadow-xs transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Total Requests</span>
            <Layers className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{totalCount}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Pending / Ready</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">{pendingCount}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Assigned</span>
            <Truck className="w-5 h-5 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">{assignedCount}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Verified</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{verifiedCount}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        <Filter className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
        {['ALL', 'PENDING', 'WASTE_READY', 'ASSIGNED', 'PICKUP_EVIDENCE_SUBMITTED', 'VERIFICATION_IN_PROGRESS', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED'].map((status) => (
          <button
            key={status}
            onClick={() => setActiveFilter(status)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
              activeFilter === status
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Request Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-500" />
          <p className="text-sm">Loading collection requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl py-16 text-center">
          <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No Collection Requests Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            There are currently no requests matching the selected filter ({activeFilter}).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((req) => (
            <CollectionRequestCard key={req.id} request={req} onRefresh={fetchRequests} />
          ))}
        </div>
      )}
    </div>
  );
};
