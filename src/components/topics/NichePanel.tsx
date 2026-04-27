// W4-03 — Optional creator niche panel for /topics page.
//
// The textarea is collapsible and unobtrusive: until the user
// explicitly opens it, the page reads as a clean trending list. When
// opened, what they type drives the howToAdapt half of every card's
// AI 分析 panel.

'use client';

import { useState } from 'react';
import { useNiche } from './use-niche';
import { NICHE_MAX_CHARS } from '@/lib/topic-analysis/index';

export function NichePanel() {
  const { niche, setNiche } = useNiche();
  const [expanded, setExpanded] = useState(false);

  const charCount = niche.length;
  const tooLong = charCount > NICHE_MAX_CHARS;

  return (
    <details
      open={expanded || charCount > 0}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border border-gray-200 bg-white"
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm text-gray-700 hover:bg-gray-50">
        <span className="font-medium">我的内容定位（可选）</span>
        {charCount > 0 ? (
          <span className="ml-2 text-xs text-indigo-600">已设置 · {charCount} 字</span>
        ) : (
          <span className="ml-2 text-xs text-gray-400">点开输入，让 AI 分析更贴合你的赛道</span>
        )}
      </summary>
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-xs text-gray-500">
          告诉我你的赛道和风格（如「30 岁宝妈分享辅食 + 育儿日常」）。会保存在浏览器本地，不上传服务器；点击任何卡片的「AI 分析」时会一并发给模型。
        </p>
        <textarea
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          maxLength={NICHE_MAX_CHARS + 50 /* let user paste long, validate visually */}
          rows={2}
          placeholder="例：30 岁宝妈，做辅食 + 育儿日常，主要在小红书和抖音"
          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={tooLong ? 'text-rose-600' : 'text-gray-400'}>
            {charCount} / {NICHE_MAX_CHARS}
            {tooLong && ' · 超出长度，将按上限截断'}
          </span>
          {charCount > 0 && (
            <button
              type="button"
              onClick={() => setNiche('')}
              className="text-gray-400 hover:text-rose-600"
            >
              清空
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
