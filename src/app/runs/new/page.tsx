// W3-05 — Start a new workflow run.

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { NewRunForm } from '@/components/workflow/NewRunForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '新建工作流 — AI 内容营销工作室',
};

export default function NewRunPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/runs" className="text-base font-semibold text-gray-900 hover:text-indigo-600">
            ← 返回工作流列表
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wide text-gray-400">新建</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">启动一个新工作流</h1>
          <p className="mt-1 text-sm text-gray-500">
            输入主题后，系统将依次执行 5 个节点：选题 → 脚本 → 分镜 → 视频生成 → 剪映导出。
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <NewRunForm />
        </div>
      </main>
    </div>
  );
}
