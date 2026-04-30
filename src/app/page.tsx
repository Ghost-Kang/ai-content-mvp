import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import {
  TechBadge,
  TechButton,
  TechPageShell,
} from '@/components/layout/TechPage';
import { PipelineAnimation } from '@/components/layout/PipelineAnimation';

export default async function Home() {
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);

  return (
    <TechPageShell>
      <LandingHeader isSignedIn={isSignedIn} />

      {/* ─── Hero · 左右并排：金句+CTA / 5 步动画 ─────────────────────────── */}
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:py-16">
        {/* Left column · 主标题 + 三行金句 + CTA */}
        <div className="flex min-w-0 flex-col">
          <TechBadge tone="cyan">AI 短视频工作流 · Seed 内测</TechBadge>

          {/* 主标题 — 中等字号、白色、定位用 */}
          <h2 className="mt-5 text-base font-semibold text-slate-200 sm:text-lg lg:text-xl">
            用数据驱动的 AI 视频创作平台
          </h2>

          {/* 三行金句 — 大字、节奏分明、最后一行带跳动 ❤️ */}
          <p className="mt-5 text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl xl:text-[3.7rem]">
            <span className="block">别拍脑袋，</span>
            <span className="block">
              <span className="bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent">
                数据找爆点
              </span>
              ，
            </span>
            <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
              AI
              <BeatingHeart />
              一键成片。
            </span>
          </p>

          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            告别在 ChatGPT、CapCut、Midjourney 之间来回复制。
            输入主题 → <span className="font-semibold text-white">12 分钟</span> 拿到剪映可直接发布的素材包。
          </p>

          {/* CTAs — 显眼，glow */}
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {isSignedIn ? (
              <TechButton href="/dashboard" variant="primary" size="lg" glow className="sm:px-10">
                进入创作控制台 →
              </TechButton>
            ) : (
              <>
                <TechButton href="/sign-up" variant="primary" size="lg" glow className="sm:px-10">
                  免费开始 · 1 分钟注册 →
                </TechButton>
                <TechButton href="/sign-in" variant="secondary" size="lg" className="sm:px-8">
                  已有账号？登录
                </TechButton>
              </>
            )}
          </div>

          {/* Trust strip */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Dot /> 免信用卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot /> 单条视频成本 ≤ ¥15
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot /> 数据 100% 境内合规
            </span>
          </div>
        </div>

        {/* Right column · 5 步使用流程动画（紧凑版） */}
        <div className="min-w-0 lg:pl-2">
          <PipelineAnimation />
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} AI 内容营销工作室 · Seed 内测期 · 数据合规符合 CAC AI 内容生成规范
      </footer>
    </TechPageShell>
  );
}

// ─── Sticky header ────────────────────────────────────────────────────
function LandingHeader({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="group inline-flex min-w-0 items-center gap-2.5">
          <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-900 text-sm font-black text-cyan-200 ring-1 ring-cyan-300/30">
            <span className="absolute inset-[-2px] -z-10 rounded-xl ring-aurora animate-aurora-spin opacity-70" />
            AI
          </span>
          <span className="hidden truncate text-sm font-semibold tracking-wide text-white sm:inline">
            AI 内容营销工作室
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
          {isSignedIn ? (
            <TechButton href="/dashboard" variant="primary" glow>
              进入控制台
            </TechButton>
          ) : (
            <>
              <TechButton href="/sign-in" variant="ghost">
                登录
              </TechButton>
              <TechButton href="/sign-up" variant="primary" glow>
                免费开始
              </TechButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// ─── Beating heart ────────────────────────────────────────────────────
//
// SVG heart with the real lub-dub heartbeat keyframe + a synced glow halo.
// Inline-baseline aligned so it sits in the middle of the text run.
function BeatingHeart() {
  return (
    <span
      role="img"
      aria-label="爱心跳动"
      className="relative inline-flex translate-y-[-0.05em] items-center justify-center"
    >
      <span
        aria-hidden
        className="absolute h-[1.2em] w-[1.2em] rounded-full bg-rose-400/35 blur-xl motion-safe:animate-heart-glow"
      />
      <svg
        viewBox="0 0 24 24"
        className="relative h-[0.95em] w-[0.95em] text-rose-400 motion-safe:animate-heartbeat motion-safe:[transform-box:fill-box] motion-safe:[transform-origin:center]"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 21s-7.5-4.6-9.5-10.2C1 7 4 3.5 7.5 3.5c2 0 3.6 1 4.5 2.5.9-1.5 2.5-2.5 4.5-2.5 3.5 0 6.5 3.5 5 7.3C19.5 16.4 12 21 12 21z" />
      </svg>
    </span>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />;
}
