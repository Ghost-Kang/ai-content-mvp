# ENG TASKS v2.0 — SOLO

**Version**: 2.0 (solo, supersedes ENG_TASKS.md v1.1)
**Date**: 2026-04-19
**Total**: 21 eng-days / 30 tasks / 4 weeks
**Capacity**: 60h/week × 4 wks × 0.8 = ~24 eng-days. Buffer ~3 days.

v1.1 的 75 任务多人计划归档作 Plan B（若未来团队扩张）。本文件是当前唯一执行清单。

---

## Task Naming Convention

- `W{week}-{id}` — 例如 `W1-04`
- Size: `XS` (≤0.5d) / `S` (~0.5d) / `M` (~1d) / `L` (~1.5d)
- Owner: 永远是"你"。省略
- Claude agent: 推荐调用哪个子 agent 起稿

---

## Week 1 (2026-04-17 → 2026-04-24) — 基建 + 访谈 + Thin Slice

**Theme**: 账号就绪、RLS 通、LLM 双 provider 能调、3 访谈、D10 裁决、preview URL 跑通 hardcoded prompt。

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W1-01 | Vercel + Supabase + Upstash (QStash + Redis) + PostHog 账号 + env 通 | S | - | DevOps Automator | `/api/healthz` 返回 4 个 OK |
| W1-02 | Next.js 14 App Router + Clerk auth + signin/dashboard 页面骨架 | S | W1-01 | Frontend Developer | `/signin` 登录、`/dashboard` 需登录 |
| W1-03 | Drizzle 配置 + schema: `content_sessions` + `content_scripts` + migration 001 | S | W1-02 | Backend Architect | 两表在 Supabase 可见，Drizzle client 读写通 |
| W1-04 | Clerk JWT `tenantId` claim + Supabase RLS policy + 跨租户探针测试 | S | W1-03 | Backend Architect | 跨租户 `select` 返回空；CI 测试绿 |
| W1-05 | LLM provider 抽象 v0: `callLLM(prompt, region)` (Claude + Kimi env 切换) | S | - | Backend Architect | 两个 provider 各跑 3 次返回文本 |
| W1-06 | 访谈招募 3 人（王磊型 × 2 + 李明型 × 1） + 异步录音/文字纪要 + D10 裁决写回 DECISIONS_LOG | L | - | UX Researcher | 3 纪要入 `/research/` + D10 verdict 签 |
| W1-07 | Thin vertical slice: 表单 → callLLM(hardcoded 公式一 60s prompt) → 页面显示文本 | M | W1-01..05 | Rapid Prototyper | preview URL 能跑通一次 end-to-end |

**Subtotal**: 5.5 eng-days
**Critical path**: W1-01 → W1-02 → W1-03 → W1-04 → W1-07 (W1-05 可并行于 02/03)
**W1 gate (2026-04-24 EOD)**: W1-07 slice demo 可在 preview 上被陌生人在 90 秒内走通 → 进 W2。否则触发 kill condition #1。

---

## Week 2 (2026-04-24 → 2026-05-01) — 核心生成 Pipeline

**Theme**: 公式一 60s 正式 prompt + 异步生成 + 字数 validator + 抑制 scanner + 结果页 + 2 事件。

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W2-01 | 公式一 60s prompt 模板（5 段结构 + 字数约束 + 抑制清单 v1 20 词 + 示例 3 条） | S | - | Content Creator | `/lib/prompts/formula1_60s.ts` commit；10 次离线调用有 8 次在 190–215 内 |
| W2-02 | `content.create` tRPC procedure + session 写表 + input Zod 校验 | S | W1-03 | Backend Architect | Postman 打 3 个有效 + 2 个非法 payload 全部行为正确 |
| W2-03 | `content.generateScript` tRPC + QStash job dispatch | S | W2-02 | Backend Architect | QStash dashboard 看到 job 入队 |
| W2-04 | Script worker API route: callLLM → 字数 validate → 3-retry → 落 `content_scripts` | M | W2-01, W2-03, W1-05 | Backend Architect | 10 次调用 ≥ 9 次成功，失败有 log |
| W2-05 | Post-gen suppression scanner（正则扫 D7 的 20 个抑制词 → 若命中标 warning） | S | W2-04 | Backend Architect | 10 个正例 100% 命中，10 个反例 0 误报 |
| W2-06 | `content.getStatus` 轮询端点（pending / done / failed） | S | W2-04 | Backend Architect | 轮询 3s 间隔，30s 内返回 done |
| W2-07 | Quick Create UI：3 字段 form + 提交按钮 + char budget 预览 | M | W1-02 | Frontend Developer | 表单校验、submit 后跳 loading |
| W2-08 | 脚本结果页：5 段 + 字数 badge + 15–18 帧分镜表 + regenerate 按钮 | M | W2-06 | Frontend Developer | 渲染 3 份真实脚本无视觉错位 |
| W2-09 | PostHog SDK 集成 + `session_started` + `script_generated` 事件 | S | W2-07 | DevOps Automator | PostHog dashboard 看到事件 |

