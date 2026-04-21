// ENG-002 / ENG-008 / ENG-009 / ENG-010 / ENG-012 / ENG-014
// content tRPC router — core content creation lifecycle

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';

import { router, tenantProcedure } from '../trpc';
import { db, contentSessions, contentScripts } from '@/db';
import { executeWithFallback } from '@/lib/llm';
import {
  buildScriptPrompt,
  validateScriptLength,
  type GeneratedScript,
} from '@/lib/prompts/script-templates';
import { buildSuppressionScanner } from '@/lib/prompts/suppression-scanner';
import { buildCacLabel } from '@/lib/cac-label';
import { LLMError } from '@/lib/llm/types';
import { friendlyFromLLMError } from '@/lib/error-messages';
import {
  fireSessionStarted,
  fireScriptGenerated,
  fireScriptApproved,
  fireScriptExported,
} from '@/lib/analytics/server';

// ─── Input schemas ─────────────────────────────────────────────────────────────

const CreateSessionInput = z.object({
  entryPoint:     z.enum(['quick_create', 'strategy_first']).default('quick_create'),
  formula:        z.enum(['provocation', 'insight']),
  lengthMode:     z.enum(['short', 'long']),
  productName:    z.string().min(1).max(100),
  targetAudience: z.string().min(1).max(200),
  coreClaim:      z.string().min(1).max(300),
});

const GenerateScriptInput = z.object({
  sessionId:  z.string().uuid(),
  regenerate: z.boolean().optional().default(false),
});

const GetStatusInput = z.object({
  sessionId: z.string().uuid(),
});

const ApproveInput = z.object({
  sessionId:  z.string().uuid(),
  checklist:  z.object({
    voice:       z.boolean(),
    rhythm:      z.boolean(),
    suppression: z.boolean(),
    facts:       z.boolean(),
    hook:        z.boolean(),
  }),
});

const ExportInput = z.object({
  sessionId: z.string().uuid(),
  format:    z.enum(['plain', 'storyboard']).default('storyboard'),
});

