# LAUNCH CHECKLIST — W4-06 自审闸门

> **规则**：任何一项不确定 = NEEDS WORK，默认阻塞发布。证据优于说辞。
> **目标发布日**：2026-05-15 Friday
> **自审人**：xukang.wang@gmail.com
> **最后更新**：2026-04-21

## 状态总览

| 区块 | 项 | 通过 | 待验 | 阻塞 |
|---|---|---|---|---|
| 合规 | 4 | 1 | 3 | 0 |
| 功能 | 4 | 3 | 1 | 0 |
| 运营 | 4 | 2 | 2 | 0 |
| 可维护 | 3 | 3 | 0 | 0 |
| **合计** | **15** | **9** | **6** | **0** |

**当前结论**：🟡 **NEEDS WORK** · 6 项待手动验证（自动化部分已完成）

---

## 合规（4 项）

### [x] CAC 标签 100% 出现在抖音导出（10 样本人工核验）

- **状态**：✅ 通过（2026-05-06，10/10 自动化矩阵替代手工 10 样本）
- **怎么验**：`pnpm wf:test:export:bundle` → case 9 跑 10 个 fixture（不同 frameCount 1/2/3/4/5/6/8/10/12/17、不同 perFrameDuration 2.5/3/3.5/4/5/12s、中英混合 topic、含/不含 onScreenText）。
- **每条样本断言三层**：
  1. `script.txt` 末行含 `本内容由 AI 辅助生成`（W3-03 watermark）
  2. `subtitles/disclosure.srt` 存在 / 含 `本视频由 AI 辅助生成` / 起 `00:00:00,000` / 结束时间码 ±0.5s 内覆盖整片
  3. `README.md` 引用 `subtitles/disclosure.srt` 且含"AI 生成"提示
- **证据**：`scripts/test-export-bundle.ts:case9CacComplianceMatrix` · 跑出 `compliance pass-rate = 10/10` ✓
- **优势**：参数空间枚举（不是采样），CI 每次 push 都跑，比手工 10 次 quick-create 覆盖更全更稳。

### [x] 《数据安全法》：CN 用户走 Kimi

- **状态**：✅ 通过（2026-05-06，自动化测试覆盖）
- **证据**：`src/lib/llm/router.test.ts` — 6 个 case 全过：
  1. CN strategy chain 无 openai/anthropic ✓
  2. CN draft chain 无 openai/anthropic ✓
  3. CN channel_adapt chain 无 openai/anthropic ✓
  4. CN diff_annotate chain 无 openai/anthropic ✓
  5. CN draft chain 起始 `kimi` 且含 qwen + ernie ✓
  6. CN 区域下用户传 `preferredProvider: 'openai'` 会被静默丢弃，链头仍是 kimi ✓
- **跑法**：`pnpm test`（router 测试在 11 文件 91 测试中，每次 push 都跑）
- **生产侧实证**（2026-05-06 抽样 `pnpm tsx --env-file=.env.local scripts/probe-spend-table.ts`）：`llm_spend_daily` 表 11 行真实记录，跨 2026-04-30 → 2026-05-06 五天，**provider 100% 是 `kimi`**，0 行 openai / anthropic / 其它跨境 provider。等于"CN 路由"在 prod 实测了 5 天 + 11 笔调用全部走 Kimi，一票通过。

### [x] 《个人信息保护法》：注册页数据使用告知

- **状态**：✅ 通过（2026-05-06 验证）
- **证据**：
  - **sign-up 完整版** `src/app/sign-up/[[...sign-up]]/page.tsx:102` 渲染 `<PiplNotice variant="signup" />` — 4 项告知（收什么 / 用于什么 / 存哪 / 用户权利）+ 引用《个人信息保护法》《数据安全法》
  - **sign-in 精简版** `src/app/sign-in/[[...sign-in]]/page.tsx:102` 渲染告知 + "完整声明 →" 链接回 sign-up 完整版
  - 内容覆盖 LAUNCH_CHECKLIST 原要求并扩充：登录邮箱用途 / 创作内容境内 Supabase 加密存储 / CN 国内大模型不出境 / 删号路径
