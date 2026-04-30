import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import {
  TechBadge,
  TechButton,
  TechCard,
  TechPageShell,
} from '@/components/layout/TechPage';

export default async function Home() {
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);

  return (
    <TechPageShell>
      <LandingHeader isSignedIn={isSignedIn} />

      {/* ── Focused hero ─────────────────────────────────────────────────── */}
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-2 content-center items-start gap-5 px-4 py-10 sm:gap-8 sm:px-6 lg:gap-10 lg:py-16">
        <div className="flex min-w-0 flex-col self-stretch">
          <TechBadge tone="cyan">AI 短视频工作流 · Seed 内测</TechBadge>

          <h1 className="mt-5 max-w-4xl text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[4.6rem]">
            别再拍脑袋猜什么会火，
            <span className="block bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent">
              一键生成短视频素材包。
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-sm leading-6 text-slate-300 sm:text-lg sm:leading-8">
            先看 4 平台热点为什么火，再把适合你的选题自动变成
            <span className="font-semibold text-white"> 脚本、分镜、视频片段和剪映素材包</span>。
            少猜方向，少搬素材，多做能发布的内容。
          </p>

          <div className="mt-auto rounded-3xl border border-cyan-300/25 bg-cyan-300/10 p-3 shadow-2xl shadow-cyan-950/30 sm:inline-flex sm:items-center sm:gap-4 sm:p-4">
            <div className="mb-3 sm:mb-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-100">从这里开始</p>
              <p className="mt-1 text-sm text-slate-300">
                {isSignedIn ? '继续创作，进入控制台。' : '登录后直接看热点、选题、生成素材包。'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {isSignedIn ? (
                <TechButton href="/dashboard" variant="primary" size="lg" glow className="w-full sm:w-auto">
                  进入控制台 →
                </TechButton>
              ) : (
                <>
                  <TechButton href="/sign-in" variant="primary" size="lg" glow className="w-full sm:w-auto">
                    登录，开始生成 →
                  </TechButton>
                  <TechButton href="/sign-up" variant="secondary" size="lg" className="w-full sm:w-auto">
                    创建账号
                  </TechButton>
                </>
              )}
            </div>
          </div>
        </div>

        <TechCard className="flex min-w-0 flex-col self-stretch overflow-hidden p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <TechBadge tone="emerald">3 步使用</TechBadge>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                从热点到素材包
              </h2>
            </div>
            <Link
              href={isSignedIn ? '/runs/new' : '/sign-in'}
              className="hidden rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 sm:inline-flex"
            >
                开始生成
            </Link>
          </div>

          <div className="flex flex-1">
            <UseStepsAnimation isSignedIn={isSignedIn} />
          </div>
        </TechCard>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 px-6 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} AI 内容营销工作室 · Seed 内测期
      </footer>
    </TechPageShell>
  );
}

// ─── Sticky / hero header (also shows login CTAs) ──────────────────────
function LandingHeader({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="group inline-flex min-w-0 items-center gap-2.5">
          <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-900 text-sm font-black text-cyan-200 ring-1 ring-cyan-300/30">
            <span className="absolute inset-[-2px] -z-10 rounded-xl ring-aurora animate-aurora-spin opacity-70" />
            AI
          </span>
          <span className="hidden truncate text-sm font-semibold tracking-wide text-white sm:inline">AI 内容营销工作室</span>
        </Link>

        <nav className="flex shrink-0 items-center gap-2">
          {isSignedIn ? (
            <TechButton href="/dashboard" variant="primary" glow>
              进入控制台
            </TechButton>
          ) : (
            <>
              <TechButton href="/sign-up" variant="ghost" className="hidden sm:inline-flex">
                创建账号
              </TechButton>
              <TechButton href="/sign-in" variant="primary" glow>
                登录
              </TechButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function UseStepsAnimation({ isSignedIn }: { isSignedIn: boolean }) {
  const steps = [
    {
      n: '01',
      title: '看热点为什么火',
      body: '选题',
      href: isSignedIn ? '/topics' : '/sign-in',
    },
    {
      n: '02',
      title: '一键生成内容',
      body: '生成',
      href: isSignedIn ? '/runs/new' : '/sign-in',
    },
    {
      n: '03',
      title: '下载素材包',
      body: '下载',
      href: isSignedIn ? '/runs' : '/sign-in',
    },
  ];

  return (
    <div className="flex w-full rounded-3xl border border-white/10 bg-slate-950/60 p-4">
      <div className="relative flex w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(217,70,239,0.14),transparent_30%)]" />
        <div className="relative flex w-full flex-col">
          <div className="mb-6 flex items-center justify-between gap-2">
            {steps.map((step, idx) => (
              <Link key={step.n} href={step.href} className="group flex flex-1 flex-col items-center">
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 font-mono text-sm font-black text-cyan-100 ring-1 ring-cyan-300/30">
                  <span
                    className="absolute inset-0 rounded-2xl bg-cyan-300/20 blur-md motion-safe:animate-pulse"
                    style={{ animationDelay: `${idx * 240}ms` }}
                  />
                  <span className="relative">{step.n}</span>
                </span>
                <span className="mt-2 text-xs font-semibold text-white">{step.body}</span>
              </Link>
            ))}
          </div>

          <div className="relative mx-6 mb-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-cyan-300 via-violet-300 to-emerald-300 motion-safe:animate-pulse" />
            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-white/50 blur-sm motion-safe:animate-shine" />
          </div>

          <div className="mt-auto rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">Output</p>
            <p className="mt-2 text-lg font-black text-white">可下载的视频素材包</p>
            <p className="mt-1 text-sm leading-6 text-emerald-50/80">
              脚本、分镜、视频片段和剪映导入文件集中打包，不再散落在多个工具里。
            </p>
            <Link
              href={isSignedIn ? '/runs/new' : '/sign-in'}
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-200 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-100"
            >
              {isSignedIn ? '开始生成素材包 →' : '登录后开始生成 →'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
