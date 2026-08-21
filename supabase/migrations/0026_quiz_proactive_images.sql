-- 0026_quiz_proactive_images.sql
-- Phase 5B: Proactive AI-Assessed Environmental Quiz
--
-- Changes:
-- 1. Fix pre-existing bug: reward_transactions.points was INTEGER, truncating 0.5→0
-- 2. Create quiz-images private storage bucket with owner-scoped RLS
-- 3. Add image/AI assessment columns to quiz_attempts
-- 4. Replace submit_quiz_answer with submit_quiz_answer_v2 that handles
--    both text-only (0.5 pts) and AI-verified image (1.0 pts) submissions

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Fix reward_transactions.points: INTEGER → DECIMAL(10,2)
--    PostgreSQL was silently truncating 0.5 → 0, meaning quiz correct answers
--    awarded zero points to the balance. This fixes the data type.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reward_transactions
  ALTER COLUMN points TYPE DECIMAL(10,2);


-- ──────────────────────────────────────────────────────────────────────────
-- 2. Create quiz-images storage bucket (private — NOT public)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('quiz-images', 'quiz-images', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload ONLY to their own user-id-prefixed path
CREATE POLICY "quiz_images_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quiz-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read ONLY their own images
CREATE POLICY "quiz_images_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quiz-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can read all quiz images (for server-side AI assessment)
CREATE POLICY "quiz_images_service_role_select"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'quiz-images');

-- Users can delete their own images (cleanup)
CREATE POLICY "quiz_images_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'quiz-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ──────────────────────────────────────────────────────────────────────────
-- 3. Extend quiz_attempts with image and AI assessment columns
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS has_image_submission BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS image_storage_path   TEXT,
  ADD COLUMN IF NOT EXISTS ai_verdict           VARCHAR(20)     -- 'relevant' | 'irrelevant' | 'error'
    CHECK (ai_verdict IN ('relevant', 'irrelevant', 'error')),
  ADD COLUMN IF NOT EXISTS ai_confidence        DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS ai_reasoning         TEXT;


-- ──────────────────────────────────────────────────────────────────────────
-- 4. Replace submit_quiz_answer with submit_quiz_answer_v2
--    Points logic (server-side, tamper-proof):
--      incorrect answer                            → 0 pts
--      correct, no image                           → content.reward_points (0.5)
--      correct, image, ai_verdict='relevant' ≥0.70 → content.reward_points * 2 (1.0)
--      correct, image, ai rejected/error           → content.reward_points (0.5, base only)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_quiz_answer_v2(
  p_content_id        UUID,
  p_answer            TEXT,
  p_image_storage_path TEXT    DEFAULT NULL,
  p_ai_verdict        VARCHAR(20) DEFAULT NULL,
  p_ai_confidence     DECIMAL(4,3) DEFAULT NULL,
  p_ai_reasoning      TEXT    DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_user_id         UUID;
  v_content_record  RECORD;
  v_is_correct      BOOLEAN;
  v_daily_attempts  INT;
  v_attempt_id      UUID;
  v_base_points     DECIMAL(10,2);
  v_points_awarded  DECIMAL(10,2) := 0;
  v_has_image       BOOLEAN;
  v_image_bonus     BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch content record
  SELECT * INTO v_content_record
  FROM public.educational_content
  WHERE id = p_content_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Educational content not found';
  END IF;

  IF v_content_record.type != 'quiz_mcq' THEN
    RAISE EXCEPTION 'Content is not an MCQ quiz';
  END IF;

  -- Check if already attempted (lifetime, not just today)
  IF EXISTS (
    SELECT 1 FROM public.quiz_attempts
    WHERE user_id = v_user_id AND content_id = p_content_id
  ) THEN
    RAISE EXCEPTION 'You have already attempted this quiz question';
  END IF;

  -- Check daily limit (max 5 attempts per calendar day)
  SELECT COUNT(*) INTO v_daily_attempts
  FROM public.quiz_attempts
  WHERE user_id = v_user_id AND attempt_date = CURRENT_DATE;

  IF v_daily_attempts >= 5 THEN
    RAISE EXCEPTION 'Daily quiz limit reached. You can only answer 5 questions per day.';
  END IF;

  -- Determine correctness (server-side, from DB record — not from client)
  v_is_correct := (p_answer = v_content_record.correct_answer);

  -- Determine base points
  v_base_points := COALESCE(v_content_record.reward_points, 0);

  -- Determine image bonus eligibility
  v_has_image   := (p_image_storage_path IS NOT NULL AND p_image_storage_path != '');
  v_image_bonus := v_has_image
                   AND p_ai_verdict = 'relevant'
                   AND COALESCE(p_ai_confidence, 0) >= 0.70;

  -- Calculate final points (ONLY if correct; client cannot influence this)
  IF v_is_correct THEN
    IF v_image_bonus THEN
      v_points_awarded := v_base_points * 2;  -- 0.5 → 1.0
    ELSE
      v_points_awarded := v_base_points;      -- 0.5 always (text-only or image rejected)
    END IF;
  END IF;
  -- incorrect → v_points_awarded stays 0

  -- Insert attempt record
  INSERT INTO public.quiz_attempts (
    user_id, content_id, attempt_date,
    answer_provided, is_correct, points_awarded,
    has_image_submission, image_storage_path,
    ai_verdict, ai_confidence, ai_reasoning
  )
  VALUES (
    v_user_id, p_content_id, CURRENT_DATE,
    p_answer, v_is_correct, v_points_awarded,
    v_has_image, p_image_storage_path,
    p_ai_verdict, p_ai_confidence, p_ai_reasoning
  )
  RETURNING id INTO v_attempt_id;

  -- Award points via reward_transactions if earned
  IF v_is_correct AND v_points_awarded > 0 THEN
    INSERT INTO public.reward_transactions (
      user_id, points, reason, reference_type, reference_id
    )
    VALUES (
      v_user_id,
      v_points_awarded,
      CASE
        WHEN v_image_bonus THEN
          'AI-verified photo answer for quiz: ' || v_content_record.title
        ELSE
          'Correct answer for quiz: ' || v_content_record.title
      END,
      CASE WHEN v_image_bonus THEN 'quiz_answer_image' ELSE 'quiz_answer' END,
      v_attempt_id
    );
  END IF;

  RETURN json_build_object(
    'success',           true,
    'is_correct',        v_is_correct,
    'points_awarded',    v_points_awarded,
    'correct_answer',    v_content_record.correct_answer,
    'had_image',         v_has_image,
    'image_bonus',       v_image_bonus,
    'ai_verdict',        p_ai_verdict,
    'ai_confidence',     p_ai_confidence
  );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog;

-- Revoke and re-grant on new function
REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer_v2(UUID, TEXT, TEXT, VARCHAR(20), DECIMAL(4,3), TEXT)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer_v2(UUID, TEXT, TEXT, VARCHAR(20), DECIMAL(4,3), TEXT)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer_v2(UUID, TEXT, TEXT, VARCHAR(20), DECIMAL(4,3), TEXT)
  TO authenticated, service_role;
