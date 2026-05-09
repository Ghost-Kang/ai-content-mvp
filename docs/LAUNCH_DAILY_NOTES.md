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

<!-- perf-auto:2026-05-09 -->
### auto-perf · 2026-05-09

- runs done: **2**
- run P50: **2m24s** ✅ (red line 7min)
- run P95: **2m32s** ✅ (red line 10min)
- per-node P50/P95: topic=1s/1s · script=39s/42s · storyboard=25s/26s · video=39s/40s · export=40s/43s
