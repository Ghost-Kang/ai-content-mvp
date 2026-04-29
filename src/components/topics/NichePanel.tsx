// W4-03 — Optional creator niche panel for /topics page.
//
// The textarea is collapsible and unobtrusive: until the user
// explicitly opens it, the page reads as a clean trending list. When
// opened, what they type drives the howToAdapt half of every card's
// AI 分析 panel.

'use client';

import { useState } from 'react';
import { useNiche } from './use-niche';
// Import from `/types` (leaf, no server-only deps) instead of `/index` —
// the facade entry point pulls in `executeWithFallback` → `db` → the
// `postgres` driver, which Next.js refuses to bundle into a client
// chunk (fs/tls/perf_hooks are Node-only). This keeps the constant
// available without dragging the runtime in.
import { NICHE_MAX_CHARS } from '@/lib/topic-analysis/types';

export function NichePanel() {
  const { niche, setNiche } = useNiche();
  const [expanded, setExpanded] = useState(false);

  const charCount = niche.length;
  const tooLong = charCount > NICHE_MAX_CHARS;

  return (
    <details
      open={expanded || charCount > 0}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      className="rounded-2xl border border-white/10 bg-white/[0.07] text-slate-100 shadow-lg shadow-slate-950/25 backdrop-blur-xl"
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.04]">
        <span className="font-medium">我的内容定位（可选）</span>
        {charCount > 0 ? (
          <span className="ml-2 text-xs text-cyan-200">已设置 · {charCount} 字</span>
        ) : (
          <span className="ml-2 text-xs text-slate-400">点开输入，让 AI 分析更贴合你的赛道</span>
        )}
      </summary>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-xs text-slate-400">
          告诉我你的赛道和风格（如「30 岁宝妈分享辅食 + 育儿日常」）。会保存在浏览器本地，不上传服务器；点击任何卡片的「AI 分析」时会一并发给模型。
        </p>
        <textarea
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          maxLength={NICHE_MAX_CHARS + 50 /* let user paste long, validate visually */}
          rows={2}
          placeholder="例：30 岁宝妈，做辅食 + 育儿日常，主要在小红书和抖音"
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white shadow-sm placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none focus:ring-1 focus:ring-cyan-300/40"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={tooLong ? 'text-rose-300' : 'text-slate-400'}>
            {charCount} / {NICHE_MAX_CHARS}
            {tooLong && ' · 超出长度，将按上限截断'}
          </span>
          {charCount > 0 && (
            <button
              type="button"
              onClick={() => setNiche('')}
              className="text-slate-400 hover:text-rose-300"
            >
              清空
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
