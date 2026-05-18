# LAUNCH 周日记（2026-05-08 → 2026-05-22）

> 每天 22:00 ± 30 分钟花 10 分钟填一段。Launch 后做复盘 + W5+1 路线打磨用。
>
> **格式**：每天一段；指标抄自 `pnpm cap:watch` 输出 + Supabase 直查；事件指向 GitHub Issues / DECISIONS_LOG 链接。
>
> **铁律**：填空白比填漂亮重要；当天没事就写 "uneventful"。

---

## 模板（复制即用）

```markdown
### 2026-05-XX（周X）

**今日指标**（`pnpm cap:watch` 22:00 抽样）：
- 全站 LLM 今日 ¥X.XX / ¥100 cap
- 当月 video 总：XX clips / 300×N tenants
- 当月 cost 总：¥XX.XX / ¥500×N tenants
- ALERT 数：N（细节见下）

**Run 总览**（Supabase `SELECT count(*), status FROM workflow_runs WHERE created_at::date = CURRENT_DATE GROUP BY status`）：
- done: N · failed: N · pending: N · cancelled: N
- 端到端 P50: XXX 秒 · P95: XXX 秒

**Seed user 反馈**（微信群）：
- 用户 A: "..."
- 用户 B: "..."
- （没反馈就写 "今日 0 反馈"）

**新建 GitHub Issues**：
- #N: 标题 — `bug` / `enhancement` / `launch-week`
- ...

**事件流水**（追加至 `DECISIONS_LOG.md` 运维事件流水段）：
- 23:14 cap-watch 触发 video amber → 调高 N → 处置 X 分钟

**明日计划**：
- ☐ ...

**情绪温度**（自评 0-10，10 = 兴奋顺利）：N
```

---

## 实战开始

<!-- 用上面模板从 5-08 起每天追加一段 -->
<!-- `pnpm perf:snapshot` 也会每天自动 append 一个 auto-perf 块（标记 perf-auto:YYYY-MM-DD），同名标记当天只 append 一次。手工模板和 auto-perf 互不冲突。 -->
<!-- 5 日聚合后：`awk -F, 'NR>1' docs/perf-snapshots.csv | tail -5` 看 P50/P95 趋势。 -->

### 2026-05-07（周三 / SEED 内测开放日）

**今日指标**（开放前最后一次 cap-watch 22:00 baseline）：
- 全站 LLM 今日 ¥12.18 / ¥100 cap（你 + 2 测试 tenant）
- 当月 video 总：153 clips / 900（3 tenants × 300 cap）
- 当月 cost 总：¥73.62 / ¥1500（3 tenants × ¥500）
- ALERT 数：0

**Run 总览**（5-07 全天，预内测）：
- done 多笔（你自测 + iOS Safari + Android）；端到端 4-6 min
- 0 failed

**Seed user 反馈**：未发出（晚上发邀请）

**新建 GitHub Issues**：（待开）
- 待开 W5+1 #1: tenant 合并工具（同人多邮箱注册）
- 待开 W5+1 #2: 境内 PostHog 自建
- 待开 W5+1 #3: seedance_spend_daily 对称表
- 待开 W5+1 #4: storyboard→video 启动 gap 优化（如 P50 > 4min）

**事件流水**（已记 DECISIONS_LOG）：
- 20:43 LLM cap 上调 ¥5→¥20 / ¥50→¥100
- 21:00 月度 video cap 上调 60→300
- 22:30 Android landing bg-clip-text bug 发现 + 修复（5af68c4）

**明日计划**：
- ☐ 起床先跑 `pnpm cap:watch`
- ☐ 微信群关注 seed user 第一波反馈
- ☐ Vercel logs `--follow` 至少看一段
- ☐ 任何 ALERT / failed run 立即写进流水段

**情绪温度**：8（闸门全关 + 工具到位，等真用户）

---

### 2026-05-08（周五 / T-7 启动前夜）

