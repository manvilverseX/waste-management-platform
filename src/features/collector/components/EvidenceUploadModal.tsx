'use client';

import React, { useState } from 'react';
import { CollectionRequestDTO, VerificationResultDTO } from '@/types';
import { X, Upload, Sparkles, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  request: CollectionRequestDTO;
  onClose: () => void;
  onSuccess: () => void;
}

export const EvidenceUploadModal: React.FC<Props> = ({ request, onClose, onSuccess }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResultDTO | null>(null);

  const handleSubmitAndVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim()) {
      setErrorMsg('Please enter a valid image URL for evidence.');
      return;
    }

    setErrorMsg(null);
    setIsUploading(true);

    try {
      // 1. Submit collector evidence photo
      const evidenceRes = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionRequestId: request.id,
          evidenceType: 'COLLECTOR_AFTER',
          imageUrl: imageUrl.trim()
        })
      });

      const evidenceData = await evidenceRes.json();
      if (!evidenceData.success) {
        throw new Error(evidenceData.error?.message || 'Failed to upload evidence');
      }

      setIsUploading(false);
      setIsVerifying(true);

      // 2. Automatically trigger server-side Gemini AI verification
      const verifyRes = await fetch(`/api/verification/${request.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const verifyData = await verifyRes.json();
      setIsVerifying(false);

      if (!verifyData.success) {
        setErrorMsg(verifyData.error?.message || 'AI Verification encountered an issue.');
      } else {
        setVerificationResult(verifyData.data);
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }

    } catch (err: any) {
      console.error('[Upload/Verify Error]:', err);
      setErrorMsg(err.message || 'An error occurred during submission.');
      setIsUploading(false);
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Upload className="w-5 h-5 text-emerald-600" /> Complete Collection & Upload Evidence
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          Provide photo evidence after collection for AI verification.
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {verificationResult ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-slate-900 dark:text-white space-y-2">
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <CheckCircle className="w-5 h-5" />
              <span>Verification Completed ({verificationResult.decision.toUpperCase()})</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <strong>Confidence Score:</strong> {verificationResult.confidenceScore}%
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <strong>AI Analysis:</strong> {verificationResult.analysis}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmitAndVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Collector After-Collection Image URL
              </label>
              <input
                type="url"
                required
                placeholder="https://images.unsplash.com/photo-..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Paste a public URL of the cleaned area photo.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading || isVerifying}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading || isVerifying}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                {isUploading || isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isUploading ? 'Uploading...' : 'Verifying with Gemini AI...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Submit & Verify
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