const TrackExportInput = z.object({
  sessionId: z.string().uuid(),
  format:    z.enum(['plain', 'storyboard']),
  action:    z.enum(['copy', 'download']),
  charCount: z.number().int().nonnegative(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const contentRouter = router({

  // ENG-002: Create session, return sessionId + estimated time
  create: tenantProcedure
    .input(CreateSessionInput)
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .insert(contentSessions)
        .values({
          tenantId:       ctx.tenantId,
          createdBy:      ctx.userId,
          entryPoint:     input.entryPoint,
          formula:        input.formula,
          lengthMode:     input.lengthMode,
          productName:    input.productName,
          targetAudience: input.targetAudience,
          coreClaim:      input.coreClaim,
          status:         'generating',
        })
        .returning({ id: contentSessions.id });

      const estimatedGenerationSeconds = input.lengthMode === 'short' ? 15 : 30;

      try {
        fireSessionStarted(ctx.userId, {
          tenantId:   ctx.tenantId,
          region:     ctx.region,
          plan:       ctx.plan,
          sessionId:  session.id,
          entryPoint: input.entryPoint,
        });
      } catch (e) {
        console.warn('[analytics] fireSessionStarted failed', e);
      }

      return {
        sessionId: session.id,
        estimatedGenerationSeconds,
      };
    }),

  // ENG-008 / ENG-009 / ENG-010 / ENG-012: Generate script synchronously
  // Note: In production this will be queued via QStash (ENG-008 full impl).
  // Sprint 1 runs synchronously to unblock FE development.
  generateScript: tenantProcedure
    .input(GenerateScriptInput)
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(contentSessions)
        .where(
          and(
            eq(contentSessions.id, input.sessionId),
            eq(contentSessions.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      if (input.regenerate) {
        // Mark previous scripts as not current
        await db
          .update(contentScripts)
          .set({ isCurrent: false })
          .where(eq(contentScripts.sessionId, input.sessionId));
      }

      const { systemPrompt, userPrompt } = buildScriptPrompt({
        formula:        session.formula,
        lengthMode:     session.lengthMode,
        productName:    session.productName,
        targetAudience: session.targetAudience,
        coreClaim:      session.coreClaim,
      });

      const MAX_RETRIES = 3;
      let lastFeedback: string | null = null;
      let retryCount = 0;

      // Track the best attempt across retries. If all 3 fail validation, we
      // still return the closest-to-target script with a qualityIssue flag so
      // the slice demo completes end-to-end. Hard failure only when zero
      // attempts produced valid JSON.
      type Attempt = {
        parsed: GeneratedScript;
        fullText: string;
        charCount: number;
        frameCount: number;
        provider: string;
        model: string;
        llmLatencyMs: number;
        issue: string | null;
        distance: number;
      };
      let bestAttempt: Attempt | null = null;

      const CHAR_TARGET_LO = 190;
      const CHAR_TARGET_HI = 215;

      while (retryCount < MAX_RETRIES) {
        const llmStart = Date.now();

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user'   as const, content: userPrompt },
        ];
        if (lastFeedback) {
          messages.push({
            role: 'user' as const,
            content: `上次输出不合规：${lastFeedback}\n目标字数 190-215（含），最理想 200-210 字。请精确控制，避免过度修正。只输出 JSON。`,
          });
        }

        let llmResponse;
        try {
          llmResponse = await executeWithFallback({
            messages,
            intent:   'draft',
            tenantId: ctx.tenantId,
            region:   ctx.region,
            maxTokens: session.lengthMode === 'short' ? 1500 : 4000,
            temperature: retryCount === 0 ? 0.6 : 0.3,
          });
        } catch (e) {
          if (e instanceof LLMError) {
            const f = friendlyFromLLMError(e);
            // Non-retryable upstream errors (auth/balance/filter) should not
            // exhaust retry budget — surface immediately with friendly detail.
            if (!e.retryable) {
              await db.update(contentSessions)
                .set({ status: 'draft', updatedAt: new Date() })
                .where(eq(contentSessions.id, session.id));
              throw new TRPCError({
                code: f.code === 'LLM_CONTEXT_TOO_LONG' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
                message: `${f.title}：${f.detail}`,
              });
            }
            // Retryable (rate limit / transient) — log and count as one retry.
            console.warn(`[generateScript] LLM retryable error: ${f.code} ${f.detail}`);
            retryCount++;
            lastFeedback = '上次请求因服务端问题失败，请重新生成，只输出 JSON。';
            continue;
          }
          throw e; // non-LLM error — bubble up to tRPC default handler
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
        const validation = validateScriptLength(fullText, frameCount, session.lengthMode);

        // Track closest-to-target for graceful degradation
        const distance = charCount < CHAR_TARGET_LO
          ? CHAR_TARGET_LO - charCount
          : charCount > CHAR_TARGET_HI
            ? charCount - CHAR_TARGET_HI
            : 0;
        if (!bestAttempt || distance < bestAttempt.distance) {
          bestAttempt = {
            parsed, fullText, charCount, frameCount,
            provider: llmResponse.provider,
            model:    llmResponse.model,
            llmLatencyMs,
            issue:    validation.valid ? null : (validation.issue ?? null),
            distance,
          };
        }

        if (!validation.valid) {
          retryCount++;
          lastFeedback = validation.issue ?? '字数或帧数不合规';
          continue;
        }

        break; // valid — fall through to persist below
      }

      if (!bestAttempt) {
        await db
          .update(contentSessions)
          .set({ status: 'draft', updatedAt: new Date() })
          .where(eq(contentSessions.id, session.id));
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'LLM returned no parseable output in any retry',
        });
      }

      // Persist best attempt (valid or degraded)
      const suppressionFlags = buildSuppressionScanner(bestAttempt.fullText);

      const [script] = await db
        .insert(contentScripts)
        .values({
          sessionId:           session.id,
          tenantId:            ctx.tenantId,
          frames:              bestAttempt.parsed.frames,
          charCount:           bestAttempt.charCount,
          frameCount:          bestAttempt.frameCount,
          fullText:            bestAttempt.fullText,
          commentBaitQuestion: bestAttempt.parsed.commentBaitQuestion ?? null,
          qualityIssue:        bestAttempt.issue,
          provider:            bestAttempt.provider,
          model:               bestAttempt.model,
          latencyMs:           bestAttempt.llmLatencyMs,
          retryCount,
          isCurrent:           true,
        })
        .returning();

      await db
        .update(contentSessions)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(contentSessions.id, session.id));

      try {
        fireScriptGenerated(ctx.userId, {
          tenantId:   ctx.tenantId,
          region:     ctx.region,
          plan:       ctx.plan,
          sessionId:  session.id,
          scriptId:   script.id,
          formula:    session.formula,
          lengthMode: session.lengthMode,
          charCount:  bestAttempt.charCount,
          frameCount: bestAttempt.frameCount,
          provider:   bestAttempt.provider,
          latencyMs:  bestAttempt.llmLatencyMs,
          retryCount,
          suppressionFlagCount: suppressionFlags.length,
        });
      } catch (e) {
        console.warn('[analytics] fireScriptGenerated failed', e);
      }

      return {
        scriptId:            script.id,
        frames:              bestAttempt.parsed.frames,
        charCount:           bestAttempt.charCount,
        frameCount:          bestAttempt.frameCount,
        commentBaitQuestion: bestAttempt.parsed.commentBaitQuestion,
        suppressionFlags,
        provider:            bestAttempt.provider,
        retryCount,
        qualityIssue:        bestAttempt.issue, // non-null = shown to user as soft warning
      };
    }),

  // ENG-014: Polling endpoint for generation status
  getGenerationStatus: tenantProcedure
    .input(GetStatusInput)
    .query(async ({ ctx, input }) => {
      const [session] = await db
        .select({
          status:    contentSessions.status,
          updatedAt: contentSessions.updatedAt,
        })
        .from(contentSessions)
        .where(
          and(
            eq(contentSessions.id, input.sessionId),
            eq(contentSessions.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const script = await db
        .select({ id: contentScripts.id })
        .from(contentScripts)
        .where(
          and(
            eq(contentScripts.sessionId, input.sessionId),
            eq(contentScripts.isCurrent, true),
          ),
        )
        .limit(1);

      return {
        status:   session.status,
        scriptId: script[0]?.id ?? null,
      };
    }),

  // W3-02: Approve current draft, transition session → approved
  // Solo mode: requires all 5 checklist items true.
  approve: tenantProcedure
    .input(ApproveInput)
    .mutation(async ({ ctx, input }) => {
      const allChecked = Object.values(input.checklist).every(Boolean);
      if (!allChecked) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '必须完成全部 5 项自审才能通过',
        });
      }

      const [session] = await db
        .select()
        .from(contentSessions)
        .where(
          and(
            eq(contentSessions.id, input.sessionId),
            eq(contentSessions.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }
      if (session.status !== 'draft' && session.status !== 'reviewing') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `无法从状态 "${session.status}" 转到 approved`,
        });
      }

      const [script] = await db
        .select({ id: contentScripts.id, qualityIssue: contentScripts.qualityIssue })
        .from(contentScripts)
        .where(
          and(
            eq(contentScripts.sessionId, session.id),
            eq(contentScripts.isCurrent, true),
          ),
        )
        .limit(1);

      await db
        .update(contentSessions)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(eq(contentSessions.id, session.id));

      if (script) {
        try {
          fireScriptApproved(ctx.userId, {
            tenantId:   ctx.tenantId,
            region:     ctx.region,
            plan:       ctx.plan,
            sessionId:  session.id,
            scriptId:   script.id,
            formula:    session.formula,
            lengthMode: session.lengthMode,
            hadQualityIssue: script.qualityIssue != null,
          });
        } catch (e) {
          console.warn('[analytics] fireScriptApproved failed', e);
        }
      }

      return { sessionId: session.id, status: 'approved' as const };
    }),

  // W3-03 + W3-04: Export approved (or draft) script to plain text with CAC label
  // - storyboard: frame-by-frame with visual directions and timecodes
  // - plain: prose-only, comment bait appended
  // Both always end with CAC AI-disclosure label.
  export: tenantProcedure
    .input(ExportInput)
    .query(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(contentSessions)
        .where(
          and(
            eq(contentSessions.id, input.sessionId),
            eq(contentSessions.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const [script] = await db
        .select()
        .from(contentScripts)
        .where(
          and(
            eq(contentScripts.sessionId, input.sessionId),
            eq(contentScripts.isCurrent, true),
          ),
        )
        .limit(1);

      if (!script) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No script found for this session' });
      }

      const frames = script.frames as { index: number; text: string; visualDirection: string; durationS: number }[];
      const cacLabel = buildCacLabel(input.format === 'plain' ? 'caption' : 'video');
      const commentBait = script.commentBaitQuestion?.trim() ?? '';

      let body: string;
      if (input.format === 'storyboard') {
        const header = `【${session.productName}】抖音 60 秒脚本\n目标受众：${session.targetAudience}\n核心主张：${session.coreClaim}\n公式：${session.formula === 'provocation' ? '挑衅断言型' : '日常现象洞察型'}\n字数：${script.charCount} 字 · ${script.frameCount} 帧`;

        let cursor = 0;
        const frameLines = frames.map((f) => {
          const start = cursor;
          cursor += f.durationS;
          const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
          return `[帧 ${f.index} · ${mmss(start)}-${mmss(cursor)}]\n画面：${f.visualDirection}\n口播：${f.text}`;
        }).join('\n\n');

        const commentBlock = commentBait ? `\n\n—— 评论引导 ——\n${commentBait}` : '';
        body = `${header}\n\n${frameLines}${commentBlock}`;
      } else {
        const commentBlock = commentBait ? `\n\n评论引导：${commentBait}` : '';
        body = `${session.productName}\n\n${script.fullText}${commentBlock}`;
      }

      const filename = `${session.productName.replace(/[^\w\u4e00-\u9fa5]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`;
      const content  = `${body}\n\n${cacLabel}`;

      return {
        filename,
        content,
        charCount:  script.charCount,
        frameCount: script.frameCount,
        cacLabel,
      };
    }),

  // W3-08: Client-triggered export tracking (copy or download)
  trackExport: tenantProcedure
    .input(TrackExportInput)
    .mutation(({ ctx, input }) => {
      try {
        fireScriptExported(ctx.userId, {
          tenantId:  ctx.tenantId,
          region:    ctx.region,
          plan:      ctx.plan,
          sessionId: input.sessionId,
          format:    input.format,
          action:    input.action,
          charCount: input.charCount,
        });
      } catch (e) {
        console.warn('[analytics] fireScriptExported failed', e);
      }
      return { ok: true as const };
    }),

  // Get full session with current script
  getSession: tenantProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(contentSessions)
        .where(
          and(
            eq(contentSessions.id, input.sessionId),
            eq(contentSessions.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const [script] = await db
        .select()
        .from(contentScripts)
        .where(
          and(
            eq(contentScripts.sessionId, input.sessionId),
            eq(contentScripts.isCurrent, true),
          ),
        )
        .limit(1);

      return { session, script: script ?? null };
    }),
});
