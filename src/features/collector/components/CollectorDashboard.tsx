'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CollectionBatchDTO, CollectionRequestDTO } from '@/types';
import { CollectionRequestCard } from './CollectionRequestCard';
import { EvidenceUploadModal } from './EvidenceUploadModal';
import { Truck, RefreshCw, Layers, CheckCircle2, Clock, PackageCheck, Filter, AlertTriangle, Plus, Camera, Check } from 'lucide-react';

export const CollectorDashboard: React.FC = () => {
  const [requests, setRequests] = useState<CollectionRequestDTO[]>([]);
  const [batches, setBatches] = useState<CollectionBatchDTO[]>([]);
  const [activeBatch, setActiveBatch] = useState<CollectionBatchDTO | null>(null);
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [isAddingToBatch, setIsAddingToBatch] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

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
    } flex: {
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
  }, [fetchRequests, fetchBatches]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const url = activeFilter === 'ALL' 
          ? '/api/collection-requests' 
          : `/api/collection-requests?status=${activeFilter}`;

        const [reqRes, batchRes] = await Promise.all([
          fetch(url),
          fetch('/api/collection-batches')
        ]);

        const reqJson = await reqRes.json();
        const batchJson = await batchRes.json();

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
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to fetch dashboard data:', err);
          const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
          setErrorMessage(msg);
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [activeFilter]);

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

  // Statistics calculation
  const totalCount = requests.length;
  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'WASTE_READY').length;
  const assignedCount = requests.filter(r => r.status === 'ASSIGNED').length;
  const verifiedCount = requests.filter(r => r.status === 'VERIFIED').length;
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
            Manage authorized collection runs, batch household evidence, and upload vehicle proof.
          </p>
        </div>

        <button
          onClick={refreshAll}
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
    </div>
  );
};
