// 5-step pipeline animation for the landing page.
//
// Pure CSS / SVG — no JS animation library. Sequential pulse via
// animation-delay so each step lights up in turn, then loops.

import type { ReactNode } from 'react';

interface Step {
  n: string;
  title: string;
  body: string;
  accent: 'cyan' | 'violet' | 'fuchsia' | 'amber' | 'emerald';
  icon: ReactNode;
}

const STEPS: ReadonlyArray<Step> = [
  {
    n: '01',
    title: '看热点',
    body: '4 平台爆款日榜 + AI 解释为什么火',
    accent: 'cyan',
    icon: <RadarIcon />,
  },
  {
    n: '02',
    title: '挑选题',
    body: '选一条点「用这条」，主题预填到工作流',
    accent: 'violet',
    icon: <PickIcon />,
  },
  {
    n: '03',
    title: '写脚本 + 拆分镜',
    body: 'AI 自动出 17 帧脚本 + 镜头语言',
    accent: 'fuchsia',
    icon: <ScriptIcon />,
  },
  {
    n: '04',
    title: '生成视频',
    body: 'Seedance 并发渲染 17 段，进度可见',
    accent: 'amber',
    icon: <VideoIcon />,
  },
  {
    n: '05',
    title: '下载剪映包',
    body: '.zip + FCPXML，导入剪映即可发布',
    accent: 'emerald',
    icon: <ExportIcon />,
  },
];

const ACCENT_RING: Record<Step['accent'], string> = {
  cyan:    'ring-cyan-300/40 text-cyan-100',
  violet:  'ring-violet-300/40 text-violet-100',
  fuchsia: 'ring-fuchsia-300/40 text-fuchsia-100',
  amber:   'ring-amber-300/40 text-amber-100',
  emerald: 'ring-emerald-300/40 text-emerald-100',
};

const ACCENT_GLOW: Record<Step['accent'], string> = {
  cyan:    'shadow-[0_0_24px_rgba(103,232,249,0.45)]',
  violet:  'shadow-[0_0_24px_rgba(196,181,253,0.45)]',
  fuchsia: 'shadow-[0_0_24px_rgba(232,121,249,0.45)]',
  amber:   'shadow-[0_0_24px_rgba(251,191,36,0.45)]',
  emerald: 'shadow-[0_0_24px_rgba(110,231,183,0.45)]',
};

const ACCENT_FILL: Record<Step['accent'], string> = {
  cyan:    'bg-cyan-300/15',
  violet:  'bg-violet-300/15',
  fuchsia: 'bg-fuchsia-300/15',
  amber:   'bg-amber-300/15',
  emerald: 'bg-emerald-300/15',
};

const STAGGER_MS = 700;
const CYCLE_MS = STAGGER_MS * STEPS.length + 800;

/**
 * Renders a 5-step horizontal pipeline that lights up sequentially.
 *
 * Layout:
 *   - lg+: horizontal row, connectors between cards
 *   - mobile: vertical stack, connectors are short vertical bars
 */