**今日指标**（22:00 三件套待跑后回填）：
- 全站 LLM 今日 ¥— / ¥100 cap
- 当月 video 总：— clips / 900
- 当月 cost 总：¥— / ¥1500
- ALERT 数：—

**Run 总览**：22:00 后回填

**Seed user 反馈**：今日 0 主动反馈（D-5 周一才主动 ping）

**今日 commits**（`git log --oneline 5a3a607..e830575` 7 个）：
- `9ab1160` fix(middleware): Clerk bypass `/api/admin/watchdog`（cron 401 修复）
- `0e6a5ce` fix(llm): `requireEnv` → `ProviderConfigError`（错误归类）
- `711d467` perf(script): `MAX_LLM_RETRIES 3→2` + 90s provider timeout（P95 -60s 预计）
- `7add477` docs(launch): happy path 红线 <5min → P50<7/P95<10min
- `c7247b4` ops(launch): `perf:snapshot` 每日 P50/P95 收集器
- `8f5f44a` docs(launch): T-7 倒计时 + deepseek-as-primary canary research
- `e830575` chore(brand): "AI 视频创作平台" + always-visible mobile header

**事件流水**：
- 上午：发现 cursor 在 working tree 改了 21 个文件（品牌改名 + Android 渐变策略反转），评估发现"max-sm 实色回退"会回退已验证的 5af68c4
- cursor 改动被外部 `git restore` 撤回 → 选 1+3 路径：从中筛安全增益（品牌改名 + 移动端 header 始终可见）单独 re-apply 成 `e830575`；5af68c4 inline-style 完整保留
- `e830575` 三层回归：tsc clean / vitest 107 green / 真机 UI 通过
- 7 个 commits push 到 `origin/main`（`5a3a607..e830575`）

**新建 GitHub Issues**：今日 0 新增

**明日计划**（D-7 周六 5/9，per `LAUNCH_T_MINUS_7.md`）：
- ☐ `vercel env add DEEPSEEK_API_KEY production` → `sk-fdf02019...`
- ☐ `vercel env add LLM_PROVIDER_TIMEOUT_MS production` → `90000`
- ☐ `vercel env add CRON_SECRET production` → `421bc928...`
- ☐ `vercel deploy --prod`（激活新 env）
- ☐ `curl /api/healthz` 200 + `curl -H "Authorization: Bearer <CRON_SECRET>" /api/admin/watchdog` 200+JSON
- ☐ 微信主动联系 tenant `1985b6c6`（昨天 LLM 失败的 seed user）
- ☐ 跑 `probe-fb5632a7-video.ts` 看 0-videos 异常
- ☐ 22:00 三件套（`cap:watch` / `prod:today` / `perf:snapshot`）

**情绪温度**：—（22:00 回填）

---

### 2026-05-09（周六 / T-7 D-7）

**今日指标**（22:00 三件套待跑后回填）：
- 全站 LLM 今日 ¥— / ¥100 cap（11:00 抽样 Kimi 38 calls / ¥19.12 / 94k tokens）
- 当月 video 总：— clips / 900
- 当月 cost 总：¥— / ¥1500
- ALERT 数：—

**Run 总览**（CN 时间，`prod:today` 11:00 抽样）：
- done: 2 · failed: 2（video step `AUTH_FAILED: Seedance overdue balance`）
- 红线（per-node 求和算法）：P50 2m24s ✅ / P95 2m32s ✅（脚本 fix 后真实数字）

**Seed user 反馈**：今日 0 主动反馈（D-5 周一主动 ping）

**今日 commits**（`git log --oneline 756a3eb..1af2a6b`，4 个）：
- `07e968c` fix(perf): 红线排除 Solo Review 等待时间 — `measure-happy-path.ts` 用 wall time 是 bug（与 LAUNCH_CHECKLIST §74 表格对不上），改 per-node 百分位求和
- `d338125` fix(workflow): hydrate-skip 路径漏加 videoCount + 5 个 vitest case（baseline 107→112）
- `5c880d1` fix(trending): unstable_cache 缓存 soft-error 12h 锁全员事故 — 改 throw-bypass-cache + 加 `/api/admin/revalidate-trending`
- `1af2a6b` ops(backfill): 修 5 个 hydrate bug 受害 run（5/6-5/9 期间每天 1 个 17 帧 happy path），共补 85 帧 / ¥41.13

