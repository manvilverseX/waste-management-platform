import React, { useState, useEffect } from 'react';
import { Loader2, PlusCircle, AlertTriangle, X, Check } from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

interface CampaignItem {
  id: string;
  communityId: string;
  organizerId: string;
  title: string;
  description: string;
  campaignDate: string;
  startTime: string;
  endTime: string;
  location: string;
  expectedParticipants: number | null;
  status: 'draft' | 'published' | 'registration_open' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  registrationCount: number;
}

interface LaunchCampaignTabProps {
  communityName: string | null;
  loadingCommunity: boolean;
}

export const LaunchCampaignTab: React.FC<LaunchCampaignTabProps> = ({ communityName, loadingCommunity }) => {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [campaignDate, setCampaignDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [expectedParticipants, setExpectedParticipants] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/campaigns', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setCampaigns(result.data || []);
      }
    } catch (e) {
      console.error('Error fetching campaigns:', e);
    }
  };

  useEffect(() => {
    let active = true;
    if (communityName) {
      const load = async () => {
        setLoadingCampaigns(true);
        try {
          const { data: { session } } = await supabaseBrowserClient.auth.getSession();
          if (!session || !active) return;

          const res = await fetch('/api/campaigns', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });
          const result = await res.json();
          if (res.ok && result.success && active) {
            setCampaigns(result.data || []);
          }
        } catch (e) {
          console.error('Error fetching campaigns:', e);
        } finally {
          if (active) {
            setLoadingCampaigns(false);
          }
        }
      };
      load();
    } else {
      setTimeout(() => {
        if (active) setLoadingCampaigns(false);
      }, 0);
    }
    return () => {
      active = false;
    };
  }, [communityName]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Basic Validation
    if (!title.trim() || !description.trim() || !campaignDate || !startTime || !endTime || !location.trim()) {
      setFormError('Please fill out all required fields.');
      return;
    }

    if (endTime <= startTime) {
      setFormError('Campaign end time must occur after the start time.');
      return;
    }

    if (expectedParticipants !== '') {
      const parsed = parseInt(expectedParticipants, 10);
      if (isNaN(parsed) || parsed <= 0) {
        setFormError('Expected participants count must be a positive integer.');
        return;
      }
    }

    setFormLoading(true);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Authentication session expired.');

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          campaignDate,
          startTime,
          endTime,
          location: location.trim(),
          expectedParticipants: expectedParticipants ? parseInt(expectedParticipants, 10) : undefined
        })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setFormSuccess('Cleanliness campaign launched successfully as a draft!');
        setTitle('');
        setDescription('');
        setCampaignDate('');
        setStartTime('');
        setEndTime('');
        setLocation('');
        setExpectedParticipants('');
        fetchCampaigns();
      } else {
        setFormError(result.error?.message || 'Failed to launch campaign.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setFormError(msg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleStatusTransition = async (campaignId: string, targetStatus: string) => {
    setActionLoadingId(campaignId);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) throw new Error('Authentication session expired.');

      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ status: targetStatus })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        fetchCampaigns();
      } else {
        alert(result.error?.message || 'Status transition failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during status transition.';
      alert(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loadingCommunity) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="text-xs">Checking community profile...</span>
      </div>
    );
  }

  if (!communityName) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-3xl text-center max-w-lg mx-auto">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4 animate-bounce" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Membership Required</h3>
        <p className="text-slate-500 dark:text-slate-400 text-xs mt-2 leading-relaxed">
          You must be registered as a member of a community locality to launch cleanliness campaigns. Please contact your local community administrator to get added.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Creation Form */}
      <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs h-fit">
        <h3 className="text-base font-bold text-slate-850 dark:text-white mb-1 flex items-center gap-1.5">
          <PlusCircle className="w-5 h-5 text-emerald-500" />
          Launch New Campaign
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-2xs mb-5">
          Organize a neighborhood cleanup or segregation campaign in {communityName}.
        </p>

        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <div>
            <label className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Campaign Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Segregation Drive & Sorting"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold outline-none"
            />
          </div>

          <div>
            <label className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Description *</label>
            <textarea
              required
              rows={3}
              placeholder="Tell residents what they need to bring and do..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Date *</label>
            <input
              type="date"
              required
              value={campaignDate}
              onChange={(e) => setCampaignDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Start Time *</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold outline-none"
              />
            </div>
            <div>
              <label className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">End Time *</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Meeting Location *</label>
            <input
              type="text"
              required
              placeholder="e.g. Central Community Park"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold outline-none"
            />
          </div>

          <div>
            <label className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Expected Participants (Optional)</label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 50"
              value={expectedParticipants}
              onChange={(e) => setExpectedParticipants(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold outline-none"
            />
          </div>

          {formError && (
            <p className="text-2xs text-red-500 dark:text-red-400 font-bold bg-red-500/5 border border-red-500/10 p-2.5 rounded-xl">{formError}</p>
          )}

          {formSuccess && (
            <p className="text-2xs text-emerald-500 dark:text-emerald-450 font-bold bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl">{formSuccess}</p>
          )}

          <button
            type="submit"
            disabled={formLoading}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-2xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {formLoading ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" /> Launching...
              </span>
            ) : 'Launch Campaign'}
          </button>
        </form>
      </div>

      {/* Campaigns Management List */}
      <div className="lg:col-span-2 space-y-6">
        <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider">My Managed Campaigns</h3>

        {loadingCampaigns ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <span className="text-xs">Loading campaign registry...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 text-slate-450 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
            <p className="text-sm font-black">No campaigns created yet</p>
            <p className="text-2xs mt-1">Use the launcher on the left to set up your first clean drive!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {campaigns.map((c) => {
              const statusColors = {
                draft: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-450 border-slate-200 dark:border-slate-750',
                published: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-450 border-blue-100 dark:border-blue-900/30',
                registration_open: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-900/30',
                completed: 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-450 border-indigo-100 dark:border-indigo-900/30',
                cancelled: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 border-rose-100 dark:border-rose-900/30'
              };

              const formattedStatus = c.status.replace('_', ' ').toUpperCase();

              return (
                <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group">
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-4xs px-2.5 py-0.5 rounded-full border tracking-widest font-extrabold ${statusColors[c.status]}`}>
                        {formattedStatus}
                      </span>
                      <span className="text-3xs text-slate-400 font-medium">👥 {c.registrationCount} registered</span>
                    </div>

                    <div>
                      <h4 className="text-sm font-black text-slate-800 dark:text-white leading-snug">{c.title}</h4>
                      <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{c.description}</p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-3xs text-slate-500 dark:text-slate-400 font-bold">
                      <div className="flex items-center gap-1.5">
                        <span>📅</span>
                        <span>{new Date(c.campaignDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>⏰</span>
                        <span>{c.startTime.substring(0, 5)} – {c.endTime.substring(0, 5)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>📍</span>
                        <span>{c.location}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
                    {c.status === 'draft' && (
                      <button
                        onClick={() => handleStatusTransition(c.id, 'published')}
                        disabled={actionLoadingId !== null}
                        className="flex-1 py-2 px-3 bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-3xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {actionLoadingId === c.id ? 'Publishing...' : 'Publish'}
                      </button>
                    )}

                    {c.status === 'published' && (
                      <>
                        <button
                          onClick={() => handleStatusTransition(c.id, 'registration_open')}
                          disabled={actionLoadingId !== null}
                          className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-3xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {actionLoadingId === c.id ? 'Opening...' : 'Open Registration'}
                        </button>
                        <button
                          onClick={() => handleStatusTransition(c.id, 'cancelled')}
                          disabled={actionLoadingId !== null}
                          className="py-2 px-3 bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-3xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {c.status === 'registration_open' && (
                      <>
                        <button
                          onClick={() => handleStatusTransition(c.id, 'completed')}
                          disabled={actionLoadingId !== null}
                          className="flex-1 py-2 px-3 bg-indigo-500 hover:bg-indigo-650 text-white font-extrabold text-3xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {actionLoadingId === c.id ? 'Completing...' : 'Mark Completed'}
                        </button>
                        <button
                          onClick={() => handleStatusTransition(c.id, 'cancelled')}
                          disabled={actionLoadingId !== null}
                          className="py-2 px-3 bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-3xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {c.status === 'completed' && (
                      <span className="flex-1 py-2 px-3 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-extrabold text-3xs uppercase tracking-wider rounded-xl border border-indigo-100 dark:border-indigo-900/30 text-center flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Completed drive
                      </span>
                    )}

                    {c.status === 'cancelled' && (
                      <span className="flex-1 py-2 px-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 font-extrabold text-3xs uppercase tracking-wider rounded-xl border border-rose-100 dark:border-rose-900/30 text-center flex items-center justify-center gap-1">
                        <X className="w-3.5 h-3.5" /> Campaign Cancelled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
