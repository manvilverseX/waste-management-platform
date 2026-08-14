'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ApiResponse, ReviewQueueItemDTO } from '@/types';
import { ReviewDetailModal } from './ReviewDetailModal';

interface ReviewQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQueueUpdated?: () => void;
}

export const ReviewQueueModal: React.FC<ReviewQueueModalProps> = ({
  isOpen,
  onClose,
  onQueueUpdated,
}) => {
  const [items, setItems] = useState<ReviewQueueItemDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/verification/review-queue');
      const data: ApiResponse<ReviewQueueItemDTO[]> = await res.json();
      if (data.success && data.data) {
        setItems(data.data);
      } else {
        setErrorMsg(data.error?.message || 'Failed to load review queue.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error connecting to server.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen) return;

    const loadQueue = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/verification/review-queue');
        const data: ApiResponse<ReviewQueueItemDTO[]> = await res.json();
        if (isMounted) {
          if (data.success && data.data) {
            setItems(data.data);
          } else {
            setErrorMsg(data.error?.message || 'Failed to load review queue.');
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Error connecting to server.';
          setErrorMsg(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadQueue();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenDetail = (requestId: string) => {
    setSelectedRequestId(requestId);
    setIsDetailOpen(true);
  };

  const handleDecisionSubmitted = () => {
    fetchQueue();
    if (onQueueUpdated) onQueueUpdated();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                Manual Review Queue
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Cases flagged by automatic verification engine requiring inspector approval.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors text-xl font-bold px-2"
            >
              &times;
            </button>
          </div>

          {/* Queue List Body */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm">Loading cases requiring review...</p>
              </div>
            ) : errorMsg ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-sm">
                {errorMsg}
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/80">
                <p className="text-sm font-medium text-slate-400">No Cases Requiring Review</p>
                <p className="text-xs mt-1">All collection verification cases have been processed.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.requestId}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-emerald-400 font-semibold">
                          #{item.requestId.slice(0, 8)}
                        </span>
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                          NEEDS_REVIEW
                        </span>
                        {item.confidenceScore !== undefined && (
                          <span className="text-[10px] text-slate-400">
                            AI Confidence: <strong className="text-amber-400">{item.confidenceScore}%</strong>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-300">
                        Resident: <strong className="text-slate-100">{item.residentName}</strong> • Community: <strong className="text-slate-100">{item.communityName}</strong>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Collector: {item.collectorName} • Batch: {item.collectionBatchId ? item.collectionBatchId.slice(0, 8) : 'Unbatched'}
                      </div>
                      <p className="text-[11px] text-amber-300/80 bg-amber-500/5 px-2.5 py-1 rounded border border-amber-500/10 mt-1">
                        Reason: {item.reason}
                      </p>
                    </div>

                    <button
                      onClick={() => handleOpenDetail(item.requestId)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all self-start md:self-center whitespace-nowrap"
                    >
                      Inspect & Review →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRequestId && (
        <ReviewDetailModal
          requestId={selectedRequestId}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          onDecisionSubmitted={handleDecisionSubmitted}
        />
      )}
    </>
  );
};
