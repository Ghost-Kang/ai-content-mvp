// W3-06 / W3-08 — Server-side Zod schemas for editStep payloads.
//
// Extracted from the workflow tRPC router so:
//   1. The W3-08 round-trip test can verify that the per-frame editor's
//      rebuildScriptOutput / rebuildStoryboardOutput produce payloads that
//      pass the same validation the live mutation runs.
//   2. Future client-side preview / dry-run features can share the schema
//      without importing tRPC server code.
//
// These are intentionally LIGHTER than the LLM-time validators (e.g.
// validateScriptLength) — a human user might deliberately produce a longer
// script than the LLM would. We enforce only structural invariants the
// downstream nodes assume.

import { z } from 'zod';

export const ScriptFrameSchema = z.object({
  index:           z.number().int().min(1),
  text:            z.string().min(1),
  visualDirection: z.string().optional().default(''),
  durationS:       z.number().nonnegative().optional().default(0),
});

export const ScriptOutputEditSchema = z
  .object({
    frames:               z.array(ScriptFrameSchema).min(1),
    charCount:            z.number().int().nonnegative().optional(),
    frameCount:           z.number().int().nonnegative().optional(),
    fullText:             z.string().optional(),
    commentBaitQuestion:  z.string().optional(),
    suppressionFlags:     z.array(z.unknown()).optional(),
    provider:             z.string().optional(),
    model:                z.string().optional(),
    latencyMs:            z.number().int().nonnegative().optional(),
    retryCount:           z.number().int().nonnegative().optional(),
    qualityIssue:         z.string().nullable().optional(),
  })
  .passthrough();

export const StoryboardFrameSchema = z.object({
  index:          z.number().int().min(1),
  voiceover:      z.string().min(1),
  durationSec:    z.number().nonnegative(),
  cameraLanguage: z.string().min(1),
  scene:          z.string().min(1),
  imagePrompt:    z.string().min(1),
  onScreenText:   z.string().optional(),
});

export const StoryboardOutputEditSchema = z
  .object({
    promptVersion:    z.string().optional(),
    frames:           z.array(StoryboardFrameSchema).min(1),
    totalDurationSec: z.number().nonnegative().optional(),
    suppressionFlags: z.array(z.unknown()).optional(),
    llmModel:         z.string().optional(),
    generatedAt:      z.string().optional(),
    provider:         z.string().optional(),
    latencyMs:        z.number().int().nonnegative().optional(),
    retryCount:       z.number().int().nonnegative().optional(),
    qualityIssue:     z.string().nullable().optional(),
  })
  .passthrough();
