'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CollectionBatchDTO, CollectionRequestDTO, CollectorMetricsDTO } from '@/types';
import { CollectionRequestCard } from './CollectionRequestCard';
import { EvidenceUploadModal } from './EvidenceUploadModal';
import { ReviewQueueModal } from '@/features/verification/components/ReviewQueueModal';
import {
  Truck,
  RefreshCw,
  Layers,
  CheckCircle2,
  PackageCheck,
  Filter,
  AlertTriangle,
  Plus,
  Camera,
  Check,
  ShieldCheck,
  BarChart3,
  Calendar,
  FileCheck,
  Timer,
} from 'lucide-react';

export const CollectorDashboard: React.FC = () => {
  const [requests, setRequests] = useState<CollectionRequestDTO[]>([]);
  const [batches, setBatches] = useState<CollectionBatchDTO[]>([]);
  const [activeBatch, setActiveBatch] = useState<CollectionBatchDTO | null>(null);
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [isAddingToBatch, setIsAddingToBatch] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [isReviewQueueOpen, setIsReviewQueueOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  // Metrics State
  const [metrics, setMetrics] = useState<CollectorMetricsDTO | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsRange, setMetricsRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');

  // Fetch Collector Performance Metrics
  const fetchMetrics = useCallback(async (range = metricsRange) => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const res = await fetch(`/api/collector/metrics?range=${range}`);
      const json = await res.json();
      if (json.success && json.data) {
        setMetrics(json.data);
      } else {
        setMetrics(null);
        setMetricsError(json.error?.message || 'Unable to load performance metrics.');
      }
    } catch (err: unknown) {
      console.error('Failed to fetch metrics:', err);
      const msg = err instanceof Error ? err.message : 'Unable to load performance metrics.';
      setMetricsError(msg);
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, [metricsRange]);

  // Fetch Collection Requests
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

  // Fetch Collector Batches
  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/collection-batches');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setBatches(json.data);
        // Find active uncompleted batch if available
        const currentActive = json.data.find(
          (b: CollectionBatchDTO) => b.status === 'CREATED' || b.status === 'COLLECTING' || b.status === 'READY_FOR_VEHICLE_EVIDENCE'
        );
        setActiveBatch(currentActive || null);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch batches:', err);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchRequests();
    fetchBatches();
    fetchMetrics(metricsRange);
  }, [fetchRequests, fetchBatches, fetchMetrics, metricsRange]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const url = activeFilter === 'ALL' 
          ? '/api/collection-requests' 
          : `/api/collection-requests?status=${activeFilter}`;

        const [reqRes, batchRes, metricsRes] = await Promise.all([
          fetch(url),
          fetch('/api/collection-batches'),
          fetch(`/api/collector/metrics?range=${metricsRange}`)
        ]);

        const reqJson = await reqRes.json();
        const batchJson = await batchRes.json();
        const metricsJson = await metricsRes.json();

        if (!ignore) {
          if (reqJson.success && Array.isArray(reqJson.data)) {
            setRequests(reqJson.data);
          }
          if (batchJson.success && Array.isArray(batchJson.data)) {
            setBatches(batchJson.data);
            const currentActive = batchJson.data.find(
              (b: CollectionBatchDTO) => b.status === 'CREATED' || b.status === 'COLLECTING' || b.status === 'READY_FOR_VEHICLE_EVIDENCE'
            );
            setActiveBatch(currentActive || null);
          }
          if (metricsJson.success && metricsJson.data) {
            setMetrics(metricsJson.data);
            setMetricsError(null);
          } else {
            setMetrics(null);
            setMetricsError(metricsJson.error?.message || 'Unable to load performance metrics.');
          }
          setLoading(false);
          setMetricsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to fetch dashboard data:', err);
          const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
          setErrorMessage(msg);
          setLoading(false);
          setMetricsLoading(false);
        }
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [activeFilter, metricsRange]);

  // Create Collection Batch Handler
  const handleCreateBatch = async () => {
    setIsCreatingBatch(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/collection-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await res.json();
      if (json.success) {
        setActiveBatch(json.data);
        refreshAll();
      } else {
        setErrorMessage(json.error?.message || 'Failed to create collection batch.');
      }
    } catch (err: unknown) {
      console.error('Create batch error:', err);
      const msg = err instanceof Error ? err.message : 'Error creating collection batch';
      setErrorMessage(msg);
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Toggle selection of eligible request for batch inclusion
  const handleToggleSelectForBatch = (id: string) => {
    setSelectedForBatch((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Add selected requests to active batch
  const handleAddSelectedToBatch = async () => {
    if (!activeBatch || selectedForBatch.length === 0) return;

    setIsAddingToBatch(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/collection-batches/${activeBatch.id}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestIds: selectedForBatch })
      });

      const json = await res.json();
      if (json.success) {
        setSelectedForBatch([]);
        refreshAll();
      } else {
        setErrorMessage(json.error?.message || 'Failed to add requests to collection batch.');
      }
    } catch (err: unknown) {
      console.error('Add to batch error:', err);
      const msg = err instanceof Error ? err.message : 'Error adding requests to batch';
      setErrorMessage(msg);
    } finally {
      setIsAddingToBatch(false);
    }
  };

  const handleRangeChange = (range: 'today' | '7d' | '30d' | 'all') => {
    setMetricsRange(range);
  };

  const eligibleForBatchRequests = requests.filter(r => (r.status === 'PICKUP_EVIDENCE_SUBMITTED' || r.status === 'COLLECTED') && !r.collectionBatchId);

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
            Manage authorized collection runs, batch household evidence, and track performance metrics.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => setIsReviewQueueOpen(true)}
            className="px-4 py-2 text-sm font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl hover:bg-amber-500/20 flex items-center gap-2 shadow-xs transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            Review Queue (NEEDS_REVIEW)
          </button>

          <button
            onClick={refreshAll}
            disabled={loading || metricsLoading}
            className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading || metricsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Collection Batch Management Section */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Physical Collection Run ({batches.length} Total Batches)</span>
            <h2 className="text-xl font-bold flex items-center gap-2 mt-0.5">
              <Layers className="w-5 h-5 text-indigo-400" />
              {activeBatch ? `Active Batch: ${activeBatch.id.slice(0, 8)}...` : 'No Active Collection Batch'}
            </h2>
          </div>

          {!activeBatch ? (
            <button
              onClick={handleCreateBatch}
              disabled={isCreatingBatch}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs flex items-center gap-2 shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isCreatingBatch ? 'Creating Batch...' : 'Start New Collection Batch'}
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedForBatch.length > 0 && (
                <button
                  onClick={handleAddSelectedToBatch}
                  disabled={isAddingToBatch}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-xs flex items-center gap-1.5 shadow-md transition-colors"
                >
                  <Check className="w-4 h-4" />
                  {isAddingToBatch ? 'Adding...' : `Add ${selectedForBatch.length} Selected to Batch`}
                </button>
              )}

              <button
                onClick={() => setShowVehicleModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold text-xs flex items-center gap-2 shadow-md transition-colors"
              >
                <Camera className="w-4 h-4" />
                Submit Batch Vehicle Evidence
              </button>
            </div>
          )}
        </div>

        {activeBatch && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
              <span className="text-slate-400 block font-medium">Batch Status</span>
              <span className="font-bold text-indigo-300 text-sm mt-0.5 block">{activeBatch.status}</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
              <span className="text-slate-400 block font-medium">Requests in Batch</span>
              <span className="font-bold text-emerald-400 text-sm mt-0.5 block">{activeBatch.requestCount || 0} Household Requests</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
              <span className="text-slate-400 block font-medium">Eligible Unbatched Requests</span>
              <span className="font-bold text-amber-400 text-sm mt-0.5 block">{eligibleForBatchRequests.length} Ready to Add</span>
            </div>
          </div>
        )}
      </div>

      {/* Collector Performance & Operational Metrics Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              Collector Performance & Operational Metrics
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Descriptive metrics derived strictly from actual platform activity.
            </p>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
            <Calendar className="w-4 h-4 text-slate-400 ml-2 mr-1" />
            {[
              { id: 'today', label: 'TODAY' },
              { id: '7d', label: '7 DAYS' },
              { id: '30d', label: '30 DAYS' },
              { id: 'all', label: 'ALL TIME' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => handleRangeChange(r.id as 'today' | '7d' | '30d' | 'all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  metricsRange === r.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Metrics Content States */}
        {metricsLoading ? (
          <div className="py-8 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
            <p className="text-xs">Loading performance metrics...</p>
          </div>
        ) : metricsError ? (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{metricsError}</span>
          </div>
        ) : !metrics || (metrics.collections.assigned === 0 && metrics.batches.created === 0) ? (
          <div className="py-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            <PackageCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No collection activity for this period.</p>
            <p className="text-xs text-slate-400 mt-0.5">Try selecting a broader date range or completing collection tasks.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Grid of Key Performance Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* Card 1: Total Assigned & Completion Rate */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Collections</span>
                  <Layers className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  {metrics.collections.completed} <span className="text-xs font-normal text-slate-400">/ {metrics.collections.assigned}</span>
                </div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                  {Math.round(metrics.collections.completionRate * 100)}% Completion Rate
                </div>
              </div>

              {/* Card 2: Verification Success */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Verification Rate</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {Math.round(metrics.verification.verificationSuccessRate * 100)}%
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                  {metrics.verification.verified} Verified | {metrics.verification.rejected} Rejected
                </div>
              </div>

              {/* Card 3: Needs Review */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Needs Review</span>
                  <ShieldCheck className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                  {metrics.verification.needsReview}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                  {Math.round(metrics.verification.reviewRate * 100)}% Manual Review Rate
                </div>
              </div>

              {/* Card 4: Manual Review Outcomes */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Manual Reviews</span>
                  <FileCheck className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                  {metrics.review.reviewsCompleted}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                  {metrics.review.manualApprovalCount} Approved | {metrics.review.manualRejectionCount} Rejected
                </div>
              </div>

              {/* Card 5: Collection Batches */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Batches</span>
                  <Truck className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-xl font-black text-purple-600 dark:text-purple-400">
                  {metrics.batches.created}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                  Avg {metrics.batches.averageRequestsPerBatch} reqs / completed batch
                </div>
              </div>

              {/* Card 6: Evidence Compliance */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Evidence Compliance</span>
                  <Camera className="w-4 h-4 text-teal-500" />
                </div>
                <div className="text-xl font-black text-teal-600 dark:text-teal-400">
                  {Math.round(metrics.evidence.complianceRate * 100)}%
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                  {metrics.evidence.pickupSubmitted} Pickup | {metrics.evidence.vehicleSubmitted} Vehicle
                </div>
              </div>
            </div>

            {/* Timing Operational Metrics Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-3 p-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl">
                <Timer className="w-5 h-5 text-indigo-500 shrink-0" />
                <div>
                  <span className="text-slate-400 font-medium block">Avg Pickup → Vehicle Evidence</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    {metrics.timing.averagePickupToVehicleMinutes !== null
                      ? `${metrics.timing.averagePickupToVehicleMinutes} minutes`
                      : 'N/A (Insufficient data)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl">
                <Timer className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <span className="text-slate-400 font-medium block">Avg Vehicle → Verification Result</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    {metrics.timing.averageVehicleToVerificationMinutes !== null
                      ? `${metrics.timing.averageVehicleToVerificationMinutes} minutes`
                      : 'N/A (Insufficient data)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl">
                <Timer className="w-5 h-5 text-purple-500 shrink-0" />
                <div>
                  <span className="text-slate-400 font-medium block">Avg Overall Collection Duration</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    {metrics.timing.averageOverallCompletionMinutes !== null
                      ? `${metrics.timing.averageOverallCompletionMinutes} minutes`
                      : 'N/A (Insufficient data)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        <Filter className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
        {['ALL', 'PENDING', 'WASTE_READY', 'ASSIGNED', 'PICKUP_EVIDENCE_SUBMITTED', 'VEHICLE_EVIDENCE_SUBMITTED', 'VERIFICATION_IN_PROGRESS', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED'].map((status) => (
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
          {requests.map((req) => {
            const isEligibleForActiveBatch = activeBatch && (req.status === 'PICKUP_EVIDENCE_SUBMITTED' || req.status === 'COLLECTED') && !req.collectionBatchId;
            return (
              <CollectionRequestCard
                key={req.id}
                request={req}
                onRefresh={refreshAll}
                selectableForBatch={Boolean(isEligibleForActiveBatch)}
                isSelectedForBatch={selectedForBatch.includes(req.id)}
                onToggleSelectForBatch={handleToggleSelectForBatch}
              />
            );
          })}
        </div>
      )}

      {/* Vehicle Evidence Modal */}
      {showVehicleModal && activeBatch && (
        <EvidenceUploadModal
          batchId={activeBatch.id}
          evidenceType="VEHICLE"
          onClose={() => setShowVehicleModal(false)}
          onSuccess={() => {
            setShowVehicleModal(false);
            refreshAll();
          }}
        />
      )}

      {/* Manual Review Queue Modal */}
      <ReviewQueueModal
        isOpen={isReviewQueueOpen}
        onClose={() => setIsReviewQueueOpen(false)}
        onQueueUpdated={refreshAll}
      />
    </div>
  );
};
