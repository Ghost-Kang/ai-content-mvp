import Link from 'next/link';
import type { ReactNode } from 'react';

type TechTone = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';

const toneRing: Record<TechTone, string> = {
  cyan:    'ring-cyan-300/30 text-cyan-100',
  violet:  'ring-violet-300/30 text-violet-100',
  emerald: 'ring-emerald-300/30 text-emerald-100',
  amber:   'ring-amber-300/30 text-amber-100',
  rose:    'ring-rose-300/30 text-rose-100',
};
const toneDot: Record<TechTone, string> = {
  cyan:    'bg-gradient-to-r from-cyan-300 to-blue-400',
  violet:  'bg-gradient-to-r from-violet-300 to-fuchsia-400',
  emerald: 'bg-gradient-to-r from-emerald-300 to-cyan-400',
  amber:   'bg-gradient-to-r from-amber-200 to-orange-400',
  rose:    'bg-gradient-to-r from-rose-300 to-pink-400',
};

export function TechPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-32 top-[-12rem] h-96 w-96 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="absolute right-[-10rem] top-24 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-16rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.18),transparent_42%),linear-gradient(to_bottom,transparent,rgba(2,6,23,0.92))]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function TechHeader({
  brand = 'AI 内容营销工作室',
  brandHref = '/dashboard',
  backHref,
  backLabel,
  right,
}: {
  brand?: string;
  brandHref?: string;
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/65 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {backHref ? (
            <Link href={backHref} className="shrink-0 text-sm font-medium text-slate-300 transition hover:text-cyan-200">
              ← {backLabel ?? '返回'}
            </Link>
          ) : null}
          <Link href={brandHref} className="group inline-flex min-w-0 items-center gap-2.5">
            <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-slate-900 text-sm font-black text-cyan-200 ring-1 ring-cyan-300/30">
              <span className="absolute inset-[-2px] -z-10 rounded-xl ring-aurora animate-aurora-spin opacity-70" />
              AI
            </span>
            <span className="hidden truncate text-sm font-semibold tracking-wide text-white sm:inline">{brand}</span>
          </Link>
        </div>
        <div className="shrink-0 flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

export function TechBadge({ children, tone = 'cyan' }: { children: ReactNode; tone?: TechTone }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full bg-white/5 px-3 py-1 text-xs font-medium ring-1 ${toneRing[tone]}`}>
      <span className={`mr-2 h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} />
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
      className={`rounded-3xl border border-white/10 bg-white/[0.06] shadow-2xl shadow-cyan-950/25 backdrop-blur-xl ${
        hover ? 'transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[0.10] hover:shadow-cyan-500/10' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function TechButton({
  href,
  onClick,
  type,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  glow = false,
}: {
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  glow?: boolean;
}) {
  const sizes = size === 'lg'
    ? 'px-6 py-3.5 text-base'
    : 'px-5 py-2.5 text-sm';

  const styles =
    variant === 'primary'
      ? 'bg-gradient-to-r from-cyan-300 via-cyan-200 to-emerald-200 text-slate-950 shadow-lg shadow-cyan-400/25 hover:shadow-cyan-300/40 hover:saturate-110'
      : variant === 'secondary'
      ? 'border border-white/15 bg-white/5 text-slate-100 hover:border-cyan-300/40 hover:bg-white/10'
      : 'text-slate-300 hover:text-cyan-200';

  const base = `relative inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${styles} ${className}`;

  const Inner = (
    <>
      {glow && variant === 'primary' && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <span className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/40 blur-md animate-shine" />
        </span>
      )}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {Inner}
      </Link>
    );
  }
  return (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} className={base}>
      {Inner}
    </button>
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

/** Inline "tone block" used for warning/info/error banners on the dark shell. */
export function TechAlert({
  tone,
  title,
  children,
  className = '',
}: {
  tone: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const palette: Record<typeof tone, string> = {
    info:    'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    warning: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    error:   'border-rose-300/30 bg-rose-400/10 text-rose-100',
    success: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100',
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${palette[tone]} ${className}`}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-xs leading-6 opacity-85">{children}</div>
    </div>
  );
}
