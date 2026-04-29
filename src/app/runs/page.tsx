// W3-05 — Recent workflow runs (v3 surface).
//
// This is the home of the v3 workflow workspace. The legacy /create page
// (Quick Create v2) stays untouched — eventually it'll be retired once
// the 5-node pipeline supersedes it for all entry points.

import { UserButton } from '@clerk/nextjs';
import { RunsList } from '@/components/workflow/RunsList';
import { TechBadge, TechButton, TechHeader, TechPageShell } from '@/components/layout/TechPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '工作流 — AI 内容营销工作室',
};

export default function RunsPage() {
  return (
    <TechPageShell>
      <TechHeader backHref="/dashboard" backLabel="控制台" right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <TechBadge tone="amber">Run Console</TechBadge>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">工作流运行</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              从主题到剪映 .draft 包，全流程 5 个节点。每 5 秒自动刷新。
            </p>
          </div>
          <TechButton href="/runs/new">
            新建工作流
          </TechButton>
        </div>

        <RunsList />
      </main>
    </TechPageShell>
  );
}
