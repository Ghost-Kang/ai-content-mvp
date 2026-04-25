# ENG TASKS v3.0

**Version**: 3.0（PIVOT，supersedes ENG_TASKS_V2_SOLO.md）
**Date**: 2026-04-23
**Total**: 40 eng-days / 41 tasks / 7 weeks
**Capacity**: 60h/week × 7 wks × 0.8 = ~42 eng-days · Buffer ~2 days
**Sprint window**: 2026-04-28 → 2026-06-12

v2.0 ENG_TASKS_V2_SOLO 归档为历史档案。本文件是当前唯一执行清单。

---

## Task Naming Convention

- `W{n}-{id}-V3` — 例如 `W1-04-V3`
- Size: `XS` (≤0.25d) / `S` (~0.5d) / `M` (~1d) / `L` (~1.5d)
- Owner: 永远是"你"，省略
- Claude agent: 推荐调用哪个子 agent 起稿

---

## Week 1 (2026-04-28 → 2026-05-04) — 工作流引擎 + 脚本节点复用

**Theme**: workflow_runs/steps schema 落地 · 节点状态机抽象 · v2 thin slice 重构为脚本节点 · 端到端串：输入 → 脚本输出 · 同步启动飞瓜外联（lead time）

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W1-01-V3 | Drizzle migration 002: `workflow_runs` + `workflow_steps` + `topic_pushes` + `monthly_usage` 4 表 + RLS 4 策略 | S | v2 schema | Backend Architect | `pnpm db:smoke:v3` 4 表读写通；RLS 跨租户探针绿 |
| W1-02-V3 | 节点状态机抽象：`NodeRunner` interface + base class（pending → running → done/failed + retry hooks + cost tracking） | M | W1-01 | Backend Architect | unit test：3 种状态转换 + 1 retry + 1 final fail |
| W1-03-V3 | Workflow orchestrator：`runWorkflow(runId)` 串行调用 nodes + state 持久化 + 错误隔离（一节点 fail 不污染下一节点） | M | W1-02 | Backend Architect | 注入 3 mock node，跑 3 个场景：全 ok / 中间 fail / 中间 retry 后 ok |
| W1-04-V3 | 脚本节点封装：把 v2 `buildScriptPrompt` + `validateScriptLength` + `buildSuppressionScanner` 重构为 `ScriptNodeRunner` | S | W1-02, v2 thin slice | Backend Architect | 1 eng-day 上限。**超过即过度重构**，砍范围 |
| W1-05-V3 | 工作流 tRPC：`workflow.create(topic)` / `workflow.get(id)` / `workflow.list()` | S | W1-03 | Backend Architect | Postman 3 endpoint 各 3 次正例 + 2 次反例 |
| W1-06-V3 | 端到端 probe：`pnpm tsx scripts/probe-workflow-v3.ts` 输入主题 → 跑 1 步脚本节点 → 输出存表 | S | W1-04, W1-05 | Backend Architect | 5 次连跑 ≥ 4 次 status=done，含 1 次 graceful degradation |
| W1-07-V3 | `monthly_usage` spend counter 框架：每节点 cost 累计 + 月限流 hook（W2 接 Seedance 时填实数） | S | W1-01 | Backend Architect | mock spend ≥ ¥1000 触发拒绝；DB 月度聚合查询通 |
| W1-08-V3 | **🔴 飞瓜/新榜/灰豚 销售联系**（见 `OUTREACH_V3.md`）3 家询价 + 索取 demo + 报价 | XS | - | - | W1 EOD 前至少 1 家给出书面报价 + API 文档 |
| W1-09-V3 | PostHog v3 事件 schema 设计：`workflow_run_started/completed/failed` + `node_completed/failed` + `monthly_usage_blocked` | XS | - | DevOps Automator | schema 文档 commit；W1-06 probe 触发 1 次事件可见 |

