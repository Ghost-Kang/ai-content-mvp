import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import {
  TechBadge,
  TechButton,
  TechCard,
  TechPageShell,
  TechStat,
} from '@/components/layout/TechPage';
import { PipelineAnimation } from '@/components/layout/PipelineAnimation';

export default async function Home() {
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);

  return (
    <TechPageShell>
      <LandingHeader isSignedIn={isSignedIn} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
        <div>
          <TechBadge tone="cyan">Seed 内测 · AI 短视频增长引擎</TechBadge>

          <h1 className="mt-5 text-[2.6rem] font-black leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.4rem]">
            一个主题，
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent">
                自动跑出整支视频。
              </span>
              <span className="absolute -bottom-2 left-0 h-[3px] w-full bg-gradient-to-r from-cyan-300/0 via-cyan-300/80 to-fuchsia-300/0 blur-sm" />
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            告别在 ChatGPT、CapCut、Midjourney 之间来回复制。
            输入主题 → 抓热点 · 写脚本 · 拆分镜 · 生成视频 · 导出剪映包，
            <span className="text-white"> 5 分钟内</span> 拿到可直接发布的素材。
          </p>

          {/* Primary CTAs — explicit & big */}
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {isSignedIn ? (
              <TechButton href="/dashboard" variant="primary" size="lg" glow>
                进入创作控制台 →
              </TechButton>
            ) : (
              <>
                <TechButton href="/sign-up" variant="primary" size="lg" glow>
                  免费开始 · 1 分钟 →
                </TechButton>
                <TechButton href="/sign-in" variant="secondary" size="lg">
                  已有账号，登录
                </TechButton>
              </>
            )}
            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-slate-300 transition hover:text-cyan-200 sm:py-3.5"
            >
              看 60 秒上手 ↓
            </Link>
          </div>

          {/* Trust strip */}
          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            <TechStat label="工作流节点" value="5 steps" />
            <TechStat label="单条视频成本" value="≤ ¥15" />
            <TechStat label="交付物" value=".zip · 剪映 draft" />
          </div>
        </div>

        <PipelineAnimation />
      </section>

      {/* ── Value props ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <TechBadge tone="violet">为什么不一样</TechBadge>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
            写脚本不再是瓶颈，
            <br className="hidden sm:block" />
            视频不再卡在剪辑那一步。
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <ValueCard
            tone="cyan"
            title="跨平台爆点雷达"
            body="抖音、快手、小红书、B 站，AI 帮你解释「为什么火」并改造成你的赛道选题。"
            icon={<RadarIcon />}
          />
          <ValueCard
            tone="violet"
            title="视频从不只生成一段"
            body="脚本拆 17 帧分镜，并发渲染 + 失败自动续跑，长视频也能一次跑完。"
            icon={<LayersIcon />}
          />
          <ValueCard
            tone="emerald"
            title="直出剪映工程"
            body="导出 FCPXML draft + 素材 zip，导入剪映即可二次微调，不再丢链路。"
            icon={<ExportIcon />}
          />
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-white/5 bg-slate-950/40 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <TechBadge tone="emerald">60 秒上手</TechBadge>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              三步从想法到成片
            </h2>
            <p className="mt-3 text-base text-slate-400">
              不需要会剪辑、不需要懂 prompt 工程，按步骤跟着做就行。
            </p>
          </div>

          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            <StepCard
              n="01"
              title="挑选题"
              body="进 Topic Radar，看 4 平台爆款；点 AI 分析判断是否切中你的赛道。"
              cta="去选题 →"
              href={isSignedIn ? '/topics' : '/sign-up'}
            />
            <StepCard
              n="02"
              title="启动工作流"
              body="点「用这条」预填主题，确认后启动 5 节点流水线，泡杯咖啡的时间。"
              cta="新建工作流 →"
              href={isSignedIn ? '/runs/new' : '/sign-up'}
            />
            <StepCard
              n="03"
              title="下载剪映包"
              body="状态变 ✓ 后点击下载 zip，导入剪映即可微调发布。"
              cta="看运行台 →"
              href={isSignedIn ? '/runs' : '/sign-up'}
            />
          </ol>

          <div className="mt-12 flex justify-center">
            {isSignedIn ? (
              <TechButton href="/runs/new" variant="primary" size="lg" glow>
                现在就启动一个工作流 →
              </TechButton>
            ) : (
              <TechButton href="/sign-up" variant="primary" size="lg" glow>
                免费创建账号 →
              </TechButton>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 px-6 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} AI 内容营销工作室 · Seed 内测期 · 数据合规符合 CAC AI 内容生成规范
      </footer>
    </TechPageShell>
  );
}

// ─── Sticky / hero header (also shows login CTAs) ──────────────────────
function LandingHeader({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/65 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="group inline-flex items-center gap-2.5">
          <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-slate-900 text-sm font-black text-cyan-200 ring-1 ring-cyan-300/30">
            <span className="absolute inset-[-2px] -z-10 rounded-xl ring-aurora animate-aurora-spin opacity-70" />
            AI
          </span>
          <span className="hidden text-sm font-semibold tracking-wide text-white sm:inline">AI 内容营销工作室</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="#how-it-works"
            className="hidden rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:text-cyan-200 sm:inline-block"
          >
            如何使用
          </Link>
          {isSignedIn ? (
            <TechButton href="/dashboard" variant="primary">
              进入控制台 →
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

// ─── Value card ────────────────────────────────────────────────────────
function ValueCard({
  tone,
  title,
  body,
  icon,
}: {
  tone: 'cyan' | 'violet' | 'emerald';
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  const ringByTone: Record<typeof tone, string> = {
    cyan: 'from-cyan-300/40 via-cyan-300/0 to-cyan-300/0',
    violet: 'from-violet-300/40 via-violet-300/0 to-violet-300/0',
    emerald: 'from-emerald-300/40 via-emerald-300/0 to-emerald-300/0',
  };
  const iconBg: Record<typeof tone, string> = {
    cyan: 'bg-cyan-300/15 text-cyan-200 ring-cyan-300/30',
    violet: 'bg-violet-300/15 text-violet-200 ring-violet-300/30',
    emerald: 'bg-emerald-300/15 text-emerald-200 ring-emerald-300/30',
  };

  return (
    <TechCard hover className="group relative overflow-hidden p-6">
      <div className={`pointer-events-none absolute -top-1 left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r ${ringByTone[tone]}`} />
      <div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ring-1 ${iconBg[tone]}`}>
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </TechCard>
  );
}

// ─── Step card ─────────────────────────────────────────────────────────
function StepCard({
  n,
  title,
  body,
  cta,
  href,
}: {
  n: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <li className="group relative">
      <TechCard hover className="flex h-full flex-col p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 font-mono text-sm font-bold text-cyan-200 ring-1 ring-cyan-300/30">
            {n}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-cyan-300/30 to-transparent" />
        </div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-slate-300">{body}</p>
        <Link
          href={href}
          className="mt-6 inline-flex items-center text-sm font-semibold text-cyan-200 transition group-hover:translate-x-1"
        >
          {cta}
        </Link>
      </TechCard>
    </li>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────
function RadarIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 12 L18 6" strokeLinecap="round" />
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 3 L21 8 L12 13 L3 8 Z" strokeLinejoin="round" />
      <path d="M3 13 L12 18 L21 13" strokeLinejoin="round" />
    </svg>
  );
}
function ExportIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M4 7 V19 H20 V7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3 V14 M8 7 L12 3 L16 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
