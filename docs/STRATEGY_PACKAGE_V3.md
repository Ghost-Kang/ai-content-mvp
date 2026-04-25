# STRATEGY PACKAGE v3.0 — AI 短视频内容工作流平台

**Version**: 3.0（PIVOT，supersedes v2.0 60s 脚本生成器）
**Date**: 2026-04-23
**Operator**: 1 human founder @ 60h/week
**Sprint window**: 2026-04-28 → 2026-06-12（7 weeks）
**Effective capacity**: ~42 eng-days（60h × 7wk × 0.8 productive ÷ 8h/day）
**Approach**: B + B + 内测（7 周缓冲 / 复用 thin slice 渐进 / P1-P4 直接内测）

v2.0 文档保留为历史档案。本文件是当前执行真相。

---

## 1. Scope Lock — D30 已签字范围

**5 节点单任务工作流**：

```
[选题节点]   →   [脚本节点 复用]   →   [分镜节点]   →   [视频生成节点 Seedance]   →   [导出节点 剪映/文本]
   H5             v2 thin slice           17 帧                D24                    D25 (c)
```

### Happy Path（single path, no alternatives）

```
Signup (Clerk · 复用)
  → Daily Topic Push（每日 9:00 推 5 条 trending）
  → User picks topic / or Quick Create 输入主题
  → Workflow Run started
    ├─ [脚本节点] LLM 生成 200 字脚本（复用 v2 thin slice）
    ├─ [分镜节点] 拆 15-18 帧 + 每帧 image prompt
    ├─ [视频生成节点] Seedance 逐帧生成 → 拼接（异步 5-10min）
    └─ [导出节点] 输出 .mp4 + 剪映工程文件 + 脚本文本（含 CAC AI 标注）
  → User download + manual publish（不接管发布，D25 (c) 锁定）
```

### 不做（v3.5 / OPT backlog）

- 批量生产（一次 5 条变体）—— H4 数据无效，MVP-1 默认单任务，留批量 hooks
- 自动发布（OAuth / ADB）—— 永航唯一异常值，留 MVP-2 加价 add-on
- 多 provider 切换（runninghub / Liblibtv）—— Seedance 单源锁定
- 多账号矩阵
- 团队协作（Solo only）
- 数据复盘 / 仪表板

---

## 2. 7-Week Calendar

| 周 | 主题 | eng-days | 关键交付 |
|---|---|---|---|
| **W1** 04-28..05-04 | 工作流引擎 + 脚本节点复用 | 5.0 | workflow_runs/steps schema · 节点状态机 · v2 thin slice 重构为脚本节点 · 端到端串：输入主题 → 脚本输出 |
| **W2** 05-05..05-11 | 分镜节点 + Seedance 接入 PoC | 7.0 | 分镜 prompt + 17 帧拆解 · Seedance API 集成 · 50 次 PoC 跑成功率 ≥ 70%（kill gate）· spend counter D23 ≤ 60 条/月 |
| **W3** 05-12..05-18 | 视频生成节点 + 导出节点 + 工作流 UI | 7.0 | 异步任务 + 进度轮询 · 视频拼接 + 剪映工程文件 + CAC 标注 · 5 节点状态可视化 UI（liblibtv 风格简化）· 节点失败可重试 |
| **W4** 05-19..05-25 | 选题节点（数据源 + 分析 + 推送）| 7.0 | 飞瓜/新榜 API 接入 OR 第三方爬虫服务 · LLM 分析 "为什么火 + 怎么改造" · 每日 9:00 邮件推 5 条 · spend cap |
| **W5** 05-26..06-01 | P1-P4 内测启动 + 第一轮反馈 | 5.0 | 4 个种子账号开通 · 真实任务跑通 · 每 2 天 1 个 user sync · 实时 bug 修复 |
| **W6** 06-02..06-08 | 第二轮迭代 + 单位经济实测 | 5.0 | 高优先级 bug 修复 · UX 优化 · 视频生成成本 vs ARPU 实算 · 转化首笔付费 |
| **W7** 06-09..06-12 | Launch gate + 公开发布 | 4.0 | 20 样本视频审计 · runbook 3 条 · landing page · 公开发布 friday 06-12 |
| **合计** | | **40** | （产能 42，缓冲 ~2 天） |

---

## 3. Success Criteria（2026-06-12 launch gate）

- [ ] P1-P4 中至少 **3 人完成 ≥ 5 条端到端工作流**（选题 → 视频导出）
- [ ] 视频生成成功率 ≥ **80%**（含 retry，单条端到端用时 ≤ 15 min）
- [ ] **至少 1 个种子用户正式付费 ¥1000/月**（验证 H1 真实付费而非访谈空头支票）
- [ ] 单位经济实测 ≥ **50% 毛利率**（视频生成成本 / ARPU）
- [ ] 20 样本视频审计：可用率 ≥ 70%（不是 valid char count，是"用户真愿意发出去"）
- [ ] CAC AI 标注 100% 注入剪映工程文件 + 脚本文本（自测 10 样本）
- [ ] 上线后 7 天内 P0 bug 数 ≤ 3
- [ ] 工作流单次端到端成本 ≤ ¥30（30 条 × ¥30 = ¥900 < ¥1000 ARPU）

