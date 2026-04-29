// ENG-003 — Formula selection UI: 公式一/公式二 cards

'use client';

import type { Formula } from '@/lib/prompts/script-templates';

interface Props {
  value: Formula | null;
  onChange: (f: Formula) => void;
}

const FORMULAS: {
  id: Formula;
  title: string;
  subtitle: string;
  hook: string;
  example: string;
}[] = [
  {
    id: 'provocation',
    title: '挑衅断言型',
    subtitle: '公式一',
    hook: '说出反常识的断言，让人忍不住往下看',
    example: '例：你不是在坚持，你是在被一具尸体拖进坟墓',
  },
  {
    id: 'insight',
    title: '日常现象洞察型',
    subtitle: '公式二',
    hook: '拆解一个人人见过但没人想过为什么的现象',
    example: '例：为什么牛奶盒是方的，可乐瓶却是圆的',
  },
];

export function FormulaSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-white">
        选择内容公式
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FORMULAS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={[
              'rounded-2xl border p-4 text-left transition-all',
              value === f.id
                ? 'border-cyan-300/60 bg-cyan-300/10 shadow-lg shadow-cyan-500/10'
                : 'border-white/10 bg-slate-950/45 hover:border-cyan-300/30 hover:bg-white/[0.06]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-medium text-cyan-200/80">{f.subtitle}</span>
                <h3 className="mt-0.5 text-base font-semibold text-white">{f.title}</h3>
              </div>
              {value === f.id && (
                <span className="ml-2 mt-0.5 h-4 w-4 shrink-0 rounded-full bg-cyan-300 text-slate-950 flex items-center justify-center text-[10px]">
                  ✓
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-300">{f.hook}</p>
            <p className="mt-1.5 text-xs text-slate-500 italic">{f.example}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
