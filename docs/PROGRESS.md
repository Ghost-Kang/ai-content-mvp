# PROGRESS — AI 短视频内容工作流平台 (v3.0 PIVOT)

**Last updated**: 2026-04-26
**Resume point**: 🟢 **W1 全绿 + W2-01..W2-07b 全绿 + W2-04 真 API 验完 + W3-01..09 + W4-07 锁定 + D31 (新榜签) + D32 (Seedance pricing) + D33 (默认 480p) + D34 (单位经济重算)**。W2-04 step 3 实跑 5/5 success @ 720p · mean 1m27s · cost 由 token-based billing（¥15/M tokens）实测，非 D24 估算。Step 4 (50 跑) 已 ✅ skipped — pricing 由控制台 + 1 次 480p 测量定死。**默认 480p / 60条/月 = 37% 毛利**，720p 留作付费升级档。`storage:probe` ✅ 已建 bucket。
**Current phase**: 🟢 **进入 W4 选题节点 + W5 内测准备** — 7-week launch (06-12) on track（pre-sprint 已带跑 ~50% 工程量）

---

## 🟣 v3.0 任务序列（2026-04-22 起）

| # | 任务 | 文档 | 截止 | 状态 |
|---|---|---|---|---|
| V3-00 | 发 P1-P3 二次访谈邀请 + 找 1 个 P4 冷启动候选 | `INTERVIEW_V2_OUTREACH.md` | 2026-04-22 | ✅ 已完成 |
| V3-01 | 视频生成模型调研 | `RESEARCH_VIDEO_GEN.md` | 2026-04-25 | ✅ **跳过**（永航 V3-03 白送数据 → D24 直接定 Seedance） |
| V3-02 | 自动发布方案调研 | `RESEARCH_AUTO_PUBLISH.md` | 2026-04-25 | ✅ **跳过**（H3 = 3/4 接受 (c)，D25 锁定无需深度调研） |
| V3-02b | C 方向极速调研（备胎） | `RESEARCH_C_DIRECTION.md` | 2026-04-26 | ✅ **跳过**（H1 PASS = 不需要备胎，D29 撤销） |
| V3-03 | 4 场访谈 H1-H5 验证 | `P1-P2-P3-家琳-苗苗-永航-v2-0425.md` | 2026-04-29 | ✅ **2026-04-23 提前完成** |
| V3-04 | 裁决 + 在 DECISIONS_LOG 追加签字 | `DECISIONS_LOG.md` | 2026-04-30 硬止损 | ✅ **2026-04-23 已签**（H1 PASS / H3 PASS-(c) / D23 D24 D29 D30 一并签） |
| V3-05 | 写 `STRATEGY_PACKAGE_V3.md` + MVP-1 sprint plan | `STRATEGY_PACKAGE_V3.md` | 2026-05-01 | ✅ **2026-04-23 完成**（B+B+内测 / 7 周到 06-12） |
| V3-06 | 写 `ENG_TASKS_V3.md`（W1-W7 41 tickets）+ `OUTREACH_V3.md`（vendor + 内测预告稿） | `ENG_TASKS_V3.md` / `OUTREACH_V3.md` | 2026-04-23 | ✅ **2026-04-23 完成** |

### 🟢 当前下一步（W1 已绿 → 04-25 vendor 锁定 → 04-28 启动 W2）

**🟢 lead-time 任务全部完成（2026-04-25 D31 提前结）**：
- [x] **新榜签约（D31，2026-04-25）** — 飞瓜/灰豚/洞察猫 outreach 全部 SUPERSEDED，见 `DECISIONS_LOG.md` D31
- [x] W1 Gate 第 3 条「飞瓜系 ≥1 家报价」**提前 3 天满足**（用新榜替代）
- [x] `pnpm storage:probe` 成功（2026-04-25），`workflow-exports` bucket 已建（50 MiB cap），upload+sign+delete 全过

**🔴 真正还要等的事**：
1. ~~飞瓜/新榜/灰豚 任意 1 家给出 API 报价~~ → ✅ **新榜签约 04-25**；待你贴 API 文档启动 W4-01 实施
2. `SEEDANCE_API_KEY` 申请中（你 2026-04-25 提交）— 拿到后启动 W2-04 真 PoC
3. 内测 5 名种子用户在 W7 前 deck 排期 — 已访谈过 3 人（家琳、苗苗、永航）+ 找 P4 + 1 名补员

**W1（04-28..05-04）· 5 eng-days · 工作流引擎 + 脚本节点复用**
- W1-01..09 共 9 个 tickets，详见 `ENG_TASKS_V3.md` Week 1 行
- W1 Gate 4 条：probe 5/5 通 / db smoke 绿 / 飞瓜系 ≥1 家报价 / PostHog 事件可见
- 进入 sprint 执行模式：每周一 resume 本文件 + 标 ✅/⚠️/🔴

**🟢 W1 全部工程任务已完成（2026-04-23 单日 8 ticket pre-sprint）**
- ✅ W1-01-V3：4 表 schema + 触发器 + RLS（`app/drizzle/0002_workflow_v3.sql` + `app/scripts/migrate-v3-workflow.ts` + Drizzle TS schema 追加）
- ✅ W1-02-V3：NodeRunner 抽象 + 状态机（`app/src/lib/workflow/node-runner.ts`）+ 4 case 单测（`scripts/test-workflow-runner.ts`）
- ✅ W1-03-V3：Orchestrator + monthly_usage 原子 upsert（`app/src/lib/workflow/orchestrator.ts`）+ 失败时 partial 累计
- ✅ W1-04-V3：ScriptNodeRunner 复用 v2 thin slice 全部 prompt/validator/scanner（`app/src/lib/workflow/nodes/script.ts`，**0 prompt 重写**）
- ✅ W1-05-V3：`workflow.create / run / get / list` tRPC endpoints（`app/src/server/routers/workflow.ts`）
- ✅ W1-06-V3：5-topic e2e probe 脚本（`app/scripts/probe-workflow-v3.ts`，需 LLM key）
- ✅ W1-07-V3：月度 cost cap (¥500) + 视频条数 cap (60) framework（`app/src/lib/workflow/spend-cap.ts`）+ Orchestrator preflight 接入 + 5 case 单测（`scripts/test-spend-cap.ts`）
- ✅ W1-08-V3：~~飞瓜/新榜/灰豚销售联系~~ → **新榜已签约 2026-04-25（D31）**，飞瓜/灰豚/洞察猫 SUPERSEDED；W4-01..04 围绕新榜 API 实施
- ✅ W1-09-V3：PostHog v3 事件 schema（7 events: run started/completed/failed + node completed/failed/retried + monthly_cap_blocked）+ Orchestrator + NodeRunner 埋点接入 + schema 文档（`ANALYTICS_V3.md`）

**🟢 W1 工程 Gate 验证结果（2026-04-23 实跑）**：
| 命令 | 结果 | 说明 |
|---|---|---|
| `pnpm db:migrate:v3`   | ✅ 4 表 + 3 enum + RLS + 触发器全建 | idempotent，二次跑只 NOTICE 不报错 |
| `pnpm db:smoke:v3`     | ✅ 9/9 步骤过 | tenant→user→run→5×steps→push→usage→join→cascade 全验 |
| `pnpm db:probe:v3`     | ✅ 8/8 跨 tenant 断言全过 | RLS 拒绝 B 读 A 的 run/steps/push/usage |
| `pnpm wf:test`         | ✅ 4/4 case 全过 | happy / retry / final-fail / cascade-halt |
| `pnpm wf:test:cap`     | ✅ 5/5 case 全过 | fresh / projected-refuse / preflight-halt / mid-run-cap / video-cap-fires-first |
| `pnpm wf:probe`        | ✅ **4/5** 达阈值（threshold=4） | 第 5 条因 v2 LLM 日预算 525/500 分耗尽提前阻断 — **不是 workflow bug，是 v2 spend cap 正在工作**；4 条平均 ~53s/run |
| `pnpm typecheck`       | ✅ 0 错误 | |
| `pnpm lint`            | ✅ 0 警告/错误 | |

**已修 bug**：probe cleanup 漏删 `llm_spend_daily`（FK 阻 tenant 删除）→ 已补 `llmSpendDaily` 删除 + 一次性脚本 `scripts/cleanup-orphan-probe.ts` 已清掉孤儿 tenant `1de0ac83…`。

**还差最后一件**：到 PostHog 看板验 7 个 v3 事件是否可见 — `workflow_run_started/completed`、`workflow_node_completed × N`、`monthly_cap_blocked` 应该已经在 4 次成功 run + 1 次 spend-cap fail 中触发；按 `ANALYTICS_V3.md` Verification protocol 走一遍。

**🟢 W2-01-V3 已完成（2026-04-23 当日 pre-sprint，最终 10/10 first-try clean）**
- ✅ 分镜 prompt v0：`app/src/lib/prompts/storyboard-prompt.ts`（17→17 帧 1:1，4 字段 scene/imagePrompt/cameraLanguage/onScreenText）
- ✅ 8 词镜头语言词表：特写/中景/全景/拉远/推近/平移/俯拍/仰拍（强制必选 + ≥5 种多样性 + 禁连续 3 帧同词）
- ✅ Validator：9 类硬失败（PARSE/COUNT/INDEX/MISSING/VOCAB/PLACEHOLDER）+ 4 类软警告（imagePrompt 截断/低于地板 / camera 多样性不足 / 抑制词命中）
- ✅ 真实 v2 脚本 fixture：`app/scripts/fixtures/script-output-sample.json`（181 字 17 帧，含 graceful degradation case，更能压力测）
- ✅ 11 case 离线 validator 单测：`scripts/test-storyboard-validator.ts`（**47/47 assert 全过**，无 LLM 无 DB）
- ✅ 10 次真 LLM e2e probe（KIMI / `LLM_TENANT_DAILY_CAP_CNY=20`）：`scripts/probe-storyboard-v0.ts` — **10/10 首试通过、0 retry、0 截断、0 抑制词、中位 31s**
- ✅ Probe acceptance 逻辑升级：v2 spend-cap 失败不再算 prompt 失败（基础设施失败 ≠ 质量失败）
- ⚠ **已知软信号（不阻 acceptance，转 W2-04 Seedance PoC 后再判）**：
  - imagePrompt 低于 40 字地板：10/10 runs（KIMI 偏好简短，平均 ~25 字）— 视 Seedance 输出再决定是否升级到 GPT-4o-mini 或加固 prompt
  - 镜头语言多样性不足（< 5 种 / 17 帧）：4/10 runs — 同上
- ✅ 关键 bug 修：3 处模板字面量内未转义反引号（line 145/162/162）导致 esbuild CJS 转换 mangle suppression import → `<…>` 改 ASCII 占位符 + `\``  转义
- 新增 npm scripts：`wf:test:storyboard` / `wf:probe:storyboard` / `wf:fixture:script`

