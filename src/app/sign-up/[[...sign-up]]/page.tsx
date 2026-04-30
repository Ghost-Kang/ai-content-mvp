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
        <aside className="hidden flex-col justify-center lg:flex">
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            从主题到剪映包，
            <span className="block bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent">
              一条工作流跑完。
            </span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
            注册即可开始 5 节点视频工作流：抓热点 → 写脚本 → 拆分镜 → 生成视频 → 导出剪映 draft。
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
        </div>
      </main>
    </TechPageShell>
  );
}
