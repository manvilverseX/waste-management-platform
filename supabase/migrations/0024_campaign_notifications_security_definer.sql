-- 0024_campaign_notifications_security_definer.sql
-- Recreates generate_campaign_notifications trigger function as a SECURITY DEFINER function.
-- Constrains search_path and revokes execute privileges from PUBLIC, anon, and authenticated to prevent direct client RPC execution.

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
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog;

-- Restrict execution access to prevent direct RPC execution by clients
REVOKE EXECUTE ON FUNCTION public.generate_campaign_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_campaign_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_campaign_notifications() FROM authenticated;
