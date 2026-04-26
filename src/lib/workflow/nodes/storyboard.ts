// W2-02-V3 — Storyboard Node Runner.
//
// Wraps the W2-01 storyboard prompt + validator into a NodeRunner. Mirrors
// `nodes/script.ts` shape (internal LLM retry loop, graceful degradation,
// best-attempt tracking). Strictly REUSES `buildStoryboardPrompt` /
// `validateStoryboard` — no prompt logic lives here.
//
// Upstream contract: requires `script` node output (ScriptOutput).
// Pulls topic from ctx.topic (root run topic) so we don't depend on a
// future TopicNode being present in W1/W2.
//
// Cost: tracked by the LLM provider's spend tracker (v2 W4-01) — same
// convention as ScriptNodeRunner. workflow_steps.cost_fen stays at 0 so
// monthly_usage.totalCostFen primarily reflects video generation cost.

import { NodeRunner } from '../node-runner';
import {
  buildStoryboardPrompt,
  validateStoryboard,
  type StoryboardOutput,
} from '@/lib/prompts/storyboard-prompt';
import type { GeneratedScript } from '@/lib/prompts/script-templates';
import { executeWithFallback, LLMError, type LLMRegion } from '@/lib/llm';
import {
  NodeError,
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
} from '../types';
import type { ScriptOutput } from './script';

// ─── IO shapes ────────────────────────────────────────────────────────────────

export interface StoryboardInput {
  topic:        string;
  scriptFrames: GeneratedScript['frames'];
}

/**
 * Storyboard node output. Extends the prompt-layer StoryboardOutput with
 * runtime metadata (provider, latency, retries, qualityIssue) that downstream
 * nodes + the UI need but the prompt validator doesn't know about.
 */
export interface StoryboardNodeOutput extends StoryboardOutput {
  provider:     string;
  latencyMs:    number;
  retryCount:   number;
  qualityIssue: string | null;
}

// ─── Tunables ─────────────────────────────────────────────────────────────────

/**
 * Internal LLM retry budget. W2-01 probe showed 10/10 first-try clean at
 * temp=0.5, so 1 retry is sufficient buffer for occasional JSON malformation
 * or vocab drift. Going higher would multiply LLM cost without UX benefit.
 */
const MAX_LLM_RETRIES = 2;

/**
 * temperature for first attempt (matches probe). Drop to 0.3 on retry to
 * coax stricter format compliance — same trick as script node.
 */
const TEMPERATURE_FIRST = 0.5;
const TEMPERATURE_RETRY = 0.3;

/** Soft headroom: 17 frames × ~150 chars JSON each ≈ 2500. */
const MAX_TOKENS = 3000;

/**
 * Shape returned by `callLLM`. Test subclasses can implement this to inject
 * deterministic responses without touching `executeWithFallback`.
 */