**事件流水**（按时间顺序）：
- ~12:30 CN：内测 2 个 run video step 全失败，error_msg 实锤 Seedance 账户欠费（request id 已记） → 已充值
- 16:00：发现 `perf:snapshot` 用 `completed_at - created_at` 算红线（含 Solo Review 用户审稿等待），实际数字 12m37s/18m10s 双红，spec 红线本意是"auto step 时间" → 改 per-node 求和后真实数字 2m24s/2m32s 双绿
- 16:30：发现 `orchestrator.ts:200` hydrate-and-skip 分支只 re-accrue costFen 没加 videoCount → 抽 `hydratedVideoCount` 纯函数 + 5 个边界 case 单测
- 23:15：内测截图 prod `/topics` 显示 DY `PROVIDER_UNAVAILABLE: Network error: fetch failed`，本地 `probe-newrank.ts` 验证 NewRank 健康 → 锁定 `unstable_cache` 把 soft-error 当正常 payload memo 12h，Next.js Data Cache 跨 deployment 共享，redeploy 不清。改 throw-bypass-cache（unstable_cache 不 memo 抛出值）+ 加 `/api/admin/revalidate-trending`，curl 清坏 cache，DY 立即恢复（4 平台全 render）
- 23:45：`probe-fb5632a7-video.ts` 实证 0-videos 异常 = 同一个 hydrate bug 表现（cost 累加正确、count 锁 0、frames=17）。audit 全表共 5 行受害，写 `scripts/backfill-video-count.ts`（dry-run 默认、`--apply` 写、三层守门、RETURNING 审计、幂等可重跑），apply 完二次 dry-run 0 行确认

**新建 GitHub Issues**：今日 0 新增（ops 类全部直接 commit）

**Ops 配置变更**：
- 远程 `claude.ai/code/routines` 上一度建过 P95 routine `trig_012aG44cnQ9pRvm7aEqHswvX`（已 disable）—— 远程 agent 没法读 `.env.local` 的 `DATABASE_URL`，路径走不通
- 改走本地 `~/Library/LaunchAgents/com.kang.aimvp.p95-snapshot.plist`，每日本地 22:00 自动跑 `perf:snapshot`，烟囱测过 exit=0
- 新增常驻 prod 路由 `/api/admin/revalidate-trending`，CRON_SECRET bearer，下次缓存中毒一行 curl 清掉

**明日计划**（D-6 周日 5/10，per `LAUNCH_T_MINUS_7.md`）：
- ☐ **UI 浏览器手测 cascade 修复**（本周唯一窗口）— 真实 run → 改 storyboard 1 帧 → 验证 video 重跑拿到不同 URL；顺手 EditNodeDialog 折叠 / 跳转工具栏 / Esc
- ☐ 22:00 三件套（`cap:watch` 手动 / `prod:today` 手动 / `perf:snapshot` 已 launchd 自动）

**情绪温度**：—（22:00 回填）

<!-- perf-auto:2026-05-09 -->
### auto-perf · 2026-05-09

- runs done: **2**
- run P50: **2m24s** ✅ (red line 7min)
- run P95: **2m32s** ✅ (red line 10min)
- per-node P50/P95: topic=1s/1s · script=39s/42s · storyboard=25s/26s · video=39s/40s · export=40s/43s

---

### 2026-05-10 → 2026-05-16（八天 Ops 真空 — 用户自填）

> 这八天 daily notes 空白属实。git log 0 commits / 0 deploy / launchd P95 cron 全挂 / perf-snapshots.csv 不增长。下次 resume 时回忆这八天到底做了什么（线下出差？病？休整？seed user 一对一未记录？）补一行。

