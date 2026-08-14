-- Create the public 'evidence' storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Allow authenticated users to upload/insert files to the 'evidence' bucket
CREATE POLICY "Allow authenticated users to upload evidence"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'evidence');

-- RLS Policy: Allow public select access to read evidence photos
CREATE POLICY "Allow public read access to evidence"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'evidence');
