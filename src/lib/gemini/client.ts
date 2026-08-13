import { GoogleGenAI } from '@google/genai';
import { geminiAnalysisResponseSchema } from '@/lib/validations/verification';
import { StructuredGeminiAnalysis } from '@/types';

export interface VerificationAiAnalysis {
  decision: 'verified' | 'rejected' | 'inconclusive';
  confidenceScore: number; // 0 to 100
  analysis: string;
  structuredDetails: StructuredGeminiAnalysis;
}

/**
 * Server-only function to analyze waste collection evidence photos using Google Gemini.
 * MUST NEVER BE CALLED FROM THE BROWSER / CLIENT SIDE.
 */
export async function analyzeEvidenceWithGemini(
  beforeImageUrl: string,
  afterImageUrl: string,
  vehicleImageUrl?: string | null
): Promise<VerificationAiAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[Gemini AI] GEMINI_API_KEY is not configured in environment. Returning fallback analysis.');
    return {
      decision: 'verified',
      confidenceScore: 85.0,
      analysis: 'Simulated verification analysis (GEMINI_API_KEY not configured).',
      structuredDetails: {
        wasteDetected: true,
        visualSimilarityScore: 85.0,
        sameWasteLikely: true,
        vehicleVisible: Boolean(vehicleImageUrl),
        contextConsistent: true,
        confidence: 85.0,
        concerns: []
      }
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are an expert waste management evidence verification assistant.
Analyze the following evidence images provided for a waste collection request:
1. BEFORE image (Resident): ${beforeImageUrl}
2. AFTER image (Collector Pickup): ${afterImageUrl}
${vehicleImageUrl ? `3. VEHICLE image (Batch Vehicle): ${vehicleImageUrl}` : ''}

Inspect the visual evidence and evaluate:
- Is waste present in BEFORE photo and cleaned in AFTER photo?
- Does the waste appear to be the same pile/location?
- Is a collection vehicle visible (if vehicle photo is provided)?
- Are there any suspicious visual mismatches or concerns?

Respond ONLY with valid JSON in this exact structure:
{
  "wasteDetected": boolean,
  "visualSimilarityScore": number (0 to 100),
  "sameWasteLikely": boolean,
  "vehicleVisible": boolean,
  "contextConsistent": boolean,
  "confidence": number (0 to 100),
  "concerns": string[],
  "analysis": "detailed explanation of findings"
}
    `.trim();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const responseText = response.text || '';
    const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
    const parsedRaw = JSON.parse(cleanedText);

    // Validate using Zod schema
    const validationResult = geminiAnalysisResponseSchema.safeParse(parsedRaw);

    if (!validationResult.success) {
      console.warn('[Gemini AI Output Validation Warning]: Unexpected JSON schema from model:', validationResult.error);
      return {
        decision: 'inconclusive',
        confidenceScore: 50.0,
        analysis: 'Gemini returned non-conforming output schema.',
        structuredDetails: {
          wasteDetected: true,
          visualSimilarityScore: 50.0,
          sameWasteLikely: true,
          vehicleVisible: false,
          contextConsistent: false,
          confidence: 50.0,
          concerns: ['Malformed JSON response structure from Gemini']
        }
      };
    }

    const data = validationResult.data;

    let decision: 'verified' | 'rejected' | 'inconclusive' = 'verified';
    if (!data.sameWasteLikely || data.visualSimilarityScore < 40) {
      decision = 'rejected';
    } else if (data.confidence < 60 || (data.concerns && data.concerns.length > 0)) {
      decision = 'inconclusive';
    }

    return {
      decision,
      confidenceScore: data.confidence,
      analysis: data.analysis || 'Analysis completed by Gemini AI.',
      structuredDetails: {
        wasteDetected: data.wasteDetected,
        visualSimilarityScore: data.visualSimilarityScore,
        sameWasteLikely: data.sameWasteLikely,
        vehicleVisible: data.vehicleVisible ?? false,
        contextConsistent: data.contextConsistent ?? true,
        confidence: data.confidence,
        concerns: data.concerns ?? []
      }
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Gemini AI Verification Error]:', error);
    return {
      decision: 'inconclusive',
      confidenceScore: 0,
      analysis: `AI Analysis encountered a service error: ${message}`,
      structuredDetails: {
        wasteDetected: false,
        visualSimilarityScore: 0,
        sameWasteLikely: false,
        vehicleVisible: false,
        contextConsistent: false,
        confidence: 0,
        concerns: [`Gemini API execution error: ${message}`]
      }
    };
  }
}
