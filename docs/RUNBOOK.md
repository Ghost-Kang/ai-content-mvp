# RUNBOOK — AI 内容营销工作室 MVP

> 单人运维场景：凌晨 3 点用户报障，第一次看这份文档的人（就是你自己，但是忘了一切）要能在 15 分钟内定位 + 处置。

**最后更新**: 2026-04-21 · **维护人**: xukang.wang@gmail.com

## 全局快捷指令

| 目标 | 命令 / 链接 |
|---|---|
| 线上日志 | `vercel logs --prod --follow` |
| 今日 LLM 花费 | Supabase SQL: `SELECT * FROM llm_spend_daily WHERE spend_date = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')` |
| 熔断器状态 | Vercel Logs 里搜 `circuit-breaker` / `All providers cooling down` |
| PostHog 错误事件 | PostHog → `LLM_ERROR` 事件 |
| 健康检查 | `curl https://<prod>/api/healthz` |
| 回滚部署 | Vercel Dashboard → Deployments → 选上一版 → Promote to Production |

---

## 场景 1：生成全部失败 · "AI 服务今日配额已用完"

### 症状
- 用户报障："所有脚本都生成失败"
- 报错 code: `LLM_SPEND_CAP_EXCEEDED`
- Vercel 日志：`SPEND_CAP_EXCEEDED`

### 诊断（2 分钟）

```sql
-- Supabase SQL Editor
SELECT tenant_id, spend_date, provider, cost_fen, call_count
FROM llm_spend_daily
WHERE spend_date = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
ORDER BY cost_fen DESC;
```

两种情况分辨：

- **globalSpentFen ≥ LLM_DAILY_CAP_CNY × 100（默认 5000 分 = 50 元）** → 全站配额满
- **某个 tenant_id 的 cost_fen ≥ LLM_TENANT_DAILY_CAP_CNY × 100（默认 500 分 = 5 元）** → 单租户配额满

### 处置

**A · 确实是被刷了 / 某个用户大量重试**：
1. 先看是不是同一个 tenant 暴涨 → 联系对方，询问是否在 loop 测试
2. 必要时在 Supabase 直接锁定：暂时用 `ALTER TABLE tenants ADD COLUMN suspended_at timestamptz` 做标记（code 侧尚未接入，需手动审）

**B · 配额设置过紧**（更常见，早期）：
1. Vercel Dashboard → Settings → Environment Variables
2. 调整 `LLM_DAILY_CAP_CNY` 或 `LLM_TENANT_DAILY_CAP_CNY`
3. **无需重新部署** —— 下一次请求读到新环境变量即可（Next.js runtime env）。如果走 build-time 注入，需 redeploy。

**C · 紧急临时放开（不推荐，风险放大）**：
```sql
-- 手动把今日花费清零 —— 只在绝对紧急时用，会导致当日预算失控
DELETE FROM llm_spend_daily WHERE spend_date = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
```

### 预防
- 每日 UTC 0 点自动重置（天然跟 Kimi 计费对齐）
- 下个迭代：接入 Slack / 邮件告警，达到 80% 配额时通知自己
- Kimi 账户充值 ≥ 200 元保底，避免 AUTH_FAILED 级联

---

## 场景 2：Kimi 大面积 RATE_LIMITED · "所有供应商都在冷却"

### 症状
- 用户报障："生成按钮卡住"
- 报错 code: `LLM_RATE_LIMITED`
- Vercel 日志：`All providers cooling down. Soonest reset: Xs`

### 诊断（1 分钟）

这是 W4-03 引入的设计行为 —— 熔断器把 RATE_LIMITED 的 provider 关闭 60 秒，等自然恢复。

**先看是"一阵风"还是"持续性"**：

```bash
# Vercel Logs 里 grep 最近 10 分钟
vercel logs --prod --since 10m | grep -E "RATE_LIMITED|cooling down"
```

- 发生频率 < 5 次/分钟 → 正常峰值，熔断器会在 60s 内自愈，**不处置**
- 发生频率 ≥ 10 次/分钟 持续 5 分钟 → 真正的容量问题，进入 B
- 熔断器一直不关闭（`All providers cooling down` 连续超过 3 分钟）→ 进入 C

