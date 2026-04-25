# STRATEGY PACKAGE v2.0 — SOLO OPERATOR

**Version**: 2.0 (solo pivot, supersedes v1.1 multi-team plan)
**Date**: 2026-04-19
**Operator**: 1 human founder @ 60h/week
**Sprint window**: 2026-04-17 → 2026-05-15 (4 weeks)
**Effective capacity**: ~24 eng-days (60h × 4 wks × 0.8 productive ratio ÷ 8h/day)
**Scope budget**: 21 eng-days (~3 day buffer)

v1.1 文档保留为多人协作参考。本文件是当前执行真相。

---

## 1. Scope Lock — The ONE Product

**抖音 60s 公式一脚本生成器。**

单用户输入 → LLM 生成 190–210 字 / 15–18 帧分镜 → Solo review 5 项 checklist → 导出含 CAC 合规标注的文本。

### Happy Path (single path, no alternatives)

```
Signup (Clerk)
  → Quick Create (3 字段表单)
  → Loading (QStash → LLM)
  → Result (5 段脚本 + 分镜表 + 字数 badge)
  → Solo Review (5 项 checkbox gate)
  → Export (复制 或 .txt 下载，含 CAC 标注)
```

**Target: < 5 分钟 end-to-end; regenerate 允许但不做 diff**

### 不做（Sprint 2 / OPT backlog）

公式二 · 长视频 · 小红书/公众号/LinkedIn · 多渠道适配 · diff 引擎 · Team review · 品牌音模块 · Topic Intelligence · 绩效日志 · kanban · Strategy-First · 调研 survey · Suppression admin UI

---

## 2. 4-Week Calendar

| 周 | 主题 | eng-days | 关键交付 |
|---|---|---|---|
| **W1** 2026-04-17..04-24 | 基建 + 访谈 + thin slice | 5.5 | 账号就绪 / RLS 通 / LLM v0 / 3 访谈完 / D10 裁决 / preview 跑通 hardcoded prompt |
| **W2** 04-24..05-01 | 核心生成 pipeline | 6.0 | Quick Create UI + 公式一 prompt + 字数 validator + 抑制 scanner + 脚本展示 + 2 PostHog 事件 |
| **W3** 05-01..05-08 | Review + 导出 + 错误路径 | 5.0 | Solo 5 项 gate + 导出 + CAC 标签 + 重试/回退 + 抑制清单扩充到 50 |
| **W4** 05-08..05-15 | 硬化 + 种子用户 + 上线 | 4.5 | 20 样本审计 + spend cap + Landing + 3 种子用户邀请 + launch gate |
| **合计** | | **21** | (产能 24，缓冲 ~3 天) |

---

## 3. Success Criteria（solo 可核验，不依赖第三方）

- [ ] 3 种子用户中至少 2 个在 7 天内完成第一次完整 cycle
- [ ] 至少 1 个种子用户在访谈中明确说"会继续用"
- [ ] 20 样本审计：字数合规 ≥ 90% · 抑制词触发 = 0 · 可读性打分 ≥ 4/5（自评）
- [ ] CAC 标签 100% 注入抖音导出（自测 10 样本）
- [ ] 上线后 7 天内 P0 bug 数 ≤ 2

---

## 4. Kill Conditions（自杀阀，单人必须有）

任一触发即启动对应动作：

| 触发 | 动作 |
|---|---|
| W1 EOD thin slice 未通 | 砍到 "Formula 1 + 前端 hardcoded 输入 + LLM 直接返回"，放弃异步 QStash |
| W2 EOD 字数合规率 < 70%（10 样本） | 放弃 190–210 硬约束，改为展示字数但不卡 |
| 3 访谈中 0 人表达抖音脚本需求 | 触发 D10 Plan B；solo 下 Plan B 成本极高，**考虑暂停项目回研究阶段** |
| Legal CAC 文案 04-28 仍无 | 使用保底文案 "本内容由 AI 辅助生成" 上线，后置热替换 |
| 任一周结束超产能 > 30% | 立即从下一周砍最低优先级任务，不加班到崩 |

---

## 5. 工具栈（冻结，不换）

```
Next.js 14 App Router + TypeScript
Clerk           (auth, 单用户即可，暂不用 Organization)
Supabase        (Postgres + RLS)
Drizzle ORM
tRPC
Upstash QStash  (LLM 异步)
Upstash Redis   (rate limit + spend counter)
PostHog         (analytics)
Claude API      (default)
Kimi API        (CN fallback，env 切换，非 registry)
Vercel          (host)
```

