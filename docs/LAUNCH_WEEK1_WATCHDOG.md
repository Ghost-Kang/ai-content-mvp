# LAUNCH 第一周 Watchdog 备忘（2026-05-15 → 2026-05-22）

> 因 PostHog 服务端在 launch 周降级（`ANALYTICS_DISABLED=1`，详见 `DECISIONS_LOG.md` 2026-05-06 PostHog 段），第一周运营数据全部直接走 Supabase + Vercel Logs。这份备忘把"看哪里、看什么、什么算异常"压成一份。

---

## 速查命令

```bash
# 1) 单 run 端到端 lifecycle（节点耗时 / cost / 来源）
pnpm tsx --env-file=.env.local scripts/probe-run.ts <runId>

# 2) prod 实时 worker 日志（含 fallback / spend cap warn / video continuation）
vercel logs --prod --follow

# 3) 健康检查（Supabase / Redis / QStash / PostHog 配置层 — 不验证事件真发）
curl https://ai-create-content.herwin.top/api/healthz

# 4) LLM 费用日聚合
pnpm tsx --env-file=.env.local scripts/probe-spend-table.ts

# 5) CN reachability 探测（境内 POP 跑，详见 OBSERVABILITY_CN.md）
PROBE_BASE_URL=https://ai-create-content.herwin.top pnpm probe:public
```

---

## 第一周关注的 7 个指标

直接 SQL Supabase（在 `app/.env.local` 的 `DATABASE_URL` 上跑 `psql`）。

### A. 漏斗（替代 PostHog session→export）

```sql
-- 每天注册的 tenant 数（=「 session_started」近似）
SELECT date_trunc('day', created_at) AS d, COUNT(*) AS tenants
FROM tenants WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1;

-- 每天起 run 数 + done / failed 分布
SELECT date_trunc('day', created_at) AS d, status, COUNT(*) AS n
FROM workflow_runs WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2 ORDER BY 1, 2;

-- run 端到端时长 P50/P95（done 分布）
SELECT
  PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)))::int AS p50_sec,
  PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)))::int AS p95_sec
FROM workflow_runs WHERE status = 'done' AND created_at >= NOW() - INTERVAL '7 days';
```

### B-pre. 当前 cap 配置（2026-05-07 上调后）

LLM 日 cap（防刷）：
- **per-tenant**: `LLM_TENANT_DAILY_CAP_CNY=20`（¥20/天/用户）
- **global**: `LLM_DAILY_CAP_CNY=100`（¥100/天）

工作流月 cap（防爆）：
- **video count**: `WORKFLOW_MONTHLY_VIDEO_CAP_COUNT=300`（300 clips/月/用户，~17 次完整 17 帧 run）
- **monthly cost**: `WORKFLOW_MONTHLY_COST_CAP_CNY=500`（默认未变，D23 ARPU margin 上限）

**抽查命令**：
```bash
# 主动告警（每天起床前手跑 1 次；exit 1 = 有 ALERT）
pnpm cap:watch
pnpm cap:watch --json    # 接 cron / webhook 用

# 原始数据（cap-watch 命中 ALERT 时往下挖）
pnpm tsx --env-file=.env.local scripts/probe-spend-table.ts     # 当日 LLM
pnpm tsx --env-file=.env.local scripts/probe-monthly-usage.ts   # 本月 video/cost
```

**`cap:watch` 单一职责**：把下面表格里的阈值变成可执行的 OK/ALERT 行。修阈值改 `scripts/cap-watch.ts` 顶部 `THRESHOLDS`（同时改这里表格保持单一来源）。

**告警阈值**：
- 任一 tenant 单日 LLM > ¥10 → ping 用户问是否在 loop 测试
- 任一 tenant 单月 video > 200 → 评估 cap 上调或催 paid plan
- 任一 tenant 单月 cost > ¥400 → 立即审查（接近 ¥500 红线）
- global LLM 单日 > ¥80 → 评估是否 fallback 死循环（看 vercel logs `circuit-breaker`）
- **接近 cap 不要直接调高**——先看是不是 bug（重试风暴 / 死循环），再调

### B. 成本（替代 PostHog cost prop）

```sql
-- 每日 LLM 花费 + provider 分布（验证 100% kimi）
SELECT spend_date, provider, SUM(cost_fen) AS fen, SUM(call_count) AS calls
FROM llm_spend_daily WHERE spend_date >= (CURRENT_DATE - INTERVAL '7 days')::text
GROUP BY 1, 2 ORDER BY 1 DESC, 2;

-- 单 run 平均 cost（含 LLM + Seedance video）
SELECT date_trunc('day', created_at) AS d,
       AVG(total_cost_fen)::int AS avg_fen,
       MAX(total_cost_fen) AS max_fen
FROM workflow_runs WHERE status = 'done'
GROUP BY 1 ORDER BY 1;
```