**Subtotal**: 5.0 eng-days
**Critical path**: W1-01 → W1-02 → W1-03 → W1-04 → W1-06
**W1 Gate (2026-05-04 EOD)**:
- [ ] 端到端 probe 5/5 通（含 1 graceful degradation）
- [ ] `pnpm db:smoke:v3` + RLS 探针绿
- [ ] 飞瓜系至少 1 家书面报价到手
- [ ] PostHog 看到 `workflow_run_completed` 事件

**触发 STRATEGY §4 任一 kill = 立即停 W2 启动**

---

## Week 2 (2026-05-05 → 2026-05-11) — 分镜节点 + Seedance PoC

**Theme**: 分镜 prompt + Seedance API 接入 · **🔴 50 次 PoC 成功率 ≥70% kill gate** · 视频生成节点 + spend 限流 · 节点失败 retry

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W2-01-V3 | 分镜 prompt 模板 v0：脚本 → 15-18 帧 + 每帧 image prompt（含中文场景描述 + 镜头语言）+ 5 抑制词 | S | W1-04 | Content Creator | 离线 10 次：≥ 8 次 15-18 帧、≥ 9 次合规 |
| W2-02-V3 | 分镜节点封装：`StoryboardNodeRunner` + 输出落 `workflow_steps.output_json` | S | W2-01, W1-02 | Backend Architect | unit test 3 case + 1 e2e probe |
| W2-03-V3 | Seedance API client wrapper：auth + submit + poll + error 分类（rate limit / quota / server error） | M | - | Backend Architect | 单条 60s 视频跑通 2 次；4 种错误各测 1 次 |
| W2-04-V3 | **🔴 Seedance PoC 统计脚本**：50 次跑（同 prompt × 50）记录 成功率 / 平均延迟 / 实测单条成本 / 失败原因分布 | M | W2-03 | Backend Architect | 报告 commit 到 `research/seedance_poc_2026-05-XX.md` |
| W2-05-V3 | 视频生成节点封装：`VideoGenNodeRunner` 串行调 Seedance × N 帧 + monthly_usage 增量 + 单 run 内 retry | M | W2-03, W1-07 | Backend Architect | 3 帧 demo run 通；超 60 条/月限流触发 |
| W2-06-V3 | 节点失败策略：retry × 2（指数退避） / skip / final fail；错误分类落 `error_msg` | S | W1-02 | Backend Architect | 注入 3 种 fault 各测 3 次 |
| W2-07-V3 | 工作流 UI v0：5 节点状态 list（纯文字 `pending/running ⏳/done ✅/failed ❌`）+ 自动轮询 | S | W1-05 | Frontend Developer | 真实跑一次能看到 4/5 节点流转 |
| W2-08-V3 | PostHog 事件：`storyboard_generated` + `video_clip_generated` + `node_retry` + `node_failed` | S | W1-09 | DevOps Automator | 真实 run 后 dashboard 看到全部事件 |

**Subtotal**: 7.0 eng-days
**Critical path**: W2-01 → W2-02 → W2-03 → W2-04 → W2-05
**W2 Gate (2026-05-11 EOD)**：
- [ ] **🔴 KILL GATE**：W2-04 PoC 成功率 ≥ 70%
- [ ] **🔴 KILL GATE**：实测成本 ≤ ¥15/条（D24 假设 ¥6 缓冲 2.5×）
- [ ] 1 个 5 帧 demo 工作流端到端跑通（脚本 → 分镜 → 5 帧视频，无导出）

---

## Week 3 (2026-05-12 → 2026-05-18) — 导出节点 + 工作流 UI 完整版

