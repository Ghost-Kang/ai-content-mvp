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
import { TechBadge, TechCard, TechHeader, TechPageShell } from '@/components/layout/TechPage';

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
    <TechPageShell>
      <TechHeader backHref="/dashboard" backLabel="控制台" right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
        <section>
          <TechBadge tone="cyan">Topic Radar</TechBadge>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">热门选题雷达</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            从 4 个内容平台抓取趋势候选，先看爆点，再一键把标题送入视频工作流。
          </p>
        </section>
        {isNewrankConfigured() ? (
          <>
            <NichePanel />
            <TrendingContent date={dateParam} />
          </>
        ) : (
          <NotConfiguredNotice />
        )}
      </main>
    </TechPageShell>
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
      <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
        加载失败：{fetchError ?? '未知错误'}
      </div>
    );
  }

  const totalCount = result.platforms.reduce((acc, p) => acc + p.items.length, 0);

  return (
    <div className="space-y-8">
      <TechCard className="p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">数据日期 · {result.date}</p>
        <h2 className="mt-2 text-2xl font-bold text-white">
          {totalCount > 0 ? `今日 ${totalCount} 条候选` : '暂无候选'}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          点击任意卡片的「用这条」即把标题预填到新工作流；点「AI 分析」获取「为什么火 / 怎么改造」建议。
        </p>
        <p className="mt-2 text-xs text-slate-500">
          数据源：新榜 · 默认 T-3 日期（更早数据更稳）
          {date ? ' · ?date= 覆盖' : ' · 可加 ?date=YYYY-MM-DD 查指定日期'}
        </p>
      </TechCard>

      {result.platforms.map((p) => (
        <section key={p.platform}>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-base font-semibold text-white">
              {p.label} <span className="ml-2 text-xs font-normal text-cyan-200/70">{p.platform.toUpperCase()}</span>
            </h3>
            <p className="text-xs text-slate-400">
              {p.items.length > 0 ? `Top ${Math.min(TOPN_PER_PLATFORM, p.items.length)} / ${p.items.length}` : '暂无数据'}
            </p>
          </div>

          {p.error && (
            <div className="mb-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              {p.error}
            </div>
          )}

          {p.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-4 py-6 text-center text-sm text-slate-400">
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
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      新榜 API 未配置：缺少 <code className="rounded bg-amber-100 px-1 font-mono text-xs">NEWRANK_API_KEY</code>。
      你仍可在
      {' '}
      <Link href="/runs/new" className="font-medium text-amber-50 underline">「新建工作流」</Link>
      {' '}
      手动输入主题。
    </div>
  );
}