- **prod URL**：`https://ai-create-content.herwin.top/sign-up`

### [x] 跨租户探针测试（app 层隔离，RLS 已知 gap）

- **状态**：✅ 通过（2026-04-21 自动化验证）
- **怎么验**：`pnpm tsx --env-file=.env.local scripts/probe-tenant-isolation.ts`
- **证据**：
  - 测试 1：无 tenant_id 过滤时 DB 返回对方数据（符合预期 —— RLS 未开启，依赖 app 层）
  - 测试 2：B 用自己 tenant_id 查 A 的 session → 返回 0 行 ✅
  - 测试 3：B 查自己的 session → 返回 1 行 ✅
  - 测试 4b：tRPC 完整路径被第一步 session 查询拦截
- **known gap**：Drizzle 连接用 postgres 超级用户，RLS 不强制。真实保护在 app 层每个路由的 `eq(X.tenantId, ctx.tenantId)`。已在 `context.ts` 注释记录。

---

## 功能（4 项）

### [ ] Happy path E2E：Signup → Quick Create → Script → Review → Export < 5 分钟

- **状态**：待验 · 各环节单独测过，未做端到端计时
- **怎么验**：录屏一遍，秒表记录，报告在此

### [ ] Solo review 5 项 checkbox 全勾才 Approve

- **状态**：✅ 通过（W3-01 完成）
- **证据**：`src/components/review/SoloReviewGate.tsx` + Task #26

### [x] 20 样本审计字数合规 ≥ 45%（降级版 + 产品层兜底）

- **状态**：✅ 通过（按降级判据，签字 2026-05-06）
- **签字**：`docs/DECISIONS_LOG.md` Launch overlay 段「2026-05-06 字数合规判据降级 — 45% + 产品层兜底」by xukang.wang@gmail.com · 2026-05-06。
- **降级理由**（详见 DECISIONS_LOG）：
  - 人工复审 UX 本来就假设用户微调字数
  - W4-04 字数漂移引导条 + Solo Review 5 项 checkbox 双重兜底
  - prompt 调优 v3 → v4 持平，ROI 为负
- **后置监控**：PostHog 上 `script_approved` 与 `script_generated` 间隔，P50 > 5 min 即重启 prompt 调优
- **证据**：`docs/audit-report-2026-04-21-v4.md` 45% 实测

### [x] 抑制词 scanner 对 D7 清单 100% 捕获（10 正例测试）

- **状态**：✅ 通过（2026-04-21 自动化验证）
- **怎么验**：`pnpm tsx scripts/test-suppression-scanner.ts`
- **证据**：10/10 通过，覆盖 8 个类别（hollow_opener / ai_tell_adjective / uniform_positive / false_claim / hype_superlative / hollow_closer / empty_connective / symmetric_list）
- **副产**：修复了 symmetric_list 正则贪婪 bug（之前真实 3 点列表根本不触发）

---

## 运营（4 项）

### [x] LLM spend cap 上线（per-session + daily global）

- **状态**：✅ 通过（Task #31 · W4-01）
- **证据**：
  - `src/lib/llm/spend-tracker.ts` · `checkSpendCap` + `recordSpend`
  - `scripts/migrate-add-llm-spend.ts` 已跑 Supabase
  - `src/lib/llm/fallback.ts` 在 provider 链前做 gate

### [x] Runbook 3 场景

- **状态**：✅ 通过（Task #33 · W4-02）
- **证据**：`RUNBOOK.md`

### [~] PostHog 4 事件发火（**降级：launch 第一周关闭，W5+1 启用境内 PostHog**）

