// W4-06-V3 — Trending topic browser (W4-03 — AI 分析 inlined per card).
//
// Server-rendered list of newrank top-trending items across the 4
// supported platforms (dy / ks / xhs / bz) for a chosen date.
// Each card has a "用这条" CTA that hands the topic text to /runs/new
// via query params; NewRunForm reads `?topic=&source=trending` and
// pre-fills.
//
// W4-03 split: actual card rendering moved to
//   `components/topics/TopicCard.tsx` (client) so we can hang an
//   on-demand AI 分析 mutation off it; an optional `NichePanel`
//   above the list lets the user save a niche to localStorage that
//   is then sent with every analyze call.
//
// MVP-1 design choices:
//   - No date picker UI: defaults to T-3 (the only date guaranteed to
//     have all 4 platforms populated per probe-newrank.ts findings).
//     Date can still be overridden by appending ?date=YYYY-MM-DD.
//   - No filtering UI: the page just shows top-N per platform sorted
//     by rank. Cross-platform sort/filter is a known follow-up.
//   - Auth: requires login (Clerk middleware already gates /topics if
//     not in publicRoutes; we don't have to call auth() here).

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { isNewrankConfigured } from '@/lib/data-source/newrank';
import {
  fetchTrendingItems,
  defaultTrendingDate,
  type TrendingFetchResult,
} from '@/lib/data-source/newrank';
import { NichePanel } from '@/components/topics/NichePanel';
import { TopicCard } from '@/components/topics/TopicCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '热门选题 — AI 内容营销工作室',
};

const TOPN_PER_PLATFORM = 12;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TopicsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dateParam = typeof params.date === 'string' ? params.date : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <Link href="/dashboard" className="text-base font-semibold text-gray-900 hover:text-indigo-600">
              ← 仪表板
            </Link>
            <h1 className="text-base font-semibold text-gray-900">热门选题</h1>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {isNewrankConfigured() ? (
          <>
            <NichePanel />
            <TrendingContent date={dateParam} />
          </>
        ) : (
          <NotConfiguredNotice />
        )}
      </main>
    </div>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────

async function TrendingContent({ date }: { date?: string }) {
  const effectiveDate = date ?? defaultTrendingDate();
  let result: TrendingFetchResult | null = null;
  let fetchError: string | null = null;
  try {
    result = await fetchTrendingItems({ date: effectiveDate });
  } catch (e) {
    fetchError = (e as Error)?.message ?? String(e);
  }

  if (fetchError || !result) {
    return (
      <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
        加载失败：{fetchError ?? '未知错误'}
      </div>
    );
  }

  const totalCount = result.platforms.reduce((acc, p) => acc + p.items.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">数据日期 · {result.date}</p>
        <h2 className="mt-1 text-2xl font-semibold text-gray-900">
          {totalCount > 0 ? `今日 ${totalCount} 条候选` : '暂无候选'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          点击任意卡片的「用这条」即把标题预填到新工作流；点「AI 分析」获取「为什么火 / 怎么改造」建议。
        </p>
        <p className="mt-1 text-xs text-gray-400">
          数据源：新榜 · 默认 T-3 日期（更早数据更稳）
          {date ? ' · ?date= 覆盖' : ' · 可加 ?date=YYYY-MM-DD 查指定日期'}
        </p>
      </div>

      {result.platforms.map((p) => (
        <section key={p.platform}>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-base font-semibold text-gray-900">
              {p.label} <span className="ml-2 text-xs font-normal text-gray-400">{p.platform.toUpperCase()}</span>
            </h3>
            <p className="text-xs text-gray-400">
              {p.items.length > 0 ? `Top ${Math.min(TOPN_PER_PLATFORM, p.items.length)} / ${p.items.length}` : '暂无数据'}
            </p>
          </div>

          {p.error && (
            <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-200">
              {p.error}
            </div>
          )}

          {p.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
              本日尚无可用数据
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.items.slice(0, TOPN_PER_PLATFORM).map((item) => (
                <li key={`${item.platform}:${item.opusId}`}>
                  <TopicCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// ─── Empty / not-configured state ─────────────────────────────────────────────

function NotConfiguredNotice() {
  return (
    <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
      新榜 API 未配置：缺少 <code className="rounded bg-amber-100 px-1 font-mono text-xs">NEWRANK_API_KEY</code>。
      你仍可在
      {' '}
      <Link href="/runs/new" className="font-medium text-amber-900 underline">「新建工作流」</Link>
      {' '}
      手动输入主题。
    </div>
  );
}
