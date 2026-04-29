// Quick Create entry page — ENG-003 through ENG-015

import { UserButton } from '@clerk/nextjs';
import { QuickCreateForm } from '@/components/create/QuickCreateForm';
import { TechBadge, TechCard, TechHeader, TechPageShell } from '@/components/layout/TechPage';

export const metadata = {
  title: '快速创作 — AI内容营销工作室',
};

export default function CreatePage() {
  return (
    <TechPageShell>
      <TechHeader backHref="/dashboard" backLabel="控制台" right={<UserButton afterSignOutUrl="/" />} />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 text-center">
          <TechBadge tone="violet">Quick Create</TechBadge>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">快速创作</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
            三个输入，快速生成完整分镜脚本。适合先验证口播结构，再升级到 5 节点视频工作流。
          </p>
        </div>

        <TechCard className="p-6">
          <QuickCreateForm />
        </TechCard>
      </main>
    </TechPageShell>
  );
}