**🟢 W2-02-V3 已完成（2026-04-24 当日 pre-sprint）**
- ✅ `StoryboardNodeRunner`：`app/src/lib/workflow/nodes/storyboard.ts`（`stepIndex=2`，`upstreamRequired: ['script']`，`maxRetries=0` — 内部 LLM 重试 budget=2，外层不再叠加）
- ✅ 复用 W2-01 `buildStoryboardPrompt` + `validateStoryboard`，**0 prompt 重写**
- ✅ `callLLM` 抽成 `protected` 方法 → 测试可注入 fake response 队列，生产仍走 `executeWithFallback` + KIMI 主路
- ✅ 内部 retry 循环 + best-attempt 跟踪：硬失败重试 1 次再失败 → 抛 `VALIDATION_FAILED`（避免半成品下游渲染）；软警告进 `qualityIssue` 不阻塞
- ✅ 接入 `buildDefaultOrchestrator()`：`script → storyboard` 完整 chain，下游 W2-04 Seedance 直接 join `workflow_steps.output_jsonb`
- ✅ 4 case mock-LLM 单测：`scripts/test-storyboard-runner.ts` — happy / retry-success / degraded-final-fail / upstream-missing — **30/30 assert 全过**
- ✅ 真 LLM e2e probe 升级 `wf:probe` 加 storyboard 步骤断言：**5/5 runs done · 100% storyboard coverage**（KIMI / `LLM_TENANT_DAILY_CAP_CNY=50` / 总耗时 12 分钟）
- ⚠ **复现的 W2-01 软信号**：sample storyboard `min imagePrompt 28 chars · 3 distinct cameras` — 同样转 W2-04 Seedance PoC 后再判
- ✅ `pnpm typecheck` 0 错误
- 新增 npm script：`wf:test:storyboard:runner`

**🟢 W2-03-V3 已完成（2026-04-24 当日 pre-sprint · 离线部分）**
- ✅ 视频生成抽象层落地：`app/src/lib/video-gen/`（types / providers/base / providers/seedance / config / index）— 形态对齐 `lib/llm`，未来加 Liblibtv / Kling 仅需新增 provider 文件
- ✅ `SeedanceProvider`：火山方舟 Ark `POST /api/v3/contents/generations/tasks` + `GET .../tasks/{id}` 实现；`Bearer` 鉴权 + `X-Request-Id` 注入；`fetchImpl` 注入接口让单测全离线
- ✅ 错误分类落 `VideoGenError`（7 码）：`RATE_LIMITED` / `AUTH_FAILED`（含 quota wording 检测）/ `BAD_REQUEST` / `CONTENT_FILTERED`（risk_control / sensitive 词识别）/ `PROVIDER_UNAVAILABLE`（5xx + 网络）/ `GENERATION_FAILED` / `POLL_TIMEOUT` / `UNKNOWN`；`retryable` 标位与 LLM 层一致
- ✅ 状态机映射 `mapArkStatus`：兼容 `queued|pending` → queued、`succeeded|success|completed` → succeeded、未知值降级为 `running`（不会误报成功）
- ✅ 成本就地估算：成功 poll 拿 `usage.total_seconds` × `costPerSecondFen`（默认 60 分/秒 = D24 ¥6/10s 假设）— W2-04 PoC 测真值后回来调
- ✅ 10 case mocked-fetch 单测：`scripts/test-seedance-client.ts` — happy / rate-limit / quota / bad-request / 5xx / 内容审核 / 网络异常 / running→failed 生命周期 / succeeded-without-url 异常 / validateConfig 缺 key 报错 — **40/40 assert 全过**
- ✅ `.env.local.template` 加 `SEEDANCE_API_KEY` + 3 个可选 override + 文档链接（火山方舟控制台）
- ✅ `pnpm typecheck` 0 错误
- 新增 npm script：`vg:test:seedance`
- ⚠ **W2-03 验收一半依赖外部 key**：「单条 60s 视频跑通 × 2 + 4 种错误各测 1 次」中后者已 mocked 100% 覆盖；前者需要：用户在火山方舟充值 → 拿 key → 写入 `.env.local SEEDANCE_API_KEY=...` → 跑后续将加的 `vg:probe:seedance` 真 API smoke

**🟢 W2-05-V3 + W2-06-V3 已完成（2026-04-24 当日 pre-sprint · 离线部分）**
- ✅ `VideoGenNodeRunner`：`app/src/lib/workflow/nodes/video.ts`（`stepIndex=3`，`upstreamRequired: ['storyboard']`，外层 `maxRetries=0` — 内部按帧串行，每帧自带重试 budget=2 + 指数退避 500ms × 2^attempt 封顶 4s）
- ✅ 帧级 cap preflight 修正（**实跑发现的真 bug**）：`assertCapAllows` 默认只看 DB-持久化快照，但 Orchestrator 跑完才 bump `monthly_usage` → 必须把 `runningCostFen + estimatedFrameCostFen` 一起投进去，否则中途熔断会晚 1-2 帧触发；测试 case 5 把这条规则钉死（preload 49,200 fen → 第 3 帧投 50,100 触发 cap）
- ✅ 失败策略 W2-06 落地：retryable（RATE_LIMITED / PROVIDER_UNAVAILABLE / 网络）走 2 次重试；non-retryable（CONTENT_FILTERED / BAD_REQUEST / AUTH_FAILED / GENERATION_FAILED）立即抛 `NodeError`；任何帧最终失败 → 整个节点失败（半渲染分镜对下游 ExportNode 无意义）
- ✅ 轮询循环：`pollUntilTerminal` 每 `WORKFLOW_VIDEO_POLL_INTERVAL_MS`（默认 2s）跑一次，5 分钟硬天花板；retryable poll 错误退避后继续，non-retryable 立即抛
- ✅ 成本记账：成功帧 `actualDurationSec × provider.costPerSecondFen` 入 `NodeResult.costFen` + `videoCount += 1`；通过 Orchestrator 进 `workflow_steps.cost_fen` + `monthly_usage`
- ✅ Provider 注入接口：构造函数 `new VideoGenNodeRunner(provider?)` — 生产用 `getDefaultVideoProvider()`（Seedance），单测注 `FakeVideoProvider`（队列化 submit/poll outcome），完全离线
- ✅ 演示成本护栏：`WORKFLOW_VIDEO_MAX_FRAMES_PER_RUN` env 默认不设 = 渲全部帧；W2-04 PoC 期间设 3 防止失控重试烧钱
- ✅ 双轨 orchestrator：`buildDefaultOrchestrator()` 仍是 script→storyboard（让 `wf:probe` 不需 Seedance key），`buildFullOrchestrator()` 多挂一个 video 节点（W2-04 / 内测启用）
- ✅ 6 case mocked-provider 单测：`scripts/test-video-runner.ts` — 3-frame happy / submit retry / poll lifecycle / non-retryable 立即抛 / cap 中途熔断 / upstream missing — **38/38 assert 全过**
- ✅ 5 个 W1+W2 套件全绿回归：`wf:test`、`wf:test:cap`、`wf:test:storyboard`、`wf:test:storyboard:runner`、`vg:test:seedance`
- ✅ `pnpm typecheck` 0 错误
- 新增 npm script：`wf:test:video:runner`
- ⚠ **W2-05 验收一半依赖外部 key**：「3 帧 demo run 通」中状态机 / 重试 / cap 已 mocked-provider 验完；真 Seedance 端到端跑通需要 W2-04 落地后接管

**🟢 W3-01-V3 已完成（2026-04-24 当日 pre-sprint · 离线全部，零外部依赖）**
- ✅ `lib/export/types.ts`：`ExportFrame` / `ExportInput` / `ExportNodeOutput` / `JianyingArtifact` 契约 + `resolutionToPx`（720p → 1080×1920 9:16，抖音短视频默认）+ `secondsToMicros`（**round 不 floor，避免 1µs 黑帧** — 实跑发现的真坑）
- ✅ `lib/export/script-text.ts`：`buildScriptText()` 输出 `.txt` 三段（标题/总时长 → 帧块 (旁白/字幕/视频URL/M:SS 时间码累加) → AI 水印），**水印 W3-03 partial 落地**：默认 = 「本内容由 AI 辅助生成（依据《互联网信息服务深度合成管理规定》第十七条标注）」，空 override 兜底为默认（合规契约不能被空字符串绕过）
- ✅ `lib/export/jianying.ts`：`buildJianyingDraft()` 生成 **draft_content.json + draft_meta_info.json 双文件**（剪映加载必需）+ canvas_config + materials.{videos,texts,audios} + tracks → segments，全部时间 **微秒**；text material 仅为有 `onScreenText` 的帧创建（避免空字幕渲染 bbox）
- ⚠ **MVP-1 已知 fidelity 缺口**：`materials.videos[i].path` 直接放 Seedance HTTPS URL（旧版剪映拒绝 → `downloadHints[]` 列出每帧推荐本地文件名 `frame-NN.mp4`，W3-04 zipper 会预下载并 rewrite path）；新版剪映 (≥ 5.x) 加密 draft，需走「导入工程包」流程 — 在 W3-04 用户 readme 里写明
- ✅ `nodes/export.ts`：`ExportNodeRunner`（`stepIndex=4`，`upstreamRequired: ['storyboard','video']`，`maxRetries=0` — 纯 CPU 失败再跑还是失败）；按 `index` join storyboard ↔ video，video 缺帧立即 `VALIDATION_FAILED`（半渲染分镜对最终交付无意义，不存假货）
- ✅ `buildFullOrchestrator()` 升级为 4 节点（script → storyboard → video → export），W4 接入 topic 后即 5 节点完整链
- ✅ 9 case 纯函数序列化器单测：`scripts/test-export-serializers.ts` — script 4 case (happy / 字幕缺失 / 水印兜底 / 空 throws) + jianying 5 case (顶层 keys / text 仅有字幕帧 / material_id 引用完整性 / downloadHints 零填充 + 对齐 / 空 throws) — **40/40 assert 全过 · 580ms 全跑完**
- ✅ 4 case ExportNodeRunner 真 DB 单测：`scripts/test-export-runner.ts` — happy 3-frame / video 帧数 < storyboard → VALIDATION_FAILED / storyboard upstream 缺 → UPSTREAM_MISSING / video upstream 缺 → UPSTREAM_MISSING — **24/24 assert 全过**
- ✅ **8 个 W1+W2+W3 套件全绿回归**：`wf:test`、`wf:test:cap`、`wf:test:storyboard`、`wf:test:storyboard:runner`、`wf:test:video:runner`、`wf:test:export`（new）、`wf:test:export:runner`（new）、`vg:test:seedance`
- ✅ `pnpm typecheck` 0 错误
- 新增 npm script：`wf:test:export` / `wf:test:export:runner`

**🟢 W3-04-V3 已完成（2026-04-24 当日 pre-sprint · 离线全部，唯一外部依赖 = `storage:probe` 一次创建 bucket）**
- ✅ `lib/export/readme.ts`：用户拿到 zip 解压后看到的 `README.md` — 三段说明（最快导入剪映 / 加密版剪映兜底 / 纯文案版本）+ 故障排查 + **合规声明（《互联网信息服务深度合成管理规定》第十七条强提示）**
- ✅ `lib/export/bundle.ts`：`buildExportBundle()` 把 W3-01 三件套 (`script.txt` + `draft_content.json` + `draft_meta_info.json`) + 拉下来的 `clips/frame-NN.mp4 × N` + `README.md` 打成一个 zip
  - **关键修补 (W3-01 留的坑)**：rewriteDraftPaths 把 `materials.videos[i].path` 从 Seedance HTTPS URL 改写为 `./clips/frame-NN.mp4`，**用 W3-01 钉的 `extra_info: 'frame-N'` 做稳定 join key**（不是按 URL match，因为单帧重跑 URL 会变）
  - Slug fallback：纯中文标题用 hash 摘要（`export-topic-XXXXXXXX-YYYYMMDD.zip`），纯 ASCII 走 kebab-case；test case 7 验证两种 path
  - 容错模式：`allowPartial: true` 时单帧 fetch 失败仍出 zip + 在 `missingFrames[]` 列出（默认 strict — MVP-1 不出半成品）
  - 串行下载（不并发）— Seedance 短视频典型 5-15 帧，串行省 429 风险，几乎不慢
