import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────

interface GrokImageAssessment {
  verdict: 'relevant' | 'irrelevant';
  confidence: number;
  reasoning: string;
}

interface QuizSubmitResult {
  isCorrect: boolean;
  pointsAwarded: number;
  correctAnswer: string;
  hadImageSubmission: boolean;
  imageBonus: boolean;
  aiVerdict: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
}

// ── Grok image relevance assessment ────────────────────────────────────

async function assessImageRelevance(
  imageBase64: string,
  imageMimeType: string,
  questionTitle: string,
  questionContent: string
): Promise<GrokImageAssessment> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY is not configured');
  }

  const prompt = `You are assessing whether a user's photo submission is genuinely relevant
to an environmental quiz question. The quiz question is:

Title: "${questionTitle}"
Description: "${questionContent}"

Evaluate whether the submitted image:
1. Contains real-world visual evidence related to the quiz topic (waste, recycling, composting, environmental matters, etc.)
2. Is a genuine photo — not a screenshot, cartoon, meme, blank image, or solid colour
3. Is sufficiently lit and in-focus to be meaningful as evidence of environmental awareness

Be strict: only mark as "relevant" if confident the image depicts something directly related to the environmental topic.

Output ONLY valid JSON:
{ "verdict": "relevant" or "irrelevant", "confidence": 0.0 to 1.0, "reasoning": "one sentence" }

Rules:
- "relevant" only if confidence >= 0.70 AND the image is a genuine real-world environmental photo
- "irrelevant" for screenshots, unrelated subjects, selfies, blank images, or very low confidence
- Do NOT identify people. Focus only on waste/environmental subject matter.`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-4.7',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${imageMimeType};base64,${imageBase64}`,
              detail: 'high'
            }
          },
          { type: 'text', text: prompt }
        ]
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`Grok API responded with HTTP ${response.status}`);
  }

  const json = await response.json();
  const responseText = json.choices?.[0]?.message?.content;
  if (typeof responseText !== 'string' || !responseText.trim()) {
    throw new Error('Empty response from Grok');
  }

  const parsed: GrokImageAssessment = JSON.parse(responseText);
  if (
    !['relevant', 'irrelevant'].includes(parsed.verdict) ||
    typeof parsed.confidence !== 'number' ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1 ||
    typeof parsed.reasoning !== 'string'
  ) {
    throw new Error('Malformed Grok response schema');
  }

  return parsed;
}

// ── Route handler ─────────────────────────────────────────────────────────

/**
 * POST /api/education/quiz/submit
 *
 * Submits a quiz answer with optional image evidence for an AI-assessed bonus.
 *
 * Request body:
 *   { contentId: string, answer: string, imageStoragePath?: string }
 *
 * Reward logic (all computed server-side — client cannot influence points):
 *   - Incorrect answer                              → 0 pts
 *   - Correct, no image                             → 0.5 pts
 *   - Correct + image + AI verdict='relevant' ≥0.70 → 1.0 pts
 *   - Correct + image + AI rejected or error        → 0.5 pts (safe fallback)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const supabase = createServerSupabaseClient(token);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      }, { status: 401 });
    }

    // 2. Parse body
    const body = await request.json();
    const { contentId, answer, imageStoragePath } = body as {
      contentId: string;
      answer: string;
      imageStoragePath?: string;
    };

    if (!contentId || answer === undefined || answer === null) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'BAD_REQUEST', message: 'contentId and answer are required' }
      }, { status: 400 });
    }

    // 3. If image provided, run AI assessment server-side
    let aiVerdict: string | null = null;
    let aiConfidence: number | null = null;
    let aiReasoning: string | null = null;

    if (imageStoragePath && typeof imageStoragePath === 'string' && imageStoragePath.trim() !== '') {
      // 3a. Fetch question details for the prompt
      const { data: questionData, error: qErr } = await supabase
        .from('educational_content')
        .select('title, content')
        .eq('id', contentId)
        .maybeSingle();

      if (qErr || !questionData) {
        console.error('[quiz/submit] Could not fetch question for AI assessment:', qErr);
        // Non-fatal: proceed without image bonus
        aiVerdict = 'error';
        aiConfidence = 0;
        aiReasoning = 'Could not fetch question content for assessment.';
      } else {
        // 3b. Download image from quiz-images bucket (service role — bypasses RLS)
        const serviceSupabase = createServerSupabaseClient();
        const { data: fileData, error: downloadErr } = await serviceSupabase.storage
          .from('quiz-images')
          .download(imageStoragePath);

        if (downloadErr || !fileData) {
          console.error('[quiz/submit] Image download failed:', downloadErr);
          aiVerdict = 'error';
          aiConfidence = 0;
          aiReasoning = 'Could not retrieve submitted image for assessment.';
        } else {
          // 3c. Convert to base64 and call Grok
          const arrayBuffer = await fileData.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const mimeType = fileData.type || 'image/jpeg';

          try {
            const assessment = await assessImageRelevance(
              base64,
              mimeType,
              questionData.title,
              questionData.content
            );
            aiVerdict = assessment.verdict;
            aiConfidence = assessment.confidence;
            aiReasoning = assessment.reasoning;
          } catch (aiErr) {
            // AI failure is safe — user gets base text-only points
            console.error('[quiz/submit] Grok assessment failed (safe fallback):', aiErr);
            aiVerdict = 'error';
            aiConfidence = 0;
            aiReasoning = aiErr instanceof Error ? aiErr.message : 'AI assessment unavailable.';
          }
        }
      }
    }

    // 4. Call submit_quiz_answer_v2 RPC (server-side point computation)
    const { data, error } = await supabase.rpc('submit_quiz_answer_v2', {
      p_content_id:         contentId,
      p_answer:             answer,
      p_image_storage_path: imageStoragePath || null,
      p_ai_verdict:         aiVerdict,
      p_ai_confidence:      aiConfidence,
      p_ai_reasoning:       aiReasoning
    });

    if (error) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'DATABASE_ERROR', message: error.message }
      }, { status: 500 });
    }

    const result: QuizSubmitResult = {
      isCorrect:           data.is_correct,
      pointsAwarded:       Number(data.points_awarded),
      correctAnswer:       data.correct_answer,
      hadImageSubmission:  data.had_image,
      imageBonus:          data.image_bonus,
      aiVerdict:           data.ai_verdict ?? null,
      aiConfidence:        data.ai_confidence !== undefined ? Number(data.ai_confidence) : null,
      aiReasoning:         aiReasoning
    };

    return NextResponse.json<ApiResponse<QuizSubmitResult>>({
      success: true,
      data: result,
      error: null
    });

  } catch (err) {
    console.error('[quiz/submit] Unexpected error:', err);
    return NextResponse.json<ApiResponse<null>>({
      success: false, data: null,
      error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error' }
    }, { status: 500 });
  }
}
