# Discovery Package — AI 内容营销工作室 MVP
**Version**: 1.1  
**Date**: 2026-04-17（用户访谈后更新）  
**Sprint**: Week 1 of 4  
**Stage**: Discovery → Strategy Handoff  
**Compiled by**: NEXUS-Sprint Orchestration (Product Manager · Trend Researcher · UX Researcher · Feedback Synthesizer · Analytics Reporter)

---

## EXECUTIVE SUMMARY

This package is the complete discovery output for the AI 内容营销工作室 MVP sprint. It is the single source of truth for all strategy and implementation decisions in Weeks 2–4. Do not begin design or engineering work until the 10 pre-build decisions (Section 4) have been resolved.

**The product**: A minimum viable workflow system for solo/2-person marketing teams at 10–200 person B2B SaaS companies. Core loop: content strategy generation → multi-channel production (WeChat 公众号 + LinkedIn) → human review/approval → performance retrospective.

**The core insight from discovery**: The product's original architecture was designed for the 20% of users who think strategically. 80% of the target users are ad-hoc opportunists — they have a deadline, not a content strategy. The MVP must serve both without forcing the ad-hoc majority through a workflow built for the strategic minority. This single insight reshapes onboarding, entry point design, and success metrics.

**Sprint 1 scope (confirmed)**: Quick Create entry + Strategy-First entry · WeChat 公众号 + LinkedIn · Example-first brand voice setup · Solo + Team review modes · LLM provider abstraction (legal requirement) · Minimal 3-field performance input · Uncanny valley suppression in prompts.

**Explicitly out of Sprint 1**: 视频号, 小红书, full retrospective dashboard, descriptor-first brand voice UI, strategy-first as forced entry.

**User interview findings (2026-04-17 update)**: First user interview revealed three critical additions:
1. **Trend intelligence gap**: Power users already have automated production pipelines. Their real bottleneck is upstream — *what* to create and *why* certain content goes viral (emotion trigger analysis). A "Topic Intelligence" module is missing from the current PRD.
2. **TTS/storyboard sync failure**: Script-to-frame time alignment is broken when scripts are generated as continuous prose. The pipeline needs frame-level script segmentation (40 units × 25-35 chars each = 6-8s per frame TTS).
3. **Two content formulas require different product support**: (1) Provocative assertion type — replicable format, production-focused; (2) Everyday phenomenon insight type ("Why are milk cartons square but Coke bottles round?") — topic selection is 70% of quality, requiring trend discovery tooling.

---

## SECTION 1 — PRODUCT BRIEF (PRD v0 Summary)