**Theme**: ffmpeg 拼接 · 剪映工程文件导出 · CAC 水印 · 5 节点 UI 可视化 · 节点级编辑 + retry

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W3-01-V3 | ffmpeg 视频拼接：N clips → 1 mp4 + 缩略图 + 元信息（时长 / 分辨率） | M | W2-05 | Backend Architect | 5 clip 拼接 mp4 时长精确、无黑帧、缩略图正确 |
| W3-02-V3 | **⚠️ 剪映工程文件导出器**：生成 `draft_content.json` 标准格式（先做 5 节点最简版） | M | W3-01 | Backend Architect | 导出文件用真实剪映 app 打开能看到时间轴 + 视频 + 字幕 |
| W3-03-V3 | CAC AI 水印注入：首帧文字水印 + 脚本 .txt 结尾追加"本内容由 AI 辅助生成" | S | W3-01 | Backend Architect | 10 样本 100% 含水印（自动 grep + 视觉抽查） |
| W3-04-V3 | 导出节点封装：`ExportNodeRunner` 输出 mp4 + 剪映工程 + 脚本 .txt 三件套 + 打包 zip | S | W3-01..03 | Backend Architect | 1 完整 run 导出三件套，下载 zip 可解压 |
| W3-05-V3 | 工作流 UI v1：5 节点可视化（liblibtv 风格简化）— 横向 5 卡片 + 进度条 + 点击展开节点输出 | M | W2-07 | Frontend Developer | 视觉走查：3 真实 run 各种状态截图无错位 |
| W3-06-V3 | 节点级编辑：脚本节点完成后用户可改 → 触发分镜节点重跑（cascade invalidate） | M | W3-05 | Frontend Developer | e2e 测试：改脚本 → 分镜状态变 `dirty` → 用户点重跑 → 节点流转 |
| W3-07-V3 | 节点失败 UI：每个节点失败显示 `重试 / 跳过 / 编辑` 3 按钮 + 错误信息 | S | W3-05 | Frontend Developer | 注入 3 种错误，UI 表现正确 + 按钮逻辑通 |

**Subtotal**: 7.0 eng-days
**Critical path**: W3-01 → W3-02 → W3-04 → W3-05
**W3 Gate (2026-05-18 EOD)**：
- [ ] 完整 4 节点工作流（脚本 → 分镜 → 视频 → 导出）端到端跑通 ≥ 3 次
- [ ] 剪映工程文件导出在真实剪映 app 打开 OK
- [ ] CAC 10 样本 100% 含水印

---

## Week 4 (2026-05-19 → 2026-05-25) — 选题节点 + 内测准备

**Theme**: 飞瓜/新榜 API 接入（W1-08 选定） · trending 抓取 · LLM 选题分析 · 每日推送 · 监控 dashboard · P1-P4 账号开通

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W4-01-V3 | 飞瓜/新榜 API client（取决于 W1-08 哪家签下来）：trending fetch + 限流 + 缓存 | M | W1-08 | Backend Architect | 拉 top 50 抖音热榜成功 + Redis 缓存 1h |
| W4-02-V3 | trending 抓取定时任务（QStash daily 8:00 cron） | S | W4-01 | DevOps Automator | 24h 内自动跑 1 次 + 数据落 `topic_pushes` |
| W4-03-V3 | LLM 选题分析 prompt：每条 trending → "为什么火（3 句） + 怎么改造为你的内容（3 句）" | S | W4-01 | Content Creator | 离线 10 条，输出格式合规 ≥ 9 |
| W4-04-V3 | 选题推送：每日 9:00 给每用户邮件（Resend）+ 飞书机器人 5 条；含"一键带入工作流"链接 | M | W4-02, W4-03 | Backend Architect | 自测：邮件 + 飞书都收到，链接点击进 `/workflow/new?topic_id=xxx` |
| W4-05-V3 | 选题节点封装：`TopicNodeRunner` 用户选定 topic → 注入 workflow.create 第一步 | S | W4-04 | Backend Architect | 完整 5 节点 e2e 跑通 |
| W4-06-V3 | 选题 UI：`/topics` 列表页 + "用这条" CTA + 已用过标记 | S | W4-05 | Frontend Developer | 真实数据走查：5 条卡片 + 点击进工作流 |
| W4-07-V3 | 监控 dashboard：`/admin/dashboard`（仅自己登录可见）— 视频成功率 / 平均延迟 / 用户活跃 / spend / 月度聚合 | S | W2-08 | Frontend Developer | 4 卡片渲染真实 PostHog + DB 数据 |
| W4-08-V3 | P1-P4 内测账号开通 + 内测须知 1 页 + 反馈微信群（4 个 1v1，**不要群聊**） | XS | - | - | 4 个账号 active，4 个微信对话开 |

