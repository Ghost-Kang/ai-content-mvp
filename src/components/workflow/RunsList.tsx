// W3-05 — Recent runs list, used by /runs.
//
// Client component because we want background refresh without forcing a
// hard reload — useful when the user just kicked off a new run from
// /runs/new and navigated back.

'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc-client';
import { RunStatusBadge } from './StatusBadge';
import {
  formatFen,
  formatRelativeTime,
  type RunStatus,
} from '@/lib/workflow/ui-helpers';

interface RunsListProps {
  pageSize?: number;
}

export function RunsList({ pageSize = 20 }: RunsListProps) {
  const query = trpc.workflow.list.useQuery(
    { limit: pageSize, offset: 0 },
    {
      // Refresh every 5s so a newly created run shows up + status changes
      // are visible. Cheap query (single index scan).
      refetchInterval: 5_000,
      refetchOnWindowFocus: true,
    },
  );

  if (query.isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-8 text-center text-sm text-slate-300 backdrop-blur-xl">
        加载中…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-6 text-sm text-rose-100">
        无法加载运行列表：{query.error.message}
      </div>
    );
  }

  const runs = query.data?.runs ?? [];

  if (runs.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.05] p-12 text-center backdrop-blur-xl">
        <p className="text-sm text-slate-300">还没有任何工作流运行。</p>
        <Link
          href="/runs/new"
          className="mt-4 inline-flex items-center rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm hover:bg-cyan-200"
        >
          启动第一个工作流
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.07] shadow-2xl shadow-slate-950/25 backdrop-blur-xl">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            href={`/runs/${r.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.06]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{r.topic}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-400">
                <span>{formatRelativeTime(r.createdAt)}</span>
                <span>{formatFen(r.totalCostFen)}</span>
                {r.totalVideoCount > 0 && <span>{r.totalVideoCount} 段</span>}
              </div>
            </div>
            <div className="shrink-0">
              <RunStatusBadge status={r.status as RunStatus} pulse={false} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