> ### ⚠️ v1.1 OVERLAY — D10 Channel Pivot (Provisional)
>
> **Status**: This DISCOVERY_PACKAGE's original body was written against the pre-D10 channel set (**WeChat 公众号 + LinkedIn**). On 2026-04-18, **D10** re-scoped Sprint 1 to **抖音 + 小红书** based on the 王磊 interview. D10 is currently **Provisional (D10-P)** and its formal close gate is the Week 1 Day 5 research brief (**2026-04-23**).
>
> **What to read where — channel references throughout this document**:
> - Anywhere the body below says "**WeChat 公众号 + LinkedIn**" as Sprint 1 scope → read as **抖音 + 小红书 (Provisional per D10-P)**
> - The sentence in §1 EXECUTIVE SUMMARY "**Explicitly out of Sprint 1: 视频号, 小红书**" → **小红书 has moved INTO Sprint 1** under D10-P; 公众号 + LinkedIn are now the **Plan B fallback**, not the default
> - All 60s char-limit references "**190–215**" → locked to **190–210** per **D13** (see STRATEGY_PACKAGE v1.1 and L87 in this doc's §1 table)
>
> **Plan B fallback**: If D10-P is falsified at 2026-04-23 (A2 or A7 fails per WEEK1_RESEARCH_PLAN D10 裁决), Sprint 1 reverts to **公众号 + LinkedIn**. Engineering impact is a feature-flag flip of `SPRINT1_ENABLED_CHANNELS` (TECH_ARCHITECTURE v1.1 §2 ContentChannel) — no DB migration, no schema change. The original §1 body is preserved below verbatim **so the Plan B spec remains discoverable** if revert is triggered.
>
> **Authoritative channel truth**: NEXUS_SPRINT_PLAN v1.1 + STRATEGY_PACKAGE v1.1 + DECISIONS_LOG D10-P/D16.



### Target Users

| Persona | Role | Core Pain | Tech Comfort | Make-or-Break Moment |
|---|---|---|---|---|
| 李明 (Li Ming) — Primary | Solo marketer, 30–80 person B2B SaaS | Reformatting the same idea across 4 channels; no data feedback loop | Medium (Notion, Feishu, Canva) | Decides in session 1 — in or out forever |
| 张薇 (Zhang Wei) — Secondary | Founder-marketer, 10–25 person SaaS | No time to write consistently; freelancers cost more to edit than to write from scratch | Higher (Linear, Slack, Notion) | Will invest 2–3 hours setup if output sounds like her |
| **王磊 (Wang Lei) — Tertiary（访谈新增）** | **个人 IP 创作者，B2B SaaS 创始人兼抖音运营者** | **已有半自动生产管线（Prompt框架→Claude→分镜→TTS→视频），真正痛点是：不知道该做什么内容，无法判断热点背后的情绪触发机制** | **高（自行搭建 AI 生产管线）** | **如果产品不能帮他找到下一个选题，他不会用** |

> **注**：王磊代表一类被 PRD v0 低估的用户——他们不需要"帮我写内容"，需要的是"告诉我该写什么以及为什么"。这类用户的产品需求集中在上游（选题洞察），而非中游（内容生产）。

### Jobs To Be Done（更新至 v1.1，含访谈新增）

1. **Strategy foundation**: Turn ICP knowledge into a 90-day content plan so I stop reinventing every quarter
2. **Brief generation**: Get a production-ready brief in under 5 minutes from a topic idea
3. **Multi-channel adaptation**: One approved long-form piece → Douyin script + Xiaohongshu post without 3 hours of reformatting
4. **Brand voice**: Every AI output sounds like me, not generic AI copy
5. **Performance visibility**: See which pieces and channels are working so I can repeat the right things
6. **Topic intelligence（访谈新增）**: 告诉我现在什么话题有机会爆、为什么它会火、背后的情绪触发机制是什么——我有生产能力，我缺的是选题判断力
7. **Video pipeline sync（访谈新增）**: 生成的脚本和分镜能精确对齐，60秒视频一键输出，不需要我手动切割音频和画面

### P0 Feature Set

| Feature | Priority | Sprint Week |
|---|---|---|
| ICP + Brand Voice Setup (example-first) | P0 | Week 1 |
| "Quick Create" entry (bypasses strategy) | P0 | Week 1 |
| Strategy generation (with reasoning chain display) | P0 | Week 1 |
| Content brief generation | P0 | Week 1 |
| Long-form draft generation (brand voice fidelity + uncanny valley suppression) | P0 | Week 1–2 |
| Multi-channel adaptation: 公众号 + LinkedIn (with diff annotation) | P0 | Week 2 |
| Review & approval: Solo mode + Team mode | P0 | Week 2 |
| LLM provider abstraction (domestic routing for CN users) | P0 — Infrastructure | Week 1 |
| Minimal performance logging (3-field form) | P1 | Week 3 |
| Content calendar (kanban view) | P1 | Week 3 |
| **Topic Intelligence module（访谈新增）** | **P1** | **Week 3** |
| **60-second video mode（访谈新增）** | **P1** | **Week 2–3** |
| Full retrospective dashboard | P2 → Sprint 2 | — |
| 视频号 + 小红书 channels | P2 → Sprint 2 | — |

#### 新增模块说明

**Topic Intelligence 选题洞察模块（P1）**
- 输入：用户账号方向 + 目标平台（抖音/小红书）
- 输出：
  - 近期爆款内容拆解（结构 + 情绪触发机制 + 传播动机）
  - 可复用的选题模式识别（同一底层逻辑可套用的其他话题）
  - 新现象选题推荐（近 1-2 年出现的反常识日常现象）
- 核心价值：解决"有生产能力但不知道生产什么"的上游瓶颈
- 实现路径 MVP：Claude 驱动的爆款分析 + 结构化选题推荐（不需要实时数据爬取）

**60-Second Video Mode 短视频模式（P1）**

两种模式，用户在创建内容时选择：

| 参数 | 长视频模式 | 短视频模式（60秒）|
|---|---|---|
| 总字数 | 800-1000 字 | 190-210 字（硬上限，D13）|
| 分镜帧数 | 40 帧 | 15-18 帧 |
| 帧时长 | 6 秒/帧 | 3-4 秒/帧（开场快切 2 秒）|
| 案例数量 | 3 个 | 1 个（最强情绪张力）|
| 结尾 | 金句收尾 | 金句 + 评论引导问题 |
| TTS 对齐 | 帧级切割（25-35字/单元）| 连续旁白，画面并行覆盖 |

内容公式支持（两种公式，用户选择）：
- **公式一：挑衅断言型** — 反常识开场 → 痛感词汇 → 案例证明 → 真相揭示 → 评论引导
- **公式二：日常现象洞察型** — 熟悉现象 → 错误直觉 → 真实底层逻辑 → 延伸洞察 → 评论引导

### Happy Path (steady state, one content piece)
Signup → Brand voice setup (≤3 min) → Quick Create OR Strategy-First → **选择内容公式（公式一/二）+ 时长（60s/长视频）** → Brief approval → Draft generation → Review (Solo or Team) → Multi-channel adaptation with diff → Export → Performance log (optional, 3 fields)  
**Target: 30–40 min total, steady state**

---

## SECTION 2 — MARKET INTELLIGENCE (Trend Research Summary)

### Why Now: 3 Load-Bearing Signals

1. **Structural headcount gap**: B2B SaaS marketing teams structurally downsized in 2023–2024 while output expectations held. This is permanent, not cyclical. 1–2 person teams with high output demands are the core buyer.

2. **Chinese B2B content marketing tooling gap**: The Chinese B2B ecosystem is 5–7 years behind Western SaaS in content marketing maturity. Tooling demand is accelerating now. Zero competitors cover the bilingual (公众号 + LinkedIn) workflow end-to-end with brand voice fidelity.

3. **WeChat 公众号 + 视频号 convergence**: Tencent is forcing simultaneous text + video production for the same B2B audience. Teams that previously managed one 公众号 editorial calendar now need synchronized multi-format production. Direct demand for this product's core feature.

### Competitive Gap Map

| Category | Best Current Option | What They Miss |
|---|---|---|
| AI writing (EN) | Jasper, Writer.com | No Chinese platforms; no workflow; no review layer |
| AI writing (CN) | 笔灵AI, 蚁小二 | No workflow; no international channels; no analytics |
| Content workflow | HubSpot AI Content Hub | No 公众号/视频号; shallow brand voice; no review |
| Analytics (CN) | 新榜 (Xinbang) | Analytics only; no production; no AI |
| Scheduling/publishing | Buffer, ContentStudio | No AI generation; no Chinese platforms |

**The gap**: No tool connects brand-consistent strategy → multi-format production → review → bilingual publishing → performance feedback for the 10–200 person B2B team.

### Critical Risks (Trend)

| Risk | Severity | Required Action |
|---|---|---|
| China data residency (《数据安全法》) | **Critical** | LLM provider abstraction in Sprint 1 — cannot be retrofitted |
| AI content saturation on LinkedIn | High | Lead with review workflow as quality control; not "AI writes for you" |
| WeChat AIGC labeling (evolving) | Medium | Monitor CAC publications; human review layer provides compliance hedge |
| HubSpot "good enough" displacement | Medium | Differentiate on bilingual voice fidelity; visible before/after comparison in onboarding |

### Positioning Recommendation
Position as **"brand quality control for AI content"** — not "AI that writes your content." The human review layer is the product's primary trust signal and competitive differentiator. This positioning is supported by the AI content saturation data and differentiates from commodity AI writing tools.

---

## SECTION 3 — UX RESEARCH (Critical Findings)

### 5 Usability Risks (Ranked by Abandonment Probability)

| Risk | Failure Mode | Required Mitigation |
|---|---|---|
| 1. Brand voice setup abandonment | Cognitive overload before any output seen → close tab | "Try first, configure later" — generate one piece with minimal input; brand voice refinement as second pass |
| 2. Strategy output feels generic | "It's not smarter than me" → mentally downgrade to formatting tool | Display reasoning chain: label each recommendation with the input that generated it; show one vertical-specific example |
| 3. Multi-channel adaptation confusion | Users must fully re-read each variant → efficiency gain negated | Diff-style annotation: "Shortened for WeChat attention span; added question hook for LinkedIn algorithm" |
| 4. Review flow failure (both modes) | Solo: authorial bias; Team: content stuck in limbo | Solo mode: add cognitive mode-switch checklist before approval. Team mode: explicit state transitions with named owner required |
| 5. Performance logging skipped | Highest friction, weakest reward → "flossing problem" | 3-field minimum input; 48-hour deferred prompt post-publish; optional not required |

### Mental Model Gap (Critical)

**Reality**: ~80% of target users are "Ad-Hoc Opportunists" — piece-first, deadline-driven, no standing strategy.  
**Product assumption**: Strategy-first architecture built for the 20% who plan quarterly.  
**Fix**: Quick Create entry point must be the **default** path. Strategy-First is opt-in. Do not force the majority through a workflow they do not recognize.

### Brand Voice UX — Recommended Flow

1. **Entry** (1 field): "Paste 2–3 sentences from content you've written that you're proud of."
2. **AI analysis** (15s): Display tone, vocabulary level, style markers, one specific gap
3. **Before/after preview**: Show same sentence in generic AI voice vs. brand voice side-by-side
4. **Confirm or refine**: 3 targeted questions only (never-use word, always-use phrase, formal vs. informal)
5. **Done**: "Your voice is set. Update anytime in Settings."

**Completable in under 3 minutes.**

### AI Trust Calibration Arc

Users pass through 3 phases. Design for Phase 1, not Phase 3:

| Phase | Sessions | Behavior | Product Response |
|---|---|---|---|
| Skeptical Auditor | 1–3 | Rewrites heavily; evaluates everything | Make editing fast; show reasoning chain; eliminate uncanny valley patterns |
| Selective Delegator | 4–10 | Trusts AI for specific content types | Surface edit rate decline over time as trust proof point |
| Calibrated Collaborator | 10+ | Accurate model of AI's strengths/limits | Reduce friction; enable regeneration in one click |

**Uncanny valley patterns to suppress in Sprint 1 prompts**:
- Hollow transitions: "In today's fast-paced business environment...", "It's no secret that..."
- Symmetrical list structures (exactly 3 points × 3 sub-bullets of identical length)
- Confident incorrectness about the user's own product (hallucinated feature claims)
- Uniformly positive framing with no acknowledged uncertainty

### Review UX Design Principles

- **State clarity over communication features** — color-coded status visible without opening a document
- **Approve is a distinct gesture** — physically separate from Save/Edit; never adjacent to Regenerate or Delete
- **Comments anchored to semantic sections**, not character offsets (AI edits shift positions)
- **Resolved comments collapse** (Figma pattern) to reduce visual noise
- **Export available before approval** — some users need external review before internal sign-off; do not gate export to approval state

---

## SECTION 4 — PRE-BUILD DECISIONS (Must Resolve Before Week 2)

10 decisions that are load-bearing for the build. Each has an owner, deadline, and forced choice. Unresolved decisions block the workstream downstream.

| # | Decision | Owner | Deadline | Forced Choice |
|---|---|---|---|---|
| D1 | Primary entry point: strategy-required or quick-create default? | PM + Design | **Week 1** | Quick Create as default (recommended) OR Strategy-First as default |
| D2 | Brand voice setup: required at onboarding or deferred post-output? | Design + PM | **Week 1** | Defer to post-first-output (recommended) OR gate generation behind setup |
| D3 | LLM architecture: provider abstraction from commit 1? | Eng + Legal | **Week 1** | Abstraction layer from day 1 (required) OR single provider + retrofit (not recommended) |
| D4 | Performance retrospective scope: 3-field minimal form or descope entirely? | PM + Design | **Week 1** | Ship 3-field form (recommended) OR placeholder only |
| D5 | Review flow: one UX or two explicit modes (Solo/Team)? | Design | **Week 1** | Two modes with different behavioral defaults (recommended) OR single flow |
| D6 | Channel adaptation: ship with diff annotation or output-only? | Design + Eng | **Week 2** | Diff annotation in Sprint 1 (recommended) OR stage annotation for Sprint 2 |
| D7 | Uncanny valley suppression list: pre-launch or iterate post-observation? | Eng + PM | **Week 2** | Define suppression list before first user session (recommended) OR iterate |
| D8 | Brand voice data: store with retention policy or no persistence in MVP? | Legal + Eng | **Week 1** | Define retention policy before collecting any user data |
| D9 | Product positioning: quality control layer or AI content generator? | PM + Design | **Week 1** | Quality control / brand enforcement (recommended) OR generation-first |
| D10 | 视频号 in Sprint 1 scope? | PM | **Week 1** | Out of Sprint 1 (recommended) OR in scope |

---

## SECTION 5 — RISK REGISTER

| Risk | Probability | Impact | Mitigation Required |
|---|---|---|---|
| R1: Onboarding abandonment before first output | **High** | **High** | "Try first" entry; instrument every onboarding drop-off point; target: brand_voice_saved → draft_generated conversion >65% |
| R2: LLM architecture requires mid-sprint rebuild for CN compliance | **High** | **High** | Abstraction layer = Sprint 1 engineering requirement, not a feature. Assign owner before any infrastructure work begins |
| R3: Phase 1 trust failure, no recovery path | **Medium** | **High** | Ship uncanny valley suppression + reasoning chain display + edit-fast UX before first user session |
| R4: Retrospective module collects no data | **High** | **Medium** | Descope full dashboard; ship 3-field minimal form + 48hr prompt; track completion rate; full dashboard only if >30% completion in Sprint 1 |
| R5: HubSpot "good enough" displacement | **Medium** | **Medium** | Target bilingual teams in early user recruitment; brand voice before/after comparison as onboarding proof point |

**Kill conditions** (any of these = stop and reassess):
- Avg edit time >25 min/piece in first 10 sessions
- Onboarding completion rate <60% after implementing "try first" fix
- Survey B mean score <3.0 AND D14 return rate <40% simultaneously
- >10% of users contact support before completing first cycle

---

## SECTION 6 — METRICS FRAMEWORK

### North Star Metric

**Weekly Active Content Completions (WACC) Rate**  
Definition: % of active users who complete at least one full content cycle (any entry point → draft → review → export) in a rolling 7-day window.  
MVP target: 70% by day 30.  
Alert: Drop below 50% for 2 consecutive days.

Tracked separately by path: Quick Create vs. Strategy-First.

### Metrics Taxonomy

**Tier 1 — North Star**
- WACC Rate (target: 70% by day 30)

**Tier 2 — Primary Health (4 weeks, 20 users)**

| Metric | Target | Alert |
|---|---|---|
| Activation Rate | 75% complete first cycle within 7 days | <60% in any 7-day cohort |
| Draft Acceptance Rate | 65% (approve without full regen) | <45% → quality problem |
| D14 Return Rate | 60% initiate second piece within 14 days | <40% |
| Multi-Channel Export Rate | 50% export all formats from one Strategy-First session | <30% |
| Onboarding Completion Rate | 80% reach first draft generation | <60% in any 3-day window |

**Tier 3 — Diagnostic (check when Tier 2 alerts)**

Brand voice setup completion · Quick Create vs. Strategy-First split · Median time-to-first-draft (<8 min target) · Review edit intensity (<5 edits/draft) · Survey response rates · Performance log entry rate (50% by day 30) · Session-to-cycle conversion by path

**Tier 4 — Guardrails (must not deteriorate)**

| Metric | Alert Threshold |
|---|---|
| Full Regeneration Rate | >35% for 3+ consecutive days → immediate content review |
| Onboarding Abandonment Rate (pre-output) | >40% → onboarding UX intervention |
| Generation Error / Timeout Rate | >8% → engineering escalation |

### In-App Surveys

**Survey A — Post-First-Export Efficiency** (fires on first cycle_completed, non-blocking):
- "How much time did creating this piece take compared to your usual process?" (5-option scale: saved 2h+ / saved 1–2h / saved 30–60min / about the same / took longer)
- "Would you use this for your next piece?" (Definitely yes / Probably yes / Not sure / Probably not)
- "What slowed you down most today?" (optional open text)

**Survey B — Per-Piece Quality** (fires 60s after review_approved, non-blocking):
- "How well did this draft match your brand voice?" (1–5 scale; 4–5 = "minor edits only")
- If score 1–2: "What was off?" multi-select (tone / vocabulary / sentence structure / claims / platform format)

### Daily Standup (4 Numbers)

1. **Yesterday's cycle completions** — raw count + 7-day sparkline
2. **Onboarding funnel drop rate** — 3-step funnel: signed_up → brand_voice_saved → draft_generated
3. **Draft acceptance rate** (rolling 48h) — green >55%, yellow 45–55%, red <45%
4. **Survey response rates** (both surveys) — alert if either below 35% for 3-day rolling window

### A/B Experiment: Brand Voice Input Type

**Hypothesis**: Example-first input (paste existing content) produces higher-quality first drafts than descriptor-first input (structured fields), measured by Survey B score.

**Assignment**: Deterministic hash of user_id (odd = example-first, even = descriptor-first).  
**Success threshold**: Example-first mean Survey B score ≥0.7 points higher AND full regeneration rate ≥10pp lower.  
**Duration**: Full 4-week sprint.  
**Decision rule**: At day 30, if threshold met → adopt example-first for Sprint 2 rollout. If mixed → keep descriptor-first (lower eng complexity) and re-test with larger cohort in Sprint 2.

### Required Instrumentation (before day 1 of user access, in order)

1. `brand_voice_saved` — with `variant` property for A/B test
2. `content_started` — with `path` (quick_create / strategy_first)
3. `draft_generated` — with `generation_duration_ms`, `channel`
4. `review_approved` — with `review_mode` (solo / team), `edit_count`
5. `cycle_completed` — composite event, source of WACC; with `formats_exported` array
6. `survey_shown` + `survey_submitted` — both surveys
7. `full_regenerate_requested` — guardrail metric source
8. `generation_error` — guardrail metric source

Surveys must be live by day 3 to capture first-export feedback from early activators.

---

## SECTION 7 — RECOMMENDED WEEK 1 RESEARCH PLAN

A 2-person team, 5 working days. Three activities in priority order:

**Priority 1: Contextual Discovery Interviews** (5 sessions × 45 min)
- Profile: Solo marketers or founder-marketers at B2B SaaS, 10–80 employees, used AI writing tool in past 6 months
- Method: Walk me through your last piece of content from idea to publish — where do you get stuck?
- What it unlocks: Validates ad-hoc vs. strategic mental model split; confirms multi-channel pain; informs onboarding sequence priority
- Recruiting: Start Day 1 on LinkedIn. $75–100 gift card. Screen for company size + role + AI tool usage.

**Priority 2: Competitive UX Teardown** (half day per tool — Jasper, Notion AI, Writesonic)
- Document: Brand voice setup flow, generation experience, review/export flow
- What it unlocks: Table-stakes features to match; 2–3 patterns worth adopting; gaps to exploit

**Priority 3: Unmoderated Prototype Test** (8–10 participants, Maze or Useberry)
- Test: Brand voice setup completion in <3 min; understanding of strategy generation before submitting
- Launch Day 2; results in 48 hours
- What it unlocks: Validates brand voice input UX before building; catches terminology confusion early

---

## SECTION 8 — SCOPE DECISION (Final)

### In Sprint 1
Quick Create + Strategy-First entry points · ICP/brand voice setup (example-first) · Strategy generation with reasoning chain · Brief generation · Long-form draft (with uncanny valley suppression) · 公众号 + LinkedIn adaptation with diff annotation · Solo + Team review modes · Minimal 3-field performance input · LLM provider abstraction (infrastructure)

### Explicitly Cut from Sprint 1
视频号 and 小红书 production · Full retrospective dashboard · Descriptor-first brand voice UI · Strategy-first as forced/only entry point · Native publishing (export to clipboard/file is sufficient) · Multi-user RBAC · Independent bilingual drafts (one primary language + adapted translation only)

### Staged for Sprint 2 (pending Sprint 1 validation)
视频号 script production + 小红书 adaptation · Full performance retrospective dashboard (only if Sprint 1 3-field form shows >30% completion) · Brand voice thumbs-up/down + specific adjustment options · Edit rate decline visualization (trust proof point) · Advanced brand voice refinement (cross-session consistency checking)

---

## HANDOFF CHECKLIST

Before moving to strategy/design phase, confirm:

- [ ] D1–D10 decisions resolved and documented (Section 4)
- [ ] Eng lead reviewed LLM abstraction requirement (D3) — first architectural decision before any code
- [ ] Legal reviewed data retention policy (D8) — required before user data collection begins
- [ ] Week 1 research interviews recruited (Day 1 action)
- [ ] Unmoderated test designed and queued (Day 2 action)
- [ ] Instrumentation spec reviewed by Eng — 8 required events confirmed before first user
- [ ] Brand voice A/B test assignment logic confirmed (user_id hash)
- [ ] Standup dashboard built and team has access before first user activates

---

*This document is the output of NEXUS-Sprint Discovery Phase. It supersedes any prior notes, assumptions, or informal alignment. All scope changes after Week 1 kickoff require written sign-off from PM and Eng Lead with rationale documented in the sprint log.*