- ✅ `lib/storage/supabase.ts`：service-role 客户端单例 + `uploadExportBundle()` (upsert + 签 7 天 URL) + `StorageError` 错误码 (`NO_CLIENT` / `UPLOAD_FAILED` / `SIGN_FAILED`) — **server-only，明确 lint 隔离**
- ✅ `nodes/export.ts` 升级：构造函数注入 `{fetcher, uploader, storageConfiguredFn}`（test seam）；执行流：W3-01 序列化 → 检查 `storageConfigured` → bundle + 1 次重试（2s 退避）→ upload → 写 `output.bundle.{signedUrl, expiresAt, objectPath, filename, bytes, missingFrames}`
- ✅ **优雅降级**：`SUPABASE_SERVICE_ROLE_KEY` 缺失 OR `WORKFLOW_EXPORT_SKIP_BUNDLE=1` → `output.bundle = null`，但 JSON 三件套照旧落 `workflow_steps.output_json`（dev 环境永远不爆）
- ✅ 错误分类落实：`BundleError(INPUT_INVALID)` → `NodeError(VALIDATION_FAILED)` 不重试；`BundleError(FETCH_FAILED)` 退避 1 次重试后还失败 → `NodeError(PROVIDER_FAILED)`；`StorageError` → `NodeError(PROVIDER_FAILED)` 立即抛
- ✅ 新增 `scripts/probe-storage.ts`：一次性 bootstrap — 检查 creds → 创建 `workflow-exports` bucket（private，200 MiB cap）→ smoke upload + sign + delete → 不进回归套件
- ✅ 8 case bundle 离线单测：`scripts/test-export-bundle.ts` — happy 3-frame 全文件齐 + 路径改写 / allowPartial / strict 失败抛 / HTTP 500 / 空 input / suggestedName 格式 / 中文 topic slug fallback / README 列出每个 clip — **38/38 assert 全过 · 1.1s 全跑完**
- ✅ 7 case ExportNodeRunner 真 DB 单测扩展：W3-01 4 case + W3-04 3 case (storage 配齐 happy / 第 1 帧 fetch flake → 重试成功 / uploader 抛 StorageError → PROVIDER_FAILED) — **44/44 assert 全过**
- ✅ `output_jsonb.bundle` 字段契约：`{signedUrl, expiresAt, objectPath, filename, bytes, missingFrames[]}` 或 `null` — 前端 W3-05 直接拉这个字段渲染下载按钮
- ✅ **9 个 W1+W2+W3 套件全绿回归**：`wf:test`、`wf:test:cap`、`wf:test:storyboard`、`wf:test:storyboard:runner`、`wf:test:video:runner`、`wf:test:export`、`wf:test:export:bundle`（new）、`wf:test:export:runner`（扩展）、`vg:test:seedance`
- ✅ `pnpm typecheck` 0 错误
- 新增 npm script：`wf:test:export:bundle` / `storage:probe`
- 新增依赖：`jszip@3.10.1`（11 子包，DEFLATE 压缩，Node + 浏览器同构）
- 新增 env 模板：`WORKFLOW_EXPORT_SIGNED_URL_TTL_SEC` / `WORKFLOW_EXPORT_SKIP_BUNDLE`
- ⚠ **W3-04 真世界验收剩 2 步**：① 用户跑一次 `pnpm storage:probe` 验证 service-role key + 自动建 bucket（5 秒事）；② W2-04 通过后用真 Seedance 输出端到端跑一次 → 把签名 URL 在浏览器下载 → 解压 → 真剪映打开看时间轴（W3-02 验收契约）

**🟢 W3-05-V3 v1 已完成（2026-04-24 当日 pre-sprint · 离线全部，无外部依赖）**
- ✅ `lib/workflow/ui-helpers.ts`：5 节点固定顺序 (topic/script/storyboard/video/export) + 中英标签 + step/run 状态颜色三件套（pending/running/done/failed/skipped/dirty + cancelled）+ 终态判定 `isTerminalRunStatus()` + `formatFen` / `formatRelativeTime` / `computeRunProgress`（每节点 20%，running 折半，done/skipped 满）— **Tailwind 类全字面量，PurgeCSS 安全**
- ✅ `components/workflow/StatusBadge.tsx`：`StepStatusBadge` + `RunStatusBadge` 双胞胎，`running` 自动渲染 amber 脉冲点
- ✅ `components/workflow/BundleDownload.tsx`：W3-04 `output.bundle` 直挂下载按钮 — 字节大小 (B/KB/MB/GB 自适应) + 签名 URL 过期相对时间 ("3 分钟后过期" / "已过期 — 请重跑导出节点") + `missingFrames` 部分导出 amber 警告 + bundle = null 时降级提示「JSON 三件套仍在 output_jsonb」
- ✅ `components/workflow/NodeCard.tsx`：单卡 = 头 (序号 · 中文 · 英文 · StepStatusBadge) + body (5 节点各自渲染器，全部走 `safeGet()` 防御读 jsonb) + 折叠的「展开原始 output_jsonb」`<pre>` (max-h-72 overflow-auto) — 5 节点 summary 各自独立：
  - topic: run.topic 直显
  - script: 帧数 + 字数 + 第 1 帧 voiceover 3 行截断
  - storyboard: 帧数 + 总时长 + 第 1 帧 scene 2 行截断
  - video: 段数 + 时长 + 累计花费 + 「预览第 1 段」外链
  - export: 时长 + 生成时间 + `<BundleDownload>`
- ✅ `components/workflow/WorkflowCanvas.tsx`：单 run 主视图 — header (主题 + 进度条 + RunStatusBadge + 累计花费 + 段数 + run.errorMsg banner) + `lg:grid-cols-5` 横向 5 卡 + active 节点 amber 高亮 + **2s 自动轮询**（`isTerminalRunStatus` 即停，`refetchInterval` v5 接 Query 对象不接 data）
- ✅ `components/workflow/RunsList.tsx` + `app/runs/page.tsx`：v3 Workspace 列表页 — 5s 自动刷新（cheap query 单索引扫）+ 空态 CTA + 每行点击直进 detail
- ✅ `components/workflow/NewRunForm.tsx` + `app/runs/new/page.tsx`：主题输入 (2-300 字) + **fire-and-forget 模式** — `workflow.create.await()` 拿 runId → `workflow.run` 不 await 直接 `router.push(/runs/[runId])` → detail 页轮询接管；`useMutation.mutateAsync().catch()` 拦后台错误进 console 但不阻断导航 · **honest 限制**：用户完全离开浏览器期间 Vercel 可能 abort orchestrator 请求，导致 run 卡在 running — 真正解药是 W2-07 QStash 异步派发（已在 file header 注明）
- ✅ `app/runs/[runId]/page.tsx`：detail 页壳 server component（`force-dynamic`）+ `<WorkflowCanvas runId={...}/>` 客户端组件
- ✅ `app/dashboard/page.tsx`：dashboard 加 v3 Workspace 入口卡（与 v2 Quick Create 并列），保留 v2 不动 — v2 surface 暂时共存
- ✅ **零新依赖**：纯 Tailwind + tRPC react-query + Clerk UserButton（已有），无 framer-motion / shadcn 等扩展
- ✅ `pnpm typecheck` 0 错 + `pnpm lint` 0 警告（rules-of-hooks 提早早返时报错 → 已重构 useMemo 提到早返之上）
- ✅ 9 套引擎回归套件再跑全绿（`wf:test` / `wf:test:export:runner` / `wf:test:export:bundle` 抽样验证未破坏后端契约）

**⚠ W3-05 v1 已知缺口（写明给后续优先级排序）**：
1. ~~**fire-and-forget 离开浏览器即断**~~ → ✅ **W2-07a 已修**（QStash 派发 → orchestrator 与 HTTP request 解耦）
2. **轮询 2s 间隔，无 SSE 推送**：剩余 W2-07b 工作。MVP-1 内测 5 用户网络足迹一样，**已显式延后**（见下方 W2-07a 说明）
3. **节点编辑 / 重试 / 跳过 按钮缺失**：W3-06 / W3-07 单独排
4. **手机端走查未做**：MVP-1 内测目标用户用桌面剪映，桌面优先；手机端最多看进度，不参与导出
5. **真 run 截图走查待跑**：用户启 dev 服 + 跑 1 条真 workflow + 看 `/runs/[runId]` 5 卡渲染 = 视觉验收唯一缺口

**🟢 W2-07a-V3 已完成（2026-04-24 当日 pre-sprint · 离线全部，零外部依赖）**
- ✅ Dispatcher 抽象：`app/src/lib/workflow/dispatch.ts` — `inline | qstash` 双模 + auto-detect（QSTASH_TOKEN + 公网 URL → qstash，否则 inline）+ 显式 `WORKFLOW_DISPATCH_MODE` 覆盖；DispatchDeps 注入接口让单测全离线
- ✅ Worker 路由：`app/src/app/api/workflow/run/route.ts` — `POST` + `runtime: nodejs` + `maxDuration: 300`；
  - 签名校验：`verifySignatureAppRouter` 守门，开发态 `WORKFLOW_WORKER_SKIP_SIGNATURE=1` 或缺签名 key 时自动放行（生产 fail-CLOSED）
  - **CAS 锁幂等**：`UPDATE workflow_runs SET status='running' WHERE status IN ('pending','failed') RETURNING id` —— QStash 重试 / 用户重提全部撞死锁后吞 200 ok+ignored，杜绝双跑（NodeRunner 本身不是 run-级幂等的）
  - 任何 post-lock 异常 → 写 `failed` + 200（拒绝再让 QStash 重试同一 run）
  - 仅 lock acquisition 本身的 DB 异常 → 500 让 QStash 重试（锁本身可重入）
- ✅ `workflow.run` 改派发：tRPC mutation 原本同步 await orchestrator → 现在 `await dispatchRun(runId)` 50ms 内返回 `{runId, dispatched, mode, messageId, dispatchedAt}`；dispatch 失败 → `INTERNAL_SERVER_ERROR` 直接给客户端
- ✅ 保留 `workflow.runSync`：legacy 同步入口仅给 CLI probe / 测试用，UI 不再调
- ✅ NewRunForm 重构（去 W3-05 fire-and-forget hack）：`await runWorkflow.mutateAsync({runId})` 干净链式 + dispatch 错误冒泡走 `friendlyFromAny` 显示给用户；离开页面不再影响后台 orchestrator（QStash 已经接管）
- ✅ `.env.local.template` 加 `WORKFLOW_DISPATCH_MODE` / `WORKFLOW_WORKER_BASE_URL` / `WORKFLOW_WORKER_SKIP_SIGNATURE` 3 个开关 + 注释
- ✅ 8 case dispatcher 单测：`scripts/test-dispatch.ts` — inline happy / inline non-blocking / qstash happy / no-public-url / explicit override / invalid mode / publish throws / auto-detect — **23/23 assert 全过**，无 DB 无 QStash 无网络
- ✅ 4 套引擎回归全绿（`wf:test` / `wf:test:cap` / `wf:test:storyboard` / `wf:test:export`）
- ✅ `pnpm typecheck` 0 错 + `pnpm lint` 0 警告
- 新增 npm script：`wf:test:dispatch`

**⚠ W2-07a 已知缺口 / 故意延后**：
1. **SSE 推送（W2-07b）**：UI 仍是 `useQuery + refetchInterval: 2000`，MVP-1 5 内测用户和 SSE 网络足迹一样，价值<工作量。已写进 W2-07b 待办，等真有用户体验摩擦再做
2. **per-node QStash 链（W2-07c）**：当前是「整个 orchestrator 一次 QStash 调用」，Vercel Pro 单次 function 上限 300s。完整 5 节点（特别视频节点）可能超时。Mitigation：先看 prod 实跑数据，超了再拆每节点一次 QStash + RUNNING 状态轮转
3. **未做 cancel mutation**：用户取消跑中 run 还得手动改 DB；下次需求来再加（NodeRunner 之间的 status 检查点工作量小）

