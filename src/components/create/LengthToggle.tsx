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
      <label className="block text-sm font-medium text-white">目标时长</label>
      <div className="flex rounded-2xl border border-white/10 bg-slate-950/60 p-1 gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={[
              'flex-1 rounded-xl py-2 px-3 text-sm font-medium transition-all',
              value === opt.id
                ? 'bg-cyan-300 text-slate-950 shadow-sm shadow-cyan-400/20 font-semibold'
                : 'text-slate-400 hover:text-white',
            ].join(' ')}
          >
            {opt.label}
            <span className={`ml-1.5 hidden text-xs font-normal sm:inline ${value === opt.id ? 'text-slate-700' : 'text-slate-500'}`}>
              {opt.detail}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
