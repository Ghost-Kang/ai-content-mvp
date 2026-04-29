import { auth } from '@clerk/nextjs/server';
import { TechBadge, TechButton, TechCard, TechPageShell, TechStat } from '@/components/layout/TechPage';

export default async function Home() {
  const { userId } = await auth();

  return (
    <TechPageShell>
      <main className="mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
        <section>
          <TechBadge tone="cyan">Seed 内测 · AI 短视频增长引擎</TechBadge>
          <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
            从热点到视频包，
            <span className="block bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-emerald-200 bg-clip-text text-transparent">
              一条工作流跑完。
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            为年轻内容团队和小型品牌设计的 AI 内容工作台：抓热点、写脚本、拆分镜、生成视频、导出剪映素材包。
            不再在多个工具之间来回复制，创意从输入到落地可追踪、可复跑。
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            {userId ? (
              <TechButton href="/dashboard">进入创作控制台 →</TechButton>
            ) : (
              <>
                <TechButton href="/sign-up">开始使用 →</TechButton>
                <TechButton href="/sign-in" variant="secondary">已有账号，登录</TechButton>
              </>
            )}
          </div>

          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            <TechStat label="工作流节点" value="5 steps" />
            <TechStat label="视频颗粒度" value="17 frames" />
            <TechStat label="交付物" value=".zip + draft" />
          </div>
        </section>

        <TechCard className="relative p-5">
          <div className="absolute right-8 top-8 h-20 w-20 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">Live Pipeline</p>
                <h2 className="mt-1 text-xl font-bold text-white">热点视频生成舱</h2>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-300/25">
                Online
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {[
                ['01', 'Topic Radar', '跨平台热点进入候选池', '100%'],
                ['02', 'Script Engine', '自动压缩成短视频节奏', '100%'],
                ['03', 'Storyboard AI', '镜头和旁白同步拆解', '100%'],
                ['04', 'Video Gen', '并发渲染 + ETA 追踪', '72%'],
                ['05', 'Export', '剪映素材包待生成', '待执行'],
              ].map(([idx, title, desc, pct]) => (
                <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-cyan-200">{idx} · {title}</p>
                      <p className="mt-1 truncate text-sm text-slate-300">{desc}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-slate-200">{pct}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300"
                      style={{ width: pct === '待执行' ? '8%' : pct }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TechCard>
      </main>
    </TechPageShell>
  );
}