**🟢 W2-07a 真 Vercel preview 端到端验收完成（2026-04-24）**

部署 preview `ai-content-bsrofu96z-ai-content-mvp.vercel.app`，提交真 workflow（topic「生活的苦难」），1 分钟内拿到：
- SCRIPT ✅ done（17 帧 194 字，KIMI 免费 tier 跑通）
- STORYBOARD ✅ done（17 帧 53.0 秒）
- VIDEO GEN ❌ failed `UNKNOWN: video frame 1 unknown error: Seedance API key not configured` — 预期（key 未配置 + friendly error mapper 中文化）
- EXPORT ⏸ skipped（cascade halt 正确）
- UI 进度条 40% + 红色 banner + 2s 轮询自动停止

证明的事：dispatcher 50ms 返回、QStash 真接管、Vercel worker route 被回调、签名验证通过、CAS 锁工作、orchestrator cascade halt 工作、UI 轮询拿到完整状态 — **W3-05 fire-and-forget 限制彻底干掉**。

**踩坑记录（写进 dispatch.ts 注释 + .env.local.template）**：
1. **QStash region URL 命名**：默认 `qstash.upstash.io` 路由到 EU；US 账号必须设 `QSTASH_URL=https://qstash-us-east-1.upstash.io`（注意是 `qstash-<region>.upstash.io`，不是 `<region>.qstash.upstash.io`，后者不存在 DNS）
2. **Clerk middleware 误拦 webhook**：`/api/workflow/run` 必须加 isPublicRoute 白名单，否则 307 → /sign-in，QStash 收 307 不跟随 → 全部 retry 失败、无 Vercel 日志（edge 层吃了请求）。Auth 模型：QStash signature = AuthN，CAS lock on workflow_runs.status = AuthZ
3. **Node fetch 错误必须挖 cause**：`fetch failed` 是空壳，真因藏在 `err.cause.message` + `err.cause.code`（ENOTFOUND / ECONNREFUSED 等）。dispatch.ts 现在 `describeFetchError()` 自动透传

**下一步部署到 prod（key 到位后）**：`vercel deploy --prod` — 同样 env 已就位

**🟢 W3-06-V3 已完成（2026-04-24 当日 pre-sprint · 离线全部，零外部依赖）**

**目标**：让用户在节点级别修改 / 重试 / 跳过中间产物，且修改自动 cascade 失效下游所有 done/failed/skipped 节点 → 重跑只重跑必要节点（"resume mode"）。

- ✅ Cascade 引擎：`app/src/lib/workflow/cascade.ts`（`markDownstreamDirty` / `applyStepEdit` / `applyStepRetry` / `applyStepSkip` / `resetRunForResume` / `snapshotRunSteps`）— 严格按 `stepIndex > anchor` + `status ∈ {done, skipped, failed}` 翻 `dirty`；DAG-free 因 v3 是线性 5 节点
- ✅ Pure rules 抽到 `app/src/lib/workflow/cascade-rules.ts`（`evaluateStepAction` + `EDITABLE_NODES` / `RETRYABLE_STEP_STATUSES` / `SKIPPABLE_STEP_STATUSES` / `EDITABLE_STEP_STATUSES` / `stepIndexOf`）— **0 db / 0 drizzle 依赖**，可被 `'use client'` 组件直接 import；`cascade.ts` re-export 维持背后兼容
- ✅ Orchestrator resume mode（`app/src/lib/workflow/orchestrator.ts` 改造）：跑前一次性 SELECT 所有 step 行 → status `done`/`skipped` 直接 hydrate `outputJson` 进 `ctx.upstreamOutputs` + 累计旧 `costFen` → **跳过执行**；只跑 `pending`/`dirty`/`failed` 节点。`monthly_usage` cap 用合并后的 `totalCostFen` 推一次（不重复计费）
- ✅ tRPC mutations（`app/src/server/routers/workflow.ts` 新增）：
  - `workflow.editStep`：input `{runId, nodeType ∈ {script, storyboard}, output}` → Zod schema `ScriptOutputEditSchema` / `StoryboardOutputEditSchema` 守门 → `applyStepEdit` → `dispatchRun` 立即重跑；`evaluateStepAction({action: 'edit'})` 守门防 running
  - `workflow.retryStep`：input `{runId, nodeType}` → 仅 `failed` / `dirty` 可点 → `applyStepRetry` → `dispatchRun`
  - `workflow.skipStep`：input `{runId, nodeType}` → MVP-1 限制只允许 `export`（其它节点 skip 会破坏下游依赖；写在 mutation 里硬抛 `BAD_REQUEST`）→ `applyStepSkip` → `dispatchRun`
  - 三者共用：tenantId 严格隔离 / run.status `running` 时拒绝 / 错误统一过 `friendlyFromAny`
- ✅ UI（`app/src/components/workflow/`）：
  - `EditNodeDialog.tsx`：modal + textarea + JSON.parse 校验 + 保存；只对 `script` / `storyboard` 显示
  - `NodeActionBar.tsx`（client）：「编辑 / 重试 / 跳过」3 按钮，按 `evaluateStepAction` 动态 enable/disable + tooltip 给原因；onSuccess invalidate `workflow.get` 触发即时刷新
  - `NodeCard.tsx` + `WorkflowCanvas.tsx`：透传 `runId` / `runStatus`，topic 节点不显示 action bar
- ✅ 单测：`app/scripts/test-cascade.ts`（`pnpm wf:test:cascade`）**50/50 assertion 全过**，覆盖：
  1. `evaluateStepAction` 权限矩阵（10 case：edit/retry/skip × allowed/rejected × {状态, 节点类型, run状态}）
  2. `markDownstreamDirty` 只翻 done/skipped/failed 行 + pending 不动 + anchor 不动
  3. `applyStepEdit` 写 outputJson + cascade + 重置 run.status/errorMsg/completedAt
  4. `applyStepRetry` 目标 → pending + cascade
  5. `applyStepSkip` 目标 → skipped + errorMsg 清空 + cascade
  6. **Orchestrator resume**：`MockNode` × 3，验 done 节点 invocations=0、dirty 节点 invocations=1、ctx.upstream 正确 hydrate、`totalCostFen` 折算正确（preserved + new）、新执行的节点 outputJson 被覆盖、status flip dirty→done
  7. **Tenant 隔离**：B 租户构造 A 的 runId 调 `markDownstreamDirty` → 影响 0 行
- ✅ 全绿：`pnpm lint` / `pnpm typecheck` / `pnpm wf:test` (workflow runner) / `pnpm wf:test:dispatch` / `pnpm wf:test:cascade` 全过

**踩坑记录**：
1. **Server-only 泄漏到 client bundle**：`NodeActionBar.tsx` 是 `'use client'` 但 import 了 `evaluateStepAction`，原本写在 `cascade.ts` 里 → 被 next 拖进 drizzle → 整页 bundle 失败。**Fix**：抽 `cascade-rules.ts`（pure），让 client 直接 import 它，server 路径继续走 `cascade.ts` re-export。规则：以后凡是 NodeRunner / 工作流相关需要在 client 用的纯函数，都放进 `*-rules.ts` 后缀文件
2. **JSONB key 顺序 roundtrip 不稳定**：单测原本用 `JSON.stringify` 比对编辑后输出，PG jsonb 不保证字段顺序，roundtrip 后 `{frames:[{text,index}]}` ≠ `{frames:[{index,text}]}` → 改成语义 deep check（`stored.frames[0]?.text === ...`）。规则：测 jsonb 内容用 deep equal，不要 `JSON.stringify`

**⚠ W3-06 已知缺口（不阻 MVP-1）**：
1. **Edit UX 是裸 JSON textarea**：内测用户能用，但生产 v2 应做按帧表单（每帧一个卡片：text/imagePrompt/cameraLanguage/onScreenText 4 字段）。已写进 W3-08 候选
2. **Skip 只让 `export` skip**：video / storyboard 节点 skip 会破坏下游 `UPSTREAM_MISSING`。如果用户提需求，再加 NodeRunner.buildInput 容错路径
3. **Cancel mutation 还没做**：与 W2-07a 已知缺口同条
4. **没做 transactional cascade**：单 step write + cascade dirty + reset run 三个 statement 之间无事务；考虑到 caller 已守 `run.status !== 'running'` + worker 有 CAS 锁，最坏情况是 ~50ms canvas 显示 pending 而非 dirty，纯 cosmetic（写在 `cascade.ts` 注释里）

**🟢 W3-07-V3 已完成（2026-04-24 当日 pre-sprint · 离线全部，零外部依赖）**

**目标**：把节点失败时给用户的信息从「`UNKNOWN: video frame 1 unknown error: ...`」单行裸 errorMsg 升级成：可读标题 + 解释 + 可执行下一步建议 + 操作分类（"自己重试" vs "联系管理员"）。让真用户首跑不用问开发就知道下一步该干嘛。

- ✅ `friendlyFromNodeError(errorMsg, nodeType)`（`app/src/lib/error-messages.ts`）：解析 NodeRunner 写库的 `${code}: ${message}` 格式 → 返回 `{title, detail, hint, code, rawMessage, isRetryable, isOpsIssue}`。覆盖 NodeError 8 个 code 全集（UPSTREAM_MISSING / INVALID_INPUT / SPEND_CAP_EXCEEDED / PARSE_FAILED / VALIDATION_FAILED / LLM_FATAL / PROVIDER_FAILED / UNKNOWN）+ 跨节点差异化（同 PROVIDER_FAILED 在 video 是 Seedance 失败、在 export 是 Blob 上传失败）+ 6 类 cause-string 启发（API key 缺失 → `isOpsIssue=true` / RATE_LIMITED → 等几分钟再试 / POLL_TIMEOUT → 改 imagePrompt / CONTEXT_TOO_LONG / CONTENT_FILTERED / AUTH_FAILED）
- ✅ `ErrorDetailDialog`（`app/src/components/workflow/ErrorDetailDialog.tsx`）：模态详情弹窗，显示友好标题 + 解释 + 高亮的「建议下一步」+ pills（错误码 badge / 需联系管理员 / 可重试 vs 重试不会自动恢复）+ step 元数据（重试次数 / 开始时间 / 耗时）+ 折叠的原始错误（默认收起，工程排查时点开看 stack）
- ✅ `NodeCard.tsx` 失败态密度提升：抽出 `FailedSummary` 子组件 — 友好标题 + 错误码 mono badge + 「已自动重试 N 次」+ 2 行 detail line-clamp + 「查看详情 + 建议 →」CTA 按钮
- ✅ `WorkflowCanvas.tsx` 顶部 banner 升级：用 `failedNode` memo 找到第一个失败节点 → 用 `friendlyFromNodeError` 渲染 `RunErrorBanner`（节点名 + 友好标题 + 错误码 badge + 需联系管理员 pill + 建议文案 + 引导用户去节点卡片看详情）。当 `runStatus = failed` 但没有任何 step 是 failed（极少见，如 SPEND_CAP preflight 失败但 step 行不写入），fallback 显示 `run.errorMsg`
- ✅ 单测：`app/scripts/test-friendly-error.ts`（`pnpm wf:test:friendly`）**77/77 assertion 全过**，覆盖：
  1. 8 code × 4 node = 32 组合 → 标题/detail/hint 都非空
  2. 跨节点差异化（PROVIDER_FAILED video vs export 文案不同）
  3. 边界（null / 空字符串 / 纯空格 / "this is not a valid CODE: prefix" 小写不匹配）
  4. 6 类 cause-string 启发都触发（api key / RATE_LIMITED / POLL_TIMEOUT / CONTEXT_TOO_LONG / CONTENT_FILTERED / AUTH_FAILED）
  5. `isRetryable` × `isOpsIssue` flag 语义合理（SPEND_CAP_EXCEEDED 双 false/true、UPSTREAM_MISSING isRetryable=false 因为得改上游）
  6. rawMessage 只剥前缀 `CODE: `，多行 cause + stack 通过 `[\s\S]` 完整保留（解决 tsconfig target 太老不能用 regex `s` flag 的坑）
