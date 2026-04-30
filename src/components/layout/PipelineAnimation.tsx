// 5-step pipeline — vertical timeline for the landing hero.
//
// Each step is a slim horizontal row (number + icon + title + body).
// Sequential pulse via animation-delay; CSS only.

import type { ReactNode } from 'react';

interface Step {
  n: string;
  title: string;
  body: string;
  accent: 'cyan' | 'violet' | 'fuchsia' | 'amber' | 'emerald';
  icon: ReactNode;
}

const STEPS: ReadonlyArray<Step> = [
  { n: '01', title: '看热点',          body: '4 平台爆款 + AI 解释为什么火', accent: 'cyan',    icon: <RadarIcon /> },
  { n: '02', title: '挑选题',          body: '点「用这条」预填到工作流',     accent: 'violet',  icon: <PickIcon /> },
  { n: '03', title: '写脚本 + 拆分镜', body: 'AI 出 17 帧脚本 + 镜头语言',   accent: 'fuchsia', icon: <ScriptIcon /> },
  { n: '04', title: '生成视频',        body: 'Seedance 并发渲染，进度可见',  accent: 'amber',   icon: <VideoIcon /> },
  { n: '05', title: '下载剪映包',      body: '.zip + FCPXML 导入即发布',     accent: 'emerald', icon: <ExportIcon /> },
];

const ACCENT_RING: Record<Step['accent'], string> = {
  cyan:    'ring-cyan-300/40 text-cyan-100',
  violet:  'ring-violet-300/40 text-violet-100',
  fuchsia: 'ring-fuchsia-300/40 text-fuchsia-100',
  amber:   'ring-amber-300/40 text-amber-100',
  emerald: 'ring-emerald-300/40 text-emerald-100',
};

const ACCENT_FILL: Record<Step['accent'], string> = {
  cyan:    'bg-cyan-300/15',
  violet:  'bg-violet-300/15',
  fuchsia: 'bg-fuchsia-300/15',
  amber:   'bg-amber-300/15',
  emerald: 'bg-emerald-300/15',
};

const STAGGER_MS = 600;
const CYCLE_MS = STAGGER_MS * STEPS.length + 600;

/**
 * Vertical 5-step timeline — designed to balance the hero headline.
 */
export function PipelineAnimation() {
  return (
    <div className="relative">
      {/* Background blur halo */}
      <div className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-cyan-500/20 via-fuchsia-500/12 to-emerald-500/15 blur-3xl" />

      <div className="relative rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl sm:p-6">
        {/* Header strip */}
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/5 pb-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200">
              Live Pipeline
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            ~12 min · ¥7-8 / run
          </span>
        </div>

        {/* Vertical compact timeline */}
        <ol className="relative">
          {STEPS.map((step, idx) => (
            <li key={step.n} className="relative">
              <StepRow step={step} index={idx} />
              {idx < STEPS.length - 1 && <Connector index={idx} />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function StepRow({ step, index }: { step: Step; index: number }) {
  const delay = `${index * STAGGER_MS}ms`;
  return (
    <div className="group relative flex items-center gap-4 rounded-2xl px-3 py-3 transition hover:bg-white/[0.04]">
      {/* Pulsing aura — subtle, fires once per cycle staggered */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-xl motion-safe:animate-pulse-soft ${ACCENT_FILL[step.accent]}`}
        style={{
          animationDelay: delay,
          animationDuration: `${CYCLE_MS}ms`,
          opacity: 0.55,
        }}
      />

      {/* Step number badge — compact, accent-ring */}
      <span
        className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-900 font-mono text-xs font-black ring-1 ${ACCENT_RING[step.accent]}`}
      >
        {step.n}
      </span>

      {/* Icon chip */}
      <span
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${ACCENT_FILL[step.accent]} ${ACCENT_RING[step.accent]}`}
      >
        {step.icon}
      </span>

      {/* Title + 1-line body */}
      <div className="relative min-w-0 flex-1">
        <h4 className="text-base font-bold text-white">{step.title}</h4>
        <p className="mt-0.5 text-xs leading-5 text-slate-400">{step.body}</p>
      </div>
    </div>
  );
}

function Connector({ index }: { index: number }) {
  const delay = `${(index + 1) * STAGGER_MS - 200}ms`;
  return (
    <span
      aria-hidden
      className="pointer-events-none relative ml-[1.75rem] block h-4 w-[2px] overflow-hidden"
    >
      <span className="absolute inset-0 bg-white/15" />
      <span
        className="absolute inset-x-0 top-0 block h-1/2 w-full bg-gradient-to-b from-transparent via-cyan-300/80 to-transparent motion-safe:animate-shine"
        style={{
          animationDelay: delay,
          animationDuration: `${CYCLE_MS}ms`,
        }}
      />
    </span>
  );
}

// ─── Icons (line, 1.6 stroke, 24×24 native) ───────────────────────────

function RadarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 12 L18 6" strokeLinecap="round" />
    </svg>
  );
}

function PickIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3.5" y="6" width="11" height="3" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="3" rx="1.5" />
      <path d="M16 6 L20 9 L16 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScriptIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="4" y="3" width="13" height="18" rx="2" />
      <path d="M8 8 H13 M8 12 H13 M8 16 H11" strokeLinecap="round" />
      <path d="M19 6 L21 8 M19 6 L17 8 M19 6 V14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10 L21 7 V17 L16 14" strokeLinejoin="round" />
      <circle cx="9" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M4 7 V19 H20 V7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3 V14 M8 7 L12 3 L16 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
