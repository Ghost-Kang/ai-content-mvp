// W1-04-V3 — Script Node Runner.
//
// Wraps the v2 thin-slice script generation logic (graceful degradation,
// best-attempt tracking) into a NodeRunner. Verbatim port of the loop in
// `routers/content.ts → generateScript`, refactored to be node-shaped.
//
// IMPORTANT: This is a REUSE of v2 prompt + validator + scanner modules.
// Strictly do not duplicate prompt logic here. If prompts need v3-specific
// tweaks, extend `script-templates.ts` upstream.

import { NodeRunner } from '../node-runner';
import {
  buildScriptPrompt,
  validateScriptLength,
  type GeneratedScript,
  type Formula,
  type LengthMode,
} from '@/lib/prompts/script-templates';
import { buildSuppressionScanner, type SuppressionFlag } from '@/lib/prompts/suppression-scanner';
import { executeWithFallback, LLMError, type LLMRegion } from '@/lib/llm';
import {
  NodeError,
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
} from '../types';

// ─── IO shapes ────────────────────────────────────────────────────────────────

export interface ScriptInput {
  topic:          string;
  formula?:       Formula;     // default 'provocation'
  lengthMode?:    LengthMode;  // default 'short' (60s)
  productName?:   string;      // default = topic
  targetAudience?: string;     // default '通用受众'
  brandVoiceNotes?: string;
}

export interface ScriptOutput {
  frames:               GeneratedScript['frames'];
  charCount:            number;
  frameCount:           number;
  fullText:             string;
  commentBaitQuestion?: string;
  suppressionFlags:     ReadonlyArray<SuppressionFlag>;
  provider:             string;
  model:                string;
  latencyMs:            number;
  retryCount:           number;
  qualityIssue:         string | null;
}

// ─── Constants (mirror v2) ────────────────────────────────────────────────────

const CHAR_TARGET_LO = 190;
const CHAR_TARGET_HI = 215;
const MAX_LLM_RETRIES = 3;

// ─── Runner ───────────────────────────────────────────────────────────────────

export class ScriptNodeRunner extends NodeRunner<ScriptInput, ScriptOutput> {
  readonly descriptor: NodeDescriptor = {
    nodeType:         'script',
    stepIndex:        1,
    // Outer NodeRunner retries are 0 — v2 already runs an internal LLM retry
    // loop with graceful degradation. Outer retries would multiply LLM cost
    // without UX benefit.
    maxRetries:       0,
    upstreamRequired: [],
  };

  protected buildInput(ctx: NodeContext): ScriptInput {
    // For W1, the script node is fed directly from the run's root topic.
    // W4 will introduce a topic node whose output is { topic, productName, ... }.
    return { topic: ctx.topic };
  }

