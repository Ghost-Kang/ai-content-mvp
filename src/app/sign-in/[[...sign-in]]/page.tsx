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

      <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-white">欢迎回来</h1>
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
      </main>
    </TechPageShell>
  );
}
