'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Loader2, X, AlertCircle, CheckCircle2, MapPin, RefreshCw, Check } from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

interface ReportDumpingFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReportDumpingForm: React.FC<ReportDumpingFormProps> = ({ onClose, onSuccess }) => {
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsTimestamp, setGpsTimestamp] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>('Acquiring location...');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // HTML5 MediaStream Camera states
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [tempImagePreview, setTempImagePreview] = useState<string | null>(null);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Fetch Geolocation on Mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
          setGpsAccuracy(position.coords.accuracy);
          setGpsTimestamp(new Date(position.timestamp).toISOString());
          setGpsError(null);
        },
        (err) => {
          console.error('[Geolocation Error]:', err);
          setGpsError('Could not retrieve GPS coordinates. Please allow location permissions in your browser.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setGpsError('Geolocation is not supported by this browser.');
    }
  }, []);

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
        setCameraError('Camera access is required to submit a dumping report.');
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
            const file = new File([blob], 'captured-hotspot.jpg', { type: 'image/jpeg' });
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
      setImageFile(tempFile);
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
    if (!imageFile) {
      setError('Please select or capture a hotspot photo.');
      return;
    }
    if (latitude === null || longitude === null) {
      setError('A valid GPS location is required to report dumping.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    let uploadedPath = '';

    try {
      // 1. Authenticate session
      const { data: { session }, error: sessionError } = await supabaseBrowserClient.auth.getSession();
      if (sessionError || !session) {
        throw new Error('You must be logged in to report illegal dumping.');
      }

      const userId = session.user.id;
      const reportId = crypto.randomUUID();
      const fileExt = imageFile.name.split('.').pop() || 'jpg';
      uploadedPath = `${userId}/dumping-reports/${reportId}.${fileExt}`;

      // 2. Upload image to 'evidence' storage bucket
      const { error: uploadError } = await supabaseBrowserClient.storage
        .from('evidence')
        .upload(uploadedPath, imageFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabaseBrowserClient.storage
        .from('evidence')
        .getPublicUrl(uploadedPath);

      // 3. Post data to dumping report API
      const res = await fetch('/api/dumping-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          imageUrl: publicUrl,
          latitude,
          longitude,
          description: description || 'Illegal garbage dumping hotspot reported.',
          gpsAccuracy,
          gpsCapturedAt: gpsTimestamp
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message || 'Failed to submit dumping report.');
      }

      setSuccess(true);
      if (onSuccess) onSuccess();

    } catch (err: unknown) {
      console.error('[Submit Dumping Report Error]:', err);
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errMsg);

      // Rollback uploaded storage object if API fails
      if (uploadedPath) {
        await supabaseBrowserClient.storage
          .from('evidence')
          .remove([uploadedPath])
          .catch((removeErr) => console.error('[Storage Rollback Error]:', removeErr));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={handleClose}></div>

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg transform overflow-hidden rounded-3xl bg-white dark:bg-slate-950 p-6 text-left align-middle shadow-2xl transition-all border border-slate-200 dark:border-slate-900">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-900">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Report Illegal Dumping</h3>
              <p className="text-2xs text-slate-450 dark:text-slate-500 mt-0.5">Help keep our community clean by reporting hotspots</p>
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {success ? (
            <div className="py-8 text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Report Filed Successfully</h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                  Municipal workers and community collectors have been notified. Thank you for contributing!
                </p>
              </div>
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 rounded-xl font-bold text-xs hover:bg-slate-800 dark:hover:bg-white transition-colors"
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-5">
              {/* Image Input */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-350 block">Hotspot Photo</label>
                {imagePreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-video flex items-center justify-center bg-slate-50 dark:bg-slate-950 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Hotspot preview" className="object-cover w-full h-full" />
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
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
                            <RefreshCw className="w-4 h-4" />
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
                      className="w-full border-2 border-dashed border-slate-250 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 text-center bg-slate-50/50 dark:bg-slate-950/20 transition-colors flex flex-col items-center justify-center gap-2 group cursor-pointer relative"
                    >
                      <div className="p-3 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 text-slate-400 group-hover:text-emerald-500 rounded-2xl shadow-xs transition-all">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Open Camera to Take Photo</span>
                        <span className="text-2xs text-slate-450 dark:text-slate-500 block mt-1 max-w-xs mx-auto leading-relaxed">
                          Camera capture is required. Please take a photograph of the actual illegal dumping location.
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
              </div>

              {/* GPS coordinates panel */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-150 dark:border-slate-800 rounded-2xl flex items-start gap-2.5">
                <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${gpsError ? 'text-amber-500' : 'text-emerald-500'}`} />
                <div className="text-2xs leading-relaxed">
                  <span className="font-bold block text-slate-700 dark:text-slate-300">Geospatial Coordinates</span>
                  {gpsError ? (
                    <span className="text-amber-600 dark:text-amber-400 block mt-0.5">{gpsError}</span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400 block mt-0.5">
                      Lat: {latitude?.toFixed(6)} | Lon: {longitude?.toFixed(6)} (GPS Verified)
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-350 block">Description / Notes</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide details about the garbage pile (e.g. size, location landmark, type of waste)..."
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-shadow outline-none resize-none"
                  required
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl text-2xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Footer Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-900 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-slate-550 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !imageFile || latitude === null}
                  className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 ${
                    imageFile && latitude !== null
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-450 dark:text-slate-550 cursor-not-allowed'
                  }`}
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'Reporting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
