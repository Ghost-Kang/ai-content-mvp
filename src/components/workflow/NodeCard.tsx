// W3-05 — One card per node in the 5-card workflow canvas.
//
// Composition:
//   <NodeCard nodeType={...} step={...} topic={...} />
//     ├── header: index · zh label · sub label · StatusBadge
//     ├── compact summary (1-2 lines, always visible)
//     └── expandable detail (raw output_jsonb pretty-printed + bundle download)
//
// Per-node summary renderers are intentionally defensive — a partial run
// might have `output_json = {}`, so every read goes through `safeGet`.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { StepStatusBadge } from './StatusBadge';
import { BundleDownload } from './BundleDownload';
import { NodeActionBar } from './NodeActionBar';
import { ErrorDetailDialog } from './ErrorDetailDialog';
import { friendlyFromNodeError } from '@/lib/error-messages';
import {
  NODE_LABELS,
  NODE_ORDER,
  formatFen,
  type NodeType,
  type RunStatus,
  type StepStatus,
} from '@/lib/workflow/ui-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NodeCardStep {
  nodeType:    NodeType;
  status:      StepStatus;
  outputJson:  unknown;          // jsonb — shape depends on node
  costFen:     number;
  retryCount:  number;
  errorMsg:    string | null;
  startedAt:   string | Date | null;
  completedAt: string | Date | null;
}

interface NodeCardProps {
  nodeType:        NodeType;
  /** Run topic — only used by the topic card (which has no real step row). */
  topic:           string;
  /** undefined when this node hasn't been registered/scheduled yet. */
  step:            NodeCardStep | undefined;
  /** Highlights the active card during a running workflow. */
  isActive?:       boolean;
  /** W3-06 — required to render the action bar (edit/retry/skip). */
  runId?:          string;
  /** W3-06 — gates action bar visibility (no actions while running). */
  runStatus?:      RunStatus;
}

// ─── Body renderers (defensive against missing fields) ────────────────────────

function safeGet<T = unknown>(obj: unknown, path: string): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur as T;
}

interface NodeProgressView {
  percent: number;
  title: string;
  detail: string;
  etaText?: string;
  stalled?: boolean;
}

interface VideoProgressPayload {
  phase?: 'rendering' | 'checkpointed' | 'continuing';
  totalFrames?: number;
  completedFrames?: number;
  activeFrameIndexes?: number[];
  concurrency?: number;
  batchNumber?: number;
  totalBatches?: number;
  startedAt?: string;
  updatedAt?: string;
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function parseTs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const ms = (typeof v === 'string' ? new Date(v) : v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1_000));
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return rest === 0 ? `${min} 分钟` : `${min} 分 ${rest} 秒`;
  const h = Math.floor(min / 60);
  return `${h} 小时 ${min % 60} 分钟`;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const GENERIC_NODE_ESTIMATE_MS: Record<Exclude<NodeType, 'topic' | 'video'>, number> = {
  script: 35_000,
  storyboard: 45_000,
  export: 25_000,
};

function buildGenericProgress(nodeType: NodeType, step: NodeCardStep, now: number): NodeProgressView {
  if (step.status === 'done' || step.status === 'skipped') {
    return { percent: 100, title: '100% 已完成', detail: '该节点已完成。' };
  }
  if (step.status === 'pending' || step.status === 'dirty') {
    return { percent: 0, title: '0% 待执行', detail: '等待上游节点完成。' };
  }
  if (step.status === 'failed') {
    return { percent: 0, title: '执行失败', detail: step.errorMsg ?? '该节点执行失败。', stalled: true };
  }

  const estimate = nodeType === 'topic' || nodeType === 'video'
    ? 30_000
    : GENERIC_NODE_ESTIMATE_MS[nodeType];
  const startedAt = parseTs(step.startedAt) ?? now;
  const elapsed = Math.max(0, now - startedAt);
  const percent = clampPct(Math.min(95, (elapsed / estimate) * 88 + 5));
  const remain = Math.max(0, estimate - elapsed);
  const stalled = elapsed > estimate * 2.5;
  return {
    percent,
    title: `${percent}% 运行中`,
    detail: stalled
      ? `已运行 ${formatDuration(elapsed)}，比平时更久；可能卡在模型请求或服务商响应。`
      : `正在执行，已运行 ${formatDuration(elapsed)}。`,
    etaText: stalled ? undefined : `预计剩余约 ${formatDuration(remain)}`,
    stalled,
  };
}

