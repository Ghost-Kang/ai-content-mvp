// W3-05 — Status pill used in NodeCard and the run-detail header.
//
// Pure presentational; no client hooks, so it lives in the boundary-free
// "shared" tier (renderable from server or client components).

import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  RUN_STATUS_BADGE_CLASSES,
  RUN_STATUS_LABELS,
  type RunStatus,
  type StepStatus,
} from '@/lib/workflow/ui-helpers';

interface StepStatusBadgeProps {
  status: StepStatus;
  /** When true, renders a pulsing dot for the `running` state. */
  pulse?: boolean;
}

export function StepStatusBadge({ status, pulse = true }: StepStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE_CLASSES[status]}`}
    >
      {pulse && status === 'running' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
        </span>
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

interface RunStatusBadgeProps {
  status: RunStatus;
  pulse?: boolean;
}

export function RunStatusBadge({ status, pulse = true }: RunStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${RUN_STATUS_BADGE_CLASSES[status]}`}
    >
      {pulse && status === 'running' && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
      )}
      {RUN_STATUS_LABELS[status]}
    </span>
  );
}
