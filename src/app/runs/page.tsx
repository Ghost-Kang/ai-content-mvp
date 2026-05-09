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
  title: '视频生成记录 — AI 视频创作平台',
};

export default function RunsPage() {
  return (
    <TechPageShell>
      <TechHeader backHref="/dashboard" backLabel="控制台" right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <TechBadge tone="amber">Video History</TechBadge>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">视频生成记录</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              按创建时间倒序展示历史生成记录与状态。每 5 秒自动刷新进度。
            </p>
          </div>
          <TechButton href="/runs/new" className="w-full sm:w-auto">
            新建工作流
          </TechButton>
        </div>

        <RunsList />
      </main>
    </TechPageShell>
  );
}
