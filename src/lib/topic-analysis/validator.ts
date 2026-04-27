// W4-03-V3 — Topic Analysis validator.
//
// Parse LLM raw text → strict JSON → enforce sentence-count + length
// + placeholder-leak rules. Pure function; the facade in index.ts
// handles cache + cost accounting.
//
// We deliberately keep the schema *narrow* (whyItHit, howToAdapt arrays
// only) so a creative LLM that adds extra fields (`summary`,
// `confidence`, …) doesn't break us — we just drop them.

import {
  SENTENCE_MAX_CHARS,
  SENTENCE_MIN_CHARS,
  SENTENCES_REQUIRED,
  TOPIC_ANALYSIS_PROMPT_VERSION,
  TopicAnalysisError,
  type TopicAnalysisResult,
} from './types';

export interface ParsedAnalysisPayload {
  whyItHit:   string[];
  howToAdapt: string[];
}

/**
 * Strip leading/trailing markdown fences if the LLM ignored the rule
 * about not wrapping JSON in code blocks. This is a soft rescue —
 * we keep the validator strict on the actual content but forgive the
 * cosmetic mistake (otherwise we'd reject a perfectly good answer).
 */
function unwrapCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    const firstNl = s.indexOf('\n');
    if (firstNl >= 0) s = s.slice(firstNl + 1);
    if (s.endsWith('```')) s = s.slice(0, -3);
  }
  return s.trim();
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return null;
    out.push(x);
  }
  return out;
}

function looksLikePlaceholder(s: string): boolean {
  // Hits "<...>" patterns or "{...}" mustache leaks. Bare punctuation
  // like "<3" in a real sentence is too short to pass the min length
  // check anyway, so we don't bother with a more elaborate regex.
  return /[<>]|\{[^}]*\}/.test(s);
}

/**
 * Parse + validate an LLM raw response.
 *
 * Throws `TopicAnalysisError` with a precise code on first hard
 * failure (count mismatch / placeholder leak / parse fail). Length
 * violations are also hard — we want the LLM to retry rather than
 * ship a 5-char "好的。" sentence.
 */
export function parseAndValidate(rawResponse: string): ParsedAnalysisPayload {
  const cleaned = unwrapCodeFences(rawResponse);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new TopicAnalysisError(
      'PARSE_FAILED',
      `LLM output is not valid JSON: ${(e as Error).message}`,
      cleaned.slice(0, 200),
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TopicAnalysisError(
      'PARSE_FAILED',
      'LLM output is not a JSON object',
      parsed,
    );
  }

  const whyItHit   = asStringArray((parsed as { whyItHit?: unknown }).whyItHit);
  const howToAdapt = asStringArray((parsed as { howToAdapt?: unknown }).howToAdapt);

  if (!whyItHit || !howToAdapt) {
    throw new TopicAnalysisError(
      'PARSE_FAILED',
      'Expected `whyItHit` and `howToAdapt` to be string arrays',
      { whyItHit, howToAdapt },
    );
  }

  if (whyItHit.length !== SENTENCES_REQUIRED || howToAdapt.length !== SENTENCES_REQUIRED) {
    throw new TopicAnalysisError(
      'SENTENCE_COUNT_MISMATCH',
      `Expected exactly ${SENTENCES_REQUIRED} sentences in each array (got whyItHit=${whyItHit.length}, howToAdapt=${howToAdapt.length})`,
    );
  }

  const all = [...whyItHit, ...howToAdapt];
  for (const s of all) {
    const trimmed = s.trim();
    if (trimmed.length === 0) {
      throw new TopicAnalysisError('EMPTY_FIELD', 'A sentence is empty or whitespace-only');
    }
    if (looksLikePlaceholder(trimmed)) {
      throw new TopicAnalysisError(
        'PLACEHOLDER_LEAKED',
        `A sentence contains placeholder syntax: ${trimmed.slice(0, 50)}…`,
      );
    }
    if (trimmed.length < SENTENCE_MIN_CHARS) {
      throw new TopicAnalysisError(
        'SENTENCE_TOO_SHORT',
        `Sentence shorter than ${SENTENCE_MIN_CHARS} chars: "${trimmed}"`,
      );
    }
    if (trimmed.length > SENTENCE_MAX_CHARS) {
      throw new TopicAnalysisError(
        'SENTENCE_TOO_LONG',
        `Sentence longer than ${SENTENCE_MAX_CHARS} chars: "${trimmed.slice(0, 60)}…"`,
      );
    }
  }

  return {
    whyItHit:   whyItHit.map((s) => s.trim()),
    howToAdapt: howToAdapt.map((s) => s.trim()),
  };
}

/**
 * Build a complete `TopicAnalysisResult` from a validated payload + the
 * runtime metadata the facade collected (provider, tokens, niche).
 */
export function assembleResult(args: {
  payload:    ParsedAnalysisPayload;
  niche?:     string;
  llmModel:   string;
  tokensUsed: number;
  costFen:    number;
}): TopicAnalysisResult {
  const { payload, niche, llmModel, tokensUsed, costFen } = args;
  const result: TopicAnalysisResult = {
    promptVersion: TOPIC_ANALYSIS_PROMPT_VERSION,
    whyItHit:      payload.whyItHit,
    howToAdapt:    payload.howToAdapt,
    llmModel,
    generatedAt:   new Date().toISOString(),
    cacheHit:      false,
    costFen,
    tokensUsed,
  };
  if (niche && niche.trim().length > 0) result.niche = niche.trim();
  return result;
}