**Subtotal**: 7.0 eng-days
**Critical path**: W4-01 → W4-02 → W4-04 → W4-05 → W4-08
**W4 Gate (2026-05-25 EOD)**：
- [ ] 完整 **5 节点** 工作流（含选题）端到端跑通 ≥ 3 次
- [ ] 选题推送 P1-P4 各收到 1 次
- [ ] 监控 dashboard 4 卡片有数据

**🔴 备用路径**：W1-08 飞瓜全部谈崩或 > ¥3000/月 → W4-01..04 降级为"用户自选 + LLM 分析"，砍主动推送，节省 ~3 eng-days。

---

## Week 5 (2026-05-26 → 2026-06-01) — P1-P4 内测启动

**Theme**: 4 个种子用户跑真实任务 · 每天看 dashboard · 每 2 天 1 个 user sync · 实时 bug 修复

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W5-01-V3 | P1-P4 内测启动会（1v1 微信，30min × 4，演示 + 引导第一次跑通） | M | W4-08 | - | 4 人都完成至少 1 个工作流 run |
| W5-02-V3 | 每天 PostHog dashboard routine（10min/day 看异常） | XS×7 | - | - | 异常 24h 内回应 |
| W5-03-V3 | 每 2 天 1 个反馈对话（4 人轮）：5 句以内"今天有什么坑" | XS×4 | - | - | feedback log commit 到 `internal/seed_feedback.md` |
| W5-04-V3 | 实时 bug 修复 buffer | M | - | Backend Architect | P0 24h 内修；P1 48h 内修 |
| W5-05-V3 | 周末 30min 视频通话（4 人轮一遍）听最深的 1 个痛点 | M | - | UX Researcher | 4 通话纪要 commit |

**Subtotal**: 5.0 eng-days
**W5 Gate (2026-06-01 EOD)**：
- [ ] **🔴 KILL GATE**：4 人中 ≥ 2 人完成 ≥ 1 条端到端
- [ ] feedback log ≥ 8 条
- [ ] P0 bug = 0

---

## Week 6 (2026-06-02 → 2026-06-08) — 第二轮迭代 + 首笔付费

**Theme**: 高优 bug + UX 优化 · 单位经济实测 · **🔴 至少 1 人正式付费 ¥1000/月 KILL GATE**

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W6-01-V3 | P0/P1 bug 修复（基于 W5 反馈，预估 3-5 个） | M | W5 | Backend/Frontend | bug list 全清 |
| W6-02-V3 | UX 优化（基于内测反馈，预估 3 个改动）：进度通知 / 节点重跑提示 / 错误友好化 | M | W5 | Frontend Developer | 改动 1v1 给最痛的种子用户验证 |
| W6-03-V3 | 单位经济实测：拉 1 周 30 条样本的 `monthly_usage.total_cost_yuan` vs 估算（¥6 × 帧数） | S | - | - | 报告 commit `internal/unit_economics_2026-06-XX.md` |
| W6-04-V3 | **🔴 首笔付费转化**：找付费意愿最高的 1 人（大概率家琳）谈"内测期满续费 ¥1000/月，提前付送 3 个月 = 6 个月 ¥6000" | S | - | - | 现金到账 OR 拒理由 commit |
| W6-05-V3 | 缓冲（应对 W5/W6 前段超预算） | M | - | - | - |

