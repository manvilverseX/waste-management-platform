-- Migration to support both resident and collector rewards on verified collection requests

CREATE OR REPLACE FUNCTION process_collection_request_reward()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'VERIFIED' AND (OLD.status IS NULL OR OLD.status != 'VERIFIED') THEN
        -- Award 100 points to resident with duplicate protection
        IF NOT EXISTS (
            SELECT 1 FROM public.reward_transactions 
            WHERE reference_type = 'collection_request' 
              AND reference_id = NEW.id 
              AND user_id = NEW.resident_id
        ) THEN
            INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
            VALUES (NEW.resident_id, 100, 'Verified waste collection contribution', 'collection_request', NEW.id);
        END IF;

        -- Award 100 points to collector (if exists) with duplicate protection
        IF NEW.collector_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.reward_transactions 
            WHERE reference_type = 'collection_request' 
              AND reference_id = NEW.id 
              AND user_id = NEW.collector_id
        ) THEN
            INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
            VALUES (NEW.collector_id, 100, 'Verified waste collection pickup reward', 'collection_request', NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
