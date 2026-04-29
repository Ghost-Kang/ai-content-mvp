// W3-06 / W3-07 — Friendly error message mapping
// Server-side: tRPC errors include `code` (TRPCError) and sometimes an LLM
// provider error underneath. Map to user-facing Chinese copy.
//
// W3-07 adds `friendlyFromNodeError` — parses the `${code}: ${message}` format
// that NodeRunner writes into workflow_steps.error_msg, and produces a richer
// envelope: title + detail + actionable hint + retryability + raw code so the
// UI can show "what to do next" instead of dumping a stack trace.

import { LLMError } from './llm/types';
import type { NodeType, NodeErrorCode } from './workflow/types';

export interface FriendlyError {
  title: string;
  detail: string;
  retryable: boolean;
  code: string;
}

/** Richer envelope for workflow_steps.error_msg (W3-07). */
export interface FriendlyNodeError {
  /** One-line title shown in the failed-state badge / banner. */
  title:       string;
  /** 1-2 sentence explanation suitable for non-technical operators. */
  detail:      string;
  /** Concrete next-step suggestion ("点重试再试一次" / "联系管理员配置 API key" 等). */
  hint:        string;
  /** NodeError taxonomy slot (UPSTREAM_MISSING / PROVIDER_FAILED / …). */
  code:        NodeErrorCode | 'UNPARSEABLE';
  /** Original error_msg payload after stripping the leading `CODE: `. */
  rawMessage:  string;
  /** Whether the user clicking 重试 is likely to succeed without other changes. */
  isRetryable: boolean;
  /** Whether this is fundamentally a config / vendor problem (escalate, not retry). */
  isOpsIssue:  boolean;
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
    case 'SPEND_CAP_EXCEEDED': {
      const isGlobal = err.message.startsWith('Global');
      return {
        title: isGlobal ? 'AI 服务今日配额已用完' : '您的团队今日配额已用完',
        detail: isGlobal
          ? '系统今日总调用预算已达上限，请明日 UTC 0 点后重试，或联系管理员提升上限。'
          : '您的团队今日生成配额已达上限，请明日 UTC 0 点后重试，或联系管理员提升上限。',
        retryable: false,
        code: 'LLM_SPEND_CAP_EXCEEDED',
      };
    }
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

// ─── W3-07: workflow_steps.error_msg → FriendlyNodeError ──────────────────────
//
// Format written by NodeRunner: `${ne.code}: ${ne.message}`
// Example:
//   "PROVIDER_FAILED: video frame 1 failed: API authentication failed"
//   "UPSTREAM_MISSING: Node export requires upstream video output but it is missing"
//   "UNKNOWN: video frame 1 unknown error: Seedance API key not configured"
//
// We parse the leading code, then map (code, nodeType) → user-facing copy.
// nodeType is required because the same code (e.g. PROVIDER_FAILED) means
// very different things for video (Seedance) vs export (Vercel Blob upload).

const NODE_ZH: Record<NodeType, string> = {
  topic:      '主题',
  script:     '脚本生成',
  storyboard: '分镜生成',
  video:      '视频生成',
  export:     '导出',
};

/** Splits `CODE: rest of message` into `[code, rest]`. Defensive against malformed input.
 *  NB: we use `[\s\S]` instead of `.` because the project's tsconfig target predates
 *  the regex `s` flag (ES2018). Multi-line raw messages (cause + stack) must survive. */
function parseNodeErrorMsg(errorMsg: string): { code: string; rest: string } {
  const match = /^([A-Z_]+):\s*([\s\S]*)$/.exec(errorMsg.trim());
  if (!match) return { code: 'UNPARSEABLE', rest: errorMsg };
  return { code: match[1], rest: match[2] ?? '' };
}

export function friendlyFromNodeError(
  errorMsg: string | null | undefined,
  nodeType: NodeType,
): FriendlyNodeError {
  if (!errorMsg || !errorMsg.trim()) {
    return {
      title:       '执行失败',
      detail:      '节点失败，但未捕获到具体原因。',
      hint:        '建议点击重试，或刷新页面查看最新状态。',
      code:        'UNKNOWN',
      rawMessage:  errorMsg ?? '',
      isRetryable: true,
      isOpsIssue:  false,
    };
  }

  const { code, rest } = parseNodeErrorMsg(errorMsg);
  const nodeZh = NODE_ZH[nodeType] ?? nodeType;
  const rawMessage = rest || errorMsg;

  switch (code) {
    case 'UPSTREAM_MISSING':
      return {
        title:       `${nodeZh}缺少上游输入`,
        detail:      '上游节点尚未生成所需的中间产物，本节点无法执行。',
        hint:        '请先重跑或编辑上游节点（前一张卡片），让其重新输出后再回到此节点。',
        code:        'UPSTREAM_MISSING',
        rawMessage,
        isRetryable: false,
        isOpsIssue:  false,
      };

    case 'INVALID_INPUT':
      return {
        title:       `${nodeZh}输入不合法`,
        detail:      '上游节点的输出不符合本节点的格式要求（字段缺失 / 类型错误 / 数量为零等）。',
        hint:        '建议编辑上游节点的输出修正格式后重跑，或重跑上游节点让 AI 重新生成。',
        code:        'INVALID_INPUT',
        rawMessage,
        isRetryable: false,
        isOpsIssue:  false,
      };

    case 'SPEND_CAP_EXCEEDED': {
      // Two flavours surface here:
      //   "Monthly cap exceeded: video_cap_exceeded (cost X/Y fen, videos N/M)"
      //   "Monthly cap exceeded: cost_cap_exceeded (cost X/Y fen, videos N/M)"
      // Show users which one tripped + the actual numbers so admins know
      // exactly which env var to bump.
      const numbersMatch = /cost (\d+)\/(\d+) fen, videos (\d+)\/(\d+)/.exec(rawMessage);
      const numbersHint = numbersMatch
        ? `当前已用：${(Number(numbersMatch[1]) / 100).toFixed(2)} 元 / ${numbersMatch[2] === '0' ? '∞' : (Number(numbersMatch[2]) / 100).toFixed(2)} 元，视频 ${numbersMatch[3]} / ${numbersMatch[4]} 条。`
        : '';
      const isVideoCap = rawMessage.includes('video_cap_exceeded');
      const isCostCap  = rawMessage.includes('cost_cap_exceeded');
      if (isVideoCap) {
        return {
          title:       '本月视频条数已用完',
          detail:      `本团队本月的视频生成条数已达上限。${numbersHint}`,
          hint:        '请等待下个自然月配额重置，或联系管理员调高 WORKFLOW_MONTHLY_VIDEO_CAP_COUNT。',
          code:        'SPEND_CAP_EXCEEDED',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  true,
        };
      }
      if (isCostCap) {
        return {
          title:       '本月生成预算已用完',
          detail:      `本团队本月的视频生成花费已达上限。${numbersHint}`,
          hint:        '请等待下个自然月配额重置，或联系管理员调高 WORKFLOW_MONTHLY_COST_CAP_CNY。',
          code:        'SPEND_CAP_EXCEEDED',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  true,
        };
      }
      return {
        title:       '本月配额已用完',
        detail:      '本团队的月度生成预算或视频条数上限已经达到，本节点被预 flight 拦截。',
        hint:        '请等待下个自然月配额重置，或联系管理员调高 monthly_usage 上限。',
        code:        'SPEND_CAP_EXCEEDED',
        rawMessage,
        isRetryable: false,
        isOpsIssue:  true,
      };
    }

    case 'PARSE_FAILED':
      return {
        title:       `${nodeZh} AI 输出解析失败`,
        detail:      'AI 三次重试后仍未返回符合 JSON 协议的结果（可能是模型口径漂移或网络抖动）。',
        hint:        '建议立即重试一次；若再失败，编辑上游节点（如分镜帧数过多）后重跑。',
        code:        'PARSE_FAILED',
        rawMessage,
        isRetryable: true,
        isOpsIssue:  false,
      };

    case 'VALIDATION_FAILED':
      // Storyboard / video / export 都可能 emit；rest 的前缀决定细节。
      if (rawMessage.startsWith('export') || nodeType === 'export') {
        return {
          title:       '导出文件生成失败',
          detail:      '在打包 ZIP / 上传 Blob 阶段遇到问题，可能是上传网络不稳或视频帧数与分镜不匹配。',
          hint:        '点重试通常能解决；若反复失败，请展开下方原始 output 检查 missingFrames 字段。',
          code:        'VALIDATION_FAILED',
          rawMessage,
          isRetryable: true,
          isOpsIssue:  false,
        };
      }
      return {
        title:       `${nodeZh}产出未通过质量校验`,
        detail:      'AI 多次返回的结果未通过分镜 / 镜头多样性 / 字数等硬性规则。',
        hint:        '建议重试 1-2 次；若主题本身较敏感或抽象，编辑脚本（缩短 / 换措辞）后再重跑分镜。',
        code:        'VALIDATION_FAILED',
        rawMessage,
        isRetryable: true,
        isOpsIssue:  false,
      };

    case 'LLM_FATAL':
      // SPEND_CAP_EXCEEDED arrives wrapped here because checkSpendCap
      // throws a non-retryable LLMError, and script/storyboard nodes
      // wrap any non-retryable LLMError as `NodeError('LLM_FATAL', 'LLM <code>: …')`.
      // The generic LLM_FATAL fallback below would mislead with
      // "auth / context / filter" copy, which has nothing to do with budget.
      if (rawMessage.includes('SPEND_CAP_EXCEEDED')) {
        const isTenantCap = rawMessage.includes('Tenant');
        return {
          title:       isTenantCap ? '今日 AI 预算已用完' : '系统今日 AI 预算已用完',
          detail:      isTenantCap
            ? '本团队今日 LLM 调用花费已达上限（默认 ¥5/天），脚本 / 分镜节点暂无法继续。'
            : '系统全局今日 LLM 调用花费已达上限（默认 ¥50/天），所有租户暂无法继续。',
          hint:        isTenantCap
            ? 'UTC 0 点（北京 8:00）后会自动重置；或联系管理员调高 LLM_TENANT_DAILY_CAP_CNY。'
            : 'UTC 0 点（北京 8:00）后会自动重置；或联系管理员调高 LLM_DAILY_CAP_CNY。',
          code:        'LLM_FATAL',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  true,
        };
      }
      if (rawMessage.includes('CONTEXT_TOO_LONG')) {
        return {
          title:       'AI 输入超出长度上限',
          detail:      '上游节点的输出（脚本 / 分镜）字数太多，模型上下文窗口装不下。',
          hint:        '编辑上游节点缩短内容（如分镜帧数从 17 → 10），或重跑上游让 AI 自动精简。',
          code:        'LLM_FATAL',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  false,
        };
      }
      if (rawMessage.includes('CONTENT_FILTERED')) {
        return {
          title:       '内容触发平台过滤',
          detail:      '上游内容包含敏感词，被 AI 提供商拦截，无法生成。',
          hint:        '编辑上游节点改写敏感措辞（涉政 / 涉黄 / 暴力等），然后重跑本节点。',
          code:        'LLM_FATAL',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  false,
        };
      }
      if (rawMessage.includes('AUTH_FAILED')) {
        return {
          title:       'AI 服务认证失败',
          detail:      'AI 提供商的 API key 失效或余额不足，本节点无法继续。',
          hint:        '联系管理员检查 LLM provider key / 余额；用户侧重试不会成功。',
          code:        'LLM_FATAL',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  true,
        };
      }
      return {
        title:       `${nodeZh} AI 调用失败（不可恢复）`,
        detail:      'AI 提供商返回了不可重试的错误（认证失败 / 上下文过长 / 内容被过滤）。',
        hint:        '展开下方原始 output 查看具体 LLM 错误码；通常需要编辑上游或联系管理员。',
        code:        'LLM_FATAL',
        rawMessage,
        isRetryable: false,
        isOpsIssue:  true,
      };

    case 'PROVIDER_FAILED':
      // export upload vs video generation
      if (nodeType === 'export') {
        return {
          title:       '导出上传失败',
          detail:      '生成 ZIP 文件没问题，但上传到云存储失败（多半是 Blob token 异常或网络抖动）。',
          hint:        '点重试通常能解决；若反复失败，联系管理员检查 BLOB_READ_WRITE_TOKEN。',
          code:        'PROVIDER_FAILED',
          rawMessage,
          isRetryable: true,
          isOpsIssue:  rawMessage.toLowerCase().includes('auth'),
        };
      }
      // video provider
      if (rawMessage.includes('AUTH_FAILED') || rawMessage.toLowerCase().includes('api key')) {
        return {
          title:       '视频生成服务认证失败',
          detail:      'Seedance API key 未配置或无效，视频节点无法调用上游。',
          hint:        '联系管理员配置 SEEDANCE_API_KEY 环境变量后再重试本节点。',
          code:        'PROVIDER_FAILED',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  true,
        };
      }
      if (rawMessage.includes('RATE_LIMITED') || rawMessage.includes('rate')) {
        return {
          title:       '视频生成服务限流',
          detail:      'Seedance 上游请求过多被限流，已触达本节点的内部重试上限。',
          hint:        '建议等 1-2 分钟后重试；若内测期间频繁触发，联系管理员申请提升上游配额。',
          code:        'PROVIDER_FAILED',
          rawMessage,
          isRetryable: true,
          isOpsIssue:  false,
        };
      }
      if (rawMessage.includes('POLL_TIMEOUT') || rawMessage.toLowerCase().includes('timeout')) {
        return {
          title:       '视频生成超时',
          detail:      'Seedance 任务排队太久（>5 分钟）未返回结果，已主动放弃。',
          hint:        '点重试一次；若同一帧反复超时，建议编辑分镜（简化第 N 帧的 imagePrompt）。',
          code:        'PROVIDER_FAILED',
          rawMessage,
          isRetryable: true,
          isOpsIssue:  false,
        };
      }
      return {
        title:       `${nodeZh}上游服务失败`,
        detail:      'AI 上游服务（视频生成 / 存储等）返回了可重试的错误，节点已重试若干次仍失败。',
        hint:        '建议点重试 1-2 次；若仍失败，展开下方 output 查看错误详情。',
        code:        'PROVIDER_FAILED',
        rawMessage,
        isRetryable: true,
        isOpsIssue:  false,
      };

    case 'UNKNOWN':
    default: {
      const lower = rawMessage.toLowerCase();
      if (lower.includes('api key') || lower.includes('not configured')) {
        return {
          title:       `${nodeZh}所需服务尚未配置`,
          detail:      '上游服务需要的 API key 或环境变量缺失，节点无法执行。',
          hint:        '联系管理员配置环境变量后再重试。用户侧重试不会自动恢复。',
          code:        'UNKNOWN',
          rawMessage,
          isRetryable: false,
          isOpsIssue:  true,
        };
      }
      return {
        title:       `${nodeZh}意外失败`,
        detail:      '出现未分类的异常。原始信息已保留在下方供工程排查。',
        hint:        '建议点重试一次；若反复失败，复制下方原始信息发给开发团队。',
        code:        code === 'UNPARSEABLE' ? 'UNPARSEABLE' : 'UNKNOWN',
        rawMessage,
        isRetryable: true,
        isOpsIssue:  false,
      };
    }
  }
}
