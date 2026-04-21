// W3-06 — Friendly error message mapping
// Server-side: tRPC errors include `code` (TRPCError) and sometimes an LLM
// provider error underneath. Map to user-facing Chinese copy.

import { LLMError } from './llm/types';

export interface FriendlyError {
  title: string;
  detail: string;
  retryable: boolean;
  code: string;
}

// ─── Server-side: LLMError → FriendlyError ────────────────────────────────────

export function friendlyFromLLMError(err: LLMError): FriendlyError {
  switch (err.code) {
    case 'RATE_LIMITED':
      return {
        title: 'AI 服务繁忙',
        detail: '当前请求过多，请稍等 30 秒后重试。',
        retryable: true,
        code: 'LLM_RATE_LIMITED',
      };
    case 'CONTEXT_TOO_LONG':
      return {
        title: '输入内容过长',
        detail: '请精简核心主张或受众描述后重试（建议单字段 300 字内）。',
        retryable: false,
        code: 'LLM_CONTEXT_TOO_LONG',
      };
    case 'CONTENT_FILTERED':
      return {
        title: '内容触发平台过滤',
        detail: '核心主张中可能包含敏感词，请改写后重试。',
        retryable: false,
        code: 'LLM_CONTENT_FILTERED',
      };
    case 'AUTH_FAILED':
      return {
        title: 'AI 服务暂不可用',
        detail: '服务端认证或余额异常，已通知管理员。请稍后再试。',
        retryable: false,
        code: 'LLM_AUTH_FAILED',
      };
    case 'PROVIDER_UNAVAILABLE':
      return {
        title: 'AI 服务暂时无法连接',
        detail: '网络或上游服务异常，30 秒后可重试。',
        retryable: true,
        code: 'LLM_PROVIDER_UNAVAILABLE',
      };
    case 'UNKNOWN':
    default:
      return {
        title: '生成失败',
        detail: err.message || '未知错误，请重试或联系支持。',
        retryable: true,
        code: 'LLM_UNKNOWN',
      };
  }
}

// ─── Client-side: any Error → user-facing copy ────────────────────────────────

export function friendlyFromAny(err: unknown): { title: string; detail: string; code: string } {
  if (err instanceof Error) {
    const msg = err.message;

    // tRPC error messages we emit explicitly from the router
    if (msg.includes('必须完成全部 5 项自审')) {
      return { title: '自审未完成', detail: msg, code: 'APPROVE_CHECKLIST_INCOMPLETE' };
    }
    if (msg.includes('无法从状态')) {
      return { title: '脚本状态不允许此操作', detail: msg, code: 'APPROVE_INVALID_STATE' };
    }
    if (msg.includes('Session not found')) {
      return { title: '会话已过期', detail: '请重新创建脚本。', code: 'SESSION_NOT_FOUND' };
    }
    if (msg.includes('No script found')) {
      return { title: '脚本未生成', detail: '请先生成脚本再导出。', code: 'SCRIPT_NOT_FOUND' };
    }
    if (msg.includes('LLM returned no parseable output')) {
      return {
        title: 'AI 输出解析失败',
        detail: '3 次重试都未能返回有效 JSON，建议换一个角度描述核心主张再试。',
        code: 'LLM_UNPARSEABLE',
      };
    }
    // Fallback: surface the message directly but trim provider prefixes
    return {
      title: '操作失败',
      detail: msg.replace(/^\[.+?\]\s*/, ''),
      code: 'UNKNOWN',
    };
  }
  return { title: '操作失败', detail: String(err), code: 'UNKNOWN' };
}