- **状态**：⚠️ 降级签字（2026-05-06，详见 `docs/DECISIONS_LOG.md` Launch overlay 段「2026-05-06 PostHog 暂关」）
- **背景**：4 个事件代码接线已完成（`src/lib/analytics/server.ts`），但 `assertCnAnalyticsCompliance` CN gate + 当前 PostHog Cloud (`us.i.posthog.com`) 不在白名单 → CN 区域事件被静默丢弃。
- **临时处置**：Vercel Production 加 `ANALYTICS_DISABLED=1`，escape hatch 见 `analytics/server.ts:26-29`。Launch 第一周用 Vercel Logs / Supabase `workflow_runs` / `llm_spend_daily` 直接看运营数据。
- **后续**：W5+1（launch 后 1 周内）启用境内 PostHog（自建于 Aliyun/Tencent）或换合规中转，重新打开 SOP `docs/LAUNCH_VALIDATION_SOP.md` #3 验证 4 事件落表。

### [ ] 3 种子用户邀请发出

- **状态**：待发 · 邀请模板已准备（`SEED_USER_INVITATION.md`）
- **怎么做**：按模板选 3 人 → 发 → 表格填入日期
- **不要**：跳过这步直接发布 —— 前 3 周反馈窗口是最关键的校准

---

## 可维护（3 项）

### [x] .env.local.template 齐全

- **状态**：✅ 通过（2026-04-21）
- **证据**：`comm -23 <(grep -E '^[A-Z_]+=' .env.local | cut -d= -f1 | sort -u) <(grep -E '^[A-Z_]+=' .env.local.template | cut -d= -f1 | sort -u)` 输出为空
- **补充**：W4-01 新增 LLM_DAILY_CAP_CNY / LLM_TENANT_DAILY_CAP_CNY / LLM_COST_PER_1K_FEN_* 已写入 template

### [x] README local dev 步骤

- **状态**：✅ 通过（2026-04-21）
- **证据**：`app/README.md` 已重写，含前置 / 启动 4 步 / 常用命令 / 目录结构 / 安全模型 / 部署 / 故障处置链接

### [x] LLM prompts 集中在 `/lib/prompts/`

- **状态**：✅ 通过（2026-04-21）
- **证据**：`grep -r "你是.*专家" src/` 仅命中 `src/lib/prompts/script-templates.ts` 与 `src/lib/prompts/suppression.ts`；`content.ts` 只消费 buildScriptPrompt() 返回值

---

## 发布前 24 小时 checklist

发布日（2026-05-15 Friday）前一天：

- [ ] 所有 15 项 ✅ 或显式降级签字
- [ ] 本地跑一遍 E2E happy path 录屏
- [ ] Vercel production 部署最新 main，`/api/healthz` 200
- [ ] Supabase `llm_spend_daily` 表存在
- [ ] `.env.local` 与 Vercel env 同步（`/env diff`）
- [ ] 3 种子用户邀请已发出 ≥ 72 小时
- [ ] 自己手机开通微信推送 —— 发布后第一批反馈会直接来微信
- [x] 移动端真机复查通过（2026-05-06，iOS Safari 7 路径全过：landing / dashboard / 新建 run / 运行中 / 完成 / **EditNodeDialog Portal 真机回归 ✓** / 折叠态 + 跳转工具栏）
- [x] Android 真机回归通过（2026-05-07，OPPO 浏览器；5af68c4 修复 `bg-clip-text` 缺 webkit 前缀致 landing hero "数据找爆点"渐变文字渲染为色块的 bug）

## 发布后 24 小时 checklist

- [ ] 每 2 小时看一次 Vercel Logs + Supabase spend 表
- [ ] PostHog 实时面板开着
- [ ] 种子用户微信 / 邮件响应 < 2 小时
- [ ] 有任何 `LLM_SPEND_CAP_EXCEEDED` / `SPEND_CAP_EXCEEDED` log → 按 RUNBOOK 场景 1 处置

---

## 降级 / 推迟发布的硬线

**必须推迟**的情况（≥ 1 项就推）：
- 合规 4 项任意一项实际不合规（不是文档没勾，而是真的违法 / 违规）
- 跨租户探针真的让 B 看到了 A 的数据
- Happy path E2E 走不通

**可以降级**的情况：
- 字数合规 ≥ 45%（已决定）
- 抑制词捕获率 ≥ 95% 但非 100%
- 种子用户只招到 2 人（硬推不推到 3）
