import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { isAdminUser } from '@/lib/admin/is-admin';
import { TechBadge, TechCard, TechHeader, TechPageShell, TechStat } from '@/components/layout/TechPage';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? '';
  const showAdminCard = isAdminUser(user?.id);

  return (
    <TechPageShell>
      <TechHeader right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <TechBadge tone="violet">Creator Command Center</TechBadge>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl">
              今天从哪里开始创作？
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              已登录 {email || '当前账号'}。把热门选题、完整视频工作流和快速脚本创作集中到一个控制台，
              选择入口后进入对应页面继续操作。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <TechStat label="热点入口" value="4 平台" />
            <TechStat label="主工作流" value="5 节点" />
            <TechStat label="视频状态" value="ETA 追踪" />
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
            eyebrow="Run Console"
            title="工作流运行台"
            body="查看历史 run、下载导出包、追踪视频生成进度和失败原因。"
            cta="查看运行"
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
  tone: 'cyan' | 'violet' | 'emerald' | 'amber';
}) {
  const gradient: Record<typeof tone, string> = {
    cyan: 'from-cyan-300 to-blue-400',
    violet: 'from-violet-300 to-fuchsia-400',
    emerald: 'from-emerald-300 to-cyan-400',
    amber: 'from-amber-200 to-orange-400',
  };

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
