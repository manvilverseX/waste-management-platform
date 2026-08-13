'use client';

import React, { useState } from 'react';
import { CollectionRequestDTO, VerificationResultDTO } from '@/types';
import { VerificationStatusBadge } from './VerificationStatusBadge';
import { EvidenceUploadModal } from './EvidenceUploadModal';
import { MapPin, User, Calendar, Camera, Sparkles, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface Props {
  request: CollectionRequestDTO;
  onRefresh: () => void;
}

export const CollectionRequestCard: React.FC<Props> = ({ request, onRefresh }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResultDTO | null>(null);
  const [isLoadingAiResult, setIsLoadingAiResult] = useState(false);

  const handleAssignToMe = async () => {
    setIsUpdatingStatus(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/collection-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ASSIGNED' })
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        setErrorMessage(data.error?.message || 'Failed to assign request.');
      }
    } catch (err: unknown) {
      console.error('Failed to assign request:', err);
      const msg = err instanceof Error ? err.message : 'Network error updating request.';
      setErrorMessage(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const fetchAiResult = async () => {
    setIsLoadingAiResult(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/verification/${request.id}`);
      const data = await res.json();
      if (data.success) {
        setVerificationResult(data.data);
      } else {
        setErrorMessage(data.error?.message || 'Failed to retrieve AI verification details.');
      }
    } catch (err: unknown) {
      console.error('Failed to fetch verification result:', err);
      const msg = err instanceof Error ? err.message : 'Error fetching verification data.';
      setErrorMessage(msg);
    } finally {
      setIsLoadingAiResult(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs font-semibold text-slate-400">
            ID: {request.id.slice(0, 8)}...
          </span>
          <VerificationStatusBadge status={request.status} />
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <User className="w-4 h-4 text-slate-400" />
            <span>{request.residentName || 'Resident User'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <MapPin className="w-4 h-4 text-emerald-500" />
            <span>{request.communityName || 'Community Location'}</span>
          </div>
          {request.collectorName && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              <User className="w-3.5 h-3.5" />
              <span>Assigned Collector: {request.collectorName}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>Requested: {new Date(request.requestedAt).toLocaleString()}</span>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-3 p-2 rounded.lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Action Buttons derived from Request State Machine */}
      <div className="flex items-center flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        {(request.status === 'PENDING' || request.status === 'WASTE_READY') && (
          <button
            onClick={handleAssignToMe}
            disabled={isUpdatingStatus}
            className="px-3.5 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            {isUpdatingStatus ? 'Assigning...' : 'Assign to Me'}
          </button>
        )}

        {request.status === 'ASSIGNED' && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            Upload Evidence & Verify
          </button>
        )}

        {request.status === 'VERIFICATION_IN_PROGRESS' && (
          <span className="text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1.5 py-1">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            Verification in progress...
          </span>
        )}

        {(request.status === 'VERIFIED' || request.status === 'REJECTED' || request.status === 'NEEDS_REVIEW' || request.status === 'COLLECTED' || request.status === 'PICKUP_EVIDENCE_SUBMITTED') && (
          <button
            onClick={fetchAiResult}
            disabled={isLoadingAiResult}
            className="px-3 py-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isLoadingAiResult ? 'Loading AI Result...' : 'View AI Verification'}
          </button>
        )}
      </div>

      {/* Display AI Verification Details inline if fetched */}
      {verificationResult && (
        <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
          <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
            <span className="flex items-center gap-1">
              {verificationResult.decision === 'verified' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500" />
              )}
              AI Decision: {verificationResult.decision.toUpperCase()}
            </span>
            <span className="text-slate-500">{verificationResult.confidenceScore}% confidence</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300">{verificationResult.analysis}</p>
        </div>
      )}

      {showUploadModal && (
        <EvidenceUploadModal
          request={request}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