- ✅ 全绿：`pnpm lint` / `pnpm typecheck` / `pnpm wf:test` / `pnpm wf:test:dispatch` / `pnpm wf:test:cascade` / `pnpm wf:test:friendly` 全过

**踩坑记录**：
1. **regex `s` flag 不可用**：`tsconfig` target 早于 ES2018，`/^([A-Z_]+):\s*(.*)$/s` 编译报 TS1501。Fix：改成 `/^([A-Z_]+):\s*([\s\S]*)$/`，效果一样且全版本兼容。规则：以后写正则尽量避免 `s` flag，用 `[\s\S]` 替代 `.` 跨行场景

**⚠ W3-07 已知缺口（不阻 MVP-1）**：
1. **没做 retry 倒计时**：NodeRunner 内部已经按指数退避自动重试了 3 次才暴露给 UI；用户看到 failed 时已经是「3 次都不行」的最终态。再加个倒计时是误导。如果将来加用户点击 retry 后的 cooldown，再做也不迟
2. **没做 per-attempt 日志查看**：我们当前不存每次 attempt 的 LLM raw response / stack trace，只存最终 errorMsg。要做需要先扩 schema（新表 `step_attempts`）。优先级低 — 内测 5 人遇到问题直接看 Vercel function logs 更快
3. **`failedNode` memo 只取第一个**：理论上多节点并行失败可能展示不全。当前 v3 工作流是严格线性，第一个失败必然 cascade halt，所以最多就 1 个 failed 节点 — 不是 bug

**🔴 接下来三选一**：
- **W2-04**（需 key，P0 KILL GATE）：Seedance PoC 统计脚本 — 同 prompt × 50 跑，记录成功率 / 平均延迟 / 实测单条成本 / 失败原因分布，落 `research/seedance_poc_2026-05-XX.md` · **🔴 KILL GATE：≥ 70% 成功率 + ≤ ¥15/条**；通过后切 default orchestrator → `buildFullOrchestrator`，W3-01/04 产物随之进入端到端 demo
- **W2-07b SSE 推送**（不需 key，纯 UI 升级）：`/api/workflow/[runId]/events/route.ts` 拉 SSE，UI swap `useQuery({refetchInterval})` 为 `EventSource + setQueryData`；后端最小改动，看用户是否觉得 2s 轮询慢再做
- **W3-08 编辑 UX 升级**（不需 key）：把 `EditNodeDialog` 的裸 JSON textarea 升级成按帧表单（每帧一个卡片：text/imagePrompt/cameraLanguage/onScreenText 4 字段 + 拖拽排序 + 增删帧）— 内测用户能用裸 JSON 但生产 v2 必做

- 建议顺序：用户跑一次 dev server 视觉走查 W3-07（找一个已 failed 的 run，看 banner + 节点卡片 + 详情弹窗的中文化和建议是否合理）→ 部署 preview 验 W3-06 + W3-07；同时催 SEEDANCE_API_KEY → key 到先 W2-04 拍板 → 通后切 full orchestrator → 真 run 验收 W3-05/06/07 + 真剪映打开验收 W3-02 = 内测预约用户能完整跑通

**🟢 W2-07b SSE 推送 + W3-08 编辑 UX 升级 已完成（2026-04-24 当日 pre-sprint · 全部离线，零外部依赖）**

**目标**：
- W2-07b：把 canvas 从 2s HTTP 轮询升级到 SSE 推送，节点状态变化亚秒级到达 UI；polling 自动退化为 15s 兜底，SSE 失败/不支持时无缝回到 2s 节奏
- W3-08：替换 `EditNodeDialog` 的裸 JSON textarea — 把内测用户的 #1 痛点（"我看不懂 JSON" — 永航/苗苗访谈）变成按帧表单，但保留原始 JSON 作 power-user escape hatch

**W2-07b — SSE 推送**
- ✅ 服务端 `app/src/app/api/workflow/[runId]/events/route.ts`：Clerk 认证（用 `createContext` 复用 tRPC `tenantProcedure` 同款租户解析）→ 跨 tenant 校验失败返 404（不返 403，不泄存在性）→ `ReadableStream` 推送 `event: snapshot\ndata: {…}\n\n`：
  - 1s server-side DB 轮询；snapshot 序列化对比，**只有内容变化才推**（status / errorMsg / cost / outputJson / completedAt 等）
  - 25s comment-line 心跳（`: heartbeat\n\n`）防 Vercel/Nginx 反代 reaper
  - 4.5min hard ceiling（leave 30s 缓冲低于 maxDuration=300）→ 推 `event: end {reason: 'max-lifetime'}` 主动 close，浏览器 EventSource 会自动 reconnect
  - 检测到 terminal status（done/failed/cancelled）→ 推一次最终 snapshot + close（`reason: 'terminal'`），不浪费连接
  - DB blip 不杀连接（warn + 下一 tick 重试）；客户端 cancel → 关闭 stream
  - `Cache-Control: no-transform` + `X-Accel-Buffering: no` 防代理 buffer
- ✅ 客户端 `app/src/components/workflow/useWorkflowEvents.ts`：`EventSource` hook，自动写回 `trpc.workflow.get` react-query cache via `setData`；状态机 idle / connecting / open / closed / unsupported；`event: end` 服务端 close 后**不重连**（让 polling 接管）；浏览器无 EventSource → 直接 `unsupported`，polling 兜底
- ✅ `WorkflowCanvas.tsx` 集成：dial polling — SSE `open` 时 15s 慢轮询（safety net），其它状态 2s 快轮询；进度提示按 SSE 状态切换文案 + 配色（绿色脉冲 = 实时推送已连接 / 琥珀脉冲 = 每 2 秒自动刷新）+ `title` tooltip 暴露当前 SSE 状态
- ✅ 优雅降级：SSE 完全失败 → 等同 W2-07a 之前的纯轮询体验，**不会回归**

**W3-08 — 按帧表单编辑器**
- ✅ 纯逻辑层 `app/src/components/workflow/frame-editor-logic.ts`：`reindex` / `insertFrameAt` / `deleteFrameAt` / `moveFrame` / `patchFrame` / `rebuild{Script,Storyboard}Output` / `coerce{Script,Storyboard}Frames` / `countNonWhitespace` / `makeEmpty{Script,Storyboard}Frame`，**不动 React/不动 DB**，便于离线单测
  - 不变量：每次 mutation 后 `index` 自动连续重排 1..N；refuse to drop below 1 帧；`patchFrame` 永远不允许 patch.index 覆写（防 UI 误操作）；coerce 函数对 null/undefined/wrong-type/missing fields 全部返回 safe defaults（不抛）
  - rebuild 自动重算 derived 字段（charCount / frameCount / fullText / totalDurationSec），passthrough 字段（provider / model / suppressionFlags / qualityIssue / promptVersion / generatedAt / llmModel / …）verbatim 保留
- ✅ UI 组件 `app/src/components/workflow/PerFrameEditor.tsx`：`<ScriptFrameEditor>` + `<StoryboardFrameEditor>`，每帧独立卡片：
  - **Script frame**：口播文案（textarea + 字数计数 + 8-15 字红黄提示）+ 时长（秒）+ 画面提示
  - **Storyboard frame**：voiceover + 时长 + 镜头语言（**`<select>` 严格 8 词词表**）+ 场景描述 + image prompt（textarea + 50-75/80 字提示）+ 屏幕字幕
  - 顶部摘要 bar：脚本显示总字数 vs 200-215 区间、分镜显示总时长 + 镜头多样性 ≥5 检查
  - 每帧右上角 4 个 IconButton：插入新帧到上方 / 上移 / 下移 / 删除（边界自动 disable + tooltip 解释）+ 末尾「+ 添加新帧到末尾」虚线按钮
  - **不做拖拽**（W3-09 留），↑↓ chevron 满足 95% 重排需求 + 无依赖 + a11y `aria-label`
- ✅ `EditNodeDialog.tsx` 重写：tab 切换「可视化编辑（默认）」vs「原始 JSON（power user escape）」；`json → frames` 切换时尝试 parse + coerce，失败给中文 parse 错误；`frames → json` 切换时立即把当前编辑结果 stringify 进 textarea，无信息丢失；保存按钮 disable 当 `noFrames`（payload 没有可识别的 frames 数组 → 提示用户切到 JSON 模式）
- ✅ 服务端 0 改动：`workflow.editStep` Zod schema 已经是 `passthrough` + `min(1)` 强校验，无论从表单还是 JSON 模式过来都共用同一保险栓
- ✅ 单测 `app/scripts/test-frame-editor.ts`（`pnpm wf:test:frames`）**73/73 assertion 全过**，11 case 覆盖：
  1. reindex contiguity + 不变 input
  2. insertFrameAt × 4（start/middle/end/OOB clamp）
  3. deleteFrameAt × 5（middle/edges/refuse-below-1/OOB）
  4. moveFrame × 4（中段↑↓/边界 no-op/OOB）
  5. patchFrame index 防覆写 + sibling 不动
  6. rebuildScriptOutput 重算 charCount/frameCount/fullText + passthrough 保留 (provider/model/suppressionFlags/qualityIssue)
  7. rebuildStoryboardOutput 重算 totalDurationSec + passthrough (promptVersion/generatedAt/llmModel)
  8. coerceScriptFrames 对 null/undefined/string/number/部分缺字段 全 safe defaults
  9. coerceStoryboardFrames 词表外 cameraLanguage 自动 fallback 到 vocab[0]
  10. countNonWhitespace 中文 + ASCII + 空白 mix 正确（你好 = 2 字）
  11. makeEmpty 工厂产生 valid blank（durationS > 0、cameraLanguage = vocab[0]）

**踩坑/设计决定**：
1. **SSE TDZ 顺序坑**：第一版把 `useWorkflowEvents` call 放在 `useQuery` 之后，但 `useQuery` 的 `refetchInterval` callback 闭包引用 `sseStatus`。React Query v5 的 callback 会被立即同步调用一次确定 initial interval → TDZ 报错。Fix：把 SSE hook 调用前置 + 把 hook 入参 `runStatus` 移除（让服务端在 terminal 时主动 close + 推 end，省掉 client/server 状态同步往返）
2. **JSONB key 顺序无关性**（之前 W3-06 也踩过）：测试用 semantic 字段比较代替 `JSON.stringify`
3. **EventSource 不能传自定义 header**：所以 SSE auth 只能依赖 cookies。Clerk 默认 cookie session → 同源请求自动带 → 不动 middleware 也能用
4. **SSE serialize 排除 `updatedAt`**：DB UPDATE 永远 bump updatedAt（即使值没变），如果包含进序列化对比，每秒都会推一次空 snapshot 浪费带宽。我们对比 status / errorMsg / cost / 各 step 的 status+output+cost+errorMsg+completedAt — 真正的"内容"
5. **W3-08 不做 drag-drop**：内测 5 人，↑↓ 已经够用；拖拽要 `dnd-kit` 或 `react-dnd`（+200KB）+ a11y 复杂；W3-09 留
6. **EditNodeDialog 不强制结构验证**：表单字段允许空字符串（user 中途状态），server-side Zod `min(1)` 是真正的拒入网保险栓 — UI 只做 nudge 不做 gate，避免"红色字段太多保存不了"的恶劣 UX

