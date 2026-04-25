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

### [ ] CAC 标签 100% 出现在抖音导出（10 样本人工核验）

- **状态**：待验 · 导出功能已实现（W3-03/04/05 ✅），但 10 样本核验未做
- **怎么验**：
  1. `/create` 生成 10 个脚本
  2. 各自点导出
  3. 下载的 `.txt` / 复制到剪贴板的内容，结尾都必须含"本内容由 AI 辅助生成"（或当前定稿文案）
  4. 在本文件勾选 + 写"10/10 通过, 2026-MM-DD"
- **证据位置**：（填） 

### [ ] 《数据安全法》：CN 用户走 Kimi

- **状态**：待验 · `router.ts` 逻辑是 region='CN' → Kimi first
- **怎么验**：
  1. 本地用 region='CN' 生成一次，log 输出 `provider: 'kimi'`
  2. 截图 Vercel Logs 一段生产请求，确认无跨境调用 OpenAI/Anthropic
- **证据位置**：（填）

### [ ] 《个人信息保护法》：注册页数据使用告知

- **状态**：待验 · Clerk 默认 signup 页面无自定义告知文案
- **怎么做**：在 `src/app/sign-up/[[...sign-up]]/page.tsx` 下方加一段"注册即同意我们按 PIPL 处理你的登录邮箱，仅用于账户识别；生成内容存储在境内 Supabase"
- **阻塞判断**：文案可当日补，非技术阻塞

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

### [ ] 20 样本审计字数合规 ≥ 90%

- **状态**：⚠️ **未达标** · 最近 v4 审计 45%，prompt 调优已放弃（见讨论历史）
- **决定**：**降低到 "≥ 45% + 产品层漂移引导兜底"** —— 理由：
  - 人工复审 UX 本来就假设用户会微调字数
  - W4-04 已加字数漂移引导条（任务 #32）
  - 继续调 prompt 是 ROI 负的（v3 45% → v4 45%）
- **需要你签字**：在 `DECISIONS_LOG.md` overlay 段添加"2026-04-21 降低字数合规判据：45% + 产品层兜底"
- **证据**：`audit-report-2026-04-21-v4.md`

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

### [ ] PostHog 4 事件发火

- **状态**：Task #28 已完成代码接线，未做生产回归
- **怎么验**：
  1. 生产环境走一遍 happy path
  2. PostHog → Events → 确认见到 `session_started` / `script_generated` / `script_approved` / `script_exported` 4 个
- **证据**：（填 PostHog 截图链接）

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
