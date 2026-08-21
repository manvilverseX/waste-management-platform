-- 0020_notifications_schema.sql
-- Creates the notifications system and database trigger for automated cleanliness campaign notifications.

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_type VARCHAR(100),
    reference_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_ref ON public.notifications(reference_type, reference_id);

-- Unique index to prevent duplicate notifications for campaigns
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_campaign_user
ON public.notifications (user_id, reference_id)
WHERE reference_type = 'campaign';

-- Trigger function to generate in-app notifications when a campaign registration opens
CREATE OR REPLACE FUNCTION public.generate_campaign_notifications()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'registration_open' AND (OLD.status IS NULL OR OLD.status != 'registration_open') THEN
        -- Insert notifications for all residents of the campaign's community
        INSERT INTO public.notifications (user_id, type, title, message, reference_type, reference_id)
        SELECT
            cm.user_id,
            'campaign',
            'New Community Cleanliness Campaign',
            'A new cleanliness campaign "' || NEW.title || '" is open for registration on ' || to_char(NEW.campaign_date, 'DD Mon YYYY') || '.',
            'campaign',
            NEW.id
        FROM public.community_memberships cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE cm.community_id = NEW.community_id
          AND u.role = 'resident'
        ON CONFLICT (user_id, reference_id) WHERE reference_type = 'campaign' DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_campaign_notifications
AFTER UPDATE OF status ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.generate_campaign_notifications();