**明确不用**：Supabase Realtime · feature flag 系统 · 复杂 provider registry · DV360 · Stripe（Sprint 2 再做）。

---

## 6. Agent 使用策略（Claude 子 agent = 执行搭档）

在 solo 模式下，"agent 矩阵"不再是多人协作清单，而是**何时调用哪个 Claude 子 agent 帮你干活**。

### 按阶段的调用清单

| 阶段 | 子 agent | 干什么 |
|---|---|---|
| 编码前 | `Plan` | 拆解任务到具体文件 + 函数签名 |
| 编码前 | `Explore` | 快速扫现有代码或调研第三方库 |
| 写代码 | `Senior Developer` / `Backend Architect` / `Frontend Developer` | 分别对应 BE / FS / FE 场景 |
| 写代码 | `Rapid Prototyper` | thin slice、POC、快出一版 |
| 写完 | `Code Reviewer` | 写完自审，找 bug / 性能 / 安全 |
| 写完 | `Evidence Collector` | 自动生成 PR 的证据图/log |
| UX 描述 | `UX Architect` | 界面结构 + Tailwind 骨架 |
| 品牌/文案 | `Brand Guardian` / `Content Creator` | 生成 20 样本 + Landing 文案 + 访谈提纲 |
| 访谈 | `UX Researcher` | 访谈纪要分析、假设验证 |
| 合规 | `Legal Compliance Checker` | CAC 标注 sanity check（最终你拍板） |
| 每日 | `Project Shepherd` | 每日 standup 摘要（你自己听） |
| 上线前 | `Reality Checker` | 严苛自审 launch gate |

### 不再调用的（v1.1 遗留）

Social Media Strategist / SEO Specialist / Growth Hacker / Sprint Prioritizer / Senior Project Manager / Infrastructure Maintainer / Studio Producer / Experiment Tracker / Support Responder — 这些在 solo 阶段你亲自兼任判断即可，不需要 agent 代言。

---

## 7. Rules (solo 改版)

1. **Rule #1 — 一次只做一件事**。开多个 PR 等于零个 PR 合并。
2. **Rule #2 — Dev↔自 QA 五步**：SPEC → BUILD → 自测 + 证据 → `Code Reviewer` 自审 → Merge。（砍掉 v1.1 六步中的独立 QA 层，因为你就是 QA）
3. **Rule #3 — No launch without 自审 reality gate**。§8 清单全绿才发，任一不确定默认 NEEDS WORK。
4. **Rule #4 — Evidence over claims**。commit 带 screenshot / curl / test output；"我本地过了"不算。
5. **Rule #5 — MVP 冻结**。任何新想法写到 OPT backlog，不当场实施。唯一例外：降低 kill condition 触发风险的改动。

---

## 8. Launch Gate（自审清单，W4 上线前必须全 ✅）

### 合规
- [ ] CAC 标签 100% 出现在抖音导出（10 样本人工核验）
- [ ] 《数据安全法》：CN 用户的 LLM 调用走 Kimi（log 可证）
- [ ] 《个人信息保护法》：注册页有数据使用告知
- [ ] 跨租户探针测试通过（Supabase RLS 隔离生效）

### 功能
- [ ] Happy path end-to-end：Signup → Quick Create → Script → Review → Export 能 < 5 分钟走通
- [ ] Solo review 5 项 checkbox 未全勾时 Approve 按钮 disabled
- [ ] 20 样本审计字数合规 ≥ 90%
- [ ] 抑制词 scanner 对 D7 清单 100% 捕获（10 正例测试）

### 运营
- [ ] LLM spend cap 上线（per-session + daily global）
- [ ] Runbook 写完（LLM outage / Supabase down / CAC copy 热替换 3 条）
- [ ] PostHog 4 事件发火（session_started / script_generated / script_approved / script_exported）
- [ ] 3 种子用户邀请发出

### 可维护
- [ ] .env.example 齐全
- [ ] README 有 local dev 步骤（未来接 contractor 用）
- [ ] 关键 LLM prompt 集中在 `/lib/prompts/` 而非散落

---

*Changes to this plan require 24h 冷静期：想清楚再改。*

## Change Log

- 2026-04-19 v2.0 — Solo operator pivot. v1.1 多团队计划归档为参考。范围硬砍 65%（保留抖音 60s 公式一单路径）；eng-days 21 / 产能 24；agent 矩阵重解为 Claude 子 agent 调用清单；决策签字归并为单人签。
