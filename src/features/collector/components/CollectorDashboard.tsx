'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  X, Camera, RefreshCw, Check, AlertCircle, CheckCircle2, Loader2, 
  Leaf, LogOut, MapPin, Inbox, History, Calendar, CheckSquare
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { CollectionRequestDTO } from '@/types';

export const CollectorDashboard: React.FC = () => {
  const router = useRouter();

  // User Profile States
  const [profile, setProfile] = useState<{ name: string; email: string; communityName?: string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Collection Request States
  const [requests, setRequests] = useState<CollectionRequestDTO[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Active Tab: 'available' | 'assignments' | 'history'
  const [activeTab, setActiveTab] = useState<'available' | 'assignments' | 'history'>('available');

  // Claim/Collect Actions
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // holds requestId if loading

  // Camera Evidence Modal States
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<CollectionRequestDTO | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmittingEvidence, setIsSubmittingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [isSuccessState, setIsSuccessState] = useState(false);

  // HTML5 Camera States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [tempImagePreview, setTempImagePreview] = useState<string | null>(null);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fetch Requests Function
  const fetchRequests = async () => {
    setLoadingRequests(true);
    setRequestsError(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/collection-requests', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) throw new Error('Failed to load collection requests.');
      const result = await res.json();
      if (result.success && result.data) {
        setRequests(result.data);
      } else {
        throw new Error(result.error?.message || 'Failed to parse requests.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not load requests.';
      setRequestsError(msg);
    } finally {
      setLoadingRequests(false);
    }
  };

  // 1. Initialize Profile & Fetch Data
  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabaseBrowserClient.auth.getSession();
        if (!session) {
          router.push('/auth/login');
          return;
        }

        // Fetch User Role
        const { data: userData } = await supabaseBrowserClient
          .from('users')
          .select('name, email, role')
          .eq('id', session.user.id)
          .single();

        if (!userData || userData.role !== 'collector') {
          console.warn('Unauthorized: Not a collector');
          router.push('/resident'); // redirect residents to their dashboard
          return;
        }

        // Fetch community membership
        const { data: membership } = await supabaseBrowserClient
          .from('community_memberships')
          .select('community:communities(name)')
          .eq('user_id', session.user.id)
          .maybeSingle();

        const commName = membership?.community 
          ? (Array.isArray(membership.community) 
              ? membership.community[0]?.name 
              : (membership.community as { name: string }).name)
          : 'Maplewood District';

        if (active) {
          setProfile({
            name: userData.name,
            email: userData.email,
            communityName: commName
          });
          setLoadingProfile(false);
          // Fetch requests directly upon successful profile initialization
          fetchRequests();
        }
      } catch (err) {
        console.error('Collector auth check failed:', err);
        if (active) router.push('/auth/login');
      }
    };

    checkAuth();
    return () => {
      active = false;
    };
  }, [router]);

  // Handle Logout
  const handleLogout = async () => {
    await supabaseBrowserClient.auth.signOut();
    router.push('/auth/login');
  };

  // Claim Request Handler
  const handleClaim = async (requestId: string) => {
    setActionLoading(requestId);
    setActionError(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Session expired. Please log in.');

      const res = await fetch(`/api/collection-requests/${requestId}/claim`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'Failed to claim request.');
      }

      // Re-fetch request list and switch tab
      await fetchRequests();
      setActiveTab('assignments');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Claim action failed.';
      setActionError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  // Camera Management
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    setIsReviewing(false);
    try {
      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: unknown) {
      console.error('Camera capture failed:', err);
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setCameraStream(fallback);
        if (videoRef.current) {
          videoRef.current.srcObject = fallback;
        }
      } catch (fallbackErr) {
        console.error('Fallback camera startup failed:', fallbackErr);
        setCameraError('Camera access denied or unavailable. Grant permission.');
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
            const file = new File([blob], 'captured-after.jpg', { type: 'image/jpeg' });
            setTempFile(file);
            setTempImagePreview(URL.createObjectURL(blob));
            setIsReviewing(true);

            if (cameraStream) {
              cameraStream.getTracks().forEach(track => track.stop());
              setCameraStream(null);
            }
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

  // Submit Evidence Handler
  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !activeRequest) return;

    setIsSubmittingEvidence(true);
    setEvidenceError(null);

    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Session expired. Please log in.');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('collectionRequestId', activeRequest.id);
      formData.append('evidenceType', 'COLLECTOR_AFTER');

      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || 'Failed to submit collected evidence.');
      }

      setIsSuccessState(true);
      await fetchRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error uploading evidence.';
      setEvidenceError(msg);
    } finally {
      setIsSubmittingEvidence(false);
    }
  };

  const closeCollectModal = () => {
    stopCamera();
    setSelectedFile(null);
    setImagePreview(null);
    setActiveRequest(null);
    setIsCollectModalOpen(false);
    setIsSuccessState(false);
    setEvidenceError(null);
  };

  // Filters based on tabs
  const getFilteredRequests = () => {
    
    return requests.filter(req => {
      if (activeTab === 'available') {
        return req.status === 'PENDING';
      }
      if (activeTab === 'assignments') {
        return req.status === 'ASSIGNED';
      }
      if (activeTab === 'history') {
        return ['COLLECTED', 'VERIFIED', 'REJECTED'].includes(req.status);
      }
      return false;
    });
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
        <p className="text-sm font-semibold tracking-wider">Loading Collector Session...</p>
      </div>
    );
  }

  const filteredRequests = getFilteredRequests();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-12">
      {/* Navbar header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              EcoClean <span className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-400 text-3xs font-extrabold uppercase border border-teal-500/20">Collector</span>
            </h1>
            <p className="text-slate-400 text-3xs font-bold flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-500" />
              {profile?.communityName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2.5 text-right">
            <span className="text-2xs font-extrabold text-slate-200 block">{profile?.name}</span>
            <span className="text-3xs text-slate-450 block font-bold">{profile?.email}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2.5 bg-slate-850 hover:bg-rose-950/20 hover:text-rose-400 rounded-xl transition-all border border-slate-800 hover:border-rose-900/30 text-slate-400 cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main dashboard body */}
      <main className="max-w-4xl mx-auto px-6 mt-8">
        {/* Statistics panel */}
        <section className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-3xs text-slate-500 uppercase tracking-widest font-black block">Available Requests</span>
            <span className="text-2xl font-black text-white mt-1 block">
              {requests.filter(r => r.status === 'PENDING').length}
            </span>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-3xs text-slate-500 uppercase tracking-widest font-black block">My Assignments</span>
            <span className="text-2xl font-black text-teal-400 mt-1 block">
              {requests.filter(r => r.status === 'ASSIGNED').length}
            </span>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-3xs text-slate-500 uppercase tracking-widest font-black block">Completed Pickups</span>
            <span className="text-2xl font-black text-emerald-450 mt-1 block">
              {requests.filter(r => ['COLLECTED', 'VERIFIED'].includes(r.status)).length}
            </span>
          </div>
        </section>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 gap-1.5 mb-6">
          <button
            onClick={() => setActiveTab('available')}
            className={`pb-3.5 px-4 text-xs font-bold relative transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'available' ? 'text-emerald-450' : 'text-slate-450 hover:text-slate-300'
            }`}
          >
            <Inbox className="w-4 h-4" />
            Available Pickups
            {activeTab === 'available' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-450 rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`pb-3.5 px-4 text-xs font-bold relative transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'assignments' ? 'text-teal-400' : 'text-slate-450 hover:text-slate-300'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            My Assignments
            {activeTab === 'assignments' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400 rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3.5 px-4 text-xs font-bold relative transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'history' ? 'text-slate-200' : 'text-slate-450 hover:text-slate-300'
            }`}
          >
            <History className="w-4 h-4" />
            Pickup History
            {activeTab === 'history' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-200 rounded-full" />}
          </button>
        </div>

        {/* Display action errors if any */}
        {actionError && (
          <div className="flex items-start gap-2.5 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-400 mb-6">
            <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Request cards list */}
        {loadingRequests ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-slate-700 mb-2" />
            <p className="text-2xs font-bold uppercase tracking-wider">Loading Requests...</p>
          </div>
        ) : requestsError ? (
          <div className="py-20 text-center text-slate-500">
            <AlertCircle className="w-10 h-10 mx-auto text-slate-750 mb-3" />
            <p className="text-2xs font-bold uppercase tracking-wider">{requestsError}</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-24 border border-dashed border-slate-800 rounded-3xl text-center text-slate-500">
            <Inbox className="w-10 h-10 mx-auto text-slate-800 mb-3" />
            <p className="text-2xs font-bold uppercase tracking-wider">No requests found in this tab.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((req) => (
              <div 
                key={req.id} 
                className="p-5 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all hover:border-slate-850 shadow-sm"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-extrabold text-slate-200 block">{req.residentName || 'Resident'}</span>
                    <span className="text-3xs px-2 py-0.5 rounded-full font-black uppercase tracking-wider text-slate-400 bg-slate-850 border border-slate-800">
                      {req.status}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-3xs text-slate-450 font-semibold">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      Submitted: {new Date(req.requestedAt).toLocaleDateString()} at {new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 self-end sm:self-center">
                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => handleClaim(req.id)}
                      disabled={actionLoading !== null}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {actionLoading === req.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : (
                        'Claim Collection'
                      )}
                    </button>
                  )}

                  {req.status === 'ASSIGNED' && (
                    <button
                      onClick={() => {
                        setActiveRequest(req);
                        setIsCollectModalOpen(true);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Collect Waste
                    </button>
                  )}

                  {['COLLECTED', 'VERIFIED', 'REJECTED'].includes(req.status) && (
                    <div className="text-right text-3xs text-slate-500 font-extrabold uppercase">
                      {req.completedAt && (
                        <span>Completed: {new Date(req.completedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Camera Capture Modal */}
      {isCollectModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity" onClick={closeCollectModal}></div>

          <div className="absolute inset-0 overflow-hidden flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col text-slate-100">
              
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div>
                  <h3 className="text-sm font-extrabold text-white">Record Evidence (AFTER)</h3>
                  <p className="text-slate-450 text-3xs font-semibold mt-0.5">Capture garbage cleanup evidence for {activeRequest.residentName}</p>
                </div>
                <button onClick={closeCollectModal} className="rounded-xl p-1.5 hover:bg-slate-800 transition-colors text-slate-400 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 flex-1 flex flex-col justify-between min-h-[300px]">
                {isSuccessState ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-white">Evidence Uploaded!</h4>
                      <p className="text-slate-400 text-3xs font-bold mt-1 leading-relaxed max-w-xs mx-auto">
                        Verification is in progress. The resident will receive reward points once verified.
                      </p>
                    </div>
                    <button
                      onClick={closeCollectModal}
                      className="mt-6 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Close Dashboard
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitEvidence} className="space-y-6 flex-1 flex flex-col justify-between">
                    <div className="space-y-3 flex-1">
                      {imagePreview ? (
                        <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imagePreview} alt="Captured after cleanup" className="object-cover w-full h-full" />
                          <button
                            type="button"
                            onClick={() => {
                              setImagePreview(null);
                              setSelectedFile(null);
                            }}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-950/80 hover:bg-slate-950 text-white border border-slate-800 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : isCameraActive ? (
                        <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-black aspect-video flex items-center justify-center">
                          {isReviewing && tempImagePreview ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={tempImagePreview} alt="Review capture" className="w-full h-full object-cover" />
                              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                                <button
                                  type="button"
                                  onClick={handleRetake}
                                  className="px-4 py-2.5 bg-slate-850 hover:bg-slate-800 text-white text-3xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-md border border-slate-800 cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  Retake
                                </button>
                                <button
                                  type="button"
                                  onClick={handleConfirm}
                                  className="px-4 py-2.5 bg-emerald-650 hover:bg-emerald-600 text-white text-3xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
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
                                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-650 hover:bg-emerald-600 text-white text-3xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                Capture Photo
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-950/80 hover:bg-slate-950 text-white border border-slate-800 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={startCamera}
                            className="w-full border border-dashed border-slate-800 hover:border-emerald-500/30 rounded-2xl p-8 text-center bg-slate-950/20 transition-all flex flex-col items-center justify-center gap-2.5 group cursor-pointer"
                          >
                            <div className="p-3.5 bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-emerald-500 rounded-2xl shadow-xs transition-all">
                              <Camera className="w-6 h-6" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-300 block">Open Camera to Snap AFTER Photo</span>
                              <span className="text-3xs text-slate-500 block mt-1 leading-relaxed max-w-xs mx-auto font-semibold">
                                Secure camera evidence is required. Snap the clean site at the community bin.
                              </span>
                            </div>
                          </button>
                          {cameraError && (
                            <div className="flex items-start gap-2 p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl text-3xs text-rose-450 font-bold">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{cameraError}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {evidenceError && (
                        <div className="flex items-start gap-2 p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl text-3xs text-rose-450 font-bold">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{evidenceError}</span>
                        </div>
                      )}
                    </div>

                    {/* Footer buttons */}
                    <div className="pt-5 border-t border-slate-850 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeCollectModal}
                        className="px-4 py-2 text-3xs font-extrabold text-slate-400 hover:bg-slate-850 rounded-xl transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingEvidence || !imagePreview}
                        className={`px-5 py-2.5 font-bold text-3xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                          imagePreview 
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-650 text-white hover:from-emerald-500 hover:to-teal-550' 
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-850'
                        }`}
                      >
                        {isSubmittingEvidence && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {isSubmittingEvidence ? 'Submitting...' : 'Upload & Complete Pickup'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
