import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { TechPageShell } from '@/components/layout/TechPage';

export default function SignUpPage() {
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
          href="/sign-in"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
        >
          已有账号？登录 →
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
              <span className="bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">
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
            <h2 className="text-3xl font-black tracking-tight text-white">创建账号</h2>
            <p className="mt-2 text-sm text-slate-400">免费注册，1 分钟开始第一个视频</p>
          </div>
          <SignUp
            forceRedirectUrl="/dashboard"
            signInForceRedirectUrl="/dashboard"
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

          <PiplNotice variant="signup" />
        </div>
      </main>
    </TechPageShell>
  );
}

// PIPL（《个人信息保护法》）/ 数据安全法 合规告知。
// 文案要素：(1) 收集什么 (2) 用于什么 (3) 存哪 (4) 用户权利。
// MVP 阶段：仅收登录邮箱（Clerk）+ 用户主动输入的创作内容（topic / niche / 脚本）。
function PiplNotice({ variant }: { variant: 'signup' | 'signin' }) {
  return (
    <div className="mt-6 max-w-md rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[11px] leading-5 text-slate-400">
      <p className="font-medium text-slate-300">
        {variant === 'signup' ? '注册即表示你同意：' : '登录即表示你确认：'}
      </p>
      <ul className="mt-1.5 space-y-1">
        <li>
          • 我们仅收集 <span className="text-slate-200">登录邮箱</span> 用于账户识别，不向任何第三方出售
        </li>
        <li>
          • 你输入的主题/脚本/分镜等创作内容，仅在境内 Supabase 中加密存储
        </li>
        <li>
          • CN 用户的内容生成 100% 走 <span className="text-slate-200">国内大模型</span>（Kimi/通义/文心），数据不出境
        </li>
        <li>
          • 你可随时通过 dashboard 联系我们删除账号及所有相关数据
        </li>
      </ul>
      <p className="mt-2 text-slate-500">
        遵循《个人信息保护法》《数据安全法》。详细政策即将上线，内测期以本声明为准。
      </p>
    </div>
  );
}

// ─── Beating heart ────────────────────────────────────────────────────
//
// SVG heart with the lub-dub heartbeat keyframe + a synced glow halo.
// Inline-baseline aligned so it sits in the middle of the text run.
// Mirrors the landing page hero so sign-up reads as the same brand voice.
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
