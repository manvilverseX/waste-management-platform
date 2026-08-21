'use client';

import Image from 'next/image';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  AlertCircle, Trophy, Sparkles, Camera, X, RotateCcw, ImagePlus,
  Leaf, Star
} from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────

type Tip = { id: string; title: string; content: string };

type Question = {
  id: string;
  type: string;
  title: string;
  content: string;
  options: string[];
};

type QuizResult = {
  isCorrect: boolean;
  pointsAwarded: number;
  correctAnswer: string;
  hadImageSubmission: boolean;
  imageBonus: boolean;
  aiVerdict: 'relevant' | 'irrelevant' | 'error' | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
};

// ── Image Capture Stage ────────────────────────────────────────────────────
// 'none'      → no image UI shown
// 'camera'    → live camera viewfinder
// 'review'    → showing captured/picked image preview
// 'uploading' → uploading to server
// 'ready'     → storagePath obtained, ready to submit with image
type ImageStage = 'none' | 'camera' | 'review' | 'uploading' | 'ready';

// ── Component ─────────────────────────────────────────────────────────────

export const EducationCenter: React.FC<{ onPointsAwarded: (points: number) => void }> = ({ onPointsAwarded }) => {
  const [activeTab, setActiveTab] = useState<'tips' | 'quiz'>('tips');

  // Tips state
  const [tips, setTips] = useState<Tip[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [loadingTips, setLoadingTips] = useState(true);
  const [claimingTip, setClaimingTip] = useState(false);
  const [tipClaimedStatus, setTipClaimedStatus] = useState<string | null>(null);

  // Quiz state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(true);

  // Active question state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);

  // Phase 5B image state
  const [imageStage, setImageStage] = useState<ImageStage>('none');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageStoragePath, setImageStoragePath] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Tips ────────────────────────────────────────────────────────────────

  const fetchTips = async () => {
    try {
      const res = await fetch('/api/education/tips');
      const json = await res.json();
      if (json.success) setTips(json.data);
    } catch (e) {
      console.error('[EducationCenter] fetchTips:', e);
    } finally {
      setLoadingTips(false);
    }
  };

  const handleClaimTip = async () => {
    setClaimingTip(true);
    setTipClaimedStatus(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) { setTipClaimedStatus('You must be logged in.'); return; }
      const res = await fetch('/api/rewards/educational', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setTipClaimedStatus('Points claimed! (+10 pts)');
        onPointsAwarded(10);
      } else {
        setTipClaimedStatus(result.error?.message || 'Failed to claim points.');
      }
    } catch {
      setTipClaimedStatus('An unexpected error occurred.');
    } finally {
      setClaimingTip(false);
    }
  };

  // ── Quiz fetch ───────────────────────────────────────────────────────────

  const fetchQuiz = async () => {
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/education/quiz/daily', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.success) {
        setQuestions(json.data.questions);
        setRemainingAttempts(json.data.remainingAttempts);
      }
    } catch (e) {
      console.error('[EducationCenter] fetchQuiz:', e);
    } finally {
      setLoadingQuiz(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => { fetchTips(); fetchQuiz(); });
  }, []);

  // ── Camera helpers ───────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setImageStage('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      // Fallback to any camera
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cameraStreamRef.current = fallback;
        if (videoRef.current) videoRef.current.srcObject = fallback;
      } catch (err) {
        console.error('[EducationCenter] Camera error:', err);
        setCameraError('Camera access denied. Please allow camera permissions or use the file picker instead.');
        setImageStage('none');
      }
    }
  };

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], 'quiz-photo.jpg', { type: 'image/jpeg' });
        setImageFile(file);
        setImagePreview(URL.createObjectURL(blob));
        setImageStage('review');
      }, 'image/jpeg', 0.92);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageStage('review');
    e.target.value = '';
  };

  const handleRetake = () => {
    stopCamera();
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setImageFile(null);
    setImageStoragePath(null);
    setImageUploadError(null);
    setImageStage('none');
  };

  const handleUsePhoto = async () => {
    if (!imageFile || !questions[0]) return;
    setImageStage('uploading');
    setImageUploadError(null);

    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) { setImageUploadError('Not authenticated'); setImageStage('review'); return; }

      const form = new FormData();
      form.append('file', imageFile);
      form.append('contentId', questions[0].id);

      const res = await fetch('/api/education/quiz/image-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: form
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setImageStoragePath(json.data.storagePath);
        setImageStage('ready');
      } else {
        setImageUploadError(json.error?.message || 'Upload failed. Try again or skip photo.');
        setImageStage('review');
      }
    } catch {
      setImageUploadError('Upload failed. Check your connection.');
      setImageStage('review');
    }
  };

  // ── Quiz submit ──────────────────────────────────────────────────────────

  const handleSubmitQuiz = async () => {
    if (!selectedOption || questions.length === 0) return;
    setSubmitting(true);
    setQuizError(null);
    setQuizResult(null);

    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) { setQuizError('Not authenticated'); return; }

      const currentQuestion = questions[0];
      const body: { contentId: string; answer: string; imageStoragePath?: string } = {
        contentId: currentQuestion.id,
        answer: selectedOption
      };
      if (imageStoragePath) body.imageStoragePath = imageStoragePath;

      const res = await fetch('/api/education/quiz/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const json = await res.json();

      if (json.success) {
        setQuizResult(json.data);
        if (json.data.pointsAwarded > 0) onPointsAwarded(json.data.pointsAwarded);
      } else {
        setQuizError(json.error?.message || 'Failed to submit answer');
      }
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setQuizResult(null);
    setSelectedOption(null);
    setQuizError(null);
    setImageStage('none');
    setImageFile(null);
    setImagePreview(null);
    setImageStoragePath(null);
    setImageUploadError(null);
    setCameraError(null);
    setQuestions(prev => prev.slice(1));
    setRemainingAttempts(prev => prev !== null ? Math.max(0, prev - 1) : null);
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderImageBonusPanel = () => {
    if (imageStage === 'none') {
      return (
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          <p className="text-2xs text-slate-400 mb-2 flex items-center gap-1.5">
            <Star className="w-3 h-3 text-amber-400" />
            Add a photo for <span className="text-amber-400 font-bold">+0.5 bonus pts</span> — AI verifies relevance
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startCamera}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-2xs font-bold rounded-xl transition-colors"
            >
              <Camera className="w-3.5 h-3.5" /> Camera
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-2xs font-bold rounded-xl transition-colors"
            >
              <ImagePlus className="w-3.5 h-3.5" /> Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
          {cameraError && (
            <p className="text-2xs text-rose-400 mt-1.5">{cameraError}</p>
          )}
        </div>
      );
    }

    if (imageStage === 'camera') {
      return (
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          <div className="relative rounded-xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-36 object-cover"
            />
            <div className="absolute bottom-2 inset-x-0 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setImageStage('none')}
                className="p-2 bg-slate-900/80 rounded-full text-slate-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCapture}
                className="p-3 bg-white rounded-full shadow-lg hover:bg-slate-100 transition-colors"
              >
                <Camera className="w-5 h-5 text-slate-900" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (imageStage === 'review') {
      return (
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          <div className="relative rounded-xl overflow-hidden bg-black">
            {imagePreview && (
              <Image src={imagePreview} alt="Preview" width={640} height={144} className="w-full h-36 object-cover" unoptimized />
            )}
          </div>
          {imageUploadError && (
            <p className="text-2xs text-rose-400 mt-1.5">{imageUploadError}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-2xs font-bold rounded-xl transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Retake
            </button>
            <button
              type="button"
              onClick={handleUsePhoto}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-2xs font-bold rounded-xl transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-3 h-3" /> Use this photo
            </button>
          </div>
        </div>
      );
    }

    if (imageStage === 'uploading') {
      return (
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          <div className="flex items-center gap-2 text-amber-400 text-2xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Uploading photo...</span>
          </div>
        </div>
      );
    }

    if (imageStage === 'ready') {
      return (
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          <div className="flex items-center gap-2 text-amber-400 text-2xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Photo ready — AI will assess relevance on submit
            <button
              type="button"
              onClick={handleRetake}
              className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {imagePreview && (
            <Image src={imagePreview} alt="Ready" width={640} height={80} className="mt-2 w-full h-20 object-cover rounded-lg opacity-70" unoptimized />
          )}
        </div>
      );
    }

    return null;
  };

  const renderQuizResult = () => {
    if (!quizResult) return null;
    const { isCorrect, pointsAwarded, correctAnswer, hadImageSubmission, imageBonus, aiVerdict } = quizResult;

    return (
      <div className="flex flex-col items-center justify-center text-center h-full flex-1 py-4">
        {isCorrect ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
            <h4 className="text-lg font-bold text-white mb-1">Correct!</h4>
            <div className="mb-3">
              {imageBonus ? (
                <>
                  <p className="text-base font-extrabold text-amber-400">+{pointsAwarded} pts</p>
                  <p className="text-2xs text-amber-300/80 mt-0.5 flex items-center justify-center gap-1">
                    <Leaf className="w-3 h-3" /> AI verified your photo — bonus earned!
                  </p>
                </>
              ) : hadImageSubmission && aiVerdict === 'irrelevant' ? (
                <>
                  <p className="text-base font-extrabold text-emerald-400">+{pointsAwarded} pts</p>
                  <p className="text-2xs text-slate-400 mt-0.5">Photo not relevant to topic — base points awarded</p>
                </>
              ) : hadImageSubmission && aiVerdict === 'error' ? (
                <>
                  <p className="text-base font-extrabold text-emerald-400">+{pointsAwarded} pts</p>
                  <p className="text-2xs text-slate-400 mt-0.5">AI unavailable — base points awarded</p>
                </>
              ) : (
                <p className="text-base font-extrabold text-emerald-400">+{pointsAwarded} pts</p>
              )}
            </div>
          </>
        ) : (
          <>
            <XCircle className="w-12 h-12 text-rose-400 mb-3" />
            <h4 className="text-lg font-bold text-white mb-1">Incorrect</h4>
            <p className="text-xs text-slate-300 mb-4">
              The correct answer was:{' '}
              <span className="font-bold text-white">{correctAnswer}</span>
            </p>
          </>
        )}

        <button
          onClick={handleNextQuestion}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors mt-auto"
        >
          {questions.length > 1 ? 'Next Question' : 'Done for now'}
        </button>
      </div>
    );
  };

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-lg border border-slate-800">
      <div className="absolute top-0 right-0 h-32 w-32 bg-emerald-500/20 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5 relative z-10">
        <div className="flex items-center gap-2 text-emerald-400">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider">Education Center</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('tips')}
            className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${activeTab === 'tips' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
          >
            Tips
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${activeTab === 'quiz' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
          >
            Daily Quiz
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-[220px]">

        {/* ── Tips Tab ── */}
        {activeTab === 'tips' && (
          <div className="flex flex-col h-full justify-between">
            {loadingTips ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              </div>
            ) : tips.length > 0 ? (
              <>
                <div>
                  <h3 className="text-base font-bold mb-2">{tips[currentTipIndex].title}</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">
                    {tips[currentTipIndex].content}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-auto pt-4">
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentTipIndex(prev => (prev - 1 + tips.length) % tips.length)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setCurrentTipIndex(prev => (prev + 1) % tips.length)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="text-xs text-slate-500">{currentTipIndex + 1} of {tips.length}</span>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800">
                  <button
                    onClick={handleClaimTip}
                    disabled={claimingTip}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claimingTip ? 'Claiming...' : 'Claim Daily Engagement Points (+10 pts)'}
                  </button>
                  {tipClaimedStatus && (
                    <p className="text-2xs mt-2 text-center text-emerald-400 font-semibold">{tipClaimedStatus}</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No educational tips available right now.</p>
            )}
          </div>
        )}

        {/* ── Quiz Tab ── */}
        {activeTab === 'quiz' && (
          <div className="flex flex-col h-full">
            {loadingQuiz ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              </div>
            ) : questions.length > 0 ? (
              <>
                {!quizResult && !quizError ? (
                  <>
                    {/* Question header */}
                    <div className="mb-3 flex justify-between items-start">
                      <h3 className="text-sm font-bold leading-snug pr-4">{questions[0].title}</h3>
                      <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400 whitespace-nowrap">
                        {remainingAttempts} left today
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{questions[0].content}</p>

                    {/* MCQ Options */}
                    <div className="space-y-2 mb-3 flex-1">
                      {questions[0].options.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedOption(opt)}
                          disabled={imageStage === 'uploading' || submitting}
                          className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all border ${
                            selectedOption === opt
                              ? 'bg-indigo-500/20 border-indigo-500 text-white'
                              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-500'
                          } disabled:opacity-50`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    {/* Image bonus panel — only shown after an option is selected */}
                    {selectedOption && renderImageBonusPanel()}

                    {/* Submit button */}
                    <button
                      onClick={handleSubmitQuiz}
                      disabled={!selectedOption || submitting || imageStage === 'uploading' || imageStage === 'review' || imageStage === 'camera'}
                      className={`w-full py-2.5 font-bold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-3 flex items-center justify-center gap-2 ${
                        imageStoragePath
                          ? 'bg-gradient-to-r from-indigo-500 to-amber-500 hover:from-indigo-400 hover:to-amber-400 text-white'
                          : 'bg-indigo-500 hover:bg-indigo-400 text-white'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {imageStoragePath ? 'AI assessing photo...' : 'Submitting...'}
                        </>
                      ) : (
                        imageStoragePath ? '✨ Submit with Photo (+1.0 pts if correct)' : 'Submit Answer (+0.5 pts if correct)'
                      )}
                    </button>
                  </>
                ) : quizResult ? (
                  renderQuizResult()
                ) : (
                  <div className="flex flex-col items-center justify-center text-center h-full flex-1 py-4">
                    <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
                    <p className="text-sm text-rose-400 mb-4">{quizError}</p>
                    <button
                      onClick={() => setQuizError(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-full flex-1 py-8">
                <Trophy className="w-8 h-8 text-indigo-400/50 mb-3" />
                <p className="text-sm text-slate-300 font-semibold">You&apos;re all caught up!</p>
                <p className="text-xs text-slate-500 mt-1">Check back tomorrow for more quiz questions.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