export interface LLMCallResult {
  content:   string;
  provider:  string;
  model:     string;
  latencyMs: number;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export class StoryboardNodeRunner extends NodeRunner<StoryboardInput, StoryboardNodeOutput> {
  readonly descriptor: NodeDescriptor = {
    nodeType:         'storyboard',
    stepIndex:        2,
    // Outer NodeRunner retries are 0 — internal LLM retry loop already covers
    // validation failures; outer retries would re-run the whole loop and pay
    // the LLM tax twice for no gain.
    maxRetries:       0,
    upstreamRequired: ['script'],
  };

  /**
   * LLM call seam — production uses `executeWithFallback`; tests override
   * to inject deterministic responses or LLMError sequences.
   *
   * The `attempt` arg lets subclasses key behavior off the retry index
   * (first attempt vs retry) and is what we use to swing the temperature.
   */
  protected async callLLM(
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    ctx:     NodeContext,
    attempt: number,
  ): Promise<LLMCallResult> {
    const t0 = Date.now();
    const resp = await executeWithFallback({
      messages:    [...messages],
      intent:      'draft',
      tenantId:    ctx.tenantId,
      region:      ctx.region as LLMRegion,
      maxTokens:   MAX_TOKENS,
      temperature: attempt === 0 ? TEMPERATURE_FIRST : TEMPERATURE_RETRY,
    });
    return {
      content:   resp.content,
      provider:  resp.provider,
      model:     resp.model,
      latencyMs: Date.now() - t0,
    };
  }

  protected buildInput(ctx: NodeContext): StoryboardInput {
    const upstream = ctx.upstreamOutputs.script as ScriptOutput | undefined;
    if (!upstream || !Array.isArray(upstream.frames) || upstream.frames.length === 0) {
      throw new NodeError(
        'UPSTREAM_MISSING',
        'storyboard node requires script.frames upstream output (got missing or empty)',
        false,
      );
    }
    return { topic: ctx.topic, scriptFrames: upstream.frames };
  }

  protected async execute(
    input: StoryboardInput,
    ctx: NodeContext,
  ): Promise<NodeResult<StoryboardNodeOutput>> {
    const { systemPrompt, userPrompt } = buildStoryboardPrompt({
      topic:        input.topic,
      scriptFrames: input.scriptFrames,
    });

    let retryCount = 0;
    let lastFeedback: string | null = null;
    let bestAttempt: BestAttempt | null = null;

    while (retryCount < MAX_LLM_RETRIES) {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user'   as const, content: userPrompt },
      ];
      if (lastFeedback) {
        messages.push({
          role: 'user' as const,
          content: `上次输出被验证器拒绝：${lastFeedback}\n请严格按 system prompt 的 JSON 格式重新输出，不要解释，不要 markdown 代码块。`,
        });
      }

      let llmResponse: LLMCallResult;
      try {
        llmResponse = await this.callLLM(messages, ctx, retryCount);
      } catch (e) {
        if (e instanceof LLMError) {
          if (!e.retryable) {
            throw new NodeError(
              e.code === 'CONTEXT_TOO_LONG' ? 'INVALID_INPUT' : 'LLM_FATAL',
              `LLM ${e.code}: ${e.message}`,
              false,
              e,
            );
          }
          retryCount++;
          lastFeedback = '上次请求因服务端问题失败，请重新生成。';
          continue;
        }
        throw new NodeError('UNKNOWN', e instanceof Error ? e.message : String(e), false, e);
      }

      const validation = validateStoryboard(
        llmResponse.content,
        input.scriptFrames,
        llmResponse.model,
      );

      // Track this attempt as "best so far" by issue count (fewer = better);
      // ties broken by warning count. Mirrors script.ts best-attempt logic so
      // a final degraded fallback can still produce a usable storyboard.
      const issueCount = validation.issues.length;
      const warnCount  = validation.warnings.length;
      if (
        !bestAttempt ||
        issueCount < bestAttempt.issueCount ||
        (issueCount === bestAttempt.issueCount && warnCount < bestAttempt.warnCount)
      ) {
        bestAttempt = {
          validation,
          provider:   llmResponse.provider,
          model:      llmResponse.model,
          latencyMs:  llmResponse.latencyMs,
          issueCount,
          warnCount,
        };
      }

      if (validation.ok) break;

      retryCount++;
      lastFeedback = validation.issues
        .slice(0, 3)
        .map((x) => `${x.code}@frame${x.frameIndex ?? '?'}: ${x.detail}`)
        .join('; ');
    }

    if (!bestAttempt) {
      throw new NodeError(
        'PARSE_FAILED',
        'LLM returned no parseable storyboard across all retries',
        false,
      );
    }

    // Final acceptance: if best attempt has no hard issues → done. If it still
    // has issues after the retry budget, throw — partial storyboards are not
    // useful for downstream Seedance node (would render blank or wrong frames).
    if (!bestAttempt.validation.ok || !bestAttempt.validation.output) {
      const summary = bestAttempt.validation.issues
        .slice(0, 5)
        .map((x) => `${x.code}@${x.frameIndex ?? '?'}`)
        .join(',');
      throw new NodeError(
        'VALIDATION_FAILED',
        `storyboard validation failed across ${retryCount + 1} attempts: ${summary}`,
        false,
      );
    }

    // Soft warnings (truncations, below-floor imagePrompt, low camera diversity)
    // are surfaced as qualityIssue for the UI but do NOT block the run.
    const qualityIssue = bestAttempt.validation.warnings.length > 0
      ? bestAttempt.validation.warnings.slice(0, 3).join(' | ')
      : null;

    const output: StoryboardNodeOutput = {
      ...bestAttempt.validation.output,
      provider:     bestAttempt.provider,
      latencyMs:    bestAttempt.latencyMs,
      retryCount,
      qualityIssue,
    };

    return {
      output,
      // LLM cost tracked by spend tracker; storyboard generates no video clips.
      costFen:      0,
      videoCount:   0,
      qualityIssue,
      meta: {
        provider:        bestAttempt.provider,
        model:           bestAttempt.model,
        latencyMs:       bestAttempt.latencyMs,
        llmRetries:      retryCount,
        warningCount:    bestAttempt.validation.warnings.length,
        suppressionHits: bestAttempt.validation.output.suppressionFlags.length,
      },
    };
  }
}

interface BestAttempt {
  validation: ReturnType<typeof validateStoryboard>;
  provider:   string;
  model:      string;
  latencyMs:  number;
  issueCount: number;
  warnCount:  number;
}
