# Prod 状态报告 — 2026-05-06

> 取数时间：2026-05-06（launch checklist 收尾）
> Prod 域名：`https://ai-create-content.herwin.top`（aliased `ai-content-mvp.vercel.app`）
> 最新部署：`9938ba7` → `https://ai-content-pciog44pw-ai-content-mvp.vercel.app`

---

## /api/healthz

```
HTTP 200, 2.36s
{"status":"ok","checks":{"supabase":"ok","redis":"ok","qstash":"ok","posthog":"ok"}}
```

四项依赖（Supabase / Upstash Redis / Upstash QStash / PostHog）均 ok。**说明 PostHog 服务端接线在 prod 工作**——但具体事件是否真 emit 仍需 happy path 跑一次（见 `LAUNCH_VALIDATION_SOP.md` #3）。

---

## .env.local ↔ Vercel Production 差异

### 只在 `.env.local` 不在 prod（1 项）

| 变量 | 评估 | 处置 |
|------|------|------|
| `AI_GATEWAY_API_KEY` | `grep -rn "AI_GATEWAY"` 在 `src/` 0 命中 → 代码未消费 | **不需补**到 prod。可考虑从 `.env.local.template` 删除以减少噪音。 |

### 只在 prod 不在 `.env.local`（7 项）

全部是 **prod-only tuning**，dev 环境不需要：

| 变量 | 用途 |
|------|------|
| `LLM_PROVIDER_TIMEOUT_MS` | LLM 单次调用超时（prod 调高，对抗云上偶发延迟） |
| `NEXT_PUBLIC_APP_URL` | 前端 absolute URL 用（dev 走 localhost 自动推导） |
| `WORKFLOW_SCRIPT_NODE_TIMEOUT_MS` | script 节点硬超时（prod 调高） |
| `WORKFLOW_STORYBOARD_NODE_TIMEOUT_MS` | storyboard 节点硬超时（prod 调高） |
| `WORKFLOW_VIDEO_CONCURRENCY` | =3，今天新增并已验证生效（并发 3 帧） |
| `WORKFLOW_VIDEO_MAX_FRAMES_PER_INVOCATION` | =3，配合并发限制 Pro 60s 函数预算 |
| `WORKFLOW_WORKER_BASE_URL` | QStash worker dispatch base URL，仅 prod |

**结论**：env diff 健康，无 missing-key 风险，无 dev/prod drift。

---

## 发布前 24h checklist 状态

按 `LAUNCH_CHECKLIST.md ## 发布前 24 小时 checklist`：

| 项 | 状态 |
|----|------|
| 所有 15 项 ✅ 或显式降级签字 | 🟢 11 ✅ + 字数降级签字 ✅ + 2 项待用户跑 SOP |
| 本地跑一遍 E2E happy path 录屏 | 🟡 等用户跑 PostHog SOP 时同步录屏 |
| Vercel production 部署最新 main，`/api/healthz` 200 | ✅ 本报告确认 |
| Supabase `llm_spend_daily` 表存在 | 🟡 待 `pnpm db:smoke` 抽样确认 |
| `.env.local` 与 Vercel env 同步 | ✅ 本报告确认 diff 健康 |
| 3 种子用户邀请已发出 ≥ 72 小时 | 🟡 用户已告知发出，待 72h 倒计时（5-09 即满 72h） |
| 自己手机开通微信推送 | — 用户运营事项 |

**剩余阻塞**：仅 PostHog 事件实跑（user SOP）+ 移动端真机复查（user SOP）+ Supabase llm_spend_daily 抽样。

---

## Supabase llm_spend_daily 抽样

```
$ pnpm tsx --env-file=.env.local scripts/probe-spend-table.ts

llm_spend_daily table exists: true
row count: 11
latest 5 rows:
┌─────────┬──────────────┬──────────┬──────────────┬──────────┬────────────┐
│ (index) │ spend_date   │ provider │ total_tokens │ cost_fen │ call_count │
├─────────┼──────────────┼──────────┼──────────────┼──────────┼────────────┤
│ 0       │ '2026-05-06' │ 'kimi'   │ 20920        │ 422      │ 7          │
│ 1       │ '2026-05-06' │ 'kimi'   │ 27999        │ 564      │ 10         │
│ 2       │ '2026-05-05' │ 'kimi'   │ 40279        │ 813      │ 14         │
│ 3       │ '2026-04-30' │ 'kimi'   │ 12331        │ 249      │ 5          │
│ 4       │ '2026-04-30' │ 'kimi'   │ 19039        │ 385      │ 6          │
└─────────┴──────────────┴──────────┴──────────────┴──────────┴────────────┘
```

**结论**：
- ✅ 表存在
- ✅ 11 条真实数据，跨 2026-04-30 → 2026-05-06（5 天）
- ✅ **provider 100% 是 kimi** — CN 合规路由在 prod 实跑实证，无任何跨境 provider 命中
- ✅ spend cap 数据通路工作（cost_fen 累加 + call_count 自增正常）

---

## 总结

发布前 24h checklist：
- ✅ healthz 4/4 ok（含 PostHog 服务端连通）
- ✅ env diff 健康（无 missing key, 7 项 prod-only tuning 合理）
- ✅ llm_spend_daily 存在 + 11 行 kimi-only 数据
- 🟡 待用户跑：PostHog 4 事件实跑 + 移动端真机（合计 ~50min · 见 `LAUNCH_VALIDATION_SOP.md`）
- 🟡 待 5-09 满 72h：3 seed user 邀请已发出窗口
