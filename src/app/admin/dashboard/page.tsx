// W4-07-V3 — Admin operations dashboard.
//
// Server-rendered, single-shot snapshot of the v3 workflow engine. NOT a
// realtime dashboard — refresh the page to refetch (we'd rather not pay for
// a polling loop until there are >1 admins, and a hard reload also exercises
// the auth gate every time).
//
// Auth: TWO-layer defense in depth.
//   1. Clerk middleware ensures ANY signed-in user can hit this URL (page is
//      not in `isPublicRoute`, so unauth → /sign-in).
//   2. This page checks `isAdminUser(clerkUserId)` and 404s if false. We
//      return notFound() (not redirect) so non-admins can't even tell the
//      page exists — small but cheap defense against enumeration.
//
// Data: direct DB calls via the service-role connection (RLS bypassed, by
// design — admin = global view). All four aggregates run in parallel via
// `fetchAdminSummary`.

import { notFound } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';

import {
  adminUserCount,
  fetchAdminSummary,
  formatFen,
  formatLatency,
  formatPercent,
  isAdminUser,
  type ComplianceAuditRow,
  type NodeLatencyRow,
  type RunStats7d,
  type WorkflowStatus,
} from '@/lib/admin';
import { COMPLIANCE_ACTION_EXPORT_DISCLOSURE_OFF } from '@/lib/compliance/record-audit';
import { TechBadge, TechHeader, TechPageShell } from '@/components/layout/TechPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '运营 dashboard — AI 内容营销工作室',
};

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  pending:   '待执行',
  running:   '运行中',
  done:      '已完成',
  failed:    '失败',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<WorkflowStatus, string> = {
  pending:   'bg-white/5 text-slate-300 ring-white/10',
  running:   'bg-amber-300/15 text-amber-100 ring-amber-300/30',
  done:      'bg-emerald-400/15 text-emerald-100 ring-emerald-300/30',
  failed:    'bg-rose-400/15 text-rose-100 ring-rose-300/30',
  cancelled: 'bg-slate-400/10 text-slate-300 ring-slate-300/20',
};

const NODE_LABEL: Record<NodeLatencyRow['nodeType'], string> = {
  topic:      '选题',
  script:     '脚本',
  storyboard: '分镜',
  video:      '视频',
  export:     '导出',
};

