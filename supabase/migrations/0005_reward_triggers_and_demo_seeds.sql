-- Seed fictional communities
INSERT INTO public.communities (id, name, address, latitude, longitude)
VALUES 
  ('eb888dee-4b1e-4c65-8ffa-351783fd06d1', 'Maplewood District', '456 Maple Avenue, Sector 2', 12.9810, 77.6010),
  ('fc888dee-4b1e-4c65-8ffa-351783fd06d2', 'Riverside Community', '789 River Boulevard, Sector 5', 12.9610, 77.5810),
  ('1c888dee-4b1e-4c65-8ffa-351783fd06d3', 'Green Valley Residential', '123 Valley Road, Sector 8', 12.9510, 77.5710)
ON CONFLICT (id) DO NOTHING;

-- Function to award points on verified collection requests
CREATE OR REPLACE FUNCTION process_collection_request_reward()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'VERIFIED' AND (OLD.status IS NULL OR OLD.status != 'VERIFIED') THEN
        -- Check duplicate
        IF NOT EXISTS (
            SELECT 1 FROM public.reward_transactions 
            WHERE reference_type = 'collection_request' AND reference_id = NEW.id
        ) THEN
            INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
            VALUES (NEW.resident_id, 100, 'Verified waste collection contribution', 'collection_request', NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for collection requests reward
CREATE OR REPLACE TRIGGER trg_collection_request_reward
AFTER UPDATE ON public.collection_requests
FOR EACH ROW
EXECUTE FUNCTION process_collection_request_reward();


-- Function to award points on validated dumping reports (cleaned status)
CREATE OR REPLACE FUNCTION process_dumping_report_reward()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'cleaned' AND (OLD.status IS NULL OR OLD.status != 'cleaned') THEN
        -- Check duplicate
        IF NOT EXISTS (
            SELECT 1 FROM public.reward_transactions 
            WHERE reference_type = 'dumping_report' AND reference_id = NEW.id
        ) THEN
            INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
            VALUES (NEW.reported_by, 150, 'Validated illegal dumping report', 'dumping_report', NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for dumping reports reward
CREATE OR REPLACE TRIGGER trg_dumping_report_reward
AFTER UPDATE ON public.dumping_reports
FOR EACH ROW
EXECUTE FUNCTION process_dumping_report_reward();
