// W3-05 — Start a new workflow run.

import Link from 'next/link';
import { Suspense } from 'react';
import { UserButton } from '@clerk/nextjs';
import { NewRunForm } from '@/components/workflow/NewRunForm';
import { TechBadge, TechCard, TechHeader, TechPageShell } from '@/components/layout/TechPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '新建工作流 — AI 内容营销工作室',
};

export default function NewRunPage() {
  return (
    <TechPageShell>
      <TechHeader backHref="/dashboard" backLabel="控制台" right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[0.85fr_1.15fr]">
        <section>
          <TechBadge tone="emerald">Start Pipeline</TechBadge>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">启动一个新工作流</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            输入主题后，系统将依次执行 5 个节点：选题 → 脚本 → 分镜 → 视频生成 → 剪映导出。
          </p>
          <div className="mt-6 grid gap-3 text-sm text-slate-300">
            {['支持热门选题预填', '视频节点带进度与 ETA', '完成后导出 zip 素材包'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                {item}
              </div>
            ))}
          </div>
          <Link href="/runs" className="mt-6 inline-flex text-sm font-medium text-cyan-200 hover:text-cyan-100">
            查看历史工作流 →
          </Link>
        </section>

        <TechCard className="p-6">
          <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />}>
            <NewRunForm />
          </Suspense>
        </TechCard>
      </main>
    </TechPageShell>
  );
}
