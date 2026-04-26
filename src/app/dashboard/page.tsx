import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { isAdminUser } from '@/lib/admin/is-admin';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? '';
  const showAdminCard = isAdminUser(user?.id);

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

        <div
          className={`grid gap-4 ${showAdminCard ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}
        >
          <Link
            href="/runs"
            className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50"
          >
            <p className="text-sm font-medium text-indigo-600">v3 Workspace</p>
            <p className="mt-1 text-base font-semibold text-gray-900">5 节点工作流</p>
            <p className="mt-2 text-sm text-gray-500">选题 → 脚本 → 分镜 → 视频 → 剪映 .draft 包导出。</p>
          </Link>

          <Link
            href="/create"
            className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50"
          >
            <p className="text-sm font-medium text-indigo-600">Quick Create (v2)</p>
            <p className="mt-1 text-base font-semibold text-gray-900">生成 60 秒抖音脚本</p>
            <p className="mt-2 text-sm text-gray-500">3 字段输入，约 15 秒产出 5 段 · 15–18 帧分镜。</p>
          </Link>

          {showAdminCard ? (
            <Link
              href="/admin/dashboard"
              className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50"
            >
              <p className="text-sm font-medium text-amber-700">运营</p>
              <p className="mt-1 text-base font-semibold text-gray-900">运营看板</p>
              <p className="mt-2 text-sm text-gray-500">
                用量、失败率、DAU、月度消耗（仅白名单用户可见本入口）。
              </p>
            </Link>
          ) : null}
        </div>
      </main>
    </div>
  );
}
