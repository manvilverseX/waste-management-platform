-- 0019_campaign_lifecycle_adjustment.sql
-- Adjusts the campaign status transition logic so that draft campaigns cannot be cancelled directly.

CREATE OR REPLACE FUNCTION public.check_campaign_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- draft -> published (cannot transition to cancelled from draft)
    IF OLD.status = 'draft' AND NEW.status != 'published' THEN
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
