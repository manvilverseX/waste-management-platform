import React, { useState, useEffect } from 'react';
import { Loader2, Bell, Check, Calendar, MapPin, Clock, User, Users } from 'lucide-react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceType: string;
  referenceId: string;
  isRead: boolean;
  createdAt: string;
}

interface CampaignDetail {
  id: string;
  title: string;
  description: string;
  campaignDate: string;
  startTime: string;
  endTime: string;
  location: string;
  organizerName: string;
  registrationCount: number;
  status: string;
}

interface NotificationsTabProps {
  onUnreadCountChange: (count: number) => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ onUnreadCountChange }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [myRegistrationStatus, setMyRegistrationStatus] = useState<'not_registered' | 'registered' | 'cancelled'>('not_registered');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabaseBrowserClient.auth.getSession();
        if (!session || !active) return;

        const res = await fetch('/api/notifications', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const result = await res.json();
        if (res.ok && result.success && active) {
          const list = result.data || [];
          setNotifications(list);
          const unreadCount = list.filter((n: NotificationItem) => !n.isRead).length;
          onUnreadCountChange(unreadCount);
        }
      } catch (e) {
        console.error('Error fetching notifications:', e);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [onUnreadCountChange]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ isRead: true })
      });

      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
        const unreadCount = notifications.filter((n) => n.id !== notificationId && !n.isRead).length;
        onUnreadCountChange(unreadCount);
      }
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const handleOpenCampaign = async (refId: string) => {
    setLoadingDetail(true);
    setSelectedCampaign(null);
    try {
      const { data: { user } } = await supabaseBrowserClient.auth.getUser();
      if (!user) return;

      // 1. Fetch Campaign and join Organizer name
      const { data: campData, error: campErr } = await supabaseBrowserClient
        .from('campaigns')
        .select(`
          *,
          organizer:users!campaigns_organizer_id_fkey(name)
        `)
        .eq('id', refId)
        .single();

      if (campErr || !campData) {
        alert('Campaign detail could not be loaded.');
        setLoadingDetail(false);
        return;
      }

      // 2. Fetch Registration count
      const { count } = await supabaseBrowserClient
        .from('campaign_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', refId)
        .eq('status', 'registered');

      // 3. Fetch current user registration status
      const { data: myReg } = await supabaseBrowserClient
        .from('campaign_registrations')
        .select('status')
        .eq('campaign_id', refId)
        .eq('user_id', user.id)
        .maybeSingle();

      const regStatus = myReg ? myReg.status : 'not_registered';

      setSelectedCampaign({
        id: campData.id,
        title: campData.title,
        description: campData.description,
        campaignDate: campData.campaign_date,
        startTime: campData.start_time,
        endTime: campData.end_time,
        location: campData.location,
        organizerName: campData.organizer?.name || 'Resident Organizer',
        registrationCount: count || 0,
        status: campData.status
      });

      setMyRegistrationStatus(regStatus);

    } catch (e) {
      console.error('Failed to load campaign details:', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRegister = async () => {
    if (!selectedCampaign) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/campaigns/${selectedCampaign.id}/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setMyRegistrationStatus('registered');
        setSelectedCampaign((prev) =>
          prev ? { ...prev, registrationCount: prev.registrationCount + 1 } : null
        );
      } else {
        alert(result.error?.message || 'Failed to register.');
      }
    } catch (e) {
      console.error('Registration failed:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!selectedCampaign) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabaseBrowserClient.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/campaigns/${selectedCampaign.id}/register`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ status: 'cancelled' })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setMyRegistrationStatus('cancelled');
        setSelectedCampaign((prev) =>
          prev ? { ...prev, registrationCount: Math.max(0, prev.registrationCount - 1) } : null
        );
      } else {
        alert(result.error?.message || 'Failed to cancel registration.');
      }
    } catch (e) {
      console.error('Cancellation failed:', e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Notifications List */}
      <div className="lg:col-span-2 space-y-4">
        <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Bell className="w-5 h-5 text-indigo-500" />
          Alerts & Activity
        </h3>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-xs">Checking inbox...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12 text-slate-450 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
            <p className="text-sm font-black">All caught up!</p>
            <p className="text-2xs mt-1">Notifications and campaign invites will arrive here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => n.referenceType === 'campaign' && handleOpenCampaign(n.referenceId)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-start ${
                  n.isRead
                    ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-850 text-slate-505 dark:text-slate-400'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                }`}
              >
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    {!n.isRead && (
                      <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0"></span>
                    )}
                    <span className={`text-xs ${!n.isRead ? 'font-black' : 'font-bold'}`}>{n.title}</span>
                  </div>
                  <p className="text-2xs leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                    {n.message}
                  </p>
                  <span className="text-4xs text-slate-400 font-medium block pt-1">
                    {new Date(n.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>

                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAsRead(n.id);
                    }}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-emerald-500 transition-colors"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details sidebar panel */}
      <div className="lg:col-span-1">
        {loadingDetail ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-xs text-slate-400 mt-2">Loading details...</span>
          </div>
        ) : selectedCampaign ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-6">
            <div>
              <span className="text-4xs bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/30 tracking-wider font-extrabold uppercase">
                Campaign Invitation
              </span>
              <h3 className="text-base font-black text-slate-800 dark:text-white mt-3 leading-snug">{selectedCampaign.title}</h3>
            </div>

            <p className="text-2xs text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50/50 dark:bg-slate-950/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-850 font-medium">
              {selectedCampaign.description}
            </p>

            <div className="space-y-3.5 text-3xs font-bold text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{new Date(selectedCampaign.campaignDate).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{selectedCampaign.startTime.substring(0, 5)} – {selectedCampaign.endTime.substring(0, 5)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{selectedCampaign.location}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-slate-400" />
                <span>Organizer: <span className="text-slate-800 dark:text-slate-200 font-extrabold">{selectedCampaign.organizerName}</span></span>
              </div>
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>Registrations: <span className="text-slate-800 dark:text-slate-200 font-extrabold">{selectedCampaign.registrationCount} residents</span></span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              {myRegistrationStatus === 'registered' ? (
                <div className="space-y-3">
                  <div className="w-full py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-450 text-center font-extrabold text-xs rounded-2xl flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4" /> You&apos;re registered
                  </div>
                  {selectedCampaign.status !== 'completed' && selectedCampaign.status !== 'cancelled' && (
                    <button
                      onClick={handleCancelRegistration}
                      disabled={actionLoading}
                      className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs rounded-2xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                    >
                      {actionLoading ? 'Cancelling...' : 'Cancel Registration'}
                    </button>
                  )}
                </div>
              ) : (
                selectedCampaign.status === 'registration_open' ? (
                  <button
                    onClick={handleRegister}
                    disabled={actionLoading}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-2xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                  >
                    {actionLoading ? 'Registering...' : 'Register for Campaign'}
                  </button>
                ) : (
                  <div className="w-full py-2.5 bg-slate-100 dark:bg-slate-850 text-slate-500 text-center font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-800">
                    Registration Closed ({selectedCampaign.status})
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-250 dark:border-slate-800 rounded-3xl p-6 text-center text-slate-400 dark:text-slate-500 text-xs min-h-[250px] flex flex-col justify-center items-center">
            <Bell className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
            <span>Select a campaign notification to view details and register.</span>
          </div>
        )}
      </div>
    </div>
  );
};
