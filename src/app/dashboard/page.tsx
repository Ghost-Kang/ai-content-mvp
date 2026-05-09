import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { isAdminUser } from '@/lib/admin/is-admin';
import { TechBadge, TechCard, TechHeader, TechPageShell } from '@/components/layout/TechPage';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await currentUser();
  const showAdminCard = isAdminUser(user?.id);

  return (
    <TechPageShell>
      <TechHeader right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section>
          <div>
            <TechBadge tone="violet">Creator Command Center</TechBadge>
            <h1 className="mt-5 text-3xl font-semibold text-slate-200 sm:text-4xl lg:text-5xl">
              用数据驱动的 AI 视频创作平台
            </h1>
            <p className="mt-5 text-2xl font-black leading-[1.1] tracking-tight text-white sm:text-3xl lg:text-4xl">
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
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300">
              主入口从下方 <span className="font-semibold text-white">「新建视频工作流」</span> 开始 —— 输入一个主题，AI 自动跑通
              <span className="font-semibold text-white">选题 → 脚本 → 分镜 → 视频 → 剪映导出</span>
              5 个节点，约 <span className="font-semibold text-white">12 分钟</span> 拿到可直接发布的素材包；暂时没思路就先到 <span className="font-semibold text-white">「热门选题雷达」</span> 拉爆点预填回工作流。
            </p>
          </div>
        </section>

        <section className={`mt-10 grid gap-4 sm:grid-cols-2 ${showAdminCard ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
          <LaunchCard
            href="/topics"
            eyebrow="Topic Radar"
            title="热门选题雷达"
            body="抖音 / 快手 / 小红书 / B站热榜，AI 分析爆点后直接预填到新工作流。"
            cta="去选题"
            tone="cyan"
          />
          <LaunchCard
            href="/runs/new"
            eyebrow="Start Pipeline"
            title="新建视频工作流"
            body="输入一个主题，自动完成选题、脚本、分镜、视频生成与导出。"
            cta="启动工作流"
            tone="emerald"
          />
          <LaunchCard
            href="/create"
            eyebrow="Quick Create"
            title="快速脚本创作"
            body="保留轻量 v2 入口，3 个字段生成短视频脚本和人工复审清单。"
            cta="快速生成"
            tone="violet"
          />
          <LaunchCard
            href="/runs"
            eyebrow="Video History"
            title="视频生成记录"
            body="查看每条视频生成记录、下载剪映素材包、追踪生成进度与失败原因。"
            cta="查看记录"
            tone="amber"
          />
          {showAdminCard ? (
            <LaunchCard
              href="/admin/dashboard"
              eyebrow="Ops"
              title="运营看板"
              body="用量、失败率、DAU、月度消耗，仅白名单用户可见。"
              cta="进入运营"
              tone="amber"
            />
          ) : null}
        </section>
      </main>
    </TechPageShell>
  );
}

type LaunchTone = 'cyan' | 'violet' | 'emerald' | 'amber';

const LAUNCH_GRADIENT: Record<LaunchTone, string> = {
  cyan: 'from-cyan-300 to-blue-400',
  violet: 'from-violet-300 to-fuchsia-400',
  emerald: 'from-emerald-300 to-cyan-400',
  amber: 'from-amber-200 to-orange-400',
};

function LaunchCard({
  href,
  eyebrow,
  title,
  body,
  cta,
  tone,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  tone: LaunchTone;
}) {
  const gradient = LAUNCH_GRADIENT;

  return (
    <Link href={href} className="group block">
      <TechCard hover className="flex h-full flex-col p-6">
        <div className={`mb-5 h-12 w-12 rounded-2xl bg-gradient-to-br ${gradient[tone]} opacity-90 shadow-lg shadow-cyan-950/30`} />
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200/80">{eyebrow}</p>
        <h2 className="mt-3 text-xl font-bold text-white">{title}</h2>
        <p className="mt-3 flex-1 text-sm leading-6 text-slate-300">{body}</p>
        <p className="mt-6 text-sm font-semibold text-cyan-200 transition group-hover:translate-x-1">
          {cta} →
        </p>
      </TechCard>
    </Link>
  );
}

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