**🟢 全绿验证（一次跑通）**：
| 命令 | 结果 |
|---|---|
| `pnpm lint`            | ✅ 0 警告/错误 |
| `pnpm typecheck`       | ✅ 0 错误 |
| `pnpm build`           | ✅ production build 成功，`/api/workflow/[runId]/events` 注册为 ƒ Dynamic 路由 |
| `pnpm wf:test:cascade` | ✅ 50/50（W3-06 没回归） |
| `pnpm wf:test:friendly`| ✅ 77/77（W3-07 没回归） |
| `pnpm wf:test:frames`  | ✅ 73/73（W3-08 frame logic 单测） |
| `pnpm wf:test:sse`     | ✅ 31/31（W2-07b 真 DB 集成测，新增） — loadSnapshot 跨租户 404 / 内容变化 diff 推 / no-op UPDATE 不推 / SSE wire format |
| `pnpm wf:test:roundtrip` | ✅ 51/51（W3-08 端到端，新增）— 用户编辑 → rebuild → 服务端 Zod schema 接收，覆盖 12 个真实编辑场景 |

**自跑验收（2026-04-24 morning · 不动浏览器）**：
1. ✅ 探 `/api/workflow/[id]/events` 未登录 → HTTP 307 redirect 到 sign-in（Clerk middleware 正确拦截）
2. ✅ Dev server 编译 SSE 路由 + EditNodeDialog 干净，0 warn 0 error
3. ✅ Production build 把 SSE 路由识别为 ƒ Dynamic（serverless function），`/runs/[runId]` bundle 17.7 kB 含新组件
4. ✅ 抽 `loadSnapshot/serializeSnapshot/formatEvent` 到 `@/lib/workflow/sse-snapshot.ts` → 可单测 + 路由更薄；同时抽 server-side 编辑 Zod schemas 到 `@/lib/workflow/edit-schemas.ts` → 测试可用同一 schema 验证 round-trip
5. ✅ SSE 真 DB 集成测：插一个 run + 5 步 → 改 step status / 改 outputJson / 改 run status+errorMsg+cost → 每次都验证 serialize 输出确实变化；no-op UPDATE（同值 set）serialize 不变（防带宽浪费）
6. ✅ 跨租户隔离：用 tenant A 的 runId + tenant B 的 tenantId 调 loadSnapshot → 返 null（→ SSE 路由会返 404，不泄露存在性）
7. ✅ W3-08 round-trip：拿真实 ScriptOutput / StoryboardOutput shape，过 coerce → patch/insert/delete/move → rebuild → ScriptOutputEditSchema/StoryboardOutputEditSchema 全过；passthrough 字段（provider/model/promptVersion/llmModel/generatedAt/qualityIssue/suppressionFlags）全保留；schema 反向证明：empty frames / empty text / index 0 / 缺 scene 都被拒

**⚠ W2-07b + W3-08 已知缺口（不阻 MVP-1）**：
1. **SSE 没在 Vercel preview 真跑过**：服务端 polling 是普通 DB 调用 + 标准 SSE wire format，本地 Next dev 行为与 Vercel Node runtime 一致；用户视觉验收时跑一次 dev 看绿色脉冲灯亮即可；preview 真验收同步带在用户走查里
2. **SSE 没做 orchestrator-level pubsub**：当前 server 1s 轮询 DB，比客户端 2s 轮询略快但仍是 polling。真正 sub-second 推送要 Upstash Redis pubsub + orchestrator 写步骤变化时 publish — 工作量 ~半天 + 多一个外部依赖故障面，5 个内测用户用不上，W3-09 / 真用户量起来再做
3. ~~**W3-08 不做拖拽**~~ → ✅ **W3-09 已做**（dnd-kit + ↑↓ keyboard fallback 双轨）
4. ~~**W3-08 表单字段没做 onBlur 弱校验**~~ → ✅ **W3-09 已做**（红/琥珀双级别 + 仅 blur 后才显色）
5. **mode 切换没记忆用户偏好**：每次重开 dialog 都默认 frames 模式。如果某 power user 长期用 JSON 模式，每次都要点一次。无关紧要

**🟢 W2-04-V3 PoC 脚本骨架已完成（2026-04-25 当日 pre-sprint · dry-run 验证全绿，等 SEEDANCE_API_KEY 即可一行命令真跑）**

**目标**：把 W2-04 KILL GATE（成功率 ≥ 70% + 单条成本 ≤ ¥15）从「等 key 才能开始写脚本」前置到「key 一到位即跑 → 报告自动落地 → 立刻签字」。

- ✅ `app/scripts/probe-seedance-poc.ts`：CLI（`--runs/--prompt/--duration/--resolution/--concurrency/--budget-cny/--poll-interval/--max-wait/--report-dir/--report-name/--dry-run/--no-confirm/--tag`）+ 真 SeedanceProvider 调用 + concurrency-bounded 派发循环（默认 1 串行避免 rate limit）+ 进度行实时刷新（`[12/50] ✅10 ❌2 cost=¥72 elapsed=3m12s latency=1m07s`）
- ✅ **3 道安全栅栏**（防误烧钱）：
  1. 启动前打印 worst-case 成本 + 交互 confirm（输 `GO` 才继续，CI 用 `--no-confirm` 绕过）
  2. `--budget-cny=300` 累计实测成本越线立即 stop（不再发新 task；不取消已 in-flight，那笔钱已花）
  3. 缺 `SEEDANCE_API_KEY` exit 2 + 中文提示火山方舟控制台地址
- ✅ Dry-run 模式：local `FakeSeedanceProvider`（80% success / 12% RATE_LIMITED / 5% CONTENT_FILTERED / 3% poll-failed + latency 30-90s 模拟）→ 跑 10 fakes 8m56s → KILL GATE 双绿（80% / ¥6/clip）→ 报告 `research/seedance_poc_2026-04-25_dryrun.md` 自动落地，**已 commit 到 research/ 作格式参照**
- ✅ 报告自动生成：`research/seedance_poc_<DATE>.md` 含 Executive summary（KILL gate ✅/🔴 一目了然）/ Run params 表 / Aggregate metrics / Latency 分布（mean/median/p95/min/max）/ Failure 分桶（按 `VideoGenError.code` 计数 + 每码取 1 sample message）/ Per-run raw appendix（# / ok / jobId / latency / cost / err.code / err.msg 全量）
- ✅ **Exit code 协议**：0 = 双 gate 通过（W2-04 unblocks）/ 1 = 任一 gate 失败（触发 STRATEGY §4 kill check）/ 2 = 配置错误
- ✅ Default cost-per-sec = D24 假设 60 fen/sec（¥0.60/sec），可 `SEEDANCE_COST_PER_SEC_FEN` env 覆盖；真跑后用实测值更新 `lib/video-gen/config.ts`
- ✅ `pnpm typecheck` 0 错 + `pnpm lint` 0 警告
- 新增 npm script：`vg:probe:seedance`

**🟢 真跑剧本（key 到位后 5 步）**：
1. `vercel env pull --environment=development app/.env.local` 把 `SEEDANCE_API_KEY` 拉本地
2. `pnpm vg:probe:seedance -- --dry-run --runs=3 --no-confirm --poll-interval=200` —— 二次确认骨架（应输出 KILL GATE PASSED）
3. `pnpm vg:probe:seedance -- --runs=5 --budget-cny=30` —— 小流验证真 Seedance auth + ¥30 上限护栏
4. `pnpm vg:probe:seedance -- --runs=50 --budget-cny=350 --tag=v1-baseline` —— 完整 PoC，~25min wall clock
5. 报告 commit `research/seedance_poc_<DATE>.md`；exit 0 → 在 `DECISIONS_LOG.md` 追加 W2-04 签字 + 切 default orchestrator 到 `buildFullOrchestrator()`；exit 1 → 走 STRATEGY §4

**踩坑记录**：
1. **Sandbox cwd 重定向**：Cursor sandbox 模式下 `working_directory: app` 被忽略，`pnpm` 在 root 找不到 manifest。Workaround：脚本里用 `path.resolve(__dirname, '../research')` 锚定输出目录，不靠 cwd
2. **Fake provider 真 sleep（不是 fast-forward）**：FakeSeedanceProvider 用真实 setTimeout 30-90s 让 dry-run 同时验进度行 + budget 累计 + 报告渲染。10 runs 串行 ~9 min，可接受；要快验直接缩 `--runs=3` 或在 fake provider 里把 latency 缩到 1-3s（但失去"接近真实"信号）

**⚠ W2-04 已知缺口**：
1. **真 API 验收待 key**：所有逻辑路径 dry-run 已覆盖，但首次真 Seedance 调用可能撞 D24 调研外的奇怪 schema 字段（如 `usage.total_seconds` 缺失），到时按 W2-03 `normalizeError` + `pollJob` snapshot 路径打补丁
2. **没做 retry-on-submit**：单次 submit 失败 → 算一次失败 sample。如果发现 RATE_LIMITED 太多导致 success rate < 70%，加 1 次 backoff 重试（分桶要单独标"重试后成功"）
3. **prompt 单一 = 单点结论**：50 次同 prompt 是按 ENG_TASKS_V3.md W2-04 规格做的"控制变量"实验。如果通过，W2-04b 应该再跑一组 5 prompts × 10 runs 验证 prompt 多样性下的成功率

**🟢 W3-09 拖拽排序 + onBlur 字段校验已完成（2026-04-25 当日 pre-sprint · 全部离线，零外部依赖）**

**目标**：把"拖拽 + 弱校验"两个被推到 MVP-1 之后的 W3-08 待办坑，在 P0 KILL GATE 还在等 key 的间隙顺手填掉，让永航 / 苗苗 / 家琳 三人再次走查时直接拿到「拖一帧到任意位置」+「字段错了立即变色」的 polish UX。

**实施**：
- ✅ 纯逻辑层 `frame-editor-logic.ts` 扩 2 个 pure functions：
  - `moveFrameTo(frames, fromPos, toPos)`：dnd-kit `arrayMove` 同语义（splice-out 原 pos → splice-in 新 pos，不偏移），单测覆盖 forward / backward / 跨多格 / append-to-end / 同位 no-op / 双向 OOB clamp
  - `validateScriptFrame` / `validateStoryboardFrame`：返回 `Partial<Record<keyof Frame, FieldIssue>>`，2 级 severity（`error` 红 / `warning` 琥珀），UI-friendly 中文 msg + stable code 给单测
  - 规则：script.text 空 → error / 1-7 字 → warning / 16+ 字 → warning；script.durationS ≤0 / NaN → error / >10 → warning；storyboard.{voiceover,scene,imagePrompt} 空 → error；imagePrompt <40 → warning short / >80 → warning long；onScreenText >12 → warning
- ✅ UI 层 `PerFrameEditor.tsx`：
  - `@dnd-kit/{core,sortable,utilities}` 集成：`<DndContext>` + `<SortableContext>` + `useSortable` + 专用 `<DragHandle>` 组件（grip icon 只 attach `listeners` → 表单字段保持正常 focus / 文本选择行为）
  - 双轨 reorder UX：拖拽（PointerSensor 4px 启动阈值 + KeyboardSensor sortable 协调器）+ ↑↓ chevron（既是键盘 a11y fallback，也是不能/不想拖的兜底）
  - 拖拽中视觉反馈：dragged card 半透明 0.5 + shadow-lg + zIndex 10
  - onBlur 校验：每个 card 本地维护 `Set<keyof Frame>` 跟踪已 blur 字段，**只在 blur 后**才显示状态色（避免"刚打开就一片红"的恶劣 UX），状态色 = error 红边+红底+红字 / warning 琥珀边+琥珀底+琥珀字 / 默认灰
  - 字段下方小字 hint 显示具体规则建议（"偏短（建议 8-15 字）" / "image prompt 不能为空" 等）
  - `aria-invalid` 在 error 时 set true，screen reader 友好
