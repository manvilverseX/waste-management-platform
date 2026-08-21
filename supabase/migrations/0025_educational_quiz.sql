-- 0025_educational_quiz.sql

CREATE TABLE public.educational_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('tip', 'quiz_mcq', 'quiz_media')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    options JSONB, -- For MCQs: ["Option A", "Option B"]
    correct_answer TEXT,
    reward_points DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.educational_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_educational_content ON public.educational_content
    FOR SELECT TO authenticated USING (true);


CREATE TABLE public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES public.educational_content(id) ON DELETE CASCADE,
    attempt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    answer_provided TEXT,
    is_correct BOOLEAN,
    points_awarded DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_quiz_attempt UNIQUE (user_id, content_id)
);

-- Enable RLS
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_own_quiz_attempts ON public.quiz_attempts
    FOR SELECT TO authenticated USING (user_id = auth.uid());


-- Function to submit a quiz answer atomically
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(p_content_id UUID, p_answer TEXT)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_content_record RECORD;
    v_is_correct BOOLEAN;
    v_daily_attempts INT;
    v_attempt_id UUID;
    v_points_awarded DECIMAL(10,2) := 0;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock the content row (mostly to ensure it exists)
    SELECT * INTO v_content_record
    FROM public.educational_content
    WHERE id = p_content_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Educational content not found';
    END IF;

    IF v_content_record.type != 'quiz_mcq' THEN
        RAISE EXCEPTION 'Content is not an MCQ quiz';
    END IF;

    -- Check if already attempted
    IF EXISTS (SELECT 1 FROM public.quiz_attempts WHERE user_id = v_user_id AND content_id = p_content_id) THEN
        RAISE EXCEPTION 'You have already attempted this quiz question';
    END IF;

    -- Check daily limits (max 5 attempts per day)
    SELECT COUNT(*) INTO v_daily_attempts
    FROM public.quiz_attempts
    WHERE user_id = v_user_id AND attempt_date = CURRENT_DATE;

    IF v_daily_attempts >= 5 THEN
        RAISE EXCEPTION 'Daily quiz limit reached. You can only answer 5 questions per day.';
    END IF;

    -- Check correctness
    v_is_correct := (p_answer = v_content_record.correct_answer);

    -- Assign points
    IF v_is_correct THEN
        v_points_awarded := COALESCE(v_content_record.reward_points, 0);
    END IF;

    -- Insert attempt
    INSERT INTO public.quiz_attempts (user_id, content_id, attempt_date, answer_provided, is_correct, points_awarded)
    VALUES (v_user_id, p_content_id, CURRENT_DATE, p_answer, v_is_correct, v_points_awarded)
    RETURNING id INTO v_attempt_id;

    -- Award points if correct
    IF v_is_correct AND v_points_awarded > 0 THEN
        INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
        VALUES (
            v_user_id,
            v_points_awarded,
            'Correct answer for quiz: ' || v_content_record.title,
            'quiz_answer',
            v_attempt_id
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'is_correct', v_is_correct,
        'points_awarded', v_points_awarded,
        'correct_answer', v_content_record.correct_answer
    );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(UUID, TEXT) TO authenticated, service_role;

-- Seed sample educational tips
INSERT INTO public.educational_content (type, title, content) VALUES
('tip', 'Wash Recyclables Before Discarding', 'Clean containers prevent contamination in the recycling bin, increasing the reuse value and earning you perfect segregation reward points!'),
('tip', 'Compost Food Scraps', 'Organic waste like fruit peels and coffee grounds can be composted into nutrient-rich soil. This reduces landfill methane emissions.'),
('tip', 'Flatten Cardboard Boxes', 'Break down cardboard boxes before recycling. It saves space in bins and collection trucks, reducing carbon emissions from transportation.');

-- Seed sample quiz MCQs
INSERT INTO public.educational_content (type, title, content, options, correct_answer, reward_points) VALUES
('quiz_mcq', 'Which of these is NOT recyclable?', 'Select the item that should go in the general waste bin instead of the recycling bin.', '["Clean cardboard", "Greasy pizza box", "Glass bottle", "Aluminium can"]', 'Greasy pizza box', 0.5),
('quiz_mcq', 'How long does a plastic bottle take to decompose?', 'Select the most accurate estimate for plastic bottle decomposition in a landfill.', '["5-10 years", "50-100 years", "450+ years", "1000+ years"]', '450+ years', 0.5),
('quiz_mcq', 'What is the correct way to dispose of batteries?', 'Household batteries contain heavy metals and should not be thrown in regular trash.', '["General waste bin", "Recycling bin", "Compost bin", "E-waste drop-off point"]', 'E-waste drop-off point', 0.5),
('quiz_mcq', 'Which color bin is typically used for organic/compost waste?', 'Standard color coding helps collectors process waste efficiently.', '["Blue", "Yellow", "Green", "Black"]', 'Green', 0.5),
('quiz_mcq', 'What should you do with plastic shopping bags?', 'Soft plastics can jam sorting machines at recycling facilities.', '["Put them in the recycling bin", "Return them to grocery store drop-offs", "Burn them", "Bury them"]', 'Return them to grocery store drop-offs', 0.5),
('quiz_mcq', 'Which item uses the most energy to produce from raw materials vs recycled?', 'Recycling this material saves up to 95% of the energy needed to make it from scratch.', '["Glass", "Paper", "Aluminium", "Plastic"]', 'Aluminium', 0.5);
