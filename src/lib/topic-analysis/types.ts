// W4-03-V3 — Topic Analysis types.
//
// Shape contract between (a) the validator (which produces it from a raw
// LLM string), (b) the Redis cache (which serializes it), and (c) the
// tRPC mutation + UI (which consume it).
//
// Keep this module type-only — no runtime deps so it's safe to import
// from both server and client paths.

import type { NewrankPlatform } from '../data-source/newrank/types';

export const TOPIC_ANALYSIS_PROMPT_VERSION = 'v1' as const;

/**
 * Per-call input — the minimum a caller must hand us. Fields mirror
 * `NormalizedTrendingItem` but flattened so the tRPC layer doesn't have
 * to re-derive them from a full normalized record (the UI may have
 * already truncated `title` for display, etc).
 */
export interface TopicAnalysisInput {
  platform:        NewrankPlatform;
  opusId:          string;
  title?:          string;
  description?:    string;
  firstCategory?:  string;
  secondCategory?: string;
  likeCount?:      number;
  playCount?:      number;
  duration?:       number;
  authorNickname?: string;

  /**
   * Optional creator-supplied niche / brand positioning (≤ 200 chars).
   * When present, the prompt asks the LLM for niche-aware adaptation
   * suggestions. When empty/undefined, the prompt asks for generic
   * "any creator" adaptations and explicitly tells the LLM not to
   * invent a niche.
   */
  niche?: string;
}

/** Final output shape. JSON-serializable so it round-trips through Redis. */
export interface TopicAnalysisResult {
  /** Schema version — bump when prompt or shape changes (cache invalidation). */
  promptVersion: typeof TOPIC_ANALYSIS_PROMPT_VERSION;
  /** Three sentences explaining why this item went viral. */
  whyItHit:      string[];
  /** Three sentences of concrete adaptation suggestions. */
  howToAdapt:    string[];
  /** Echoed niche (trimmed) if one was supplied; absent otherwise. */
  niche?:        string;
  llmModel:      string;
  generatedAt:   string;
  /** Did this come from Redis? Set by the facade, not the validator. */
  cacheHit:      boolean;
  /** Approximate cost — `recordSpend` does the real tracking. */
  costFen:       number;
  tokensUsed:    number;
}

export type TopicAnalysisErrorCode =
  | 'PARSE_FAILED'
  | 'SENTENCE_COUNT_MISMATCH'
  | 'SENTENCE_TOO_SHORT'
  | 'SENTENCE_TOO_LONG'
  | 'PLACEHOLDER_LEAKED'
  | 'EMPTY_FIELD';

export class TopicAnalysisError extends Error {
  constructor(
    public code: TopicAnalysisErrorCode,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = 'TopicAnalysisError';
  }
}

/** Hard quality gates the validator enforces. */
export const SENTENCE_MIN_CHARS = 10;
export const SENTENCE_MAX_CHARS = 150;
export const SENTENCES_REQUIRED = 3;

/** Niche text size limit — guard prompt budget + cache key sanity. */
export const NICHE_MAX_CHARS = 200;
