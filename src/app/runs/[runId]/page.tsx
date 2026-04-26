// W3-05 — Workflow detail page (the 5-card canvas).
//
// Server-rendered shell + client-side WorkflowCanvas that handles polling
// and per-card state. Auth is enforced by middleware; tenant scoping is
// enforced by the tRPC procedure (`tenantProcedure`).

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '工作流详情 — AI 内容营销工作室',
};

interface PageProps {
  params: { runId: string };
}

export default function RunDetailPage({ params }: PageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/runs" className="text-sm font-medium text-gray-600 hover:text-indigo-600">
            ← 返回工作流列表
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <WorkflowCanvas runId={params.runId} />
      </main>
    </div>
  );
}
