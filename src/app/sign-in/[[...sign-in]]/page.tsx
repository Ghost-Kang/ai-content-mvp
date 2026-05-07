import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import { TechPageShell } from '@/components/layout/TechPage';

export default function SignInPage() {
  return (
    <TechPageShell>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="group inline-flex items-center gap-2.5">
          <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-slate-900 text-sm font-black text-cyan-200 ring-1 ring-cyan-300/30">
            <span className="absolute inset-[-2px] -z-10 rounded-xl ring-aurora animate-aurora-spin opacity-70" />
            AI
          </span>
          <span className="text-sm font-semibold tracking-wide text-white">AI 内容营销工作室</span>
        </Link>
        <Link
          href="/sign-up"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
        >
          没账号？注册 →
        </Link>
      </header>

      <main className="grid min-h-[calc(100vh-4rem)] gap-12 px-4 py-10 lg:grid-cols-[1fr_1fr] lg:px-12">
        <aside className="hidden flex-col justify-start pt-6 lg:flex">
          {/* 主标题 — 与落地页 hero 保持一致：定位副标题 */}
          <h2 className="text-base font-semibold text-slate-200 sm:text-lg lg:text-xl">
            用数据驱动的 AI 视频创作平台
          </h2>

          {/* 三行金句 — 与落地页 hero 一致 */}
          <p className="mt-5 text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
            <span className="block">别拍脑袋，</span>
            <span className="block">
              <span
                className="bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent"
                style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
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

          <p className="mt-6 max-w-md text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            告别在 ChatGPT、CapCut、Midjourney 之间来回复制。
            输入主题 → <span className="font-semibold text-white">12 分钟</span> 拿到剪映可直接发布的素材包。
          </p>

          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {[
              '免信用卡，立即体验',
              '单条视频成本 ≤ ¥15',
              '导出剪映 FCPXML 工程，可二次微调',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20 text-[10px] text-emerald-200 ring-1 ring-emerald-300/30">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex flex-col items-center justify-center">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-black tracking-tight text-white">欢迎回来</h2>
            <p className="mt-2 text-sm text-slate-400">登录后继续你的视频工作流</p>
          </div>
          <SignIn
            forceRedirectUrl="/dashboard"
            signUpForceRedirectUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: 'mx-auto',
                card: 'bg-slate-950/70 border border-white/10 backdrop-blur-xl shadow-2xl shadow-cyan-950/40',
                headerTitle: 'text-white',
                headerSubtitle: 'text-slate-400',
                socialButtonsBlockButton: 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/10',
                dividerLine: 'bg-white/10',
                dividerText: 'text-slate-500',
                formFieldLabel: 'text-slate-200',
                formFieldInput: 'bg-slate-900/80 border-white/10 text-white',
                footerActionText: 'text-slate-400',
                footerActionLink: 'text-cyan-300 hover:text-cyan-200',
                formButtonPrimary:
                  'bg-gradient-to-r from-cyan-300 to-emerald-200 text-slate-950 hover:saturate-110 shadow-lg shadow-cyan-400/25',
              },
              variables: {
                colorBackground: 'transparent',
                colorPrimary: '#67e8f9',
                colorText: '#e2e8f0',
                colorInputBackground: 'rgba(15,23,42,0.8)',
                colorInputText: '#ffffff',
              },
            }}
          />

          <p className="mt-6 max-w-sm text-center text-[11px] leading-5 text-slate-500">
            登录即表示你确认我们按 <span className="text-slate-300">《个人信息保护法》</span> 处理登录邮箱（仅用于账户识别）；
            你的创作内容存储在境内 Supabase。
            <Link href="/sign-up" className="ml-1 text-cyan-300 hover:text-cyan-200">完整声明 →</Link>
          </p>
        </div>
      </main>
    </TechPageShell>
  );
}

// ─── Beating heart ────────────────────────────────────────────────────
//
// SVG heart with the lub-dub heartbeat keyframe + a synced glow halo.
// Inline-baseline aligned so it sits in the middle of the text run.
// Mirrors the landing page hero so sign-in reads as the same brand voice.
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
