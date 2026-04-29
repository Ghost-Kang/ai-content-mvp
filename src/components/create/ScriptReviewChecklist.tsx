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
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">发布前自审 · {doneCount}/5</h3>
        <span className="text-xs text-slate-500">全部勾选后可通过</span>
      </div>

      <ul className="space-y-2 mb-4">
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={checked[item.id]}
                onChange={() => toggle(item.id)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 text-cyan-300 focus:ring-cyan-300"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-100 group-hover:text-white">{item.label}</p>
                <p className="text-xs text-slate-500">{item.hint}</p>
              </div>
            </label>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onApprove}
        disabled={!allChecked || isApproving}
        className="w-full rounded-2xl bg-cyan-300 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {isApproving ? '通过中...' : allChecked ? '通过并继续' : `还差 ${5 - doneCount} 项`}
      </button>
    </div>
  );
}
