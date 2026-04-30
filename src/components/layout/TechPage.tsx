import Link from 'next/link';
import type { ReactNode } from 'react';

type TechTone = 'cyan' | 'violet' | 'emerald' | 'amber';

const toneClasses: Record<TechTone, string> = {
  cyan:    'from-cyan-400 to-blue-500 text-cyan-100 ring-cyan-400/30',
  violet:  'from-violet-400 to-fuchsia-500 text-violet-100 ring-violet-400/30',
  emerald: 'from-emerald-400 to-cyan-500 text-emerald-100 ring-emerald-400/30',
  amber:   'from-amber-300 to-orange-500 text-amber-100 ring-amber-400/30',
};

export function TechPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-12rem] h-96 w-96 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="absolute right-[-10rem] top-24 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-16rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.18),transparent_42%),linear-gradient(to_bottom,transparent,rgba(2,6,23,0.92))]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function TechHeader({
  brand = 'AI 内容营销工作室',
  backHref,
  backLabel,
  right,
}: {
  brand?: string;
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-white/10 bg-slate-950/55 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {backHref ? (
            <Link href={backHref} className="shrink-0 text-sm font-medium text-slate-300 transition hover:text-cyan-200">
              ← {backLabel ?? '返回'}
            </Link>
          ) : null}
          <Link href="/dashboard" className="group inline-flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-400/10 text-sm font-black text-cyan-200 ring-1 ring-cyan-300/25 transition group-hover:bg-cyan-400/20">
              AI
            </span>
            <span className="hidden truncate text-sm font-semibold tracking-wide text-white sm:inline">{brand}</span>
          </Link>
        </div>
        <div className="shrink-0">{right}</div>
      </div>
    </header>
  );
}

export function TechBadge({ children, tone = 'cyan' }: { children: ReactNode; tone?: TechTone }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full bg-white/5 px-3 py-1 text-xs font-medium ring-1 ${toneClasses[tone]}`}>
      <span className={`mr-2 h-1.5 w-1.5 rounded-full bg-gradient-to-r ${toneClasses[tone].split(' text-')[0]}`} />
      {children}
    </span>
  );
}

export function TechCard({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.07] shadow-2xl shadow-cyan-950/25 backdrop-blur-xl ${
        hover ? 'transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[0.10] hover:shadow-cyan-500/10' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function TechButton({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const base = 'inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition';
  const styles = variant === 'primary'
    ? 'bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-400/20 hover:bg-cyan-200'
    : 'border border-white/15 bg-white/5 text-slate-100 hover:border-cyan-300/40 hover:bg-white/10';
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function TechStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
