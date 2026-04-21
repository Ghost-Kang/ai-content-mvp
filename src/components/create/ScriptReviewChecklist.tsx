// W3-01 — Solo 5-item review checklist, gates approve action

'use client';

import { useState } from 'react';

export const CHECKLIST_ITEMS = [
  { id: 'voice',        label: '品牌声音一致', hint: '读起来像你自己说话的风格，不像通用 AI' },
  { id: 'rhythm',       label: '字数节奏达标', hint: '190-215 字，16-18 帧，开场 / 中段 / 结尾节奏分明' },
  { id: 'suppression',  label: '抑制词清零',   hint: '没有"震撼 / 颠覆 / 全网首创"等 uncanny valley 词' },
  { id: 'facts',        label: '无事实错误',   hint: '数字、时间、产品名称都核对过' },
  { id: 'hook',         label: '结尾钩子有力', hint: '金句 / 问题 / 号召——观众看完会评论或转发' },
] as const;

export type ChecklistId = (typeof CHECKLIST_ITEMS)[number]['id'];

interface Props {
  onApprove: () => void;
  isApproving: boolean;
}

export function ScriptReviewChecklist({ onApprove, isApproving }: Props) {
  const [checked, setChecked] = useState<Record<ChecklistId, boolean>>(
    () => Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.id, false])) as Record<ChecklistId, boolean>,
  );

  const allChecked = CHECKLIST_ITEMS.every((i) => checked[i.id]);
  const doneCount  = CHECKLIST_ITEMS.filter((i) => checked[i.id]).length;

  function toggle(id: ChecklistId) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">发布前自审 · {doneCount}/5</h3>
        <span className="text-xs text-gray-400">全部勾选后可通过</span>
      </div>

      <ul className="space-y-2 mb-4">
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={checked[item.id]}
                onChange={() => toggle(item.id)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 group-hover:text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-400">{item.hint}</p>
              </div>
            </label>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onApprove}
        disabled={!allChecked || isApproving}
        className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isApproving ? '通过中...' : allChecked ? '通过并继续' : `还差 ${5 - doneCount} 项`}
      </button>
    </div>
  );
}
