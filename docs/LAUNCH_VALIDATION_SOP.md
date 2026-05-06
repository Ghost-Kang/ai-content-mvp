# LAUNCH 前最终人工验证 SOP

> 目标：在 2026-05-15 launch 前，由用户（xukang.wang@gmail.com）按本文档逐条跑完两项必须真人参与的验证。
> 自动化能替代的部分（CAC、PIPL）已在 2026-05-06 完成；剩下两项必须真机/真账号。
>
> **prod 域名**：`https://ai-create-content.herwin.top`

---

## #3 PostHog v3 看板确认（产生事件 + dashboard 见到）

### 背景

代码层 4 个事件接线全做完（`src/lib/analytics/server.ts`）：
- `session_started` — 用户首次访问 dashboard
- `script_generated` — script 节点完成
- `script_approved` — solo review gate 通过
- `script_exported` — export 节点产出 zip

### 步骤

1. **打开 prod**：`https://ai-create-content.herwin.top`
2. **登录**：用你自己的 prod 账号（`xukang.wang@gmail.com`）
3. **跑一次 happy path**：
   - 访问 `/dashboard` → 期望产生 `session_started`
   - `/runs/new` 或 `/topics` → 选一个 topic 起 run
   - 等到 script 节点 `done` → 期望产生 `script_generated`
   - 在 review 卡片勾完 5 项 checkbox 点 Approve → 期望产生 `script_approved`
   - 让流程跑完 export 节点 → 期望产生 `script_exported`
4. **打开 PostHog dashboard**：登录 PostHog → Events
5. **在搜索框逐个查这 4 个事件名**，对每个：
   - 截图你这次 run 产生的事件行（含 `distinct_id` 跟你自己的 user 对得上、timestamp 在最近 30 分钟内）
   - 检查 properties 字段是否合理（runId、tenantId、durationMs、costFen 等）
6. **回到 LAUNCH_CHECKLIST.md** "PostHog 4 事件发火"项，把状态改成 `[x]`，证据位置填 4 张截图的存放路径（推荐 `docs/research/posthog-2026-05-XX/`）

### 失败处置

- **看不到事件**：检查 Vercel Production env 是否有 `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST`，二者缺任一就静默丢弃（看 `src/lib/analytics/server.ts:20` 的 `requireEnv` 行为）
- **事件出现但 properties 缺字段**：跟 grep `captureEvent.*<event_name>` 对照源码，bug 写一个 P1 ticket
- **distinct_id 是 anonymous**：意味着 Clerk userId 没传到 analytics。看 `src/lib/analytics/server.ts:128` 上下文

### 时间预算

- happy path 一遍 ~10-15 分钟（含 ~4 分钟视频生成）
- 截图 + 录证据 ~5 分钟
- **合计 ~20 分钟**

---

## #4 移动端人工复查

### 步骤

1. **真机**：用 iOS Safari + Android Chrome 各跑一遍（最低限度 1 台 iOS）
2. **每一台访问的 5 个路径 + 关键交互**：
   - `/` landing page → hero 文字不溢出 / pipeline 动画顺滑 / 各 CTA 可点
   - `/sign-up` → PIPL 告知卡片完整可见 / Clerk widget 表单不被截断 / "已有账号？登录" 链接顺
   - `/sign-in` → 精简 PIPL 告知 + "完整声明 →" 链接顺
   - 登录后 `/dashboard` → 4 张卡片不挤压
   - `/topics` → trending 榜单可滚动 / "用这条" CTA 可点
   - `/runs/new` 起一条 run → workflow canvas 5 张 NodeCard 可横向/纵向流畅滚动
   - **重点**：在分镜节点点"编辑" → EditNodeDialog 应**全屏覆盖**（之前的 Portal bug 在桌面修了，移动端再确认一次）；折叠态 17 帧应可滚动；点开任意一帧编辑可输入 / 点 Esc 或 X 可关闭
3. **截图证据**：每屏 1 张，存 `docs/research/mobile-2026-05-XX/`

### 已知设计折中（不是 bug）

- 落地页 hero 的并排 3 行金句在 < 640px 视口会变 1 列（`lg:grid-cols-[1fr_1fr]` 断点）— OK
- EditNodeDialog 在 < 480px 时 toolbar 的"前往"按钮可能被折叠到第二行 — OK，flex-wrap 设了
- NodeCard 卡片在 < 380px 视口可能字符竖排 —— **如果发现** 写 P1 ticket 加 `min-width` 兜底

### 失败判据 (≥1 项即推迟 launch)

- 任何路径白屏 / 报错弹窗
- EditNodeDialog 又被困在 NodeCard 内（Portal 失效回归）
- 关键 CTA（登录、起 run、编辑、保存）在真机上无法点击

### 时间预算

- iOS 一遍 ~15 分钟
- Android 一遍 ~15 分钟（可以晚点补）
- **合计 ~30 分钟**

---

## 完成标记

跑完后回到 `docs/LAUNCH_CHECKLIST.md`：
- [PostHog 4 事件发火] 标 `[x]`，证据位置填截图目录
- [移动端] 此 checklist 没有显式条目；在 `## 发布前 24 小时 checklist` 增加 `[x] 移动端真机复查通过`

跑完后告诉我具体结果，我同步更新 PROGRESS + 关 task。
