// W3-06 — Per-node action bar (重试 / 跳过 / 编辑).
//
// Lives inside NodeCard. Decides which buttons to render based on the
// pure cascade-engine guard (server source of truth replicated client-side
// via shared `evaluateStepAction`). No buttons render when run is `running`.
//
// Why a separate component:
//   • keeps NodeCard focused on display + summary rendering
//   • the edit dialog is heavy (lazy mounted only when the user clicks)
//   • separates the click-handler / mutation noise from the layout JSX
//
// Mutations all invalidate `workflow.get` so the canvas snaps back to
// "pending + cascading dirty markers" without waiting for the next 2s poll.

'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { friendlyFromAny } from '@/lib/error-messages';
// IMPORTANT: import from `cascade-rules`, not from `@/lib/workflow`.
// The aggregate barrel transitively pulls in drizzle/db (cascade.ts), which
// breaks `'use client'` bundles. cascade-rules is dependency-free.
import { evaluateStepAction } from '@/lib/workflow/cascade-rules';
import {
  NODE_LABELS,
  type NodeType,
  type RunStatus,
  type StepStatus,
} from '@/lib/workflow/ui-helpers';
import { EditNodeDialog } from './EditNodeDialog';

interface NodeActionBarProps {
  runId:        string;
  nodeType:     NodeType;
  stepStatus:   StepStatus;
  runStatus:    RunStatus;
  /** Current outputJson — passed through to the edit dialog. */
  outputJson:   unknown;
}

export function NodeActionBar({
  runId,
  nodeType,
  stepStatus,
  runStatus,
  outputJson,
}: NodeActionBarProps) {
  const utils = trpc.useUtils();

  const [actionError, setActionError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Mutation hooks — single shared invalidate + error handler keeps the
  // surface area small. We rely on tRPC's per-mutation isPending for the
  // button spinner state.
  const retryStep = trpc.workflow.retryStep.useMutation({
    onSuccess: () => utils.workflow.get.invalidate({ runId }),
    onError:   (err) => setActionError(formatErr(err)),
  });
  const skipStep = trpc.workflow.skipStep.useMutation({
    onSuccess: () => utils.workflow.get.invalidate({ runId }),
    onError:   (err) => setActionError(formatErr(err)),
  });

  // Use the shared guard helper so the UI surfaces match the server
  // exactly. We don't render buttons that the server would reject.
  const canEdit  = evaluateStepAction({ nodeType, stepStatus, runStatus, action: 'edit'  }).allowed;
  const canRetry = evaluateStepAction({ nodeType, stepStatus, runStatus, action: 'retry' }).allowed;
  const canSkip  = evaluateStepAction({ nodeType, stepStatus, runStatus, action: 'skip'  }).allowed;

  // Topic node has no NodeRunner row, so we never render an action bar
  // for it. This is enforced both here AND in NodeCard (defense in depth).
  if (nodeType === 'topic') return null;

  // Hide the bar entirely if no action is available — keeps the card
  // visually quiet for healthy `done` runs of nodes that aren't editable
  // (video / export). The user will only see buttons when they CAN do
  // something useful.
  if (!canEdit && !canRetry && !canSkip) return null;

  const anyPending = retryStep.isPending || skipStep.isPending;

  return (
    <div className="border-t border-gray-100 px-4 py-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setEditOpen(true);
            }}
            disabled={anyPending}
            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            编辑
          </button>
        )}
        {canRetry && (
          <ActionButton
            label="重试"
            confirmText={`重试「${NODE_LABELS[nodeType].zh}」节点？下游已完成节点会被标记为「需重跑」。`}
            running={retryStep.isPending}
            disabled={anyPending}
            onClick={() => {
              setActionError(null);
              retryStep.mutate({ runId, nodeType: nodeType as 'script' | 'storyboard' | 'video' | 'export' });
            }}
            variant="primary"
          />
        )}
        {canSkip && (
          <ActionButton
            label="跳过"
            confirmText={`跳过「${NODE_LABELS[nodeType].zh}」节点？该节点将不再执行，标记为「已跳过」。`}
            running={skipStep.isPending}
            disabled={anyPending}
            onClick={() => {
              setActionError(null);
              skipStep.mutate({ runId, nodeType: nodeType as 'export' });
            }}
            variant="secondary"
          />
        )}
      </div>

      {actionError && (
        <p className="mt-2 text-xs text-rose-700">{actionError}</p>
      )}

      {canEdit && (
        <EditNodeDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          runId={runId}
          nodeType={nodeType as 'script' | 'storyboard'}
          initialOutput={outputJson}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface ActionButtonProps {
  label:       string;
  confirmText: string;
  running:     boolean;
  disabled:    boolean;
  onClick:     () => void;
  variant:     'primary' | 'secondary';
}

function ActionButton({ label, confirmText, running, disabled, onClick, variant }: ActionButtonProps) {
  // Use native confirm() for MVP-1. Internal users, low volume, no need for
  // a custom modal here. If we add a destructive action that needs richer
  // copy (e.g. "delete run"), upgrade to a Dialog component then.
  const handleClick = () => {
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;
    onClick();
  };

  const base = 'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50';
  const cls = variant === 'primary'
    ? `${base} border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`
    : `${base} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`;

  return (
    <button type="button" onClick={handleClick} disabled={disabled || running} className={cls}>
      {running ? (
        <>
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          处理中…
        </>
      ) : (
        label
      )}
    </button>
  );
}

function formatErr(err: unknown): string {
  const f = friendlyFromAny(err);
  return `${f.title}：${f.detail}`;
}

// Helper export to fold the "is the run idle enough to act on" check at
// places outside the bar (e.g. WorkflowCanvas footer hint). Kept inline
// here to avoid a separate util module just for one boolean.
export function isRunActionable(runStatus: RunStatus): boolean {
  return runStatus !== 'running' && runStatus !== 'cancelled';
}
