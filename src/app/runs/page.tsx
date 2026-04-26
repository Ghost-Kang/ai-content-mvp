// W3-05 — Recent workflow runs (v3 surface).
//
// This is the home of the v3 workflow workspace. The legacy /create page
// (Quick Create v2) stays untouched — eventually it'll be retired once
// the 5-node pipeline supersedes it for all entry points.

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { RunsList } from '@/components/workflow/RunsList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '工作流 — AI 内容营销工作室',
};

export default function RunsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-base font-semibold text-gray-900 hover:text-indigo-600">
            AI 内容营销工作室
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">v3 Workspace</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">工作流运行</h1>
            <p className="mt-1 text-sm text-gray-500">
              从主题到剪映 .draft 包，全流程 5 个节点。每 5 秒自动刷新。
            </p>
          </div>
          <Link
            href="/runs/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新建工作流
          </Link>
        </div>

        <RunsList />
      </main>
    </div>
  );
}
