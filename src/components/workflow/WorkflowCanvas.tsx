// W3-05 — 5-card horizontal canvas for a single workflow run.
// W2-07b — augmented with SSE live updates layered on top of polling.
//
// Two update mechanisms run in parallel:
//   1. SSE (EventSource → /api/workflow/[runId]/events): server pushes a
//      snapshot whenever DB content changes. ~1s latency end-to-end.
//   2. Polling (useQuery refetchInterval): insurance fallback. When SSE is
//      `open`, we slow the poll to SLOW_POLL_MS. When SSE is closed/erroring/
//      unsupported, we drop back to FAST_POLL_MS so the UI stays fresh.
//
// Both write to the same react-query cache; whichever arrives first wins.
// This degrades gracefully — if the SSE route is broken, the canvas still
// works exactly as it did pre-W2-07b.

'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';
import { NodeCard, type NodeCardStep } from './NodeCard';
import { RunStatusBadge } from './StatusBadge';
import { useWorkflowEvents } from './useWorkflowEvents';
import { friendlyFromNodeError } from '@/lib/error-messages';
import {
  NODE_LABELS,
  NODE_ORDER,
  RUN_STATUS_LABELS,
  computeRunProgress,
  formatFen,
  formatRelativeTime,
  isTerminalRunStatus,
  type NodeType,
  type RunStatus,
  type StepStatus,
} from '@/lib/workflow/ui-helpers';

// Fast poll when SSE is unavailable; slow poll when SSE is healthy (insurance).
const FAST_POLL_MS = 2_000;
const SLOW_POLL_MS = 15_000;

interface WorkflowCanvasProps {
  runId: string;
  /** When true, we render a slim "auto-refresh paused" hint instead of the dot. */
  pauseAutoRefresh?: boolean;
}