function buildVideoProgress(step: NodeCardStep, now: number): NodeProgressView {
  const raw = safeGet<VideoProgressPayload>(step.outputJson, 'progress');
  const frames = safeGet<ReadonlyArray<unknown>>(step.outputJson, 'frames') ?? [];
  const completedFrames = raw?.completedFrames ?? frames.length;
  const totalFrames = raw?.totalFrames ?? Math.max(completedFrames, frames.length, 1);
  const concurrency = Math.max(1, raw?.concurrency ?? 1);
  const activeFrameIndexes = Array.isArray(raw?.activeFrameIndexes) ? raw.activeFrameIndexes : [];
  const phase = raw?.phase;
  const lastProgressAt = parseTs(raw?.updatedAt) ?? parseTs(step.startedAt) ?? now;
  const elapsedSinceProgress = Math.max(0, now - lastProgressAt);

  if (step.status === 'done') {
    return { percent: 100, title: '100% 已完成', detail: `已完成 ${totalFrames}/${totalFrames} 段视频。` };
  }

  const basePct = (completedFrames / totalFrames) * 100;
  const activePct = activeFrameIndexes.length > 0
    ? Math.min((activeFrameIndexes.length / totalFrames) * 85, (activeFrameIndexes.length / totalFrames) * (elapsedSinceProgress / 45_000) * 90)
    : 0;
  const percent = clampPct(Math.min(99, basePct + activePct));

  const remainingFrames = Math.max(0, totalFrames - completedFrames);
  const remainingBatches = Math.ceil(remainingFrames / concurrency);
  const batchEtaMs = 35_000;
  const currentBatchCredit = phase === 'rendering' ? Math.min(elapsedSinceProgress, batchEtaMs) : 0;
  const etaMs = Math.max(0, remainingBatches * batchEtaMs - currentBatchCredit);
  const stalled = phase === 'rendering' && elapsedSinceProgress > 90_000;

  if (phase === 'continuing' || (step.status === 'pending' && completedFrames > 0 && completedFrames < totalFrames)) {
    return {
      percent,
      title: `${percent}% 等待下一批`,
      detail: `已完成 ${completedFrames}/${totalFrames} 段；正在等待 worker 接力继续渲染。`,
      etaText: `预计剩余约 ${formatDuration(etaMs)}`,
    };
  }

  if (activeFrameIndexes.length > 0) {
    const activeText = activeFrameIndexes.map((n) => `第 ${n} 段`).join('、');
    return {
      percent,
      title: `${percent}% 视频生成中`,
      detail: stalled
        ? `${activeText} 已等待 ${formatDuration(elapsedSinceProgress)}；当前卡在 Seedance 生成/轮询结果。`
        : `正在并发生成 ${activeText}，已完成 ${completedFrames}/${totalFrames} 段。`,
      etaText: stalled ? '如果继续超过 3 分钟，通常是服务商任务排队或回调变慢' : `预计剩余约 ${formatDuration(etaMs)}`,
      stalled,
    };
  }

  return {
    percent,
    title: `${percent}% 视频生成中`,
    detail: `已完成 ${completedFrames}/${totalFrames} 段，正在准备下一批。`,
    etaText: `预计剩余约 ${formatDuration(etaMs)}`,
  };
}