### 处置

**B · 容量持续不够**：
1. 登录 moonshot.cn 查看 rpm / tpm 使用率
2. 若已达账户级上限：提交工单升级 tier，或切换到备用 provider
3. 临时方案：把 `src/lib/llm/router.ts` 的 preferredProvider 暂时改为 `openai`（需 OPENAI_API_KEY 可用）

**C · 熔断器卡死（bug）**：
1. 这不应该发生 —— 60s timeout 是自动重置
2. 紧急热修：redeploy（Vercel Dashboard → Redeploy）会重置进程内状态
3. 根本修复：检查 `src/lib/llm/circuit-breaker.ts` 的 `msUntilReset()` 和 state 转换是否有 race

### 预防
- 生产环境至少配置 2 个 provider 有有效 key（Kimi 主 + Qwen/Ernie 备）
- Audit 脚本间隔至少 2s（已在 `scripts/audit-20-samples.ts` 设置）

---

## 场景 3：数据库连接异常 / 迁移失败

### 症状
- 所有 API 500，报错关键词：`connect ETIMEDOUT`、`too many connections`、`relation ".*" does not exist`
- `/api/healthz` 返回非 200
- Supabase Dashboard 显示 paused / down

### 诊断（3 分钟）

**按日志关键词分类**：

| 关键词 | 含义 | 去哪看 |
|---|---|---|
| `connect ETIMEDOUT` / `ENOTFOUND` | Supabase 网络或 DNS 故障 | status.supabase.com |
| `password authentication failed` | DATABASE_URL 配置错误或 Supabase rotate 了密码 | Vercel env + Supabase Settings → Database |
| `too many connections` | 连接池耗尽（max_connections 默认 60） | Supabase Dashboard → Database → Connections |
| `relation "xxx" does not exist` | 迁移没跑或跑到了错的环境 | `SELECT tablename FROM pg_tables WHERE schemaname='public'` |

### 处置

**A · Supabase 侧故障**：
- 等 —— status.supabase.com 看 ETA
- 如果超过 10 分钟无更新，在 app 侧给用户挂一个 maintenance 横幅（改 landing page 部署一次静态提示）

**B · 密码 rotated 或 DATABASE_URL 错误**：
1. Supabase → Settings → Database → 新的 connection string（勾选 "pooler"）
2. Vercel → Environment Variables → 更新 `DATABASE_URL`（3 个环境都更新）
3. Redeploy

**C · 连接池耗尽**：
1. 临时：Supabase Dashboard → kill 掉 idle > 30min 的连接
2. 根本：代码用 `postgres({ max: 1 })` 已经是 singleton，通常不会耗尽 —— 如果出现，排查是否有 cron 脚本没 `.end()`

**D · 表不存在**（生产环境）：
1. 先确认是不是连错了数据库（env 的 DATABASE_URL 指向是否正确）
2. 若确实漏跑迁移：
```bash
# 本地有 .env.production.local 的情况
pnpm tsx --env-file=.env.production.local scripts/migrate-add-llm-spend.ts
```
⚠️ **生产迁移前**：先 Supabase Dashboard → Database → Backups → 手动 snapshot

### 预防
- 每周日 UTC 0 点由 Supabase 自动备份（Free 保留 7 天）
- 部署前 checklist：新的迁移文件必须已经在 staging 环境跑过
- DATABASE_URL 变更后立即 `curl /api/healthz` 验证

---

## 应急联系 / 升级路径

| 故障 | 第一步 | 升级 |
|---|---|---|
| Supabase 宕机 | status.supabase.com | Supabase support (付费计划才有 SLA) |
| Kimi 大面积失败 | moonshot.cn console | 工单 |
| Vercel 部署失败 | Vercel Dashboard Deploy Logs | Vercel support |
| Clerk 登录全挂 | status.clerk.com | Clerk support |

## 每次事件后

写一行到 `DECISIONS_LOG.md` 的事件段（手动维护）：
```
YYYY-MM-DD HH:mm 事件：<一句话> · 根因：<一句话> · 耗时：<N 分钟>
```

这不是完美 postmortem —— 单人运维要的是一页能快速翻的流水账，未来找模式用。