export default async function AdminDashboardPage() {
  const { userId: clerkUserId } = await auth();
  if (!isAdminUser(clerkUserId)) {
    notFound();
  }

  const [user, summary] = await Promise.all([
    currentUser(),
    fetchAdminSummary(),
  ]);

  const adminCount = adminUserCount();
  const generatedAt = new Date(summary.generatedAt);
  const generatedAtLabel = generatedAt.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12:   false,
  });

  return (
    <TechPageShell>
      <TechHeader backHref="/dashboard" backLabel="控制台" right={<UserButton afterSignOutUrl="/" />} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <TechBadge tone="amber">Ops · W4-07</TechBadge>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">运营 dashboard</h1>
            <p className="mt-2 text-sm text-slate-400">
              v3 工作流近 7 天健康度 · 当月成本 ·{' '}
              <span className="text-slate-200">{user?.emailAddresses[0]?.emailAddress ?? '未知'}</span>
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>快照生成于 {generatedAtLabel}</div>
            <div>刷新重新拉取；同部署内聚合结果 60s 去重</div>
          </div>
        </div>

        {adminCount === 0 ? (
          <div className="mb-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            ⚠ <code className="rounded bg-amber-300/20 px-1.5 py-0.5">ADMIN_USER_IDS</code>{' '}
            未配置 — 当前实例对所有登录用户开放运营 dashboard。请在 Vercel 环境变量
            或本地 <code className="rounded bg-amber-300/20 px-1.5 py-0.5">.env.local</code> 设置
            管理员 Clerk userId 列表（逗号分隔），然后重新部署。
          </div>
        ) : null}

        {/* Top 4 KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="近 7 天工作流成功率"
            value={formatPercent(summary.runs.successRate)}
            sub={`${summary.runs.byStatus.done} 成功 / ${summary.runs.terminalCount} 终态`}
            tone={successRateTone(summary.runs)}
          />
          <KpiCard
            label="近 7 天总运行数"
            value={summary.runs.total.toLocaleString('zh-CN')}
            sub={`运行中 ${summary.runs.byStatus.running} · 失败 ${summary.runs.byStatus.failed}`}
            tone="neutral"
          />
          <KpiCard
            label="活跃用户"
            value={`${summary.activeUsers.d7} / ${summary.activeUsers.d30}`}
            sub="近 7 天 / 近 30 天 创建过运行"
            tone="neutral"
          />
          <KpiCard
            label={`本月支出 (${summary.monthSpend.monthKey})`}
            value={formatFen(summary.monthSpend.totalFen)}
            sub={`${summary.monthSpend.videoCount} 条视频 · ${summary.monthSpend.userCount} 名用户`}
            tone={spendTone(summary.monthSpend.totalFen)}
          />
        </div>

        {/* Run-status breakdown chips */}
        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
          <h2 className="text-sm font-bold text-white">近 7 天运行状态分布</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['done', 'running', 'pending', 'failed', 'cancelled'] as WorkflowStatus[]).map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${STATUS_COLOR[s]}`}
              >
                <span>{STATUS_LABEL[s]}</span>
                <span className="font-semibold tabular-nums">{summary.runs.byStatus[s]}</span>
              </span>
            ))}
          </div>
          {summary.runs.total === 0 ? (
            <p className="mt-4 text-xs text-slate-500">最近 7 天没有任何运行记录。</p>
          ) : null}
        </section>

        {/* Per-node latency table */}
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
          <h2 className="text-sm font-bold text-white">近 7 天节点延迟（仅成功节点）</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">
                <tr>
                  <th className="pb-2 font-medium">节点</th>
                  <th className="pb-2 font-medium tabular-nums">样本数</th>
                  <th className="pb-2 font-medium tabular-nums">平均</th>
                  <th className="pb-2 font-medium tabular-nums">P50</th>
                  <th className="pb-2 font-medium tabular-nums">P95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary.latencyByNode.map((row) => (
                  <tr key={row.nodeType}>
                    <td className="py-2 font-medium text-white">{NODE_LABEL[row.nodeType]}</td>
                    <td className="py-2 tabular-nums text-slate-300">{row.count.toLocaleString('zh-CN')}</td>
                    <td className="py-2 tabular-nums text-slate-200">{formatLatency(row.avgMs)}</td>
                    <td className="py-2 tabular-nums text-slate-200">{formatLatency(row.p50Ms)}</td>
                    <td className="py-2 tabular-nums text-slate-200">{formatLatency(row.p95Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            统计窗口：<code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">completed_at &gt;= NOW() - INTERVAL &#39;7 days&#39;</code> · 状态 = done
          </p>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
          <h2 className="text-sm font-bold text-white">
            合规 / 高敏操作（最近 · 最多 30 条{summary.complianceLog.length > 0 ? `，当前 ${summary.complianceLog.length}` : ''}）
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            例：为运行关闭 CAC disclosure 的导出（<code className="rounded bg-white/5 px-1 text-slate-200">export_overrides</code>）。
            无数据 = 未触发或尚未执行 <code className="rounded bg-white/5 px-1 text-slate-200">db:migrate:compliance</code>。
          </p>
          <div className="mt-4 overflow-x-auto">
            {summary.complianceLog.length === 0 ? (
              <p className="text-sm text-slate-500">暂无记录</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">
                  <tr>
                    <th className="pb-2 font-medium">时间</th>
                    <th className="pb-2 font-medium">操作</th>
                    <th className="pb-2 font-medium">用户</th>
                    <th className="pb-2 font-medium">Run</th>
                    <th className="pb-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {summary.complianceLog.map((row) => (
                    <ComplianceLogRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </TechPageShell>
  );
}

// ─── Sub-components (server) ─────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub:   string;
  tone:  'good' | 'warn' | 'bad' | 'neutral';
}

const TONE_RING: Record<KpiCardProps['tone'], string> = {
  good:    'border-emerald-300/30 bg-emerald-400/10',
  warn:    'border-amber-300/30 bg-amber-300/10',
  bad:     'border-rose-300/30 bg-rose-400/10',
  neutral: 'border-white/10 bg-white/[0.06]',
};
const TONE_VALUE: Record<KpiCardProps['tone'], string> = {
  good:    'text-emerald-200',
  warn:    'text-amber-200',
  bad:     'text-rose-200',
  neutral: 'text-white',
};

function KpiCard({ label, value, sub, tone }: KpiCardProps) {
  return (
    <div className={`rounded-2xl border p-5 shadow-lg shadow-cyan-950/15 backdrop-blur-xl ${TONE_RING[tone]}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${TONE_VALUE[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function actionLabel(action: string): string {
  if (action === COMPLIANCE_ACTION_EXPORT_DISCLOSURE_OFF) return '关闭 AI disclosure（FCPXML）';
  return action;
}

function ComplianceLogRow({ row }: { row: ComplianceAuditRow }) {
  const t = new Date(row.createdAt);
  const timeLabel = t.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const extra = typeof row.detail.topic === 'string' ? row.detail.topic : '—';
  return (
    <tr>
      <td className="py-2 align-top text-slate-300 tabular-nums">{timeLabel}</td>
      <td className="py-2 align-top text-white">{actionLabel(row.action)}</td>
      <td className="py-2 align-top text-slate-200">{row.userEmail}</td>
      <td className="py-2 align-top">
        <code className="rounded bg-white/5 px-1 py-0.5 text-xs text-slate-200">{row.runId}</code>
      </td>
      <td className="py-2 align-top text-slate-300">{extra}</td>
    </tr>
  );
}

function successRateTone(runs: RunStats7d): KpiCardProps['tone'] {
  if (runs.terminalCount === 0) return 'neutral';
  if (runs.successRate >= 0.9)  return 'good';
  if (runs.successRate >= 0.7)  return 'warn';
  return 'bad';
}

/** D23 monthly cap = ¥500 = 50_000 fen. Warn at 70%, alarm at 90%. */
function spendTone(totalFen: number): KpiCardProps['tone'] {
  const cap = 50_000;
  if (totalFen >= cap * 0.9) return 'bad';
  if (totalFen >= cap * 0.7) return 'warn';
  return 'good';
}