export function WorkflowCanvas({ runId, pauseAutoRefresh = false }: WorkflowCanvasProps) {
  // SSE first — pushes snapshots into the react-query cache. We dial polling
  // based on SSE health below.
  const { status: sseStatus } = useWorkflowEvents({
    runId,
    disabled: pauseAutoRefresh,
  });

  // tRPC react-query handles cache + refetch. The interval is dialed up/down
  // based on SSE health.
  const query = trpc.workflow.get.useQuery(
    { runId },
    {
      refetchInterval: (q) => {
        if (pauseAutoRefresh) return false;
        const data = q.state.data;
        if (!data?.run) return FAST_POLL_MS;
        if (isTerminalRunStatus(data.run.status as RunStatus)) return false;
        // When SSE is open, polling becomes a safety net (15s is far slower
        // than SSE's 1s push, so the user never sees the laggy poll). When
        // SSE is closed/unsupported/erroring, we drop back to the original
        // 2s poll cadence so the canvas stays fresh.
        return sseStatus === 'open' ? SLOW_POLL_MS : FAST_POLL_MS;
      },
      retry: 3,
      refetchOnWindowFocus: true,
      staleTime: 1_000,
    },
  );

  // ─── Hooks (must run unconditionally — keep above any early returns) ───────

  // Re-key the step rows by nodeType for O(1) card lookup. Memoizing on the
  // `steps` reference keeps the Map stable across re-renders triggered by
  // unrelated state (e.g. toggling NodeCard expansion).
  const steps = query.data?.steps;
  const stepsByNode = useMemo(() => {
    const map = new Map<NodeType, NodeCardStep>();
    if (!steps) return map;
    for (const s of steps) {
      map.set(s.nodeType as NodeType, {
        nodeType:    s.nodeType as NodeType,
        status:      s.status as StepStatus,
        outputJson:  s.outputJson,
        costFen:     s.costFen,
        retryCount:  s.retryCount,
        errorMsg:    s.errorMsg,
        startedAt:   s.startedAt,
        completedAt: s.completedAt,
      });
    }
    return map;
  }, [steps]);

  const runStatus = (query.data?.run.status ?? 'pending') as RunStatus;

  const activeNode: NodeType | null = useMemo(() => {
    if (isTerminalRunStatus(runStatus)) return null;
    for (const node of NODE_ORDER) {
      if (node === 'topic') continue;
      const s = stepsByNode.get(node);
      if (s && s.status === 'running') return node;
    }
    return null;
  }, [runStatus, stepsByNode]);

  // W3-07 — find the first failed node so we can show "脚本生成失败：xxx"
  // in the run-level banner instead of dumping the raw orchestrator error.
  const failedNode = useMemo<{ nodeType: NodeType; errorMsg: string | null } | null>(() => {
    if (runStatus !== 'failed') return null;
    for (const node of NODE_ORDER) {
      if (node === 'topic') continue;
      const s = stepsByNode.get(node);
      if (s && s.status === 'failed') return { nodeType: node, errorMsg: s.errorMsg };
    }
    return null;
  }, [runStatus, stepsByNode]);

  // ─── Loading / error states ─────────────────────────────────────────────────

  if (query.isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
        正在加载工作流…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        无法加载工作流：{query.error?.message ?? '未知错误'}
      </div>
    );
  }

  const { run, steps: stepRows } = query.data;

  const progress = computeRunProgress(
    stepRows.map((s) => ({ nodeType: s.nodeType as NodeType, status: s.status as StepStatus })),
  );

  return (
    <div className="space-y-6">
      {/* ─── Run header ──────────────────────────────────────────────────────── */}
      <header className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">主题</p>
            <h1 className="mt-0.5 truncate text-xl font-semibold text-gray-900">{run.topic}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>创建于 {formatRelativeTime(run.createdAt)}</span>
              {run.completedAt && <span>完成于 {formatRelativeTime(run.completedAt)}</span>}
              <span>累计花费 {formatFen(run.totalCostFen)}</span>
              {run.totalVideoCount > 0 && <span>{run.totalVideoCount} 段视频</span>}
            </div>
          </div>
          <div className="shrink-0">
            <RunStatusBadge status={runStatus} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>进度 {progress}%</span>
            {!isTerminalRunStatus(runStatus) && !pauseAutoRefresh && (
              <span
                className="inline-flex items-center gap-1.5"
                title={
                  sseStatus === 'open'
                    ? 'SSE 已连接 · 状态变化即时推送'
                    : sseStatus === 'connecting'
                    ? 'SSE 连接中 · 暂以轮询兜底'
                    : sseStatus === 'unsupported'
                    ? '浏览器不支持 SSE · 使用 2s 轮询'
                    : 'SSE 未连接 · 使用 2s 轮询'
                }
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                      sseStatus === 'open' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                      sseStatus === 'open' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                </span>
                {sseStatus === 'open' ? '实时推送已连接' : '每 2 秒自动刷新'}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                runStatus === 'failed'
                  ? 'bg-rose-500'
                  : runStatus === 'done'
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
        </div>

        {/* W3-07 — Friendly run-level banner.
            Prefer surfacing the first failed *node*'s friendly message (rich +
            actionable) over the raw run.error_msg (which is always a wrapped
            "node X failed: …"). Falls back to run.error_msg only when no node
            row is in `failed` (e.g. SPEND_CAP_EXCEEDED preflight). */}
        {(failedNode || run.errorMsg) && (
          <RunErrorBanner failedNode={failedNode} runErrorMsg={run.errorMsg} />
        )}
      </header>

      {/* ─── 5-card grid (horizontal on lg+, stacks on small screens) ───────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        {NODE_ORDER.map((node) => (
          <NodeCard
            key={node}
            nodeType={node}
            topic={run.topic}
            step={stepsByNode.get(node)}
            isActive={activeNode === node}
            runId={runId}
            runStatus={runStatus}
          />
        ))}
      </div>

      {/* ─── Footer hint when terminal ──────────────────────────────────────── */}
      {isTerminalRunStatus(runStatus) && (
        <p className="text-center text-xs text-gray-400">
          运行已 {RUN_STATUS_LABELS[runStatus]}。轮询已停止。
        </p>
      )}
    </div>
  );
}

// ─── Run-level error banner (W3-07) ───────────────────────────────────────────

interface RunErrorBannerProps {
  failedNode:   { nodeType: NodeType; errorMsg: string | null } | null;
  runErrorMsg:  string | null;
}

function RunErrorBanner({ failedNode, runErrorMsg }: RunErrorBannerProps) {
  // If we have a failed node, the friendly mapping wins (rich + actionable).
  // Otherwise, surface the run-level error_msg directly (rare path).
  if (failedNode) {
    const f = friendlyFromNodeError(failedNode.errorMsg, failedNode.nodeType);
    const labels = NODE_LABELS[failedNode.nodeType];
    return (
      <div className="mt-4 rounded-md bg-rose-50 px-3 py-2.5 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{labels.zh}失败 · {f.title}</span>
          <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[10px] text-rose-700 ring-1 ring-inset ring-rose-200">
            {f.code}
          </span>
          {f.isOpsIssue && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 ring-1 ring-inset ring-amber-200">
              需联系管理员
            </span>
          )}
        </div>
        <p className="mt-1 leading-relaxed text-rose-700">
          {f.hint}
        </p>
        <p className="mt-1.5 text-[11px] text-rose-600/80">
          展开下方「{labels.zh}」卡片，点「查看详情 + 建议」获得完整诊断。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
      <span className="font-medium">运行错误：</span>
      {runErrorMsg}
    </div>
  );
}
