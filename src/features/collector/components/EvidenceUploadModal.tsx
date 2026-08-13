'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CollectionRequestDTO, VerificationResultDTO } from '@/types';
import { X, Camera, RefreshCw, Sparkles, CheckCircle, AlertTriangle, Loader2, MapPin } from 'lucide-react';

interface Props {
  request: CollectionRequestDTO;
  onClose: () => void;
  onSuccess: () => void;
}

export const EvidenceUploadModal: React.FC<Props> = ({ request, onClose, onSuccess }) => {
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // GPS State
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'fetching' | 'success' | 'error'>('fetching');
  const [locationError, setLocationError] = useState<string | null>(null);

  // Submit / Verification State
  const [isUploading, setIsUploading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResultDTO | null>(null);

  // Refs for Video/Canvas
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start live camera stream
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      const constraints: MediaStreamConstraints = {
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback to basic video constraint if environment camera unavailable
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError(null);
      setCameraActive(true);
    } catch (err: unknown) {
      console.error('[Camera Access Error]:', err);
      const msg = err instanceof Error ? err.message : 'Camera permission denied or camera unavailable.';
      setCameraError(msg);
      setCameraActive(false);
    }
  }, []);

  // Request browser GPS position
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Geolocation API is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
        setLocationStatus('success');
      },
      (err) => {
        console.error('[Geolocation Error]:', err);
        setLocationStatus('error');
        let errMsg = 'Failed to acquire GPS position.';
        if (err.code === err.PERMISSION_DENIED) {
          errMsg = 'GPS permission denied. Please allow location access to submit evidence.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errMsg = 'GPS location is unavailable.';
        } else if (err.code === err.TIMEOUT) {
          errMsg = 'GPS location request timed out.';
        }
        setLocationError(errMsg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  // Initialize camera and GPS on modal load
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (mounted) {
        await startCamera();
        requestLocation();
      }
    };

    init();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [startCamera, requestLocation]);

  // Capture frame from video stream onto hidden canvas
  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Jpeg = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedPhoto(base64Jpeg);
      stopCamera();
    }
  };

  // Retake photo handler
  const handleRetakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  // Close modal and stop stream
  const handleModalClose = () => {
    stopCamera();
    onClose();
  };

  // Submit Evidence & Run AI Verification
  const handleSubmitAndVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!capturedPhoto) {
      setErrorMsg('Please capture a photo using the live camera before submitting.');
      return;
    }

    if (!location) {
      setErrorMsg('Valid GPS coordinates are required. Please allow location access and try again.');
      return;
    }

    setErrorMsg(null);
    setIsUploading(true);

    try {
      // 1. Submit collector evidence payload (image + GPS)
      const evidenceRes = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionRequestId: request.id,
          evidenceType: 'COLLECTOR_AFTER',
          imageBase64: capturedPhoto,
          latitude: location.latitude,
          longitude: location.longitude,
          capturedAt: new Date().toISOString()
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

    } catch (err: unknown) {
      console.error('[Upload/Verify Error]:', err);
      const msg = err instanceof Error ? err.message : 'An error occurred during submission.';
      setErrorMsg(msg);
      setIsUploading(false);
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleModalClose}
          disabled={isUploading || isVerifying}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Camera className="w-5 h-5 text-emerald-600" /> Live Evidence Capture
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Capture photo evidence and GPS location for request ID: <code className="font-mono text-emerald-600">{request.id.slice(0, 8)}</code>
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {verificationResult ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-slate-900 dark:text-white space-y-2">
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <CheckCircle className="w-5 h-5" />
              <span>Evidence Uploaded & Verified ({verificationResult.decision.toUpperCase()})</span>
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
            {/* Camera Preview / Photo Display Box */}
            <div className="relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              {capturedPhoto ? (
                /* Captured Image Preview */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={capturedPhoto}
                  alt="Captured Evidence Preview"
                  className="w-full h-full object-cover"
                />
              ) : cameraActive ? (
                /* Live Camera Stream Video */
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                /* Camera Error / Placeholder */
                <div className="text-center p-4 text-slate-400">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold">{cameraError || 'Camera inactive'}</p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-2 px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                  >
                    Try Camera Again
                  </button>
                </div>
              )}

              {/* Hidden Canvas for Frame Capture */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Overlay Action Button on Video */}
              {cameraActive && !capturedPhoto && (
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-2 transition-transform active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  Take Snapshot
                </button>
              )}
            </div>

            {/* Retake Button if Photo Captured */}
            {capturedPhoto && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRetakePhoto}
                  disabled={isUploading || isVerifying}
                  className="text-xs text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retake Photo
                </button>
              </div>
            )}

            {/* System Status Indicators (Camera & Location) */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <div className="flex items-center gap-2">
                <Camera className={`w-4 h-4 ${capturedPhoto ? 'text-emerald-500' : cameraActive ? 'text-blue-500' : 'text-slate-400'}`} />
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Camera: </span>
                  <span className="text-slate-500">
                    {capturedPhoto ? 'Photo Captured' : cameraActive ? 'Live Stream Ready' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <MapPin className={`w-4 h-4 ${locationStatus === 'success' ? 'text-emerald-500' : locationStatus === 'fetching' ? 'text-amber-500 animate-spin' : 'text-rose-500'}`} />
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Location: </span>
                  <span className="text-slate-500">
                    {locationStatus === 'success' && location
                      ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
                      : locationStatus === 'fetching'
                      ? 'Fetching GPS...'
                      : 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>

            {locationError && (
              <p className="text-[11px] text-rose-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{locationError}</span>
              </p>
            )}

            {/* Form Action Controls */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isUploading || isVerifying}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!capturedPhoto || !location || isUploading || isVerifying}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {isUploading || isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isUploading ? 'Uploading to Supabase...' : 'Verifying with Gemini AI...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Submit Evidence & Verify
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
