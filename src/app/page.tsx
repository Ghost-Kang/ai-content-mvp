import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <div className="mb-3 inline-flex w-fit items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
          MVP · 2026-05-15 上线
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          AI 内容营销工作室
        </h1>

        <p className="mt-4 max-w-xl text-lg text-gray-600">
          为小型 B2B SaaS 团队生成 60 秒抖音脚本 · 5 段结构 + 15–18 帧分镜 · 抑制平台降权词 ·
          Solo 可用。
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          {userId ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
            >
              进入仪表板 →
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
              >
                登录
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-300"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