export function PipelineAnimation() {
  return (
    <div className="relative">
      {/* Background blur halo */}
      <div className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-cyan-500/15 via-fuchsia-500/10 to-emerald-500/10 blur-3xl" />

      <div className="relative rounded-3xl border border-white/10 bg-slate-950/65 p-5 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl sm:p-8">
        {/* Header strip */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-200">
              Live Pipeline
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              5 步从想法到爆款
            </h3>
            <p className="mt-1.5 text-sm text-slate-400">
              输入主题后，下面 5 个节点自动按顺序跑完，每步状态实时回传。
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-300/25">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Online · ~12 min / run
          </span>
        </div>

        {/* Steps */}
        <ol className="grid gap-3 lg:grid-cols-5 lg:gap-3">
          {STEPS.map((step, idx) => (
            <li key={step.n} className="relative">
              <StepCard step={step} index={idx} />
              {/* Connector — only between cards, hidden on last */}
              {idx < STEPS.length - 1 && <Connector index={idx} />}
            </li>
          ))}
        </ol>

        {/* Bottom kpi strip */}
        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 text-center text-[11px] sm:text-xs">
          <div>
            <p className="text-slate-500">输入</p>
            <p className="mt-1 font-mono font-semibold text-cyan-200">1 个主题</p>
          </div>
          <div>
            <p className="text-slate-500">耗时</p>
            <p className="mt-1 font-mono font-semibold text-violet-200">~ 12 min</p>
          </div>
          <div>
            <p className="text-slate-500">输出</p>
            <p className="mt-1 font-mono font-semibold text-emerald-200">.zip + FCPXML</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function StepCard({ step, index }: { step: Step; index: number }) {
  const delay = `${index * STAGGER_MS}ms`;
  return (
    <div
      className="group relative flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]"
    >
      {/* Pulsing aura ring — fires once per cycle, staggered */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 motion-safe:animate-pulse-soft ${ACCENT_RING[step.accent]}`}
        style={{
          animationDelay: delay,
          animationDuration: `${CYCLE_MS}ms`,
        }}
      />

      <div className="relative flex items-center justify-between gap-2">
        {/* Big step number */}
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-900 font-mono text-base font-black ring-1 ${ACCENT_RING[step.accent]} ${ACCENT_GLOW[step.accent]}`}>
          {step.n}
        </span>
        {/* Icon */}
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${ACCENT_FILL[step.accent]} ${ACCENT_RING[step.accent]} ring-1`}>
          {step.icon}
        </span>
      </div>

      <div className="relative">
        <h4 className="text-base font-bold text-white">{step.title}</h4>
        <p className="mt-1.5 text-xs leading-5 text-slate-400">{step.body}</p>
      </div>

      {/* Tiny progress chevron at the bottom that animates in */}
      <span
        aria-hidden
        className="relative mt-auto block h-0.5 w-full overflow-hidden rounded-full bg-white/10"
      >
        <span
          className="absolute inset-y-0 left-0 block w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/50 to-transparent motion-safe:animate-shine"
          style={{
            animationDelay: delay,
            animationDuration: `${CYCLE_MS}ms`,
          }}
        />
      </span>
    </div>
  );
}

function Connector({ index }: { index: number }) {
  const delay = `${(index + 1) * STAGGER_MS - 200}ms`;
  return (
    <>
      {/* Desktop: horizontal connector positioned to the right of the card */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 top-1/2 hidden h-[2px] w-6 -translate-y-1/2 overflow-hidden lg:block"
      >
        <span className="absolute inset-0 bg-white/15" />
        <span
          className="absolute inset-y-0 left-0 block h-full w-1/2 bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent motion-safe:animate-shine"
          style={{
            animationDelay: delay,
            animationDuration: `${CYCLE_MS}ms`,
          }}
        />
      </span>
      {/* Mobile: vertical connector below the card */}
      <span
        aria-hidden
        className="pointer-events-none mx-auto block h-3 w-[2px] overflow-hidden lg:hidden"
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
    </>
  );
}

// ─── Icons (line, 1.6 stroke, 24×24 native) ───────────────────────────

function RadarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 12 L18 6" strokeLinecap="round" />
    </svg>
  );
}

function PickIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3.5" y="6" width="11" height="3" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="3" rx="1.5" />
      <path d="M16 6 L20 9 L16 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScriptIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="4" y="3" width="13" height="18" rx="2" />
      <path d="M8 8 H13 M8 12 H13 M8 16 H11" strokeLinecap="round" />
      <path d="M19 6 L21 8 M19 6 L17 8 M19 6 V14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10 L21 7 V17 L16 14" strokeLinejoin="round" />
      <circle cx="9" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M4 7 V19 H20 V7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3 V14 M8 7 L12 3 L16 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
