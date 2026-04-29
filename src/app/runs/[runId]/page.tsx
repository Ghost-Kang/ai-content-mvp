// W3-05 — Workflow detail page (the 5-card canvas).
//
// Server-rendered shell + client-side WorkflowCanvas that handles polling
// and per-card state. Auth is enforced by middleware; tenant scoping is
// enforced by the tRPC procedure (`tenantProcedure`).

import { UserButton } from '@clerk/nextjs';
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';
import { TechHeader, TechPageShell } from '@/components/layout/TechPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '工作流详情 — AI 内容营销工作室',
};

interface PageProps {
  params: { runId: string };
}

export default function RunDetailPage({ params }: PageProps) {
  return (
    <TechPageShell>
      <TechHeader backHref="/runs" backLabel="工作流列表" right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <WorkflowCanvas runId={params.runId} />
      </main>
    </TechPageShell>
  );
}
