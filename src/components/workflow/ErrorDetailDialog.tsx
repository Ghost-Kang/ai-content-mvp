// W3-07 — Failed-node detail dialog.
//
// What the user sees when they click "查看详情" on a failed node card:
//   1. friendly title (e.g. "视频生成服务认证失败")
//   2. 1-2 sentence explanation
//   3. concrete actionable hint ("联系管理员配置 SEEDANCE_API_KEY")
//   4. a "ops issue" pill if user retry won't help (e.g. missing API key)
//   5. raw error code badge + collapsed raw message (defaults closed; click to expand)
//   6. step metadata: 重试次数 / 第 N 步 / startedAt → completedAt 持续时间
//
// The dialog is read-only (no mutation calls). Retry/Skip live in NodeActionBar.
//
// Accessibility: same pattern as EditNodeDialog — role=dialog + aria-modal,
// Esc closes, focus trap is minimal (single Close button).

'use client';

import { useEffect, useState } from 'react';
import {
  friendlyFromNodeError,
  type FriendlyNodeError,
} from '@/lib/error-messages';
import {
  NODE_LABELS,
  type NodeType,
} from '@/lib/workflow/ui-helpers';

interface ErrorDetailDialogProps {
  open:        boolean;
  onClose:     () => void;
  nodeType:    NodeType;
  errorMsg:    string | null;
  retryCount:  number;
  startedAt:   string | Date | null;
  completedAt: string | Date | null;
}

export function ErrorDetailDialog({
  open,
  onClose,
  nodeType,
  errorMsg,
  retryCount,
  startedAt,
  completedAt,
}: ErrorDetailDialogProps) {
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset the raw-message disclosure each time the dialog opens — otherwise
  // it would silently remember the user's previous toggle state.
  useEffect(() => {
    if (open) setShowRaw(false);
  }, [open]);

  if (!open) return null;

  const friendly: FriendlyNodeError = friendlyFromNodeError(errorMsg, nodeType);
  const labels = NODE_LABELS[nodeType];
  const durationMs = computeDurationMs(startedAt, completedAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-detail-title"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/75">
              {labels.sub} · {labels.zh}
            </p>
            <h2
              id="error-detail-title"
              className="mt-0.5 truncate text-base font-bold text-rose-200"
            >
              {friendly.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 rounded p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {/* Pills row */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-200 ring-1 ring-white/10">
              {friendly.code}
            </span>
            {friendly.isOpsIssue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/15 px-2 py-0.5 text-amber-100 ring-1 ring-amber-300/30">
                需联系管理员
              </span>
            )}
            {friendly.isRetryable ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-100 ring-1 ring-emerald-300/30">
                可重试
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-slate-300 ring-1 ring-white/10">
                重试不会自动恢复
              </span>
            )}
          </div>

          {/* Detail */}
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/75">
              发生了什么
            </p>
            <p className="mt-1 text-sm text-slate-200">{friendly.detail}</p>
          </div>

          {/* Hint */}
          <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200">
              建议下一步
            </p>
            <p className="mt-1 text-sm text-cyan-50">{friendly.hint}</p>
          </div>

          {/* Step metadata */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-300 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.2em] text-slate-500">重试次数</dt>
              <dd className="mt-0.5">{retryCount} 次</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.2em] text-slate-500">开始时间</dt>
              <dd className="mt-0.5">{formatTime(startedAt)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.2em] text-slate-500">耗时</dt>
              <dd className="mt-0.5">{formatDuration(durationMs)}</dd>
            </div>
          </dl>

          {/* Raw message (collapsed by default) */}
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-slate-400 transition hover:text-cyan-200"
              aria-expanded={showRaw}
            >
              <span>{showRaw ? '收起原始错误' : '展开原始错误信息（工程排查用）'}</span>
              <svg
                className={`h-3 w-3 transition-transform ${showRaw ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showRaw && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 font-mono text-[11px] leading-snug text-slate-200">
                {friendly.rawMessage || '(empty)'}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            重试 / 跳过 操作请使用节点卡片下方的按钮。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-white/10"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(v: string | Date | null): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeDurationMs(
  startedAt: string | Date | null,
  completedAt: string | Date | null,
): number | null {
  const s = toDate(startedAt);
  const c = toDate(completedAt);
  if (!s || !c) return null;
  return Math.max(0, c.getTime() - s.getTime());
}

function formatTime(v: string | Date | null): string {
  const d = toDate(v);
  if (!d) return '—';
  return d.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} 秒`;
  const min = Math.floor(sec / 60);
  const restSec = Math.round(sec - min * 60);
  return `${min} 分 ${restSec} 秒`;
}
