-- Seed three new real-world demo communities
INSERT INTO public.communities (id, name, address, latitude, longitude)
VALUES 
  ('a1888dee-4b1e-4c65-8ffa-351783fd06d0', 'Purvankara Apartments, CRPF', 'CRPF Compound, Yelahanka, Bengaluru', 13.1190, 77.5810),
  ('b1888dee-4b1e-4c65-8ffa-351783fd06d1', 'Prestige Elite, Avalahalli', 'Avalahalli Main Road, Doddaballapur Road, Bengaluru', 13.1120, 77.5680),
  ('c1888dee-4b1e-4c65-8ffa-351783fd06d2', 'Concord Silicon Valley, Rajanakunte', 'Rajanakunte Locality, Yelahanka Taluk, Bengaluru', 13.1670, 77.5720)
ON CONFLICT (id) DO NOTHING;

-- Seed weekly demo score history for the new and existing communities
-- Communities: 
-- 1. Purvankara Apartments (a1888dee-4b1e-4c65-8ffa-351783fd06d0)
-- 2. Prestige Elite (b1888dee-4b1e-4c65-8ffa-351783fd06d1)
-- 3. Concord Silicon Valley (c1888dee-4b1e-4c65-8ffa-351783fd06d2)
-- 4. Maplewood District (eb888dee-4b1e-4c65-8ffa-351783fd06d1)

-- 1. Purvankara Apartments, CRPF (Gradual Improvement)
INSERT INTO public.community_scores (id, community_id, score, period, breakdown, calculated_at)
VALUES
  ('aa100000-0000-0000-0000-000000000001', 'a1888dee-4b1e-4c65-8ffa-351783fd06d0', 65, '2026-W30', '{"segregation": 60, "participation": 65, "cleanliness": 70}'::jsonb, '2026-07-26T23:59:59+00:00'),
  ('aa100000-0000-0000-0000-000000000002', 'a1888dee-4b1e-4c65-8ffa-351783fd06d0', 72, '2026-W31', '{"segregation": 68, "participation": 72, "cleanliness": 76}'::jsonb, '2026-08-02T23:59:59+00:00'),
  ('aa100000-0000-0000-0000-000000000003', 'a1888dee-4b1e-4c65-8ffa-351783fd06d0', 78, '2026-W32', '{"segregation": 75, "participation": 78, "cleanliness": 81}'::jsonb, '2026-08-09T23:59:59+00:00'),
  ('aa100000-0000-0000-0000-000000000004', 'a1888dee-4b1e-4c65-8ffa-351783fd06d0', 85, '2026-W33', '{"segregation": 82, "participation": 85, "cleanliness": 88}'::jsonb, '2026-08-16T23:59:59+00:00'),
  ('aa100000-0000-0000-0000-000000000005', 'a1888dee-4b1e-4c65-8ffa-351783fd06d0', 91, '2026-W34', '{"segregation": 89, "participation": 90, "cleanliness": 94}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. Prestige Elite, Avalahalli (High performance, minor fluctuations)
INSERT INTO public.community_scores (id, community_id, score, period, breakdown, calculated_at)
VALUES
  ('bb100000-0000-0000-0000-000000000001', 'b1888dee-4b1e-4c65-8ffa-351783fd06d1', 88, '2026-W30', '{"segregation": 85, "participation": 90, "cleanliness": 89}'::jsonb, '2026-07-26T23:59:59+00:00'),
  ('bb100000-0000-0000-0000-000000000002', 'b1888dee-4b1e-4c65-8ffa-351783fd06d1', 89, '2026-W31', '{"segregation": 86, "participation": 92, "cleanliness": 89}'::jsonb, '2026-08-02T23:59:59+00:00'),
  ('bb100000-0000-0000-0000-000000000003', 'b1888dee-4b1e-4c65-8ffa-351783fd06d1', 87, '2026-W32', '{"segregation": 84, "participation": 90, "cleanliness": 87}'::jsonb, '2026-08-09T23:59:59+00:00'),
  ('bb100000-0000-0000-0000-000000000004', 'b1888dee-4b1e-4c65-8ffa-351783fd06d1', 90, '2026-W33', '{"segregation": 88, "participation": 91, "cleanliness": 91}'::jsonb, '2026-08-16T23:59:59+00:00'),
  ('bb100000-0000-0000-0000-000000000005', 'b1888dee-4b1e-4c65-8ffa-351783fd06d1', 92, '2026-W34', '{"segregation": 90, "participation": 93, "cleanliness": 93}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Concord Silicon Valley, Rajanakunte (Struggling but recovering)
INSERT INTO public.community_scores (id, community_id, score, period, breakdown, calculated_at)
VALUES
  ('cc100000-0000-0000-0000-000000000001', 'c1888dee-4b1e-4c65-8ffa-351783fd06d2', 52, '2026-W30', '{"segregation": 45, "participation": 55, "cleanliness": 56}'::jsonb, '2026-07-26T23:59:59+00:00'),
  ('cc100000-0000-0000-0000-000000000002', 'c1888dee-4b1e-4c65-8ffa-351783fd06d2', 50, '2026-W31', '{"segregation": 44, "participation": 52, "cleanliness": 54}'::jsonb, '2026-08-02T23:59:59+00:00'),
  ('cc100000-0000-0000-0000-000000000003', 'c1888dee-4b1e-4c65-8ffa-351783fd06d2', 58, '2026-W32', '{"segregation": 50, "participation": 60, "cleanliness": 64}'::jsonb, '2026-08-09T23:59:59+00:00'),
  ('cc100000-0000-0000-0000-000000000004', 'c1888dee-4b1e-4c65-8ffa-351783fd06d2', 64, '2026-W33', '{"segregation": 58, "participation": 65, "cleanliness": 69}'::jsonb, '2026-08-16T23:59:59+00:00'),
  ('cc100000-0000-0000-0000-000000000005', 'c1888dee-4b1e-4c65-8ffa-351783fd06d2', 69, '2026-W34', '{"segregation": 64, "participation": 70, "cleanliness": 73}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. Maplewood District, eb888dee-4b1e-4c65-8ffa-351783fd06d1 (Seeded in 0005, dynamic testing dashboard target)
INSERT INTO public.community_scores (id, community_id, score, period, breakdown, calculated_at)
VALUES
  ('dd100000-0000-0000-0000-000000000001', 'eb888dee-4b1e-4c65-8ffa-351783fd06d1', 70, '2026-W30', '{"segregation": 65, "participation": 70, "cleanliness": 75}'::jsonb, '2026-07-26T23:59:59+00:00'),
  ('dd100000-0000-0000-0000-000000000002', 'eb888dee-4b1e-4c65-8ffa-351783fd06d1', 74, '2026-W31', '{"segregation": 70, "participation": 73, "cleanliness": 79}'::jsonb, '2026-08-02T23:59:59+00:00'),
  ('dd100000-0000-0000-0000-000000000003', 'eb888dee-4b1e-4c65-8ffa-351783fd06d1', 73, '2026-W32', '{"segregation": 69, "participation": 72, "cleanliness": 78}'::jsonb, '2026-08-09T23:59:59+00:00'),
  ('dd100000-0000-0000-0000-000000000004', 'eb888dee-4b1e-4c65-8ffa-351783fd06d1', 82, '2026-W33', '{"segregation": 78, "participation": 81, "cleanliness": 87}'::jsonb, '2026-08-16T23:59:59+00:00'),
  ('dd100000-0000-0000-0000-000000000005', 'eb888dee-4b1e-4c65-8ffa-351783fd06d1', 86, '2026-W34', '{"segregation": 83, "participation": 85, "cleanliness": 90}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;
