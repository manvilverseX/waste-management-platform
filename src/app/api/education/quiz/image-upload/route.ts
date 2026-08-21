import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateImageBuffer } from '@/lib/validations/image';
import { ApiResponse } from '@/types';

/**
 * POST /api/education/quiz/image-upload
 *
 * Accepts a quiz image submission, validates it, uploads it to the private
 * `quiz-images` Supabase Storage bucket, and returns the storage path.
 *
 * This is a SEPARATE step from answer submission. The flow is:
 *   1. User selects answer + takes photo → POST here → receive storagePath
 *   2. POST /api/education/quiz/submit with { contentId, answer, imageStoragePath }
 *      → server downloads image, calls Gemini AI, computes points
 *
 * Accepts: multipart/form-data with:
 *   - file: File (image — JPEG, PNG, or WEBP, max 5MB, min 200×200px)
 *   - contentId: string (UUID of the quiz_mcq question being answered)
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
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
      }, { status: 401 });
    }

    // 2. Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Expected multipart/form-data.' }
      }, { status: 400 });
    }

    const file = formData.get('file');
    const contentId = formData.get('contentId');

    if (!file || !(file instanceof File)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'VALIDATION_ERROR', message: 'A photo file is required.' }
      }, { status: 400 });
    }

    if (!contentId || typeof contentId !== 'string') {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'VALIDATION_ERROR', message: 'contentId is required.' }
      }, { status: 400 });
    }

    // 3. Verify content exists and is a quiz_mcq
    const { data: content, error: contentErr } = await supabase
      .from('educational_content')
      .select('id, type')
      .eq('id', contentId)
      .eq('type', 'quiz_mcq')
      .maybeSingle();

    if (contentErr || !content) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'NOT_FOUND', message: 'Quiz question not found.' }
      }, { status: 404 });
    }

    // 4. Check user has not already attempted this question
    const { data: existingAttempt } = await supabase
      .from('quiz_attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('content_id', contentId)
      .maybeSingle();

    if (existingAttempt) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'ALREADY_ATTEMPTED', message: 'You have already answered this question.' }
      }, { status: 409 });
    }

    // 5. Check daily quiz limit (must have remaining attempts today)
    const today = new Date().toISOString().split('T')[0];
    const { count: attemptsToday } = await supabase
      .from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('attempt_date', today);

    if ((attemptsToday ?? 0) >= 5) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'LIMIT_EXCEEDED', message: 'Daily quiz limit reached.' }
      }, { status: 429 });
    }

    // 6. Validate image (magic bytes, size, dimensions)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validation = validateImageBuffer(buffer);
    if (!validation.isValid) {
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'VALIDATION_ERROR', message: validation.error || 'Invalid image file.' }
      }, { status: 400 });
    }

    // 7. Upload to quiz-images bucket (service role client bypasses RLS for upload)
    const serviceSupabase = createServerSupabaseClient();
    const fileExt = validation.format || 'jpg';
    const storagePath = `${user.id}/${contentId}/${today}.${fileExt}`;

    const { error: uploadError } = await serviceSupabase.storage
      .from('quiz-images')
      .upload(storagePath, buffer, {
        contentType: file.type || `image/${fileExt}`,
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('[quiz/image-upload] Storage upload error:', uploadError);
      return NextResponse.json<ApiResponse<null>>({
        success: false, data: null,
        error: { code: 'STORAGE_ERROR', message: 'Failed to upload image.' }
      }, { status: 500 });
    }

    return NextResponse.json<ApiResponse<{ storagePath: string }>>({
      success: true,
      data: { storagePath },
      error: null
    }, { status: 200 });

  } catch (err) {
    console.error('[quiz/image-upload] Unexpected error:', err);
    return NextResponse.json<ApiResponse<null>>({
      success: false, data: null,
      error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error' }
    }, { status: 500 });
  }
}
