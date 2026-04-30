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

      {/* ─── §1 HERO · 金句 + 显眼登录注册 ───────────────────────────────── */}
      <section className="relative">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24 sm:pb-28 lg:pt-32 lg:pb-32">
          <TechBadge tone="cyan">AI 短视频工作流 · Seed 内测</TechBadge>

          {/* 金句 — 三行节奏，第二行 gradient highlight，第三行收束爆点 */}
          <h1 className="mt-7 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            别拍脑袋，
            <br className="hidden sm:block" />
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent">
                让数据找爆点
              </span>
              <span className="absolute -bottom-2 left-0 h-[3px] w-full bg-gradient-to-r from-cyan-300/0 via-cyan-300/80 to-fuchsia-300/0 blur-sm" />
            </span>
            ，
            <br className="hidden sm:block" />
            AI 替你拍。
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            告别在 ChatGPT、CapCut、Midjourney 之间来回复制。
            输入主题 → <span className="font-semibold text-white">12 分钟</span> 拿到剪映可直接发布的素材包。
          </p>

          {/* CTAs — 显眼，glow，desktop 一行 */}
          <div className="mt-10 flex w-full max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            {isSignedIn ? (
              <TechButton href="/dashboard" variant="primary" size="lg" glow className="w-full sm:w-auto sm:px-10">
                进入创作控制台 →
              </TechButton>
            ) : (
              <>
                <TechButton href="/sign-up" variant="primary" size="lg" glow className="w-full sm:w-auto sm:px-10">
                  免费开始 · 1 分钟注册 →
                </TechButton>
                <TechButton href="/sign-in" variant="secondary" size="lg" className="w-full sm:w-auto sm:px-8">
                  已有账号？登录
                </TechButton>
              </>
            )}
          </div>

          {/* Trust signals — 紧贴 CTA 下方 */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Dot /> 免信用卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot /> 单条视频成本 ≤ ¥15
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot /> 数据 100% 境内合规
            </span>
            <Link
              href="#how-it-works"
              className="inline-flex items-center gap-1 font-medium text-cyan-200 transition hover:text-cyan-100"
            >
              看 5 步使用流程 ↓
            </Link>
          </div>
        </div>
      </section>

      {/* ─── §2 五步使用流程 · 动画 ─────────────────────────────────────── */}
      <section id="how-it-works" className="relative border-t border-white/5 bg-slate-950/60 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <TechBadge tone="emerald">5 步使用流程</TechBadge>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">
              输入主题，剩下交给 AI
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg">
              下面 5 个节点会自动按顺序跑完，每一步状态实时回传到你的控制台。
              整个过程你只在 <span className="text-white">「挑选题」</span> 那步花 1 分钟决策，其余可以离开做别的事。
            </p>
          </div>

          <div className="mt-12">
            <PipelineAnimation />
          </div>

          {/* 中段 secondary CTA */}
          <div className="mt-12 flex justify-center">
            {isSignedIn ? (
              <TechButton href="/runs/new" variant="primary" size="lg" glow>
                现在就启动一个工作流 →
              </TechButton>
            ) : (
              <TechButton href="/sign-up" variant="primary" size="lg" glow>
                免费创建账号，开始第一条视频 →
              </TechButton>
            )}
          </div>
        </div>
      </section>

      {/* ─── §3 Closing CTA ─────────────────────────────────────────────── */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl">
          <div className="relative overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-gradient-to-br from-cyan-300/15 via-fuchsia-300/10 to-emerald-300/15 p-8 text-center shadow-2xl shadow-cyan-950/40 sm:p-12">
            {/* Aurora ring background */}
            <span aria-hidden className="pointer-events-none absolute inset-[-2px] rounded-[2rem] ring-aurora animate-aurora-spin opacity-30" />
            <div className="relative">
              <h3 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                下一个想法，
                <span className="bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent">
                  直接做成视频。
                </span>
              </h3>
              <p className="mt-4 text-sm text-slate-300 sm:text-base">
                Seed 内测期免费体验。注册即开通，不用等审核。
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {isSignedIn ? (
                  <TechButton href="/dashboard" variant="primary" size="lg" glow className="w-full sm:w-auto sm:px-10">
                    进入控制台 →
                  </TechButton>
                ) : (
                  <>
                    <TechButton href="/sign-up" variant="primary" size="lg" glow className="w-full sm:w-auto sm:px-10">
                      免费开始 →
                    </TechButton>
                    <TechButton href="/sign-in" variant="ghost" size="lg" className="w-full sm:w-auto">
                      已有账号？登录
                    </TechButton>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-8 text-center text-xs text-slate-500">
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
          <Link
            href="#how-it-works"
            className="hidden rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:text-cyan-200 sm:inline-block"
          >
            如何使用
          </Link>
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

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />;
}
