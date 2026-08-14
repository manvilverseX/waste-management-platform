/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect, useState } from 'react';
import { ApiResponse, ReviewDetailDTO, VerificationResultDTO } from '@/types';

interface ReviewDetailModalProps {
  requestId: string;
  isOpen: boolean;
  onClose: () => void;
  onDecisionSubmitted: () => void;
}

export const ReviewDetailModal: React.FC<ReviewDetailModalProps> = ({
  requestId,
  isOpen,
  onClose,
  onDecisionSubmitted,
}) => {
  const [detail, setDetail] = useState<ReviewDetailDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !requestId) return;

    const fetchDetail = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/verification/review/${requestId}`);
        const data: ApiResponse<ReviewDetailDTO> = await res.json();
        if (data.success && data.data) {
          setDetail(data.data);
        } else {
          setErrorMsg(data.error?.message || 'Failed to load case detail.');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error connecting to server.';
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [isOpen, requestId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Manual review explanation reason is required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/verification/review/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });

      const response: ApiResponse<VerificationResultDTO> = await res.json();

      if (response.success) {
        onDecisionSubmitted();
        onClose();
      } else {
        setErrorMsg(response.error?.message || 'Failed to submit decision.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting review decision.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-xs">
                NEEDS_REVIEW
              </span>
              Verification Review — #{requestId.slice(0, 8)}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Resident: {detail?.request.residentName || 'N/A'} • Community: {detail?.request.communityName || 'N/A'} • Collector: {detail?.request.collectorName || 'Unassigned'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-xl font-bold px-2"
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm">Loading verification evidence context...</p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-sm">
              {errorMsg}
            </div>
          ) : (
            <>
              {/* Evidence Images Side-by-Side */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Visual Evidence Photos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Resident Before Photo */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center text-center">
                    <span className="text-xs font-semibold text-slate-300 mb-2">
                      1. Resident BEFORE
                    </span>
                    {detail?.beforeEvidence?.imageUrl ? (
                      <img
                        src={detail.beforeEvidence.imageUrl}
                        alt="Resident Before Waste"
                        className="w-full h-40 object-cover rounded-md border border-slate-800"
                      />
                    ) : (
                      <div className="w-full h-40 bg-slate-900 border border-dashed border-slate-800 rounded-md flex items-center justify-center text-xs text-slate-500">
                        Photo Missing
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 mt-2">
                      {detail?.beforeEvidence?.capturedAt
                        ? `Captured: ${new Date(detail.beforeEvidence.capturedAt).toLocaleTimeString()}`
                        : 'No timestamp'}
                    </span>
                  </div>

                  {/* Collector After Photo */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center text-center">
                    <span className="text-xs font-semibold text-slate-300 mb-2">
                      2. Collector AFTER
                    </span>
                    {detail?.afterEvidence?.imageUrl ? (
                      <img
                        src={detail.afterEvidence.imageUrl}
                        alt="Collector After Pickup"
                        className="w-full h-40 object-cover rounded-md border border-slate-800"
                      />
                    ) : (
                      <div className="w-full h-40 bg-slate-900 border border-dashed border-slate-800 rounded-md flex items-center justify-center text-xs text-slate-500">
                        Photo Missing
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 mt-2">
                      {detail?.afterEvidence?.capturedAt
                        ? `Captured: ${new Date(detail.afterEvidence.capturedAt).toLocaleTimeString()}`
                        : 'No timestamp'}
                    </span>
                  </div>

                  {/* Batch Vehicle Photo */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center text-center">
                    <span className="text-xs font-semibold text-slate-300 mb-2">
                      3. Batch VEHICLE
                    </span>
                    {detail?.vehicleEvidence?.imageUrl ? (
                      <img
                        src={detail.vehicleEvidence.imageUrl}
                        alt="Batch Vehicle Evidence"
                        className="w-full h-40 object-cover rounded-md border border-slate-800"
                      />
                    ) : (
                      <div className="w-full h-40 bg-slate-900 border border-dashed border-slate-800 rounded-md flex items-center justify-center text-xs text-slate-500">
                        Vehicle Photo Missing
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 mt-2">
                      {detail?.batch?.id
                        ? `Batch: ${detail.batch.id.slice(0, 8)}`
                        : 'Unbatched'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hard Evidence Checks */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Hard Evidence Automated Checks
                </h3>
                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400">
                        <th className="py-2 px-3">Check Name</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Details / Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {detail?.hardEvidenceChecks && detail.hardEvidenceChecks.length > 0 ? (
                        detail.hardEvidenceChecks.map((chk, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30">
                            <td className="py-2 px-3 font-medium text-slate-200">{chk.name}</td>
                            <td className="py-2 px-3">
                              {chk.passed ? (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  PASS
                                </span>
                              ) : chk.severity === 'CRITICAL' ? (
                                <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  CRITICAL FAIL
                                </span>
                              ) : (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  WARNING
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-400">{chk.reason}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="py-3 px-3 text-slate-500 text-center">
                            No check records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Gemini AI Vision Analysis Summary */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Gemini Vision Analysis Signals
                </h3>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">AI Confidence Score:</span>
                    <span className="font-bold text-amber-400">
                      {detail?.confidenceScore !== undefined ? `${detail.confidenceScore}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Waste Detected:</span>
                    <span className="font-medium text-slate-200">
                      {detail?.aiAnalysisDetails?.wasteDetected ? 'YES' : 'NO'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Same Waste Pile Likely:</span>
                    <span className="font-medium text-slate-200">
                      {detail?.aiAnalysisDetails?.sameWasteLikely ? 'YES' : 'NO / UNCERTAIN'}
                    </span>
                  </div>
                  <div className="border-t border-slate-800/80 pt-2 mt-2">
                    <span className="text-slate-400 block mb-1">Automatic Review Reason:</span>
                    <p className="text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800/60">
                      {detail?.automaticReason || 'No summary available.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Manual Review Form */}
              <form onSubmit={handleSubmit} className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-4">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Inspector Decision Submission
                </h3>

                <div>
                  <label className="text-xs text-slate-400 block mb-2">Decision:</label>
                  <div className="flex gap-4">
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      decision === 'APPROVE'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}>
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVE"
                        checked={decision === 'APPROVE'}
                        onChange={() => setDecision('APPROVE')}
                        className="sr-only"
                      />
                      ✓ APPROVE (VERIFIED)
                    </label>

                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      decision === 'REJECT'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}>
                      <input
                        type="radio"
                        name="decision"
                        value="REJECT"
                        checked={decision === 'REJECT'}
                        onChange={() => setDecision('REJECT')}
                        className="sr-only"
                      />
                      ✕ REJECT
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Explanation Reason <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide a mandatory explanation for your manual decision..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !reason.trim()}
                    className={`px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-lg ${
                      decision === 'APPROVE'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950'
                        : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {submitting ? 'Submitting...' : `Submit Manual ${decision}`}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
