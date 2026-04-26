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
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { friendlyFromAny } from '@/lib/error-messages';

const TOPIC_MIN = 2;
const TOPIC_MAX = 300;

export function NewRunForm() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
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
      const { runId } = await createRun.mutateAsync({ topic: trimmed });
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
      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-gray-900">
          主题
        </label>
        <p className="mt-0.5 text-xs text-gray-500">
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
          className="mt-2 block w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          disabled={submitting}
        />
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>{trimmed.length} / {TOPIC_MAX}</span>
          <span>5 节点：选题 → 脚本 → 分镜 → 视频 → 导出</span>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          预估花费 ≤ ¥{(15).toFixed(2)} / 运行（含视频生成）
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
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