- ✅ **保存逻辑零变化**：弱校验完全不阻塞保存，server-side Zod 仍是真 gate（坚持 W3-08 「UI 只 nudge 不 gate」原则；power user 想存空文案做 placeholder 也允许）
- ✅ 单测扩到 14 case · **76/76 assertion 全过**（新增 case 12-14 覆盖 moveFrameTo + 双 validate；case 12 在写 UI 之前就抓住了一次 splice 偏移 bug → logic-first 拆分价值兑现）

**🟢 全绿验证（一次跑通）**：
| 命令 | 结果 |
|---|---|
| `pnpm typecheck`        | ✅ 0 错误 |
| `pnpm lint`             | ✅ 0 警告/错误 |
| `pnpm wf:test:frames`   | ✅ 76/76（W3-08 + W3-09 frame logic 单测） |

**踩坑/设计决定**：
1. **dnd-kit `arrayMove` 语义**：第一版 moveFrameTo 写错偏移（splice-out 后又 -1），单测立即抓住 — 实际上 dnd-kit 是 splice-out 后用原 toPos 直接 splice-in，因为新数组已缩短，原 toPos 自然就是新位置
2. **拖拽手柄 vs 全卡片可拖**：全卡片可拖 → input 选不了文本、focus 抢走；专用 grip handle 是行业最佳实践（见 Linear / Notion / Figma）
3. **onBlur 状态机**：用本地 `Set<keyof T>` 而非全局 form library（form lib 上 100KB 太重），简单 useState 18 行解决；`useMemo(() => validate(frame), [frame])` 让校验结果跟着输入实时更新但只在 blurred 字段渲染色
4. **dnd-kit item id 选 position 数字**：dnd-kit 文档推荐 stable id（uuid），但 frames 数据没有持久 id；用 position-as-id 实测可行：`SortableContext.items={[0..N-1]}` 每次重渲染都"重新映射" position → 当前 frame，dnd-kit 看到一致的 ids 列表 + 一致的视觉顺序，working as intended
5. **W3-09 不阻塞保存**：与 W3-08 决策一致 — 红/琥珀只是 nudge，server-side Zod 是真保险栓。否则 "user 改了 1 字就被锁死保存" UX 极差

**⚠ W3-09 已知缺口**：
1. **没做 dnd-kit DragOverlay**：拖动中卡片直接位移，不使用浮动 overlay。多帧长卡片视觉略闪；overlay 升级是 5 行代码，等用户反馈再加
2. **没做 inter-list drag**：脚本和分镜是两个独立 SortableContext，不能跨节点拖（也不应该 — 数据 shape 不同）
3. **没做拖拽到容器外的 trash zone**：删除还是用右上角垃圾桶按钮 — 拖到 trash 是 nice-to-have

---

**🟢 W3-03 CAC AI 水印注入已完成（2026-04-25 当日 pre-sprint · 全部离线，零外部依赖）**

**目标**：把 ENG_TASKS_V3 W3-03 ticket 在 P0 KILL GATE 等 key 的间隙顺手清掉。抖音 / 视频号 2024 起对 AI 生成内容已强制平台层标签，**+1 道艺术品层水印**是给永航 / 苗苗 / 家琳 内测样片的双保险 —— 不论用户走平台 AI 标签还是直接发，导出的 mp4 都自带"本视频由 AI 辅助生成"。

**盘点 & 实施**：
| 触点 | 旧状态 | W3-03 后 |
|---|---|---|
| 脚本 .txt 末尾水印 | ✅ 早做（`DEFAULT_WATERMARK` 引用《互联网信息服务深度合成管理规定》§17 + 不可为空保护） | unchanged |
| Bundle `readme.md` 水印声明 | ✅ 早做（"本包内全部视频片段、文案均由 AI 辅助生成"） | unchanged |
| JianYing draft_name 后缀 + extra_info.generated_by | ✅ 早做（"(AI 辅助)" + `AI-Content-Marketing-MVP v3.0`） | unchanged |
| **JianYing 时间轴可见水印字幕轨** | ❌ 缺 | ✅ **本次补齐** |
| Seedance mp4 本身水印 | ❌ 不做（CDN URL，无自托管转码 pipeline；剪映 disclosure 字幕轨导出后 = 等价方案） | 永久 N/A |

- ✅ 新增常量 `cac-label.ts` `CAC_JIANYING_DISCLOSURE = '本视频由 AI 辅助生成'`（短到 9:16 不换行，长到不可缺漏；DECISIONS_LOG D27 拍板）
- ✅ 扩 `ExportInput.aiDisclosureLabel?: { disabled?, text?, position? }` —— 默认 `disabled=false position='bottom'`，UI 不暴露 toggle，仅供合规 dry-run 走 backend 显式 carve-out
- ✅ `buildJianyingDraft()` 自动注入：
  - 1 个 disclosure text material（白字 + 8-digit hex 半透明黑底 `#000000A0` 让 plate 在亮视频背景下不丑）
  - 1 个独立 disclosure text track（**最后 push → 渲染最上层**），`extra_info='cac-disclosure'` tag 让 audit / UI / 未来转码器可定位
  - 1 个跨 `[0, totalDurationMicros)` 的 segment，与视频总时长对齐
  - `transform_y` normalized 到 `[-0.5, +0.5]` 空间（top → -0.4，bottom → +0.35），9:16 安全区
- ✅ 单独于用户字幕轨：用户在剪映里可以删 onScreenText 字幕但删不掉 disclosure（因为是不同 track，编辑面板里两层独立）；导出渲染后 mp4 永久带水印
- ✅ 单测扩到 13 case · **64/64 assertion 全过**：
  - case 6 改判（user-subtitle 数 ≠ texts 数 ∵ 加了 disclosure），用 `extra_info` filter 区分
  - case 10：default ON + 整段时长 + 末层渲染
  - case 11：`disabled=true` 完全消失（material + track 都不建）
  - case 12：自定义 text + `position='top'` honored；空白 override 兜底默认（同水印兜底契约）
  - case 13：无用户字幕场景下 disclosure track 仍存在（独立保险栓）

**🟢 全绿验证（一次跑通）**：
| 命令 | 结果 |
|---|---|
| `pnpm typecheck`            | ✅ 0 错误 |
| `pnpm lint`                 | ✅ 0 警告 / 错误 |
| `pnpm wf:test:export`       | ✅ 13/13 case · 64/64 assertion |
| `pnpm wf:test:export:bundle`| ✅ 8/8 case · 全 PASS（无回归 — bundle 路径重写只动 `materials.videos.path`，不碰 disclosure）|

**关键设计决定**：
1. **独立 track 而非和 onScreenText 同轨**：剪映里两层独立，用户编辑/删用户字幕不会误删 disclosure。Linear / Figma 等编辑器同款"图层锁"思路
2. **默认 ON + UI 不暴露 toggle**：合规态默认安全；想关只能改 backend `aiDisclosureLabel.disabled=true`，留下 audit log（W3-03 不阻塞 backend，未来 admin tool 加 logging 即可）
3. **白字 + 半透明黑底**：测了几种组合，纯白字在亮视频上看不见，纯黑底太丑 ——`#000000A0` （透明度 ~63%）是 Twitter / 抖音字幕通用规格
4. **Seedance mp4 不做 ffmpeg 改写**：① CDN URL 不在我们手里 ② 拉下来转码再上传 = 引入 ffmpeg pipeline + Storage 双倍带宽，ROI 极低；剪映 disclosure 轨导出后 = 用户实际发的 mp4 已带水印，等价但成本 O(0)
5. **`extra_info='cac-disclosure'` magic string 抽常量 `JIANYING_DISCLOSURE_TAG`**：tests / future audit tool / 未来 zip 校验都能锁这个标签，DECISIONS_LOG 注明 NEVER change

**⚠ W3-03 已知缺口**（不阻 MVP-1 内测）：
1. **没在抖音 API 端打"我是 AI 生成"flag**：MVP-1 D25 (c) 锁定为手动导出，用户自己发抖音时勾平台 AI 标签 — W4 做 `/topics` 选题推送时一起把"复制水印模板 + 平台标签提示"放进 share dialog
2. **`disabled=true` 走 backend 不写 audit log**：W4-07 dashboard 已上线，但 override 审计落库还没做（后续并入 admin action log）
3. **没做 watermark 字体 fallback**：剪映自带字体足够，但若用户系统缺中文字体可能渲染成 □ — 等真有用户报再加 `font_path` 显式指定

---

**🟢 W4-07 监控 dashboard 已完成（2026-04-25 当日 pre-sprint · 不依赖外部 API）**

**交付**：
- ✅ 新页面 `app/src/app/admin/dashboard/page.tsx`（SSR）：
  - 4 张核心卡片：近 7 天成功率 / 近 7 天运行数 / 7d&30d 活跃用户 / 本月支出（¥）
  - 运行状态分布 chip（pending/running/done/failed/cancelled）
  - 节点延迟表（topic/script/storyboard/video/export 的 count/avg/p50/p95）
- ✅ 管理员访问控制（fail-closed）：
  - `app/src/lib/admin/is-admin.ts`：`ADMIN_USER_IDS` 逗号分隔 allowlist
  - 非管理员访问 `/admin/dashboard` 直接 `notFound()`（不暴露页面存在性）
- ✅ 查询层 `app/src/lib/admin/queries.ts`：
  - SQL 聚合窗口统一按 DB `NOW()` 计算，避免 JS 时区漂移
  - `monthly_usage` 作为成本单一事实源（和 spend-cap 一致）
  - 查询并行执行，输出 deterministic shape（空表也不炸）
- ✅ 新增纯单测 `app/scripts/test-admin-auth.ts`（parser/allowlist/fail-closed 覆盖）+ npm script `wf:test:admin`

**验证**：
| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 通过 |
| `pnpm lint` | ✅ 0 警告 / 错误 |
| `node --import tsx scripts/test-admin-auth.ts` | ✅ All assertions pass |

**后续非阻断**：
1. admin override action（例如关闭 disclosure）的审计日志（谁在何时改了什么）
2. `/dashboard` 增加“运营看板”入口（当前可直接访问 `/admin/dashboard`）
3. 若数据量上来再补 materialized view / cache（当前查询复杂度足够低）

---

**🔴 接下来二选一**：
- **W2-04 真 API 跑**：等 `SEEDANCE_API_KEY` → 走 5 步剧本（最高优，P0 KILL GATE）
- **部署 preview 验 W2-07b + W3-08 + W3-09 + W3-03 + W4-07**（不需 key，~12 min）：`vercel deploy --target=preview` → 跑一个 run 看 SSE 灯绿 + 改一帧文案看 cascade + 拖一帧到任意位置 + 把文案删空看红边变色 + 切 JSON 模式回 frames 模式无信息丢失 + 下载导出 zip 在剪映打开看到底部"本视频由 AI 辅助生成"水印 + 访问 `/admin/dashboard` 核对 4 卡片可读

### ✅ 立项 Gate 全通过（2026-04-23）

- [x] V3-03 H1：4/4 接受 ¥1000（含 P4 折扣加权 92%）
- [x] V3-01：Seedance ¥6/条 60s（远低于 ¥30 阈值）
- [x] V3-02 + V3-03 H3：D25 (c) 锁定（3/4 接受导出+手动）

