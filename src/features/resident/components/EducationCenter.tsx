import React, { useState, useEffect } from 'react';
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle, Trophy, Sparkles } from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

type Tip = {
  id: string;
  title: string;
  content: string;
};

type Question = {
  id: string;
  type: string;
  title: string;
  content: string;
  options: string[];
};

export const EducationCenter: React.FC<{ onPointsAwarded: (points: number) => void }> = ({ onPointsAwarded }) => {
  const [activeTab, setActiveTab] = useState<'tips' | 'quiz'>('tips');

  // Tips State
  const [tips, setTips] = useState<Tip[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [loadingTips, setLoadingTips] = useState(true);

  // Quiz State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(true);

  // Active Question State
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{ isCorrect: boolean; pointsAwarded: number; correctAnswer: string } | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);

  const [claimingTip, setClaimingTip] = useState(false);
  const [tipClaimedStatus, setTipClaimedStatus] = useState<string | null>(null);

  const fetchTips = async () => {
    try {
      const res = await fetch('/api/education/tips');
      const json = await res.json();
      if (json.success) {
        setTips(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTips(false);
    }
  };

  const handleClaimTip = async () => {
    setClaimingTip(true);
    setTipClaimedStatus(null);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) {
        setTipClaimedStatus('You must be logged in.');
        return;
      }
      const res = await fetch('/api/rewards/educational', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setTipClaimedStatus('Points claimed successfully (+10 pts)!');
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
      console.error(e);
    } finally {
      setLoadingQuiz(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchTips();
      fetchQuiz();
    });
  }, []);

  const handleNextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % tips.length);
  };

  const handlePrevTip = () => {
    setCurrentTipIndex((prev) => (prev - 1 + tips.length) % tips.length);
  };

  const handleSubmitQuiz = async () => {
    if (!selectedOption || questions.length === 0) return;

    setSubmitting(true);
    setQuizError(null);
    setQuizResult(null);

    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) {
        setQuizError('Not authenticated');
        return;
      }

      const currentQuestion = questions[0];

      const res = await fetch('/api/education/quiz/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contentId: currentQuestion.id,
          answer: selectedOption
        })
      });

      const json = await res.json();

      if (json.success) {
        setQuizResult(json.data);
        if (json.data.pointsAwarded > 0) {
          onPointsAwarded(json.data.pointsAwarded);
        }
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
    setQuizResult(null);
    setSelectedOption(null);
    setQuizError(null);
    setQuestions(prev => prev.slice(1));
    setRemainingAttempts(prev => prev !== null ? Math.max(0, prev - 1) : null);
  };

  return (
    <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-lg border border-slate-800">
      <div className="absolute top-0 right-0 h-32 w-32 bg-emerald-500/20 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>

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

      <div className="relative z-10 min-h-[220px]">
        {activeTab === 'tips' && (
          <div className="flex flex-col h-full justify-between">
            {loadingTips ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
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
                    <button onClick={handlePrevTip} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={handleNextTip} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
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

        {activeTab === 'quiz' && (
          <div className="flex flex-col h-full">
            {loadingQuiz ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            ) : questions.length > 0 ? (
              <>
                {!quizResult && !quizError ? (
                  <>
                    <div className="mb-4 flex justify-between items-start">
                      <h3 className="text-sm font-bold leading-snug pr-4">{questions[0].title}</h3>
                      <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400 whitespace-nowrap">
                        {remainingAttempts} left today
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">{questions[0].content}</p>

                    <div className="space-y-2 mb-4 flex-1">
                      {questions[0].options.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedOption(opt)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all border ${
                            selectedOption === opt
                              ? 'bg-indigo-500/20 border-indigo-500 text-white'
                              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleSubmitQuiz}
                      disabled={!selectedOption || submitting}
                      className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-auto"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Answer'}
                    </button>
                  </>
                ) : quizResult ? (
                  <div className="flex flex-col items-center justify-center text-center h-full flex-1 py-4">
                    {quizResult.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
                        <h4 className="text-lg font-bold text-white mb-1">Correct!</h4>
                        <p className="text-sm text-emerald-400 font-semibold mb-4">+{quizResult.pointsAwarded} points awarded</p>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-12 h-12 text-rose-400 mb-3" />
                        <h4 className="text-lg font-bold text-white mb-1">Incorrect</h4>
                        <p className="text-xs text-slate-300 mb-4">
                          The correct answer was: <span className="font-bold text-white">{quizResult.correctAnswer}</span>
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
