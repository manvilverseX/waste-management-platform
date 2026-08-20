'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, RefreshCw, Check, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  onClose: () => void;
}

export const RequestCollectionForm: React.FC<Props> = ({ onClose }) => {
  const [wasteType, setWasteType] = useState('mixed');
  const [description, setDescription] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GPS State
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsTimestamp, setGpsTimestamp] = useState<string | null>(null);

  // Fetch location proactively on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
          setGpsAccuracy(position.coords.accuracy);
          setGpsTimestamp(new Date(position.timestamp).toISOString());
        },
        (err) => {
          console.warn('[Resident Geolocation mount high-accuracy error, trying fallback]:', err);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLatitude(pos.coords.latitude);
              setLongitude(pos.coords.longitude);
              setGpsAccuracy(pos.coords.accuracy);
              setGpsTimestamp(new Date(pos.timestamp).toISOString());
            },
            (err2) => {
              console.warn('[Resident Geolocation fallback error]:', err2);
            },
            { enableHighAccuracy: false, timeout: 8000 }
          );
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // HTML5 MediaStream Camera states
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [tempImagePreview, setTempImagePreview] = useState<string | null>(null);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    setIsReviewing(false);
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: unknown) {
      console.error('Camera startup failed:', err);
      // Fallback if facingMode: environment fails (e.g. desktop/laptop front cameras)
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setCameraStream(fallbackStream);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }
      } catch (fallbackErr: unknown) {
        console.error('Fallback camera startup failed:', fallbackErr);
        setCameraError('Camera access denied or unavailable. Please enable camera permissions.');
        setIsCameraActive(false);
      }
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setIsReviewing(false);
    setTempImagePreview(null);
    setTempFile(null);
  };

  const handleCapture = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'captured-evidence.jpg', { type: 'image/jpeg' });
            setTempFile(file);
            setTempImagePreview(URL.createObjectURL(blob));
            setIsReviewing(true);
            
            // Stop camera stream while reviewing
            if (cameraStream) {
              cameraStream.getTracks().forEach(track => track.stop());
              setCameraStream(null);
            }
            setError(null);
          }
        }, 'image/jpeg', 0.85);
      }
    }
  };

  const handleRetake = async () => {
    setTempImagePreview(null);
    setTempFile(null);
    setIsReviewing(false);
    await startCamera();
  };

  const handleConfirm = () => {
    if (tempImagePreview && tempFile) {
      setSelectedFile(tempFile);
      setImagePreview(tempImagePreview);
      setIsCameraActive(false);
      setIsReviewing(false);
      setTempImagePreview(null);
      setTempFile(null);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsSubmitting(true);
    setError(null);

    let createdRequestId: string | null = null;

    try {
      // 1. Get authenticated user session
      const { data: { session }, error: sessionError } = await supabaseBrowserClient.auth.getSession();
      if (sessionError || !session) {
        throw new Error('You must be logged in to request a collection.');
      }
      const token = session.access_token;

      // 2. Fetch community membership of this user
      const { data: membership, error: membershipError } = await supabaseBrowserClient
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (membershipError || !membership) {
        throw new Error('No community membership found. Please join a community first.');
      }

      const communityId = membership.community_id;

      // 3. Create collection request via API
      const reqResponse = await fetch('/api/collection-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ communityId })
      });

      if (!reqResponse.ok) {
        const errData = await reqResponse.json();
        throw new Error(errData?.error?.message || 'Failed to create collection request.');
      }

      const reqResult = await reqResponse.json();
      createdRequestId = reqResult.data.id;

      if (!createdRequestId) {
        throw new Error('Collection request creation returned an invalid ID.');
      }

      // 4. Send evidence to backend via multipart/form-data
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('collectionRequestId', createdRequestId);
      formData.append('evidenceType', 'RESIDENT_BEFORE');
      if (latitude !== null && longitude !== null) {
        formData.append('latitude', latitude.toString());
        formData.append('longitude', longitude.toString());
        if (gpsAccuracy !== null) {
          formData.append('gpsAccuracy', gpsAccuracy.toString());
        }
        if (gpsTimestamp !== null) {
          formData.append('gpsCapturedAt', gpsTimestamp);
        }
      }

      const evidenceResponse = await fetch('/api/evidence', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!evidenceResponse.ok) {
        const errData = await evidenceResponse.json();
        throw new Error(errData?.error?.message || 'Failed to register evidence.');
      }

      setIsSuccess(true);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');

      // Rollback: delete request if it was created but evidence submission failed
      if (createdRequestId) {
        try {
          await supabaseBrowserClient
            .from('collection_requests')
            .delete()
            .eq('id', createdRequestId);
        } catch (rollbackErr) {
          console.error('Failed to cleanup collection request during rollback:', rollbackErr);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
        onClick={handleClose}
      ></div>

      <div className="absolute inset-0 overflow-hidden">
        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
          <div className="pointer-events-auto w-screen max-w-md transform transition-all duration-300 ease-in-out">
            <div className="flex h-full flex-col overflow-y-scroll bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl">
              {/* Form Header */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">New Collection Request</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">Submit details for your waste collection</p>
                </div>
                <button 
                  onClick={handleClose} 
                  className="rounded-xl p-1.5 hover:bg-slate-150 dark:hover:bg-slate-800 transition-colors text-slate-450 dark:text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body / Success State */}
              <div className="relative flex-1 py-6 px-6">
                {isSuccess ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                    <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white">Request Created!</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 max-w-xs mx-auto">
                        Your collection request has been listed. You will earn reward points once verified by our collector team.
                      </p>
                    </div>
                    <button
                      onClick={handleClose}
                      className="mt-6 px-6 py-2.5 bg-slate-900 hover:bg-slate-850 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Waste type */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350 block">Waste Category</label>
                      <div className="grid grid-cols-3 gap-2.5">
                        {[
                          { id: 'mixed', label: 'Mixed Waste' },
                          { id: 'organic', label: 'Organic' },
                          { id: 'recyclables', label: 'Recyclables' }
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setWasteType(item.id)}
                            className={`py-2 px-3 rounded-xl border text-2xs font-bold text-center transition-all ${
                              wasteType === item.id
                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-450'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Image uploads (BEFORE photos) */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350 block">
                        Evidence Photo (BEFORE)
                      </label>
                      
                      {imagePreview ? (
                        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 aspect-video flex items-center justify-center group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imagePreview} alt="Before preview" className="object-cover w-full h-full" />
                          <button
                            type="button"
                            onClick={() => {
                              setImagePreview(null);
                              setSelectedFile(null);
                            }}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-900/60 hover:bg-slate-900 text-white backdrop-blur-xs transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : isCameraActive ? (
                        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black aspect-video flex items-center justify-center">
                          {isReviewing && tempImagePreview ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={tempImagePreview} alt="Review capture" className="w-full h-full object-cover" />
                              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 px-4">
                                <button
                                  type="button"
                                  onClick={handleRetake}
                                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
                                >
                                  <RefreshCw className="w-4 h-4 animate-spin-hover" />
                                  Retake
                                </button>
                                <button
                                  type="button"
                                  onClick={handleConfirm}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
                                >
                                  <Check className="w-4 h-4" />
                                  Confirm
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={handleCapture}
                                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
                              >
                                <Camera className="w-4 h-4" />
                                Capture Photo
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-900/60 hover:bg-slate-900 text-white backdrop-blur-xs transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={startCamera}
                            className="w-full border-2 border-dashed border-slate-250 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl p-8 text-center bg-slate-50/50 dark:bg-slate-950/20 transition-all flex flex-col items-center justify-center gap-2.5 group cursor-pointer"
                          >
                            <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 text-slate-400 group-hover:text-emerald-500 rounded-2xl shadow-xs transition-all">
                              <Camera className="w-7 h-7" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-350 block">Open Camera to Take Photo</span>
                              <span className="text-2xs text-slate-450 dark:text-slate-500 block mt-1 leading-relaxed max-w-xs mx-auto">
                                Live camera capture is required. Snap a direct photograph of the garbage pile.
                              </span>
                            </div>
                          </button>
                          {cameraError && (
                            <div className="flex items-start gap-2 p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl text-2xs text-rose-600 dark:text-rose-400">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>{cameraError}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {!imagePreview && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-2xs text-amber-600 dark:text-amber-400">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>An evidence photo of the garbage site is required to verify your request.</span>
                        </div>
                      )}

                      {error && (
                        <div className="flex items-start gap-2 p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl text-2xs text-rose-600 dark:text-rose-400">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{error}</span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350 block">Description (Optional)</label>
                      <textarea
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add location details, instruction or notes..."
                        className="w-full text-xs p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-500 transition-shadow outline-none resize-none"
                      />
                    </div>

                    {/* Submit footer */}
                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 text-xs font-bold text-slate-550 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !imagePreview}
                        className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 ${
                          imagePreview 
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500' 
                            : 'bg-slate-100 dark:bg-slate-850 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {isSubmitting ? 'Submitting...' : 'Submit Request'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
