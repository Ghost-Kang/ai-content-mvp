// ENG-004 — Length selection toggle: 60s / 长视频

'use client';

import type { LengthMode } from '@/lib/prompts/script-templates';

interface Props {
  value: LengthMode;
  onChange: (m: LengthMode) => void;
}

const OPTIONS: { id: LengthMode; label: string; detail: string }[] = [
  { id: 'short', label: '60秒短视频', detail: '约190-215字 · 15-18帧' },
  { id: 'long',  label: '长视频脚本', detail: '约800-1000字 · 40帧' },
];

export function LengthToggle({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">目标时长</label>
      <div className="flex rounded-lg border border-gray-200 p-1 gap-1 bg-gray-50">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={[
              'flex-1 rounded-md py-2 px-3 text-sm font-medium transition-all',
              value === opt.id
                ? 'bg-white shadow-sm text-indigo-700 font-semibold'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {opt.label}
            <span className="ml-1.5 text-xs font-normal text-gray-400 hidden sm:inline">
              {opt.detail}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
