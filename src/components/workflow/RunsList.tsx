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
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        加载中…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        无法加载运行列表：{query.error.message}
      </div>
    );
  }

  const runs = query.data?.runs ?? [];

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white p-12 text-center">
        <p className="text-sm text-gray-500">还没有任何工作流运行。</p>
        <Link
          href="/runs/new"
          className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          启动第一个工作流
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            href={`/runs/${r.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-gray-50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{r.topic}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-500">
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