---

### 2026-05-17（周六 / Launch +2）

**指标**（22:00 三件套真数据，今晚 1 次手动跑 + DB 直查补做）：
- 全站 LLM 今日 ¥0.00 / ¥100 cap
- 当月 video 总：459 clips / 1800 (6 tenants × 300 cap)
- 当月 cost 总：¥217.82 / ¥3000 (6 tenants × ¥500)
- ALERT 数：1（tenant `9f5d137c` 当月 204 clips / amber 200，未处置）

**Run 总览**（CN time 今天）：
- done: 0 · failed: 0 · pending: 0
- 端到端 P50/P95: 无样本

**14d 流量盘点**（今天补做的 DB 实证）：
- 注册：5/07-09 共 7 个 seed tenant；5/10 起 8 天 0 新注册
- 14d 范围最后 5 个 run 全部来自 `9f5d137c`；其余 6 个 tenant 0 行动
- Launch day (5/15) 唯一 run = failed (export timeout)
- 5/16 / 5/17 = 0 run
- 9 个 orphan pending run（tenant `2cdbc44f`，4/24-5/06 卡至今 11-23 天）
- 节点 14d 失败率：video 12.5% (4/32) · export 10.7% (3/28) · storyboard 8.6% (3/35) · script 7.9% (3/38) · topic 0%

**5/15 export timeout 诊断 + fix**（已完成 + 已 deploy）：
- run `e0aad73d`，前 4 节点 done，export 卡 61s 报 PROVIDER_FAILED
- 根因：`WORKFLOW_EXPORT_NODE_TIMEOUT_MS` 默认 60_000 仅给 P95(43s) 1.4× headroom
- 副发现：bundle retry 内部需 80s+ 不可能在 60s 内完成 → retry 路径从未跑通
- 修复 commit `0dfbe92`：
  - `node-runner.ts` 默认值 60_000 → 180_000（给 P95 4.2× headroom）
  - `export.ts` 加 `[export] runId/frames/build/upload/compressed` timing log
  - 顺便修 `probe-today.ts` 列名 `day_cn` → `spend_date::text`（8 天炸 SQL 无人发现）
- 回归：tsc clean / vitest 112/112 / 已 push origin main → Vercel auto-deploy

**Ops 真空缺口**（自评诚实）：
- launchd P95 cron 5/10-5/16 连挂 8 天（DNS 劫持 198.18.x.x），今天发现
- LAUNCH_DAILY_NOTES.md 5/9 那条本身就是 unstaged，5/10-5/16 完全没动笔
- D-7 (5/9) 计划的 Vercel env 三件**实际做了**（CRON_SECRET / DEEPSEEK_API_KEY / LLM_PROVIDER_TIMEOUT_MS 在 5/5-5/7 加好），但 daily notes 没记 → 误判 8 天

**Seed user 反馈**：
- 7 个里 6 个 14d 内 0 run
- `9f5d137c` 一个人月内 12 次完整 run 单点撑流量；5/15 撞 export bug 后停手
- 真实 outreach 记录在哪？（如果有线下/微信跟进，请补记忆）

**新建 GitHub Issues**：
- 待开 P1: `9 个 orphan pending run 清理脚本`（tenant 2cdbc44f）
- 待开 P2: `9f5d137c amber 204 clips` 决策（raise cap / 推付费 / 等月底归零）
- 待开 P2: launchd P95 cron 加 DNS preflight + 自我自愈

**明日计划**：
- ☐ 验今晚 deploy `0dfbe92` 健康 + 用 `9f5d137c` topic 复跑一次 happy path 验 export bug 修好
- ☐ 关 VPN / TUN 后 kickstart launchd P95 cron 验 exit=0
- ☐ Ping 6 个 quiet seed tenant 之一（建议 `ccd8aeba` 136 clips 已用，最有可能恢复）
- ☐ 补 5/10-5/16 真实记忆

**情绪温度**：—（回填）

