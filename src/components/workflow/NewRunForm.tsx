// W3-05 — New workflow run form.  (W2-07a refactor)
//
// Flow:
//   1. POST workflow.create  → returns runId   (~50ms)
//   2. POST workflow.run     → enqueues + returns dispatch metadata (~50ms)
//   3. router.push('/runs/[runId]')
//
// As of W2-07a `workflow.run` no longer blocks on the orchestrator —
// dispatch returns immediately and the orchestrator runs out-of-band
// (QStash in prod, fire-and-forget in dev). So we can `await` the
// mutation cleanly and report dispatch errors before navigating, instead
// of the W3-05 fire-and-forget hack that swallowed them.

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { friendlyFromAny } from '@/lib/error-messages';

const TOPIC_MIN = 2;
const TOPIC_MAX = 300;

// Trending sourceMeta param keys — match TopicCard CTA + parse-seed-input.
// Kept flat in the URL so the page stays bookmarkable / shareable. Server
// re-validates via parseRunSeedInput, so a tampered URL cannot corrupt
// the persisted seed_input.
const PLATFORMS: ReadonlyArray<'dy' | 'ks' | 'xhs' | 'bz'> = ['dy', 'ks', 'xhs', 'bz'];

interface TrendingSourceMeta {
  platform?:       'dy' | 'ks' | 'xhs' | 'bz';
  opusId?:         string;
  rank?:           number;
  url?:            string;
  authorNickname?: string;
}

function readTrendingSourceMeta(sp: URLSearchParams): TrendingSourceMeta | undefined {
  const out: TrendingSourceMeta = {};
  const platform = sp.get('platform');
  if (platform && (PLATFORMS as ReadonlyArray<string>).includes(platform)) {
    out.platform = platform as TrendingSourceMeta['platform'];
  }
  const opusId = sp.get('opusId');
  if (opusId && opusId.length > 0 && opusId.length <= 120) out.opusId = opusId;
  const rankRaw = sp.get('rank');
  const rank = rankRaw ? Number.parseInt(rankRaw, 10) : NaN;
  if (Number.isFinite(rank) && rank >= 1) out.rank = rank;
  const url = sp.get('url');
  if (url && /^https?:\/\//.test(url) && url.length <= 500) out.url = url;
  const authorNickname = sp.get('authorNickname');
  if (authorNickname && authorNickname.length <= 60) out.authorNickname = authorNickname;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function NewRunForm() {
  const router = useRouter();
  // W4-06: /topics 「用这条」CTA hands off the candidate topic via URL params.
  // Migration 005 added workflow_runs.seed_input — sourceMeta now flows
  // through it as ParsedSeedInput.sourceMeta, consumed by TopicNodeRunner.
  const searchParams = useSearchParams();
  const initialTopic = (searchParams.get('topic') ?? '').slice(0, TOPIC_MAX);
  const fromTrending = searchParams.get('source') === 'trending';
  // Snapshot meta at mount — searchParams is stable across renders so we
  // could read on submit, but capturing here keeps the submit handler
  // pure and easier to reason about during navigation.
  const trendingSourceMeta = fromTrending ? readTrendingSourceMeta(searchParams) : undefined;

  const [topic, setTopic] = useState(initialTopic);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createRun = trpc.workflow.create.useMutation();
  const runWorkflow = trpc.workflow.run.useMutation();

  const trimmed = topic.trim();
  const canSubmit = trimmed.length >= TOPIC_MIN && trimmed.length <= TOPIC_MAX && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const { runId } = await createRun.mutateAsync({
        topic: trimmed,
        ...(trendingSourceMeta ? { seedInput: { sourceMeta: trendingSourceMeta } } : {}),
      });
      // W2-07a: returns ~50ms with dispatch metadata. If QStash publish
      // fails we hear about it HERE (vs. silent console warn pre-W2-07).
      await runWorkflow.mutateAsync({ runId });
      router.push(`/runs/${runId}`);
    } catch (err) {
      console.error(err);
      const f = friendlyFromAny(err);
      setErrorMessage(`${f.title}：${f.detail}`);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {fromTrending && initialTopic && (
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">
          已从 <span className="font-medium">「热门选题」</span> 预填，可直接修改后启动。
        </div>
      )}
      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-white">
          主题
        </label>
        <p className="mt-0.5 text-xs text-slate-400">
          一句话描述你想做的视频内容（{TOPIC_MIN}–{TOPIC_MAX} 字）。
        </p>
        <textarea
          id="topic"
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          placeholder="例：教 35+ 妈妈用大模型 5 分钟搞定家庭日历"
          maxLength={TOPIC_MAX}
          className="mt-2 block w-full resize-none rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white shadow-sm placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none focus:ring-1 focus:ring-cyan-300/40"
          disabled={submitting}
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{trimmed.length} / {TOPIC_MAX}</span>
          <span>5 节点：选题 → 脚本 → 分镜 → 视频 → 导出</span>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {errorMessage}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          预估花费 ≤ ¥{(15).toFixed(2)} / 运行（含视频生成）
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm shadow-cyan-400/20 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
        >
          {submitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              启动中…
            </>
          ) : (
            '启动工作流'
          )}
        </button>
      </div>
    </form>
  );
}
