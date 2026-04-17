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
      <label className="block text-sm font-medium text-gray-700">
        选择内容公式
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FORMULAS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={[
              'rounded-xl border-2 p-4 text-left transition-all',
              value === f.id
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-gray-200 bg-white hover:border-gray-300',
            ].join(' ')}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-medium text-gray-400">{f.subtitle}</span>
                <h3 className="mt-0.5 text-base font-semibold text-gray-900">{f.title}</h3>
              </div>
              {value === f.id && (
                <span className="ml-2 mt-0.5 h-4 w-4 shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  ✓
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-600">{f.hook}</p>
            <p className="mt-1.5 text-xs text-gray-400 italic">{f.example}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
