// W3-05 — UI helpers for workflow visualization.
//
// Pure, framework-agnostic helpers: node labels, status colors, and a few
// formatters used by both the canvas and the list page. Keeping these in
// `src/lib` (not `src/components`) so server components can import them too.

export type NodeType = 'topic' | 'script' | 'storyboard' | 'video' | 'export';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'dirty';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

// Canonical card order. The 5-card canvas iterates this list — DO NOT reorder
// without also updating the orchestrator's stepIndex contract.
export const NODE_ORDER: ReadonlyArray<NodeType> = [
  'topic',
  'script',
  'storyboard',
  'video',
  'export',
];

export const NODE_LABELS: Record<NodeType, { zh: string; sub: string }> = {
  topic:      { zh: '选题',     sub: 'Topic'      },
  script:     { zh: '脚本',     sub: 'Script'     },
  storyboard: { zh: '分镜',     sub: 'Storyboard' },
  video:      { zh: '视频生成', sub: 'Video Gen'  },
  export:     { zh: '导出',     sub: 'Export'     },
};

// Tailwind class triplets. Kept literal so PurgeCSS picks them up — DO NOT
// build these strings dynamically.
export const STATUS_BADGE_CLASSES: Record<StepStatus, string> = {
  pending: 'bg-gray-100 text-gray-600 ring-gray-200',
  running: 'bg-amber-50 text-amber-700 ring-amber-200',
  done:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed:  'bg-rose-50 text-rose-700 ring-rose-200',
  skipped: 'bg-slate-100 text-slate-500 ring-slate-200',
  dirty:   'bg-orange-50 text-orange-700 ring-orange-200',
};

export const STATUS_LABELS: Record<StepStatus, string> = {
  pending: '待执行',
  running: '运行中',
  done:    '已完成',
  failed:  '失败',
  skipped: '已跳过',
  dirty:   '需重跑',
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  pending:   '待启动',
  running:   '运行中',
  done:      '已完成',
  failed:    '失败',
  cancelled: '已取消',
};

export const RUN_STATUS_BADGE_CLASSES: Record<RunStatus, string> = {
  pending:   'bg-gray-100 text-gray-600 ring-gray-200',
  running:   'bg-amber-50 text-amber-700 ring-amber-200',
  done:      'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed:    'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

// `done | failed | cancelled` are terminal — once a run hits one of these we
// stop polling. Keep this in sync with the WorkflowOrchestrator state machine.
export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'done',
  'failed',
  'cancelled',
]);

export function isTerminalRunStatus(s: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(s);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** 1234 fen → "¥12.34". Returns "免费" when 0 to keep cards visually quiet. */
export function formatFen(fen: number): string {
  if (!Number.isFinite(fen) || fen <= 0) return '免费';
  return `¥${(fen / 100).toFixed(2)}`;
}

/** ISO timestamp → "刚刚 / 3 分钟前 / 2 小时前 / YYYY-MM-DD HH:mm". */
export function formatRelativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const ms = Date.now() - d.getTime();
  if (ms < 0)             return '刚刚';
  if (ms < 60_000)        return '刚刚';
  if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)} 分钟前`;
  if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)} 小时前`;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Computes 0–100 for the run-level progress bar. We weight nodes equally
 * (20% per node × 5 nodes) and use 50% for `running`. Intentionally simple —
 * a more accurate frame-level breakdown lands with W2-07 SSE in W3-08.
 */
export function computeRunProgress(
  steps: ReadonlyArray<{ nodeType: NodeType; status: StepStatus }>,
): number {
  const perNode = 100 / NODE_ORDER.length;
  let pct = 0;
  for (const node of NODE_ORDER) {
    const step = steps.find((s) => s.nodeType === node);
    if (!step) continue;
    if (step.status === 'done')     pct += perNode;
    else if (step.status === 'running') pct += perNode / 2;
    else if (step.status === 'skipped') pct += perNode; // count as advanced
  }
  return Math.min(100, Math.round(pct));
}