---

## 4. Kill Conditions（自杀阀，单人必须有）

| 触发 | 动作 |
|---|---|
| **W2 EOD** Seedance 50 次 PoC 成功率 < 70% | 切 runninghub（D24 备用）· 重测 1 周 · 再失败则视频质量降级或重新评估方向 |
| **W2 EOD** Seedance 单条成本实测 > ¥15（之前估 ¥6） | 重算单位经济 · D23 月上限砍到 30 条 · 评估是否提价 ¥1500 |
| **W4 EOD** 飞瓜/新榜 API 谈不下来 或 月费 > ¥3000 | 选题节点降级为"用户自选 + LLM 分析"，砍主动推送 · 影响 H5 价值，需告知种子用户 |
| **W5 EOD** 4 个种子用户中 < 2 人完成 1 条端到端 | 不公开发布 · W6/W7 转为 bug fix + UX 重做 · 推迟到 06-26 |
| **W6 EOD** 0 人付费 | 公开发布前必须先转化 1 人，否则 H1 是访谈幻觉 · 暂停发布 · 调研定价 |
| 任一周超产能 30% | 立即从下一周砍最低优先级（推送方式 / UI polish / 选题节点高级功能） |
| 任一节点超 W3 仍未完成 | 砍掉非阻塞依赖（如分镜节点未完则跳过分镜直接给整段 prompt 给 Seedance） |

---

## 5. 工具栈（基于 v2 增量）

```
继承（v2 thin slice）
  Next.js 14 App Router + TypeScript
  Clerk            (auth)
  Supabase         (Postgres + RLS)
  Drizzle ORM
  Upstash Redis + QStash (异步)
  Vercel           (deploy)
  Kimi             (LLM 脚本生成 + 选题分析)
  PostHog          (新增 v3 事件埋点)

新增（v3.0）
  Seedance         (D24 主用视频生成 · ¥6/条 60s)
  runninghub       (D24 备用)
  飞瓜 API or 新榜 API or 灰豚 (W4 选 1 · 选题数据源)
  ffmpeg           (视频拼接 + 剪映工程文件生成)
  Resend or 飞书机器人 (每日选题推送)

不引入
  ❌ 工作流编辑器框架（react-flow 等 · MVP-1 不做节点拖拽，只做状态可视化）
  ❌ 多 LLM provider 切换（v2 抽象层够用）
  ❌ 自建 video gen 模型
  ❌ 多账号矩阵
```

---

## 6. 数据模型增量（基于 v2 schema）

```sql
-- 复用：tenants / users / suppression_list
-- 升级：content_sessions → workflow_runs；content_scripts → workflow_step_outputs

workflow_runs (
  id, tenant_id, user_id, topic, status, created_at, updated_at,
  total_cost_yuan, total_video_count
)

workflow_steps (
  id, run_id, node_type[topic/script/storyboard/video/export],
  status, input_json, output_json, error_msg, retry_count,
  cost_yuan, started_at, completed_at
)

topic_pushes (
  id, tenant_id, user_id, push_date, topics_json[5 条 trending],
  source[douyin/xiaohongshu], opened, clicked
)

monthly_usage (
  tenant_id, month, video_count, total_cost_yuan
)
```

W1 的 migration 在 v2 schema 基础上扩展，**不破坏 thin slice**（v2 数据可以查询，但新工作流走新表）。

---

## 7. P1-P4 内测启动协议（W5）

### 内测账号配置（W5 day 1）

- 4 个免费账号 · 视频生成上限 60 条/月 · 选题推送默认开启
- 每人加一个**专属反馈微信对话**，**不要群聊**（避免互相影响）
- 提前发"内测须知" 1 页：哪些功能能用 / 哪些会断 / 反馈方式

### 反馈节奏（W5-W6）

| 频率 | 动作 |
|---|---|
| 每天 | 看 PostHog dashboard：每人完成的工作流数 / 失败节点 / 退出位置 |
| 每 2 天 | 4 人各 1 条微信"今天有什么坑"，**不超过 5 句** |
| 每周 | 1 次 30min 视频通话（轮流，1 周 4 人轮完）听最深的 1 个痛点 |
| 任何时候 | 收到投诉 24h 内回复（solo 必须严守，否则口碑崩） |

### 转化首笔付费（W6 必做）

- W6 周中找付费意愿最高的 1 人（大概率是家琳，她当前已月付 ¥1000 + 有强表达 "trending 深度分析"）
- 直接谈："内测期满后续费 ¥1000/月，要不你提前付，我送你额外 3 个月" = 6 个月 ¥1000 = ¥6000 现金
- 如果她拒，问"为什么"——这是真实付费意愿数据
- **W6 EOD 0 付费 = launch kill condition 触发**

---