**Subtotal**: 6 eng-days
**Critical path**: W2-01 → W2-02 → W2-03 → W2-04 → W2-08
**W2 gate (2026-05-01 EOD)**: 随机输入 10 次，字数合规 ≥ 90%，抑制扫描 0 误报。否则触发 kill condition #2。

---

## Week 3 (2026-05-01 → 2026-05-08) — Review + 导出 + 错误路径

**Theme**: Solo 5 项 checklist gate、导出 + CAC 标签、错误回退、抑制清单扩充。

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W3-01 | Solo review UI：5 项 checkbox（字数 / 公式结构 / 抑制词 / 品牌契合 / CTA 清晰）；全勾前 Approve 按钮 disabled | M | W2-08 | Frontend Developer | 人工测 5 次：勾 4 个 disabled，勾 5 个 enabled |
| W3-02 | `content.approve` tRPC + session state 字段变更（draft → approved） | S | W2-02 | Backend Architect | 状态变更 + timestamp 落库 |
| W3-03 | `content.export` tRPC + 文本组装（5 段拼接 + 分镜帧说明） | S | W3-02 | Backend Architect | 返回格式化纯文本 |
| W3-04 | CAC AI 标签 constants + 注入 middleware（导出 payload 自动含标签） | S | - | Backend Architect | 10 样本 100% 含标签；启用开关可切标签文案 |
| W3-05 | 导出 UI：复制到剪贴板 + .txt 下载 | S | W3-03 | Frontend Developer | 两种路径都能拿到文本 |
| W3-06 | 错误路径：LLM 超时 / 字数 3-retry 仍 fail / QStash 重推 / 用户看到友好错误 | M | W2-04 | Backend Architect | 注入 3 种 fault 各测 3 次，UI 不崩 |
| W3-07 | 抑制清单从 20 词扩充到 50 词 + prompt 注入调优 + 10 样本回归 | S | W2-05 | Content Creator + Backend Architect | 新 50 词各构造一个正例，100% 命中 |
| W3-08 | PostHog：`script_approved` + `script_exported` 事件 | S | W3-02, W3-03 | DevOps Automator | dashboard 看到事件 |

**Subtotal**: 5 eng-days
**Critical path**: W3-01 → W3-02 → W3-03 → W3-04 → W3-05
**W3 gate (2026-05-08 EOD)**: 自己走一遍 end-to-end < 5 分钟完成 cycle。导出文本含 CAC 标签。进 W4。

---

## Week 4 (2026-05-08 → 2026-05-15) — 硬化 + 种子用户 + 上线

**Theme**: Spend cap、20 样本审计、Landing、3 种子用户、launch gate。

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W4-01 | LLM spend counter：per-session（记 token + 美元） + daily global cap + 硬 kill 返回 graceful error | S | W1-05 | Backend Architect | 人工灌到 cap，断点正常、UI 显示友好 |
| W4-02 | Runbook 3 条（LLM outage / Supabase down / CAC 文案热替换）写到 `/ops/runbook.md` | S | - | Infrastructure Maintainer (self) | 3 份步骤清单可被另一个人复现 |
| W4-03 | 20 样本审计脚本（批量生成 + 字数/抑制/可读性自动标分 + 表格输出） | M | W2-05 | Content Creator + Backend Architect | 审计报告 markdown，结论含 3 条改进建议 |
| W4-04 | Landing page + signup 流程 polish + 截图 demo + 使用说明 | M | W1-02 | Frontend Developer + UX Architect | 非登录状态可见 landing；注册流 < 60s |
| W4-05 | 3 种子用户邀请（王磊 + 李明 + 1 张薇型）+ 7 天反馈收集模板 | S | W4-04 | Content Creator | 3 邀请邮件发出，反馈 Google Form 上线 |
| W4-06 | Bug bash + 自审 Launch Gate 清单 + 首发上线 | M | all | Reality Checker (self) | Launch Gate 8 大类全 ✅ → push to prod |

