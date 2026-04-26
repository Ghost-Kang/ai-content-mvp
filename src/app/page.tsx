import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        {/* Header badge */}
        <div className="mb-4 inline-flex w-fit items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
          🚀 Seed 用户内测 · 2026-05-15 正式上线
        </div>

        {/* Hero */}
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          30 秒生成抖音 B2B 脚本
          <br />
          不用再抓着市场同事排队
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
          为小型 B2B SaaS 团队设计的 60 秒口播脚本生成器。输入产品 + 受众 + 核心主张，输出
          17 帧分镜脚本 + 评论区引导问题，并自动过滤平台降权词。无需文案团队，创始人自己也能跑。
        </p>

        {/* CTAs */}
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
                href="/sign-up"
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
              >
                开始使用 →
              </Link>
              <Link
                href="/sign-in"
                className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-300"
              >
                已有账号，登录
              </Link>
            </>
          )}
        </div>

        {/* Feature strip */}
        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          <Feature
            title="公式驱动，不是胡写"
            body="挑衅断言型 / 日常现象洞察型两套成熟公式，每一帧的起承转合都有明确位置，不是 AI 随便填词。"
          />
          <Feature
            title="平台降权词自动抑制"
            body="8 大类 49 个降权模式（空洞开场、对称排比、虚假承诺…）生成时就避开，不靠人工筛。"
          />
          <Feature
            title="人工复审闸门"
            body="5 项自检 checklist + 字数漂移引导 + CAC 合规标签，发出去之前你能一次看清所有风险点。"
          />
        </div>

        {/* Footer signals */}
        <div className="mt-24 border-t border-gray-200 pt-8 text-xs text-gray-400">
          <p>
            内测名额有限 · 本产品生成的内容由 AI 辅助，发布前请人工复审 · 符合 CAC《生成式人工智能服务管理暂行办法》标识要求
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">{body}</p>
    </div>
  );
}