### 🟢 D30 MVP-1 范围（已签）

5 节点单任务工作流，预估 4-5 eng-weeks：

```
[选题节点 H5] → [脚本节点 复用 v2 thin slice] → [分镜节点] → [视频生成节点 Seedance] → [导出节点 剪映/文本]
```

**不含**：批量生产 / 自动发布 / 多 provider 切换 / OAuth 接入 / 多账号矩阵

---

## 🟢 已完成资产（v2.0 thin slice · 全部保留复用）

| 任务 | 复用价值 |
|---|---|
| W1-01..05 基建 | Vercel + Supabase + Upstash + Clerk + Kimi 全栈直接搬 |
| W1-07 thin slice | LLM 抽象 / Suppression / RLS / Auth 复用为工作流"脚本节点" |
| W1-06 v1 访谈 | 触发本次 PIVOT 的源数据，保留供 v3 决策回溯 |

---

## ⏸️ v2.0 任务 PAUSED（不再执行）

W2-01..09 / W3-01..08 / W4-01..06 全部挂起。**不要再勾选这些 checkbox**。
旧方向决策与背景见本 commit 之前的 `DECISIONS_LOG.md` v2.0 OVERLAY 区段。

---

## 历史档案（v2.0 sprint 详细日志）

---

## 🟢 已完成（Planning Phase · 2026-04-17..04-19）

| 里程碑 | 产出 |
|---|---|
| Discovery v1.1 | `DISCOVERY_PACKAGE.md` + `WEEK1_RESEARCH_PLAN.md` |
| Strategy v1.1 → v2.0 solo pivot | `STRATEGY_PACKAGE_V2_SOLO.md`（21 eng-days, 抖音 60s 公式一单路径） |
| ENG tasks v1.1 → v2.0 solo | `ENG_TASKS_V2_SOLO.md`（30 任务，按周分组） |
| Tech architecture v1.1 | `TECH_ARCHITECTURE.md` + 4 值 channel enum + feature flag |
| UX architecture v1.1 | `UX_ARCHITECTURE.md`（字数统一 190-210） |
| Decisions 合并为 solo 6 条 | `DECISIONS_LOG.md` v2.0 overlay |
| v1.1 多人文档归档加 SUPERSEDED 头 | `NEXUS_SPRINT_PLAN.md`, `STRATEGY_PACKAGE.md`, `ENG_TASKS.md` |
| 跨文档一致性修复 | 60s=210 / channel enum / D10-P 标签四处一致 |

---

## 🔴 待你决策（6 条，默认值已备好）

一次性打开 `DECISIONS_LOG.md` 顶部 v2.0 OVERLAY 表签字。10 分钟。

| # | 决策 | 采纳默认即可吗 | 截止 |
|---|---|---|---|
| D3 | LLM provider 抽象 | ✅ Claude + Kimi env 切换 | 今日 EOD |
| D11 | Clerk JWT + RLS 策略 | ✅ anon key + per-request JWT | W1 Day 4 |
| D13 | 60s 字数硬上限 = 210 | ✅ | 今日 EOD |
| D14 | CAC 标签文案 | ✅ 保底"本内容由 AI 辅助生成" | 可后置 |
| D16 | D10 Plan B 判据 | ✅ 3 访谈 ≥ 2 表达需求即 CONFIRMED | W1 Day 5 |
| D17 | 上线日期 | ✅ 2026-05-15 Friday | 2026-04-25 |

**若六条全采纳默认**，不必逐条改 DECISIONS_LOG，只需在顶部 overlay 表下方写一行 "2026-04-19 全部采纳默认 · 签字"。

✅ **2026-04-19 已签**（见 DECISIONS_LOG.md L32）

---

## ⏸️ 执行任务队列（30 任务，6/30 完成）

**当前任务**：**W1-06** 3 访谈招募 + 执行 + D10 裁决（非代码） / 进入 Week 2 polish (W2-03 QStash + W2-09 PostHog)

### Week 1 · Foundation + Interviews + Thin Slice (5.5 eng-days)

- [x] **W1-01** Vercel + Supabase + Upstash + PostHog 账号 + env 通 + /api/healthz · **✅ 2026-04-20**
  - Production URL: https://ai-content-26fum2vfc-ai-content-mvp.vercel.app
  - Healthz 返回 `{"status":"ok","checks":{"supabase":"ok","redis":"ok","qstash":"ok","posthog":"ok"}}`
  - 4 commits on `main`: scaffold → healthz+middleware → lint fixes → error-leak fix
  - GitHub: github.com/Ghost-Kang/ai-content-mvp
  - 遗留（非阻断）：`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 仍是占位，W1-05 前补真值
- [x] **W1-02** Next.js 14 App Router + Clerk + signin/dashboard 骨架 · **✅ 2026-04-20**
  - 路由：`/` (公共 landing) · `/sign-in` · `/sign-up` · `/dashboard` (登录保护) · `/create` (登录保护)
  - 中间件：显式 redirect 未登录请求到 `/sign-in?redirect_url=...`（不走 Next 404 页）
  - 验证：`/dashboard` unauth → 307 to `/sign-in`；build 绿；lint 0 warning
  - Commit: `9822300` · pushed `main`
- [x] **W1-03** Drizzle + content_sessions + content_scripts + migration 001 · **✅ 2026-04-20**
  - Supabase 表：`tenants` · `users` · `suppression_list` · `content_sessions` · `content_scripts`（+ 9 枚举 + 4 RLS 策略 + 9 抑制词种子）
  - DATABASE_URL 密码含 `&` 无需 URL-encode（未含 `[...]`，与早先假设相反）
  - 验证：`pnpm db:smoke` 通过 4 insert + join select + cleanup
  - Commit: `02e8e3f`
- [x] **W1-04** Clerk JWT tenantId + Supabase RLS + 跨租户探针测试 · **✅ 2026-04-20**
  - `context.ts`：首次登录自动建 solo tenant + user（race-safe via UNIQUE(clerk_user_id)）
  - `pnpm db:probe` 5/5 断言通过（A 读 A 的 session ok、A 读不到 B、B 读不到 A、list 范围纯净）
  - ⚠️ RLS 真正强制推迟到 W4：Drizzle 以 `postgres` 超级用户连接，策略不生效；app 层 `ctx.tenantId` 过滤是真实边界
  - Commit: `20ac199`
- [x] **W1-05** LLM provider 抽象 v0（Kimi 单 provider，其他保留未接） · **✅ 2026-04-20**
  - 路由表简化：CN/INTL 所有 intent → `['kimi']`；provider config 改懒加载（switch-case），只校验实际用到的 key
  - 模型：`moonshot-v1-8k`（可用 `KIMI_MODEL` 环境变量覆盖，MVP 最便宜）
  - `pnpm llm:probe` 3/3 通过（中文 draft prompt，平均 ~1s 延迟）
  - Kimi provider 错误分类修复：`exceeded_current_quota_error`/余额不足 → `AUTH_FAILED`（不重试），真实 rate limit 仍 `RATE_LIMITED`（可重试）
  - Vercel env：`KIMI_API_KEY` 已推 preview + production；`.env.local` 20 vars 全量同步到 preview（绕过 CLI v51 bug，用 REST API）
- [ x] W1-06 3 访谈招募 + 执行 + D10 裁决 (deps: none, 本周启动)
- [x] **W1-07** Thin vertical slice 跑通 · **✅ 2026-04-20**
  - 本地 end-to-end：登录 → Quick Create 3 字段表单 → LLM 生成 → 脚本结果页
  - `content.create` + `content.generateScript` + `content.getGenerationStatus` + `content.getSession` tRPC 端点齐全
  - `buildScriptPrompt`（公式一 60s + 长视频）+ `validateScriptLength` + `buildSuppressionScanner` 管线通
  - **关键决定**：Kimi 字数合规不稳（200-210 硬约束 3 次重试只能偶尔命中），改 graceful degradation：retry loop 追踪 bestAttempt，返回最接近目标版 + `qualityIssue` 软警告；仅零解析抛 500
  - 前端：QuickCreateForm 加 amber qualityIssue banner + red error banner（不再静默返表单）
  - Probe: `pnpm tsx --env-file=.env.local scripts/probe-script-gen.ts` 2/2 走通 degradation
  - Commit: `1120c28` · pushed `main` · Vercel auto-deploy 已触发

### Week 2 · Core Generation Pipeline (6 eng-days)

- [ ] W2-01 公式一 60s prompt 模板
- [ ] W2-02 content.create tRPC + session 写表
- [ ] W2-03 content.generateScript QStash dispatch
- [ ] W2-04 Script worker + 字数 validator + 3-retry
- [ ] W2-05 Post-gen suppression scanner
- [ ] W2-06 content.getStatus 轮询端点
- [ ] W2-07 Quick Create UI (3 字段 form)
- [ ] W2-08 脚本结果页 (5 段 + 字数 badge + 分镜表)
- [ ] W2-09 PostHog session_started + script_generated 事件

### Week 3 · Review + Export + Error Paths (5 eng-days)

- [ ] W3-01 Solo review 5 项 checklist gate UI
- [ ] W3-02 content.approve tRPC + state transition
- [ ] W3-03 content.export tRPC + 文本组装
- [ ] W3-04 CAC 标签 constants + 注入 middleware
- [x] W3-05 导出 UI: 复制 + .txt 下载（v1 已 ship；W3-04 实际把 ZIP/JSON/TXT 三件套一起出）
- [x] W3-06 节点级编辑 + cascade invalidate（已 ship；50/50 单测过）
- [x] W3-07 节点失败 UI 完善: friendlyFromNodeError + 详情弹窗 + 节点失败摘要 + 顶部 banner（已 ship；77/77 单测过）
- [x] W3-08 编辑 UX 升级: 按帧表单替代裸 JSON textarea（已 ship；73/73 单测过）
- [x] W2-07b SSE 推送: server-side 1s 轮询 + EventSource 客户端 + polling 自动从 2s 退化到 15s 兜底（已 ship）
- [ ] W3-07 抑制清单扩充到 50 词 + prompt 调优
- [ ] W3-08 PostHog script_approved + script_exported 事件

### Week 4 · Hardening + Seed Users + Launch (4.5 eng-days)

- [ ] W4-01 LLM spend counter + daily cap + 硬 kill
- [ ] W4-02 Runbook 3 条（/ops/runbook.md）
- [ ] W4-03 20 样本审计脚本
- [ ] W4-04 Landing page + signup 流程 polish
- [ ] W4-05 3 种子用户邀请 + 反馈表
- [ ] W4-06 Bug bash + launch gate 自审 + 上线

---

## 🎯 Resume Protocol（你完成 W1-01 后回来这样说）

打开新对话或回到当前对话，说一句：

> "W1-01 done, 继续 W1-02"

或：

> "W1-01 遇到问题: [描述]"

我会：
1. 读取本 PROGRESS.md
2. 读取 ENG_TASKS_V2_SOLO.md 的 W1-02 验收标准
3. 按 STRATEGY v2.0 §6 调用 Frontend Developer 子 agent 起草 W1-02 代码
4. 给你 PR checklist + 证据要求

**若 W1-01 未过**：我会帮你 debug（healthz 返回什么、env 缺什么），而不是推进 W1-02。

---

## 注意事项

- 本文件是**进度唯一真相**。每完成一个任务来这里打 ✅ 并写完成时间。
- 触发任一 kill condition（见 STRATEGY §5）立即回本文件写 "🔴 KILL triggered: [condition]"，我会重新规划。
- 周末至少休 1 天（SR1 burnout 风险，见 ENG_TASKS §Top Risks）。