function ProgressBlock({ info }: { info: NodeProgressView }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={info.stalled ? 'font-semibold text-rose-700' : 'font-semibold text-amber-700'}>
          {info.title}
        </span>
        {info.etaText && <span className="text-gray-500">{info.etaText}</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full transition-all duration-500 ${info.stalled ? 'bg-rose-500' : 'bg-amber-500'}`}
          style={{ width: `${Math.max(2, info.percent)}%` }}
        />
      </div>
      <p className={`text-xs leading-relaxed ${info.stalled ? 'text-rose-600' : 'text-gray-600'}`}>
        {info.detail}
      </p>
    </div>
  );
}

function TopicSummary({ topic }: { topic: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-gray-400">主题</p>
      <p className="text-sm font-medium text-gray-900">{topic}</p>
    </div>
  );
}

function ScriptSummary({ output }: { output: unknown }) {
  const frameCount = safeGet<number>(output, 'frameCount') ?? 0;
  const charCount  = safeGet<number>(output, 'charCount')  ?? 0;
  const firstFrame = safeGet<{ text?: string; voiceover?: string }>(output, 'frames.0');
  const preview    = firstFrame?.voiceover ?? firstFrame?.text ?? '';
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{frameCount} 帧</span>
        <span>{charCount} 字</span>
      </div>
      {preview && (
        <p className="line-clamp-3 text-xs text-gray-700">
          <span className="text-gray-400">第 1 帧：</span>
          {preview}
        </p>
      )}
    </div>
  );
}

function StoryboardSummary({ output }: { output: unknown }) {
  const frames     = safeGet<ReadonlyArray<unknown>>(output, 'frames') ?? [];
  const totalSec   = safeGet<number>(output, 'totalDurationSec') ?? 0;
  const firstScene = safeGet<string>(output, 'frames.0.scene') ?? '';
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{frames.length} 帧</span>
        <span>{totalSec.toFixed(1)} 秒</span>
      </div>
      {firstScene && (
        <p className="line-clamp-2 text-xs text-gray-700">
          <span className="text-gray-400">第 1 帧：</span>
          {firstScene}
        </p>
      )}
    </div>
  );
}

function VideoSummary({ output, costFen }: { output: unknown; costFen: number }) {
  const frames     = safeGet<ReadonlyArray<{ videoUrl?: string }>>(output, 'frames') ?? [];
  const totalSec   = safeGet<number>(output, 'totalDurationSec') ?? 0;
  const firstUrl   = frames[0]?.videoUrl;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{frames.length} 段</span>
        <span>{totalSec.toFixed(1)} 秒</span>
        <span>{formatFen(costFen)}</span>
      </div>
      {firstUrl && (
        <a
          href={firstUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
        >
          预览第 1 段
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7m0 0v7m0-7L10 14M5 5v14h14" />
          </svg>
        </a>
      )}
    </div>
  );
}

function FailedSummary({
  errorMsg,
  retryCount,
  nodeType,
  onShowDetail,
}: {
  errorMsg:    string | null;
  retryCount:  number;
  nodeType:    NodeType;
  onShowDetail: () => void;
}) {
  // Compute friendly title for the inline preview — full detail lives in the
  // dialog. We accept a small re-mapping cost on render here because most cards
  // never enter the failed branch.
  const friendly = friendlyFromNodeError(errorMsg, nodeType);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-rose-700">{friendly.title}</span>
        <span className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] text-rose-700 ring-1 ring-inset ring-rose-200">
          {friendly.code}
        </span>
        {retryCount > 0 && (
          <span className="text-[10px] text-gray-500">已自动重试 {retryCount} 次</span>
        )}
      </div>
      <p className="line-clamp-2 text-xs text-rose-600">{friendly.detail}</p>
      <button
        type="button"
        onClick={onShowDetail}
        className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 underline-offset-2 hover:underline"
      >
        查看详情 + 建议
        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

function ExportSummary({ output }: { output: unknown }) {
  const totalSec   = safeGet<number>(output, 'totalDurationSec') ?? 0;
  const generated  = safeGet<string>(output, 'generatedAt');
  const bundle     = safeGet<{
    signedUrl:     string;
    expiresAt:     string;
    filename:      string;
    bytes:         number;
    missingFrames: ReadonlyArray<number>;
  }>(output, 'bundle') ?? null;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{totalSec.toFixed(1)} 秒成品</span>
        {generated && <span>{new Date(generated).toLocaleString('zh-CN')}</span>}
      </div>
      <BundleDownload bundle={bundle} />
    </div>
  );
}

// ─── NodeCard ─────────────────────────────────────────────────────────────────

export function NodeCard({
  nodeType,
  topic,
  step,
  isActive = false,
  runId,
  runStatus,
}: NodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [errorDetailOpen, setErrorDetailOpen] = useState(false);
  const labels = NODE_LABELS[nodeType];
  const idx    = NODE_ORDER.indexOf(nodeType) + 1;

  // The "topic" card is special — there's no NodeRunner row for it.
  const isTopic   = nodeType === 'topic';
  const status: StepStatus = isTopic
    ? 'done'
    : (step?.status ?? 'pending');

  const hasOutput = !isTopic && step && step.outputJson !== null && Object.keys((step.outputJson as object) ?? {}).length > 0;
  const canExpand = hasOutput || (!!step?.errorMsg);
  const hasVideoProgress = nodeType === 'video' && !!safeGet<VideoProgressPayload>(step?.outputJson, 'progress');
  const shouldTick = !!step && (status === 'running' || (status === 'pending' && hasVideoProgress));
  const now = useNow(shouldTick);
  const progressInfo = useMemo(() => {
    if (!step || isTopic) return null;
    if (nodeType === 'video' && (status === 'running' || hasVideoProgress)) {
      return buildVideoProgress(step, now);
    }
    if (status === 'running') return buildGenericProgress(nodeType, step, now);
    return null;
  }, [hasVideoProgress, isTopic, nodeType, now, status, step]);

  return (
    <article
      className={`flex w-full flex-col rounded-xl border bg-white shadow-sm transition-all ${
        isActive
          ? 'border-amber-300 ring-2 ring-amber-200'
          : 'border-gray-200'
      }`}
      data-node-type={nodeType}
      data-status={status}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            {idx} · {labels.sub}
          </p>
          <h3 className="text-sm font-semibold text-gray-900">{labels.zh}</h3>
        </div>
        <StepStatusBadge status={status} />
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-3">
        {isTopic && <TopicSummary topic={topic} />}

        {!isTopic && status === 'pending' && (
          progressInfo ? (
            <ProgressBlock info={progressInfo} />
          ) : (
            <p className="text-xs text-gray-400">等待上游节点完成…</p>
          )
        )}

        {!isTopic && status === 'running' && (
          progressInfo ? (
            <ProgressBlock info={progressInfo} />
          ) : (
            <p className="text-xs text-amber-700">
              正在执行 (重试 {step?.retryCount ?? 0} 次)…
            </p>
          )
        )}

        {!isTopic && status === 'failed' && step && (
          <FailedSummary
            errorMsg={step.errorMsg}
            retryCount={step.retryCount}
            nodeType={nodeType}
            onShowDetail={() => setErrorDetailOpen(true)}
          />
        )}

        {!isTopic && (status === 'done' || status === 'skipped' || status === 'dirty') && hasOutput && (
          <>
            {nodeType === 'script'     && <ScriptSummary     output={step!.outputJson} />}
            {nodeType === 'storyboard' && <StoryboardSummary output={step!.outputJson} />}
            {nodeType === 'video'      && <VideoSummary      output={step!.outputJson} costFen={step!.costFen} />}
            {nodeType === 'export'     && <ExportSummary     output={step!.outputJson} />}
          </>
        )}
      </div>

      {/* W3-06 — Action bar (edit/retry/skip). Returns null when not applicable
          (topic node, running run, or all guards reject). Ordered ABOVE the
          expand toggle so the user sees actions before the raw output JSON. */}
      {!isTopic && runId && runStatus && step && (
        <NodeActionBar
          runId={runId}
          nodeType={nodeType}
          stepStatus={status}
          runStatus={runStatus}
          outputJson={step.outputJson}
        />
      )}

      {/* Footer / Expand toggle */}
      {canExpand && (
        <footer className="border-t border-gray-100">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
            aria-expanded={expanded}
          >
            <span>{expanded ? '收起 output' : '展开原始 output_jsonb'}</span>
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expanded && (
            <pre className="max-h-72 overflow-auto border-t border-gray-100 bg-gray-50 px-4 py-3 text-[11px] leading-snug text-gray-700">
              {JSON.stringify(step!.outputJson, null, 2)}
            </pre>
          )}
        </footer>
      )}

      {/* W3-07 — Failure detail dialog (controlled by FailedSummary CTA). */}
      {!isTopic && step && (
        <ErrorDetailDialog
          open={errorDetailOpen}
          onClose={() => setErrorDetailOpen(false)}
          nodeType={nodeType}
          errorMsg={step.errorMsg}
          retryCount={step.retryCount}
          startedAt={step.startedAt}
          completedAt={step.completedAt}
        />
      )}
    </article>
  );
}
