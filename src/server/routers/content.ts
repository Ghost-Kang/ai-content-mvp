// ENG-002 / ENG-008 / ENG-009 / ENG-010 / ENG-012 / ENG-014
// content tRPC router — core content creation lifecycle

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { router, tenantProcedure } from '../trpc';
import { db, contentSessions, contentScripts } from '@/db';
import { executeWithFallback } from '@/lib/llm';
import {
  buildScriptPrompt,
  validateScriptLength,
  type GeneratedScript,
} from '@/lib/prompts/script-templates';
import { buildSuppressionScanner } from '@/lib/prompts/suppression-scanner';

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
      let lastError: Error | null = null;
      let retryCount = 0;

      while (retryCount < MAX_RETRIES) {
        const llmStart = Date.now();

        const llmResponse = await executeWithFallback({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          intent:   'draft',
          tenantId: ctx.tenantId,
          region:   ctx.region,
          maxTokens: session.lengthMode === 'short' ? 1500 : 4000,
          temperature: 0.75,
        });

        // Parse JSON response
        let parsed: GeneratedScript;
        try {
          const raw = llmResponse.content
            .replace(/^```json\n?/, '')
            .replace(/\n?```$/, '')
            .trim();
          parsed = JSON.parse(raw);
        } catch {
          retryCount++;
          lastError = new Error('LLM returned non-JSON output');
          continue;
        }

        const fullText = parsed.frames.map((f) => f.text).join('');
        const validation = validateScriptLength(
          fullText,
          parsed.frames.length,
          session.lengthMode,
        );

        if (!validation.valid) {
          retryCount++;
          lastError = new Error(validation.issue ?? 'Validation failed');
          continue;
        }

        // ENG-019: Post-generation suppression scan (soft check — flag but don't block)
        const suppressionFlags = buildSuppressionScanner(fullText);

        const [script] = await db
          .insert(contentScripts)
          .values({
            sessionId:  session.id,
            tenantId:   ctx.tenantId,
            frames:     parsed.frames,
            charCount:  validation.charCount,
            frameCount: parsed.frames.length,
            fullText,
            provider:   llmResponse.provider,
            model:      llmResponse.model,
            latencyMs:  Date.now() - llmStart,
            retryCount,
            isCurrent:  true,
          })
          .returning();

        await db
          .update(contentSessions)
          .set({ status: 'draft', updatedAt: new Date() })
          .where(eq(contentSessions.id, session.id));

        return {
          scriptId:           script.id,
          frames:             parsed.frames,
          charCount:          validation.charCount,
          frameCount:         parsed.frames.length,
          commentBaitQuestion: parsed.commentBaitQuestion,
          suppressionFlags,
          provider:           llmResponse.provider,
          retryCount,
        };
      }

      // All retries exhausted
      await db
        .update(contentSessions)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(contentSessions.id, session.id));

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Script generation failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
      });
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