## 8. 单位经济护栏（D23 修订基线）

| 用户档位 | 视频条数/月 | Seedance 成本 | LLM 成本（脚本+分镜+选题） | 数据源摊销 | 总成本 | 毛利 | 毛利率 |
|---|---|---|---|---|---|---|---|
| 轻度 | 10 | ¥60 | ¥10 | ¥30 | ¥100 | ¥900 | 90% |
| 中度 | 30 | ¥180 | ¥30 | ¥30 | ¥240 | ¥760 | 76% |
| 重度（D23 上限） | 60 | ¥360 | ¥60 | ¥30 | ¥450 | ¥550 | 55% |
| 超额（拒绝） | >60 | — | — | — | — | — | — |

**spend counter 必做**：W2 上线时 hardcode `monthly_usage.video_count >= 60` → 拒绝新任务 + UI 提示升级（暂时手动加白名单）

---

## 9. CAC 合规（D14 重启）

v2.0 的 D14 在新方向更复杂——视频内容也要标 AI 生成：

- **导出节点必须**：剪映工程文件第一帧加水印 "本内容由 AI 辅助生成" + 脚本文本结尾追加同样文字
- **W7 launch gate**：抽查 10 个导出，100% 含 CAC 标注
- **抖音平台规则**：用户上传时仍需在抖音 app 内勾选"内容包含 AI 生成"开关 → 在我们的"导出页"加用户提示

Legal 真实咨询推迟到付费用户 ≥ 10 人时（W7 之后），现在用保底文案"本内容由 AI 辅助生成"先上。

---

## 10. v2 资产复用清单（不要重写）

| v2 模块 | v3 用途 | 改动 |
|---|---|---|
| Clerk auth + RLS context | 直接复用 | 无 |
| Drizzle schema (tenants/users/suppression_list) | 直接复用 | 无 |
| LLM provider 抽象（Kimi） | 脚本节点 + 选题分析节点共用 | 加新 prompt 类型 |
| Suppression scanner | 视频脚本 + 选题文本扫描 | 复用 |
| Quick Create UI | 拆解为"输入主题"组件 + 重新嵌入工作流 step 1 | 重构 |
| 脚本结果页 | 拆解为"脚本节点 step 输出"组件 | 重构 |
| spend cap 设计（v2 W4-01 没做） | 直接落地为 monthly_usage 限流 | 新建 |
| 20 样本审计脚本 | 改造为视频可用性审计 | 重写 |

**核心原则**：v3 W1 的脚本节点端到端跑通，**应该 ≤ 1 eng-day**（如果超过，说明在过度重构 v2 代码）。

---

## 11. v3.0 重大风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 选题数据源（飞瓜/新榜）月费失控或合同卡住 | 🔴 高 | W1 立即联系销售 · W4 之前必须签合同或确定第三方爬虫服务 · 备份方案 = 用户自选模式 |
| Seedance 实测稳定性低于永航说的 | 🟡 中 | W2 PoC 50 次 · 不达 70% 切 runninghub · 不达 60% 重新评估方向 |
| 视频生成异步任务给用户的体验难做（要等 5-10min） | 🟡 中 | 进度条 + 邮件/微信完成通知 · 用户可关闭页面回头看 |
| Solo 7 周大概率超时 | 🟡 中 | 每周一回看 calendar · 任一周超产能 30% 立刻砍范围 · 不允许"加班补"模式 |
| H4 批量需求未验证 → 内测时家琳要批量我们没做 | 🟢 低 | W5 内测前预先告知"MVP-1 单任务，批量 v3.5 加" · 留 hooks 不留功能 |
| 没人愿意正式付钱（H1 访谈是空头支票） | 🔴 高 | W6 必须转化 1 笔 · 0 付费 = 不公开发布 · 直接问家琳为什么不付费 |

---

## 12. Resume Protocol（每周一打开本文件）

每周一开工前 5 min：
1. 读上周 W_n 任务的实际产出 vs 计划
2. 标 ✅/⚠️/🔴 到 PROGRESS.md 对应行
3. 如果有 🔴 → 检查 §4 kill conditions 是否触发
4. 检查 §11 风险是否升级
5. 在本文件 §2 calendar 表追加"实际 eng-days vs 计划"

每周五 EOD：
1. 写 1 段 commit message 风格的"本周做了什么"
2. 推到 main
3. PostHog dashboard 截图

---

## 13. v3.0 Launch Gate（2026-06-12）

发布前**必须**全过：

- [ ] §3 Success Criteria 8 条全 ✅
- [ ] §9 CAC 标注 10 样本 100% 通过
- [ ] §8 spend counter 触发测试通过（mock 60 条上限）
- [ ] runbook.md 3 条（视频生成失败 / Seedance 宕机 / 飞瓜 API 拒）
- [ ] landing page 上线 + sign-up flow 通
- [ ] 至少 1 笔付费现金到账
- [ ] P0 bug list = 0

**任一不过 = 推迟 1 周到 06-19**，不要 launch with broken core flow。
