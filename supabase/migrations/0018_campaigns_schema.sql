-- 0018_campaigns_schema.sql
-- Creates database schema and triggers for Community Cleanliness Campaigns and registrations.

-- 1. Create campaigns table
CREATE TABLE public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    campaign_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(255) NOT NULL,
    expected_participants INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'registration_open', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create campaign_registrations table
CREATE TABLE public.campaign_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, user_id)
);

-- 3. Create indexes for performance optimization
CREATE INDEX idx_campaigns_community ON public.campaigns(community_id);
CREATE INDEX idx_campaigns_organizer ON public.campaigns(organizer_id);
CREATE INDEX idx_campaigns_status_date ON public.campaigns(status, campaign_date);
CREATE INDEX idx_campaign_registrations_campaign ON public.campaign_registrations(campaign_id);
CREATE INDEX idx_campaign_registrations_user ON public.campaign_registrations(user_id);

-- 4. Status transition lifecycle verification trigger
CREATE OR REPLACE FUNCTION public.check_campaign_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- draft -> published OR cancelled
    IF OLD.status = 'draft' AND NEW.status NOT IN ('published', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from draft to %', NEW.status;
    END IF;
    
    -- published -> registration_open OR cancelled
    IF OLD.status = 'published' AND NEW.status NOT IN ('registration_open', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from published to %', NEW.status;
    END IF;
    
    -- registration_open -> completed OR cancelled
    IF OLD.status = 'registration_open' AND NEW.status NOT IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from registration_open to %', NEW.status;
    END IF;
    
    -- completed cannot be transitioned
    IF OLD.status = 'completed' THEN
        RAISE EXCEPTION 'Cannot transition status from completed';
    END IF;
    
    -- cancelled cannot be transitioned
    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot transition status from cancelled';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campaign_status_transition
BEFORE UPDATE OF status ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.check_campaign_status_transition();

-- 5. Organizer community membership verification trigger
CREATE OR REPLACE FUNCTION public.verify_campaign_organizer_community()
RETURNS TRIGGER AS $$
DECLARE
    v_is_member BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.community_memberships
        WHERE user_id = NEW.organizer_id AND community_id = NEW.community_id
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RAISE EXCEPTION 'Organizer does not belong to the campaign''s community';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verify_campaign_organizer_community
BEFORE INSERT OR UPDATE OF organizer_id, community_id ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.verify_campaign_organizer_community();

-- 6. Participant community membership verification trigger
CREATE OR REPLACE FUNCTION public.verify_registration_community()
RETURNS TRIGGER AS $$
DECLARE
    v_campaign_community UUID;
    v_is_member BOOLEAN;
BEGIN
    SELECT community_id INTO v_campaign_community
    FROM public.campaigns
    WHERE id = NEW.campaign_id;

    SELECT EXISTS (
        SELECT 1 FROM public.community_memberships
        WHERE user_id = NEW.user_id AND community_id = v_campaign_community
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RAISE EXCEPTION 'User does not belong to the campaign''s community';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verify_registration_community
BEFORE INSERT ON public.campaign_registrations
FOR EACH ROW EXECUTE FUNCTION public.verify_registration_community();
