// W4-03-V3 — Topic Analysis facade.
//
// Single public entry point for the tRPC mutation. Pipeline:
//   1. read-through Redis cache → return immediately on hit
//   2. build prompt
//   3. call LLM via shared `executeWithFallback` (spend cap +
//      circuit breaker + recordSpend already wired)
//   4. parse + validate raw text
//   5. assemble result + write-back cache
//   6. return result
//
// Errors:
//   - LLMError (RATE_LIMITED / SPEND_CAP_EXCEEDED / etc) bubbles up
//     unchanged so the tRPC layer's `friendlyFromAny` can map them.
//   - TopicAnalysisError (validation) also bubbles — these mean the
//     LLM produced unusable output; we deliberately do NOT retry inside
//     the facade because every retry costs another token bill. Caller
//     can re-click; UX makes that obvious.

import { executeWithFallback } from '../llm/fallback';
import { estimateCostFen } from '../llm/spend-tracker';
import type { LLMRequest, LLMResponse } from '../llm/types';

import { buildAnalysisPrompt } from './prompt';
import { parseAndValidate, assembleResult } from './validator';
import { readCached, writeCached } from './cache';
import {
  NICHE_MAX_CHARS,
  type TopicAnalysisInput,
  type TopicAnalysisResult,
} from './types';

export interface AnalyzeTopicDeps {
  /** Test seam — defaults to `executeWithFallback`. */
  llmCall?:    (req: LLMRequest) => Promise<LLMResponse>;
  /** Test seam — when true, skip Redis read+write entirely. */
  bypassCache?: boolean;
}

/** What the facade actually needs from the caller (tenant + payload). */
export interface AnalyzeTopicArgs {
  tenantId: string;
  input:    TopicAnalysisInput;
}

const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_MAX_TOKENS  = 700;

export async function analyzeTopic(
  args: AnalyzeTopicArgs,
  deps: AnalyzeTopicDeps = {},
): Promise<TopicAnalysisResult> {
  const { tenantId, input } = args;
  const llmCall = deps.llmCall ?? executeWithFallback;
  const bypassCache = deps.bypassCache === true;

  const niche = input.niche?.trim().slice(0, NICHE_MAX_CHARS);
  const sanitized: TopicAnalysisInput = niche
    ? { ...input, niche }
    : { ...input, niche: undefined };

  if (!bypassCache) {
    const hit = await readCached(sanitized);
    if (hit) return hit;
  }

  const { systemPrompt, userPrompt } = buildAnalysisPrompt(sanitized);

  const llmReq: LLMRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    intent:      'strategy',
    tenantId,
    region:      'CN',
    maxTokens:   DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
  };

  const response = await llmCall(llmReq);
  const payload  = parseAndValidate(response.content);

  const tokensUsed = response.usage.totalTokens;
  const costFen    = estimateCostFen(response.provider, tokensUsed);

  const result = assembleResult({
    payload,
    niche,
    llmModel: response.model,
    tokensUsed,
    costFen,
  });

  if (!bypassCache) {
    await writeCached(sanitized, result);
  }

  return result;
}

// ─── Public surface ───────────────────────────────────────────────────────────

export type {
  TopicAnalysisInput,
  TopicAnalysisResult,
  TopicAnalysisErrorCode,
} from './types';
export { TopicAnalysisError, TOPIC_ANALYSIS_PROMPT_VERSION, NICHE_MAX_CHARS } from './types';
export { buildAnalysisPrompt } from './prompt';
export { parseAndValidate, assembleResult } from './validator';
export {
  readCached,
  writeCached,
  buildCacheKey,
  nicheKey,
  TOPIC_ANALYSIS_CACHE_TTL_SECONDS,
  __setRedisClientForTesting,
} from './cache';
