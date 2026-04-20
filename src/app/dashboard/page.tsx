import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="text-base font-semibold text-gray-900">AI 内容营销工作室</h1>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm text-gray-500">已登录</p>
          <p className="text-lg font-medium text-gray-900">{email}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/create"
            className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50"
          >
            <p className="text-sm font-medium text-indigo-600">Quick Create</p>
            <p className="mt-1 text-base font-semibold text-gray-900">生成 60 秒抖音脚本</p>
            <p className="mt-2 text-sm text-gray-500">3 字段输入，约 15 秒产出 5 段 · 15–18 帧分镜。</p>
          </Link>

          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 opacity-60">
            <p className="text-sm font-medium text-gray-400">即将上线</p>
            <p className="mt-1 text-base font-semibold text-gray-500">历史脚本</p>
            <p className="mt-2 text-sm text-gray-400">查看已导出与草稿中的脚本。</p>
          </div>
        </div>
      </main>
    </div>
  );
}