  protected async execute(input: ScriptInput, ctx: NodeContext): Promise<NodeResult<ScriptOutput>> {
    const formula:       Formula     = input.formula     ?? 'provocation';
    const lengthMode:    LengthMode  = input.lengthMode  ?? 'short';
    const productName:   string      = input.productName ?? input.topic;
    const targetAudience: string     = input.targetAudience ?? '通用受众';

    const { systemPrompt, userPrompt } = buildScriptPrompt({
      formula,
      lengthMode,
      productName,
      targetAudience,
      coreClaim:        input.topic,
      brandVoiceNotes:  input.brandVoiceNotes,
    });

    let lastFeedback: string | null = null;
    let retryCount = 0;
    let bestAttempt: BestAttempt | null = null;

    while (retryCount < MAX_LLM_RETRIES) {
      const llmStart = Date.now();
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user'   as const, content: userPrompt },
      ];
      if (lastFeedback) {
        messages.push({
          role: 'user' as const,
          content: `上次输出不合规：${lastFeedback}\n目标字数 ${CHAR_TARGET_LO}-${CHAR_TARGET_HI}（含），最理想 200-210 字。请精确控制，避免过度修正。只输出 JSON。`,
        });
      }

      let llmResponse;
      try {
        llmResponse = await executeWithFallback({
          messages,
          intent:      'draft',
          tenantId:    ctx.tenantId,
          region:      ctx.region as LLMRegion,
          maxTokens:   lengthMode === 'short' ? 1500 : 4000,
          temperature: retryCount === 0 ? 0.6 : 0.3,
        });
      } catch (e) {
        if (e instanceof LLMError) {
          if (!e.retryable) {
            // Fatal (auth / balance / context too long) — surface immediately.
            throw new NodeError(
              e.code === 'CONTEXT_TOO_LONG' ? 'INVALID_INPUT' : 'LLM_FATAL',
              `LLM ${e.code}: ${e.message}`,
              false,
              e,
            );
          }
          // Retryable (rate limit / 5xx) — count as one retry.
          retryCount++;
          lastFeedback = '上次请求因服务端问题失败，请重新生成，只输出 JSON。';
          continue;
        }
        throw new NodeError('UNKNOWN', e instanceof Error ? e.message : String(e), false, e);
      }
      const llmLatencyMs = Date.now() - llmStart;

      let parsed: GeneratedScript;
      try {
        const raw = llmResponse.content
          .replace(/^```json\n?/, '')
          .replace(/\n?```$/, '')
          .trim();
        parsed = JSON.parse(raw);
      } catch {
        retryCount++;
        lastFeedback = '你上次的输出不是合法 JSON。请只输出一个 JSON 对象，不要加任何解释或 markdown 代码块。';
        continue;
      }

      const fullText   = parsed.frames.map((f) => f.text).join('');
      const charCount  = fullText.replace(/\s/g, '').length;
      const frameCount = parsed.frames.length;
      const validation = validateScriptLength(fullText, frameCount, lengthMode);

      const distance = charCount < CHAR_TARGET_LO
        ? CHAR_TARGET_LO - charCount
        : charCount > CHAR_TARGET_HI
          ? charCount - CHAR_TARGET_HI
          : 0;

      if (!bestAttempt || distance < bestAttempt.distance) {
        bestAttempt = {
          parsed, fullText, charCount, frameCount,
          provider:  llmResponse.provider,
          model:     llmResponse.model,
          latencyMs: llmLatencyMs,
          issue:     validation.valid ? null : (validation.issue ?? null),
          distance,
        };
      }

      if (!validation.valid) {
        retryCount++;
        lastFeedback = validation.issue ?? '字数或帧数不合规';
        continue;
      }

      break; // valid — fall through
    }

    if (!bestAttempt) {
      throw new NodeError(
        'PARSE_FAILED',
        'LLM returned no parseable output across all retries',
        false,
      );
    }

    const suppressionFlags = buildSuppressionScanner(bestAttempt.fullText);

    const output: ScriptOutput = {
      frames:               bestAttempt.parsed.frames,
      charCount:            bestAttempt.charCount,
      frameCount:           bestAttempt.frameCount,
      fullText:             bestAttempt.fullText,
      commentBaitQuestion:  bestAttempt.parsed.commentBaitQuestion,
      suppressionFlags,
      provider:             bestAttempt.provider,
      model:                bestAttempt.model,
      latencyMs:            bestAttempt.latencyMs,
      retryCount,
      qualityIssue:         bestAttempt.issue,
    };

    return {
      output,
      // Script LLM cost is tracked by the LLM provider's spend tracker (v2 W4-01).
      // We don't double-count it in workflow_steps.cost_fen — this is left at 0
      // so monthly_usage.totalCostFen primarily reflects video generation cost
      // (D24 ¥6/clip is the dominant variable cost).
      costFen:      0,
      videoCount:   0,
      qualityIssue: bestAttempt.issue,
      meta: {
        provider:    bestAttempt.provider,
        model:       bestAttempt.model,
        latencyMs:   bestAttempt.latencyMs,
        llmRetries:  retryCount,
      },
    };
  }
}

interface BestAttempt {
  parsed:      GeneratedScript;
  fullText:    string;
  charCount:   number;
  frameCount:  number;
  provider:    string;
  model:       string;
  latencyMs:   number;
  issue:       string | null;
  distance:    number;
}
