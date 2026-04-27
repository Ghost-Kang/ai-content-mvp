// W4-03 / W4-06 — Trending topic card with on-demand AI analysis.
//
// The card itself is unchanged from W4-06 (rank chip, title, like/play
// counts, "用这条" CTA). What W4-03 adds: an "AI 分析" button that
// expands an inline panel showing whyItHit + howToAdapt. The mutation
// is fired only on first open; result stays cached client-side for
// the lifetime of the page (Redis keeps it for 24h, so a refresh is
// also basically free).

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { friendlyFromAny } from '@/lib/error-messages';
import type { NormalizedTrendingItem } from '@/lib/data-source/newrank';
import type { TopicAnalysisResult } from '@/lib/topic-analysis/index';
import { useNiche } from './use-niche';

interface Props {
  item: NormalizedTrendingItem;
}

const TITLE_MAX = 80;
const TOPIC_MAX_FOR_CTA = 200;

export function TopicCard({ item }: Props) {
  const { niche } = useNiche();
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<TopicAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const analyze = trpc.topic.analyze.useMutation();

  const display = (item.title ?? item.description ?? '').trim();
  const title = display.length > 0
    ? truncate(display, TITLE_MAX)
    : `(无标题 · #${item.opusId})`;
  const useTopic = display.length > 0
    ? truncate(display, TOPIC_MAX_FOR_CTA)
    : `${item.platform}-${item.opusId}`;
  const cta = `/runs/new?source=trending&topic=${encodeURIComponent(useTopic)}`;

  async function handleAnalyzeClick() {
    setExpanded((prev) => !prev);
    if (result || analyze.isPending) return;
    setErrorMsg(null);
    try {
      const trimmedNiche = niche.trim();
      const r = await analyze.mutateAsync({
        platform:        item.platform,
        opusId:          item.opusId,
        title:           item.title,
        description:     item.description,
        firstCategory:   item.firstCategory,
        secondCategory: item.secondCategory,
        likeCount:       typeof item.likeCount === 'number' ? Math.round(item.likeCount) : undefined,
        playCount:       typeof item.playCount === 'number' ? Math.round(item.playCount) : undefined,
        duration:        item.duration,
        authorNickname: item.authorNickname,
        niche:           trimmedNiche.length > 0 ? trimmedNiche : undefined,
      });
      setResult(r);
    } catch (err) {
      const friendly = friendlyFromAny(err);
      setErrorMsg(friendly.title + (friendly.detail ? ` · ${friendly.detail}` : ''));
    }
  }

  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300">
      <div>
        <div className="flex items-baseline justify-between text-xs text-gray-400">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
            #{item.rank}
          </span>
          {item.authorNickname && (
            <span className="ml-2 truncate text-right text-gray-500" title={item.authorNickname}>
              {item.authorNickname}
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-3 text-sm text-gray-900">{title}</p>
        <p className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
          {item.firstCategory && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">{item.firstCategory}</span>
          )}
          {typeof item.likeCount === 'number' && <span>♥ {compactNumber(item.likeCount)}</span>}
          {typeof item.playCount === 'number' && <span>▶ {compactNumber(item.playCount)}</span>}
          {typeof item.duration === 'number' && item.duration > 0 && (
            <span>{Math.round(item.duration)}s</span>
          )}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleAnalyzeClick}
          disabled={analyze.isPending}
          aria-expanded={expanded}
          className="inline-flex items-center rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60"
        >
          {analyze.isPending ? '分析中…' : (expanded ? '收起 ▴' : 'AI 分析 ▾')}
        </button>
        <Link
          href={cta}
          className="inline-flex items-center rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          用这条 →
        </Link>
      </div>

      {expanded && (
        <AnalysisPanel
          loading={analyze.isPending}
          errorMsg={errorMsg}
          result={result}
          onRetry={() => {
            setResult(null);
            setErrorMsg(null);
            void handleAnalyzeClick();
          }}
        />
      )}

      {item.url && (
        <div className="mt-2 text-right">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
          >
            查看原视频 ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Analysis panel ───────────────────────────────────────────────────────────

function AnalysisPanel(props: {
  loading:  boolean;
  errorMsg: string | null;
  result:   TopicAnalysisResult | null;
  onRetry:  () => void;
}) {
  const { loading, errorMsg, result, onRetry } = props;

  if (loading && !result) {
    return (
      <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-700">
        正在分析… 通常需要 3-5 秒
      </div>
    );
  }
  if (errorMsg) {
    return (
      <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
        <p className="font-medium">分析失败</p>
        <p className="mt-1">{errorMsg}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-rose-700 underline-offset-2 hover:underline"
        >
          重试
        </button>
      </div>
    );
  }
  if (!result) return null;

  return (
    <div className="mt-3 space-y-3 rounded-md border border-indigo-100 bg-indigo-50/30 px-3 py-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">为什么火</p>
        <ul className="mt-1 space-y-1 text-xs leading-5 text-gray-800">
          {result.whyItHit.map((s, i) => (
            <li key={i} className="flex">
              <span className="mr-1 select-none text-indigo-400">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
          怎么改造为你的内容
          {result.niche && (
            <span className="ml-2 font-normal normal-case text-gray-500">
              · 基于：{truncate(result.niche, 24)}
            </span>
          )}
        </p>
        <ul className="mt-1 space-y-1 text-xs leading-5 text-gray-800">
          {result.howToAdapt.map((s, i) => (
            <li key={i} className="flex">
              <span className="mr-1 select-none text-indigo-400">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-indigo-100 pt-2 text-[10px] text-gray-400">
        {result.cacheHit ? '缓存命中（24h 内同条免费）' : `${result.llmModel} · ${result.tokensUsed} tokens · 约 ¥${(result.costFen / 100).toFixed(3)}`}
      </p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function compactNumber(n: number): string {
  if (n < 1_000)         return String(n);
  if (n < 10_000)        return `${(n / 1_000).toFixed(1)}k`;
  if (n < 100_000)       return `${(n / 10_000).toFixed(1)}万`;
  if (n < 100_000_000)   return `${Math.round(n / 10_000)}万`;
  return `${(n / 100_000_000).toFixed(1)}亿`;
}
