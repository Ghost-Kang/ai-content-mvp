// W4-03-V3 — Topic Analysis tRPC router.
//
// Single mutation: `topic.analyze` — given a normalized trending item
// + optional creator niche, return a 2-sided analysis (whyItHit /
// howToAdapt) backed by Redis cache + executeWithFallback.
//
// Why mutation, not query? Cache misses cost LLM tokens. Mutations
// are the right semantic for "may have side effects" (in our case:
// recordSpend ledger row + Redis write).

import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { router, tenantProcedure } from '../trpc';
import { analyzeTopic, NICHE_MAX_CHARS, TopicAnalysisError } from '@/lib/topic-analysis/index';
import { LLMError } from '@/lib/llm/types';

// ─── Input schema ─────────────────────────────────────────────────────────────

const PlatformEnum = z.enum(['dy', 'ks', 'xhs', 'bz']);

const AnalyzeInput = z.object({
  platform:        PlatformEnum,
  opusId:          z.string().min(1).max(120),
  title:           z.string().max(500).optional(),
  description:     z.string().max(2000).optional(),
  firstCategory:   z.string().max(60).optional(),
  secondCategory: z.string().max(60).optional(),
  likeCount:       z.number().int().nonnegative().optional(),
  playCount:       z.number().int().nonnegative().optional(),
  duration:        z.number().nonnegative().optional(),
  authorNickname: z.string().max(100).optional(),
  niche:           z.string().max(NICHE_MAX_CHARS).optional(),
});

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapLLMErrorToTRPC(err: LLMError): TRPCError {
  switch (err.code) {
    case 'SPEND_CAP_EXCEEDED':
      return new TRPCError({ code: 'FORBIDDEN', message: `今日 LLM 预算已用完：${err.message}` });
    case 'RATE_LIMITED':
      return new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `LLM 服务限流，请稍后再试：${err.message}` });
    case 'CONTENT_FILTERED':
      return new TRPCError({ code: 'BAD_REQUEST', message: `LLM 拒绝处理这条内容：${err.message}` });
    case 'AUTH_FAILED':
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `LLM 鉴权失败（请联系管理员）：${err.message}` });
    case 'CONTEXT_TOO_LONG':
      return new TRPCError({ code: 'BAD_REQUEST', message: `输入太长：${err.message}` });
    case 'PROVIDER_UNAVAILABLE':
    case 'UNKNOWN':
    default:
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `LLM 服务异常：${err.message}` });
  }
}

function mapAnalysisErrorToTRPC(err: TopicAnalysisError): TRPCError {
  // All TopicAnalysisError variants mean "LLM output didn't match
  // the contract" — actionable by retry, so we surface as BAD_REQUEST
  // (UI can show "重新分析" button).
  return new TRPCError({
    code:    'BAD_REQUEST',
    message: `选题分析输出不合规（${err.code}）：${err.message}`,
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const topicRouter = router({
  analyze: tenantProcedure
    .input(AnalyzeInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await analyzeTopic({
          tenantId: ctx.tenantId,
          input,
        });
        return result;
      } catch (err) {
        if (err instanceof LLMError) throw mapLLMErrorToTRPC(err);
        if (err instanceof TopicAnalysisError) throw mapAnalysisErrorToTRPC(err);
        throw err;
      }
    }),
});
