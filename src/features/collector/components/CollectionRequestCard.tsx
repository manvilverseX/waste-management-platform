'use client';

import React, { useState } from 'react';
import { CollectionRequestDTO, VerificationResultDTO } from '@/types';
import { VerificationStatusBadge } from './VerificationStatusBadge';
import { EvidenceUploadModal } from './EvidenceUploadModal';
import { MapPin, User, Calendar, Camera, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  request: CollectionRequestDTO;
  onRefresh: () => void;
}

export const CollectionRequestCard: React.FC<Props> = ({ request, onRefresh }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResultDTO | null>(null);
  const [isLoadingAiResult, setIsLoadingAiResult] = useState(false);

  const handleUpdateStatus = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/collection-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const fetchAiResult = async () => {
    setIsLoadingAiResult(true);
    try {
      const res = await fetch(`/api/verification/${request.id}`);
      const data = await res.json();
      if (data.success) {
        setVerificationResult(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch verification result:', err);
    } finally {
      setIsLoadingAiResult(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
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
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Calendar className="w-4 h-4" />
          <span>Requested: {new Date(request.requestedAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        {request.status === 'PENDING' && (
          <button
            onClick={() => handleUpdateStatus('ASSIGNED')}
            disabled={isUpdatingStatus}
            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            {isUpdatingStatus ? 'Assigning...' : 'Assign to Me'}
          </button>
        )}

        {(request.status === 'ASSIGNED' || request.status === 'PENDING') && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            Upload Evidence & Verify
          </button>
        )}

        {(request.status === 'VERIFIED' || request.status === 'REJECTED' || request.status === 'COLLECTED') && (
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