**Subtotal**: 4.5 eng-days
**Critical path**: W4-01 → W4-03 → W4-06
**Launch gate**: STRATEGY_PACKAGE_V2_SOLO §8 全绿。任何 ❌ 默认推迟 2 天。

---

## Database Migration Order (v2.0 simplified)

```
W1 Day 3:
  Migration 001 — content_sessions + content_scripts   ← 唯一 Sprint 1 必需
```

v1.1 的 7 张表在 v2.0 缩减为 **1 张 migration**，覆盖 2 张表。

v2.0 不建：`channel_variants` · `content_reviews`（用 sessions 的 state 字段）· `topic_analyses` · `performance_logs` · `survey_responses` · `brand_voices` · `suppression_list`（硬编码 constants）。这些移到 Sprint 2 schema。

---

## Critical Path (Gantt 简版)

```
W1 ━━━━━━━━━━━━━━━━━━━━━━━━
  Day 1-2: W1-01, W1-02
  Day 3:   W1-03, W1-04       ← RLS 通
  Day 4:   W1-05, W1-07 启动  ← LLM 通 + slice
  Day 5:   W1-07 demo + W1-06 访谈收尾 + D10 裁决

W2 ━━━━━━━━━━━━━━━━━━━━━━━━
  Day 1-2: W2-01, W2-02, W2-03
  Day 3-4: W2-04, W2-05, W2-06 (BE 主)
  Day 5-6: W2-07, W2-08 (FE 主)
  Day 7:   W2-09 + 字数合规率测试

W3 ━━━━━━━━━━━━━━━━━━━━━━━━
  Day 1-2: W3-01 (review UI)
  Day 3:   W3-02, W3-03, W3-04 (BE)
  Day 4:   W3-05 (FE)
  Day 5:   W3-06 错误路径
  Day 6-7: W3-07, W3-08 + 自测

W4 ━━━━━━━━━━━━━━━━━━━━━━━━
  Day 1:   W4-01, W4-02
  Day 2:   W4-03 审计
  Day 3-4: W4-04 Landing
  Day 5:   W4-05 邀请 + W4-06 bug bash
  Day 6-7: Launch gate + 上线
```

---

## Top Risks (solo 特化)

| # | Risk | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| SR1 | Burnout（60h/week 连续 4 周） | Medium | Critical | 周末至少休 1 天；每日 ≤ 12h；每周一自检能量 |
| SR2 | Context switch 毁生产力（频繁换 BE/FE/DevOps 帽子） | High | High | 同一周只切 2 种角色；W1/W3 偏 BE，W2/W4 偏 FE |
| SR3 | LLM 字数合规率不达标 | High | High | W2 末硬测；不达标触发 kill #2（放弃硬约束） |
| SR4 | CAC 标签合规 solo 吃不准 | Medium | Critical | 保底文案 + 上线后找 Legal 一次性咨询替换 |
| SR5 | 访谈招不到王磊型（抖音 B2B 创作者） | Medium | High | 即刻/小红书/LinkedIn 三个渠道并发推 Day 1 |
| SR6 | Clerk JWT + Supabase RLS debug 耗时 > 1 day | Medium | Medium | W1-04 卡 2h 就改方案：用 application-level tenant check 兜底，生产再补 RLS |

---

## OPT Backlog (Sprint 2 候选，本 sprint 不做)

从 v1.1 ENG_TASKS 迁来 + 新增：

1. 公式二 日常现象洞察型
2. 长视频 800–1000 字 + 40 帧
3. 小红书适配（图文 + 标题长度 + emoji 密度）
4. 公众号 / LinkedIn 适配（D10 Plan B 用）
5. 多渠道 diff 引擎 + 对比 UI
6. Team review（state machine + owner assignment + 24h timeout）
7. 品牌音模块（example-first + before/after UI）
8. Topic Intelligence（选题洞察 + 情绪触发拆解）
9. 绩效日志 + 48h 提醒
10. Kanban 内容日历
11. Strategy-First 入口
12. Survey A + B
13. Suppression admin UI
14. Storyboard brief 生成（v1.1 ENG-013/016）
15. 风格多档位（60s / 90s / 3min 滑块）

---

## Change Log

- 2026-04-19 v2.0 — Solo 重写。75 任务 → 30 任务（21 eng-days）。单渠道 + 单公式 + 单长度锁定。DB 表从 7 张减到 2 张。Review 从 Solo+Team 减到仅 Solo。合规路径保留（CAC + RLS + 双 provider）。