**Subtotal**: 5.0 eng-days
**W6 Gate (2026-06-08 EOD)**：
- [ ] **🔴 KILL GATE**：≥ 1 笔 ¥1000+ 现金到账（拒绝 = 不公开发布，调研定价）
- [ ] 单位经济报告显示毛利 ≥ 50%
- [ ] P0/P1 bug = 0

---

## Week 7 (2026-06-09 → 2026-06-12) — Launch Gate + 公开发布

**Theme**: 20 样本审计 · runbook · landing page · 06-12 周五公开发布

| ID | Task | Size | Deps | Claude agent | 验收 |
|---|---|---|---|---|---|
| W7-01-V3 | 20 样本视频审计脚本 + 跑：可用率 ≥ 70%（用户真愿意发出去） | S | - | - | `audit-report-2026-06-XX-v3.md` commit |
| W7-02-V3 | runbook 3 条：视频生成失败 / Seedance 宕机 / 飞瓜 API 拒绝 | S | - | DevOps Automator | `/ops/runbook_v3.md` 3 条各 ≥ 5 步 |
| W7-03-V3 | landing page 改 v3：workflow 卖点 + 5 节点示意图 + 定价 ¥1000/月 + signup CTA | S | - | Frontend Developer + Brand Guardian | 页面上线 + signup flow 通 |
| W7-04-V3 | Launch gate self-audit：对照 STRATEGY §13 8 条 checklist 自查 | XS | W7-01..03 | - | 8 条全 ✅ 才上线 |
| W7-05-V3 | **2026-06-12 周五公开发布**：DNS 切 + landing 上线 + 首批宣发（朋友圈 + 4 个种子用户口碑 + Twitter） | XS | W7-04 | Content Creator | 上线 24h 内 ≥ 10 个独立访问 |

**Subtotal**: 4.0 eng-days
**W7 Gate (2026-06-12 EOD)**：见 `STRATEGY_PACKAGE_V3.md` §13 完整 launch gate 8 条，**任一不过 = 推迟 1 周到 06-19**

---

## Critical Path 全景

```
W1-01 → W1-02 → W1-03 → W1-04 → W1-06
                                  ↓
W2-01 → W2-02 → W2-03 → W2-04 [KILL] → W2-05
                                          ↓
W3-01 → W3-02 → W3-04 → W3-05
                          ↓
W4-01 → W4-04 → W4-05 → W4-08
                          ↓
W5-01 [KILL] → W6-04 [KILL] → W7-04 → W7-05 [LAUNCH]
```

**3 个 KILL GATE 节点**：W2-04（Seedance）/ W5-EOD（用户完成率）/ W6-04（首笔付费）。任一不过 → 进 STRATEGY §4 自杀阀流程。

---

## Top Risks & Mitigations（compressed from STRATEGY §11）

| 风险 | 周次 | 缓解 |
|---|---|---|
| 🔴 飞瓜数据源谈不下 | W1 | W1-08 lead time 启动；W4 备用降级路径 |
| 🔴 Seedance 实测 < 70% | W2 | W2-04 PoC kill gate；切 runninghub 备用 |
| 🔴 0 付费 | W6 | W6-04 强制转化；不上线 |
| 🟡 剪映工程文件格式踩坑 | W3 | W3-02 单独 1d 预算；fallback 仅 mp4 + .txt |
| 🟡 视频生成异步 UX 难 | W2-W3 | 进度条 + 邮件通知，用户可关页面回头看 |
| 🟡 Solo 7 周超时 | 全程 | 每周一回看 calendar；超产能 30% 立刻砍 |

---

## Resume Protocol

每周一开工前 5 min：
1. 打开本文件本周 section
2. 检查上周 Gate 是否过；超过 1 个未过即触发 STRATEGY §4 kill check
3. 标 ✅/⚠️/🔴 到 PROGRESS.md 对应 W{n} 行
4. 在本文件本周表追加"实际 eng-days vs 计划"列

每周五 EOD：
1. 检查本周 Gate
2. commit `chore(progress): W{n} done` + 截图 PostHog dashboard
3. 推 main
