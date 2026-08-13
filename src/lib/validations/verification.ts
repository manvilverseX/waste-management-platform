import { z } from 'zod';

export const geminiAnalysisResponseSchema = z.object({
  wasteDetected: z.boolean(),
  visualSimilarityScore: z.number().min(0).max(100),
  sameWasteLikely: z.boolean(),
  vehicleVisible: z.boolean().optional().default(false),
  contextConsistent: z.boolean().optional().default(true),
  confidence: z.number().min(0).max(100),
  concerns: z.array(z.string()).optional().default([]),
  analysis: z.string().optional().default('AI visual inspection completed.')
});

export type GeminiAnalysisResponseInput = z.infer<typeof geminiAnalysisResponseSchema>;
