-- 0023_complete_campaign_security_definer.sql
-- Recreates complete_campaign as a SECURITY DEFINER function to run with privileged access.
-- Constrains search_path and enforces authorization checking using auth.uid() inside the database layer.

CREATE OR REPLACE FUNCTION public.complete_campaign(p_campaign_id UUID)
RETURNS JSON AS $$
DECLARE
    v_organizer_id UUID;
    v_community_id UUID;
    v_status VARCHAR(50);
    v_title VARCHAR(255);
    v_participants_rewarded INTEGER := 0;
    v_organizer_rewarded BOOLEAN := FALSE;
    r RECORD;
BEGIN
    -- 1. Lock the campaign row for update
    SELECT organizer_id, community_id, status, title
    INTO v_organizer_id, v_community_id, v_status, v_title
    FROM public.campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found';
    END IF;

    -- 2. Security Check: Enforce caller matches organizer (if called via authenticated API context)
    IF auth.uid() IS NOT NULL AND auth.uid() != v_organizer_id THEN
        RAISE EXCEPTION 'Only the campaign organizer can complete the campaign';
    END IF;

    -- If campaign is already completed, return early with current statistics
    IF v_status = 'completed' THEN
        SELECT count(*)::integer INTO v_participants_rewarded
        FROM public.reward_transactions
        WHERE reference_id = p_campaign_id
          AND reference_type = 'campaign_participation';

        SELECT EXISTS(
            SELECT 1 FROM public.reward_transactions
            WHERE reference_id = p_campaign_id
              AND reference_type = 'campaign_organizer'
        ) INTO v_organizer_rewarded;

        RETURN json_build_object(
            'success', true,
            'campaign_id', p_campaign_id,
            'participants_rewarded', v_participants_rewarded,
            'organizer_rewarded', v_organizer_rewarded,
            'participant_points', v_participants_rewarded * 100,
            'organizer_points', CASE WHEN v_organizer_rewarded THEN 1000 ELSE 0 END
        );
    END IF;

    -- 3. Transition campaign status to 'completed'
    UPDATE public.campaigns
    SET status = 'completed', updated_at = NOW()
    WHERE id = p_campaign_id;

    -- 4. Insert participant reward transactions (+100 pts) for attended participants
    FOR r IN
        SELECT DISTINCT user_id
        FROM public.campaign_registrations
        WHERE campaign_id = p_campaign_id
          AND status = 'attended'
    LOOP
        INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
        VALUES (
            r.user_id,
            100,
            'Cleanliness campaign attendance reward for campaign: ' || v_title,
            'campaign_participation',
            p_campaign_id
        )
        ON CONFLICT (reference_id, user_id) WHERE reference_type = 'campaign_participation' DO NOTHING;

        v_participants_rewarded := v_participants_rewarded + 1;
    END LOOP;

    -- 5. Insert organizer reward transaction (+1000 pts)
    INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
    VALUES (
        v_organizer_id,
        1000,
        'Cleanliness campaign organization reward for campaign: ' || v_title,
        'campaign_organizer',
        p_campaign_id
    )
    ON CONFLICT (reference_id, user_id) WHERE reference_type = 'campaign_organizer' DO NOTHING;

    v_organizer_rewarded := TRUE;

    RETURN json_build_object(
        'success', true,
        'campaign_id', p_campaign_id,
        'participants_rewarded', v_participants_rewarded,
        'organizer_rewarded', v_organizer_rewarded,
        'participant_points', v_participants_rewarded * 100,
        'organizer_points', 1000
    );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog;

-- Restrict execution access to authenticated users and service role only
REVOKE EXECUTE ON FUNCTION public.complete_campaign(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_campaign(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_campaign(UUID) TO authenticated, service_role;
