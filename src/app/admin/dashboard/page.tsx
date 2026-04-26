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
import Link from 'next/link';

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
  pending:   'bg-gray-100 text-gray-600',
  running:   'bg-blue-100 text-blue-700',
  done:      'bg-emerald-100 text-emerald-700',
  failed:    'bg-rose-100 text-rose-700',
  cancelled: 'bg-amber-100 text-amber-700',
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
    // Fail closed — non-admins (including signed-out, since middleware would
    // have redirected those already) get a 404 page.
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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-base font-semibold text-gray-900 hover:text-indigo-600">
              AI 内容营销工作室
            </Link>
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              运营
            </span>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">W4-07</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">运营 dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              v3 工作流近 7 天健康度 · 当月成本 ·{' '}
              <span className="text-gray-700">{user?.emailAddresses[0]?.emailAddress ?? '未知'}</span>
            </p>
          </div>
          <div className="text-right text-xs text-gray-400">
            <div>快照生成于 {generatedAtLabel}</div>
            <div>刷新重新拉取；同部署内聚合结果 60s 去重（Next 数据缓存）</div>
          </div>
        </div>

        {adminCount === 0 ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            ⚠ <code className="rounded bg-amber-100 px-1.5 py-0.5">ADMIN_USER_IDS</code>{' '}
            未配置 — 当前实例对所有登录用户开放运营 dashboard。请在 Vercel 环境变量
            或本地 <code className="rounded bg-amber-100 px-1.5 py-0.5">.env.local</code> 设置
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
        <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">近 7 天运行状态分布</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['done', 'running', 'pending', 'failed', 'cancelled'] as WorkflowStatus[]).map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[s]}`}
              >
                <span>{STATUS_LABEL[s]}</span>
                <span className="font-semibold tabular-nums">{summary.runs.byStatus[s]}</span>
              </span>
            ))}
          </div>
          {summary.runs.total === 0 ? (
            <p className="mt-4 text-xs text-gray-400">最近 7 天没有任何运行记录。</p>
          ) : null}
        </section>

        {/* Per-node latency table */}
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">近 7 天节点延迟（仅成功节点）</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="pb-2 font-medium">节点</th>
                  <th className="pb-2 font-medium tabular-nums">样本数</th>
                  <th className="pb-2 font-medium tabular-nums">平均</th>
                  <th className="pb-2 font-medium tabular-nums">P50</th>
                  <th className="pb-2 font-medium tabular-nums">P95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.latencyByNode.map((row) => (
                  <tr key={row.nodeType}>
                    <td className="py-2 font-medium text-gray-900">{NODE_LABEL[row.nodeType]}</td>
                    <td className="py-2 tabular-nums text-gray-600">{row.count.toLocaleString('zh-CN')}</td>
                    <td className="py-2 tabular-nums text-gray-700">{formatLatency(row.avgMs)}</td>
                    <td className="py-2 tabular-nums text-gray-700">{formatLatency(row.p50Ms)}</td>
                    <td className="py-2 tabular-nums text-gray-700">{formatLatency(row.p95Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            统计窗口：<code className="rounded bg-gray-100 px-1 py-0.5">completed_at &gt;= NOW() - INTERVAL &#39;7 days&#39;</code> · 状态 = done
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            合规 / 高敏操作（最近 · 最多 30 条{summary.complianceLog.length > 0 ? `，当前 ${summary.complianceLog.length}` : ''}）
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            例：为运行关闭 CAC disclosure 的导出（<code className="rounded bg-gray-100 px-0.5">export_overrides</code>）。
            无数据 = 未触发或尚未执行 <code className="rounded bg-gray-100 px-0.5">db:migrate:compliance</code>。
          </p>
          <div className="mt-4 overflow-x-auto">
            {summary.complianceLog.length === 0 ? (
              <p className="text-sm text-gray-400">暂无记录</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="pb-2 font-medium">时间</th>
                    <th className="pb-2 font-medium">操作</th>
                    <th className="pb-2 font-medium">用户</th>
                    <th className="pb-2 font-medium">Run</th>
                    <th className="pb-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.complianceLog.map((row) => (
                    <ComplianceLogRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
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
  good:    'border-emerald-200 bg-emerald-50',
  warn:    'border-amber-200 bg-amber-50',
  bad:     'border-rose-200 bg-rose-50',
  neutral: 'border-gray-200 bg-white',
};
const TONE_VALUE: Record<KpiCardProps['tone'], string> = {
  good:    'text-emerald-700',
  warn:    'text-amber-700',
  bad:     'text-rose-700',
  neutral: 'text-gray-900',
};

function KpiCard({ label, value, sub, tone }: KpiCardProps) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${TONE_RING[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${TONE_VALUE[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

// ─── Tone helpers ─────────────────────────────────────────────────────────────
// Mapping is conservative — KILL gate (W2-04) is 70% success, so anything
// below that is RED on the dashboard regardless of sample size.

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
      <td className="py-2 align-top text-gray-600 tabular-nums">{timeLabel}</td>
      <td className="py-2 align-top text-gray-900">{actionLabel(row.action)}</td>
      <td className="py-2 align-top text-gray-700">{row.userEmail}</td>
      <td className="py-2 align-top">
        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-700">{row.runId}</code>
      </td>
      <td className="py-2 align-top text-gray-600">{extra}</td>
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
