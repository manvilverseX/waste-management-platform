-- 0022_notifications_rls.sql
-- Enables RLS on notifications table and establishes security policies.

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Select policy: users can only read their own notifications
CREATE POLICY "Users can select their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Update policy: users can only update their own notifications (e.g. mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);