### C. 节点级稳定性（替代 PostHog event property breakdown）

```sql
-- 每个节点的失败率
SELECT node_type,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COUNT(*) AS total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 2) AS fail_pct
FROM workflow_steps
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY fail_pct DESC NULLS LAST;
```

---

## ⚠️ 已知性能/账面观察（launch 前发现，非阻塞）

### 1. storyboard → video 启动 gap ≈ 3 分 35 秒

- **现象**：跑 `probe-run.ts <doneRunId>`，看 `workflow_steps`：storyboard `completed_at` 与 video `started_at` 之间有 ~3-4 分钟空窗。video 自身只跑 ~43s。
- **猜测根因**：QStash dispatch 接力 + Vercel function 冷启动 + 首次 Seedance 任务排队。
- **不在 launch 阻塞清单**：用户感知是"等待 6 分钟出 17 段视频"，已在 SLA 内（< 12 min）。
- **观察阈值**：第一周 P50 不应超过 4 min；**P50 > 5 min 则启动诊断**（开 ticket：`PERF: storyboard→video gap`）。
- **诊断工具**：`vercel logs --prod --follow` 在 storyboard done 后看 dispatch / worker 启动间隔。

### 2.5 storyboard 镜头语言多样性 < 5 种

- **现象**：移动端真机测 run（topic = 京藏高速半挂车司机故事，17 帧）时，`StoryboardFrameEditor` 顶部 stats 显示 "镜头语言仅 3 种 (建议 ≥5)"（amber 警告）。
- **根因猜测**：storyboard prompt（`src/lib/prompts/storyboard-prompt.ts`）虽然要求 ≥5 种镜头语言（v2 prompt 硬规则），但 LLM 在窄主题（车祸救援故事场景单一）下会反复用 全景 / 中景 / 特写 三种。
- **launch 周影响**：用户感知是"画面单调"，但流程能跑完。Solo Review 5 项 checkbox 的"镜头语言多样性"项给用户机会编辑分镜（已经做了，UX 在 watchdog 范围）。
- **观察方式**：每周抽 5 个 done run 跑 `pnpm tsx --env-file=.env.local scripts/probe-run.ts <runId>` 后看 storyboard step output_json，统计 cameraLanguage 唯一值数。 < 4 种 占比 > 30% → ticket。
- **不在 launch 阻塞清单**：amber 警告而非 error，UX 给了编辑入口，不影响导出。

### 3. `llm_spend_daily` ≠ run total cost

- **现象**：单 run `total_cost_fen` 包含 LLM + Seedance video，但 `llm_spend_daily` 只跟 LLM 调用。例如 17 段 run 的 LLM = ¥1.78，video（Seedance）= ¥7.91，合计 ¥7.91+ 才是用户付的。
- **结果**：跨表对账时不要把 `llm_spend_daily` 当总账。月度 cap 算的是 `tenants_monthly_usage`（同时累加 LLM + video），不是 `llm_spend_daily`。
- **launch 周影响**：用 `workflow_runs.total_cost_fen` 做月预算估算；`llm_spend_daily` 只看 LLM provider 分布（CN 合规审计）。
- **后续**：W5+1 加一个 `seedance_spend_daily` 表，对称设计，做端到端账面分离。

---

## 紧急升级路径（参考 RUNBOOK.md）

| 症状 | 第一处置 | 升级 |
|------|---------|------|
| Vercel logs 大量 `LLM_SPEND_CAP_EXCEEDED` | RUNBOOK 场景 1（cap 调整 + 看 tenant） | 用户微信通知 |
| video 节点 P50 > 5 min | 看 `vercel logs` worker 是否被 SIGKILL；查 `WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION` 是否合理 | 临时降并发到 1 + redeploy |
| run 大批 `failed` (> 10%) | `probe-run.ts` 抽样看 `error_msg`；区分 LLM_FATAL / PROVIDER_FAILED / VALIDATION_FAILED | 回滚到上版 prod |
| 任意 healthz 项 fail | 对应依赖（Supabase / Redis / QStash）厂商面板 | 用户微信通知 + 公告 |

---

## W5+1 路线（launch 后 1 周内必做）

1. **境内 PostHog 实例**（Aliyun ECS 自建 / Tencent CloudPosthog 候选） → 改 prod env `POSTHOG_HOST` + 删 `ANALYTICS_DISABLED` → 重启 4 事件验证 SOP
2. **`seedance_spend_daily` 对称表** + 月对账脚本
3. **storyboard→video gap 优化**：worker 预热 / dispatch 链优化（如果 launch 周观察到 P50 > 4 min）
