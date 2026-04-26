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
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-detail-title"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              {labels.sub} · {labels.zh}
            </p>
            <h2
              id="error-detail-title"
              className="mt-0.5 truncate text-base font-semibold text-rose-700"
            >
              {friendly.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-700">
              {friendly.code}
            </span>
            {friendly.isOpsIssue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 ring-1 ring-inset ring-amber-200">
                需联系管理员
              </span>
            )}
            {friendly.isRetryable ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                可重试
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                重试不会自动恢复
              </span>
            )}
          </div>

          {/* Detail */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              发生了什么
            </p>
            <p className="mt-1 text-sm text-gray-800">{friendly.detail}</p>
          </div>

          {/* Hint */}
          <div className="rounded-md bg-indigo-50 px-3 py-2 ring-1 ring-inset ring-indigo-100">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">
              建议下一步
            </p>
            <p className="mt-1 text-sm text-indigo-900">{friendly.hint}</p>
          </div>

          {/* Step metadata */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-600 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-gray-400">重试次数</dt>
              <dd className="mt-0.5">{retryCount} 次</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-gray-400">开始时间</dt>
              <dd className="mt-0.5">{formatTime(startedAt)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-gray-400">耗时</dt>
              <dd className="mt-0.5">{formatDuration(durationMs)}</dd>
            </div>
          </dl>

          {/* Raw message (collapsed by default) */}
          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-700"
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
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-gray-900 px-3 py-2 font-mono text-[11px] leading-snug text-gray-100">
                {friendly.rawMessage || '(empty)'}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <p className="text-[11px] text-gray-400">
            重试 / 跳过 操作请使用节点卡片下方的按钮。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
