# Strategy Package — AI 内容营销工作室 MVP

> **🔴 SUPERSEDED 2026-04-19**: 本文件假设 3 工程师团队。Solo 执行请读 **STRATEGY_PACKAGE_V2_SOLO.md**（21 eng-days / 单渠道抖音 / 单公式一 / 单 Solo review）。本文件保留作多人协作 Plan B。

**Version**: 1.1 (review-driven revision) — **superseded by v2.0 solo for execution**
**Compiled**: 2026-04-18 v1.0 · **Revised**: 2026-04-18 v1.1 (same day)
**Stage**: 2 (Strategy) — closed upon publication of this doc
**Successor**: `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/NEXUS_SPRINT_PLAN.md` v1.1 (Stage 3+ orchestration)

**v1.1 changes**: (1) 60s char limit → 210 hard cap (aligned with DECISIONS_LOG, was 215); (2) W3 engineering backlog cuts 5 tasks (ENG-013, 016, 032, 033, 044 — moved to OPT); (3) FS engineer W3 role re-scoped to BE overflow; (4) capacity math corrected (v1.0 "within 10%" was wrong — 20.5 eng-days was 37% over); (5) cut-list restructured to mark Sprint 1 **cuts-already-made** vs. **still-cuttable-if-slipping**.

This package consolidates the Stage 2 outputs from five perspectives (Sprint Prioritizer, Brand Guardian, Channel Strategists, UX Architect, Senior PM). Engineers build against this doc; product decisions reference this doc; scope changes are rejected against this doc.

Upstream inputs (do not re-derive):
- `DISCOVERY_PACKAGE.md` v1.1 — personas, P0 list, metrics framework
- `DECISIONS_LOG.md` — D1–D10 confirmed (D10 channels = Douyin + Xiaohongshu, per 2026-04-17 decision)
- `UX_ARCHITECTURE.md` — 8 screens, 4 flows, component inventory, design principles
- `TECH_ARCHITECTURE.md` — LLM abstraction, data model, state machines, instrumentation
- `ENG_TASKS.md` — 75 tasks dependency-ordered

---

## 1. Sprint Prioritization — 4-Week Calendar

**Sprint window**: 2026-04-17 → 2026-05-15 (20 working days + launch day)

### Week themes (one line each)

| Week | Dates | Theme | Must-ship-this-week |
|---|---|---|---|
| W1 | 04-17 → 04-24 | Foundation + research validation | CI/preview/PostHog live · LLM abstraction scaffold · migration 001 · thin vertical slice demo · Day 5 research brief |
| W2 | 04-24 → 05-01 | Content Creation Engine | Formula+length picker · Quick Create form · 60s + long-form script generators · suppression prompt+scanner · first 3 PostHog events |
| W3 | 05-01 → 05-08 | Adaptation, Review, Export | 抖音 + 小红书 adapters with diff · Solo + Team review (named-owner/timeout deferred) · Export with CAC label · Topic Intelligence BE (no emotion breakdown) · events 4–7. **Contingent on D10 validation 2026-04-23 — see SPRINT_PLAN §3 Week 3 Plan B for revert scenario** |
| W4 | 05-08 → 05-15 | Calendar, Polish, Launch | Content Calendar kanban · Topic Intelligence UI · Brand Voice capture (deferred flow) · Performance log + 48h reminder · Surveys · Strategy-First entry · launch gate · ship |

### P0 → Sprint map (from PRD v0)

| P0 feature | Sprint week | Corresponding tasks | Cuttable if slipping? |
|---|---|---|---|
| ICP + Brand Voice setup (example-first) | W4 | ENG-067..070 | Partial — can cut before/after UI (ENG-070) but not capture |
| Quick Create entry | W2 | ENG-005, 006 | **No** — core of the product |
| Strategy generation + reasoning chain | W4 | ENG-074, 075 | **Yes** — cut first if W4 slips (Quick Create covers 80%) |
| Content brief generation | W2 | Integrated into ENG-009/010 prompts | No — part of script pipeline |
| Long-form draft (brand voice + uncanny valley) | W2 | ENG-010, 011, 017, 018, 019 | No |
| Multi-channel adaptation (抖音 + 小红书) with diff | W3 | ENG-021..026 | Partial — can ship 抖音 only if 小红书 slips. **Plan B if D10 falsified**: WeChat + LinkedIn swap (2–3 eng-days rework) |
| Review workflow (Solo + Team) | W3 | ENG-027..031, 034, 035 (ENG-032/033 cut in v1.1) | Partial — Solo is launch-blocking; Team launches with submitter-as-default-owner (no named assignment, no 24h timeout) |
| LLM provider abstraction | W1 | TECH_ARCH §2 implementation | **No** — regulatory hard requirement |
| Minimal performance logging | W4 | ENG-047..051, 064 | No — needed for kill condition #4 |
| Topic Intelligence | W3–W4 | ENG-041, 042, 043, 045, 046 (BE W3, UI W4; **ENG-044 emotion breakdown CUT in v1.1**) | Partial — ships without emotion breakdown |
| 60-second video mode | W2 | ENG-009, ENG-004 | No — strong signal from interview |

### 20-user activation timeline

- Launch day (05-15): 5 seeded users (warm intros, existing discovery interviewees)
- Day 3 post-launch: +5 users from waitlist
- Day 7: +10 users → 20 total, matching Discovery §6 metrics denominator
- Day 30: metrics read against PRD v0 success criteria

---

## 2. Brand Voice Guardrails

Two distinct rubrics: one for the product's own surface text (errors, empty states, CTAs, onboarding copy), one for the generated-content quality gate.

### 2.1 Product-surface voice (from D9 positioning)

**Positioning north star**: *"让 AI 内容听起来像你自己写的"* — the product is a **quality control layer**, not a generator.

**Tone attributes**:
- Confident but not boastful. Never self-congratulate the AI ("我们的 AI 非常智能...").
- Operator-respectful. Users are marketing professionals, not novices. Avoid hand-holding language.
- Calmly honest about limits. When generation fails, say what went wrong and what to try next. Do not apologize theatrically.
- Bilingual comfort. Chinese primary; English acceptable inline (LinkedIn, SaaS terms). Never pidgin.

**Voice rules (for every string the product ships)**:

| Rule | Good | Bad |
|---|---|---|
| Lead with the user's verb | "选择公式" | "让 AI 为你推荐公式" |
| Describe state without drama | "生成中，约 30 秒" | "AI 正在为您精心打造..." |
| Specific errors | "字数 247 超出 60 秒模式上限 215；请选择长视频模式或缩短" | "生成失败，请重试" |
| No exclamation marks | "草稿已导出。" | "草稿已成功导出！🎉" |
| Action verbs on CTAs | "导出到抖音"; "审核通过" | "立即体验"; "一键搞定" |
| Empty states pivot forward | "还没有内容。从左上角开始一个。" | "暂无数据" |

**Forbidden phrases** (product will automatically fail QA if shipped):
- "一键" (cheapens user craft)
- "智能生成" / "AI 赋能" / "赋能内容"
- "亲" / "您稍等"
- "精心/精美/贴心打造"
- Emoji in system copy (emoji belong to user content, not product chrome)

### 2.2 Generation rubric (for content the product creates for users)

Every piece of generated text — scripts, briefs, adaptations — is scored against this rubric. Target: ≥80% of 20-sample audit score ≥4/5 per Reality Checker launch gate.

**5 dimensions, 1–5 each**:

1. **Voice fidelity** — does this sound like the user's pasted sample? (5 = indistinguishable; 1 = obviously generic AI)
2. **Claim restraint** — does it avoid inventing product features the user didn't describe? (5 = zero hallucinated specifics; 1 = confidently wrong)
3. **Structural variety** — free of symmetrical templates (3×3 lists, parallel sentence starts)? (5 = natural rhythm; 1 = AI-shaped)
4. **Opening honesty** — does the hook avoid hollow transitions? (5 = starts on a concrete noun/number/observation; 1 = "在当今快节奏的商业环境中...")
5. **Platform fit** — does it match the channel's idiom? (5 = could pass as native Douyin/Xiaohongshu; 1 = formatted for the wrong medium)

**Uncanny valley suppression list** (from D7, enforced at prompt layer AND post-gen scanner):
- Hollow transitions: "在当今...", "众所周知...", "毋庸置疑...", "随着...的发展"
- Symmetrical lists: exactly 3 bullets with parallel structure and equal length
- Self-congratulation: "这个方法非常有效", "经过精心设计"
- Confident product claims the user did not supply
- Uniformly positive framing; no acknowledged uncertainty or trade-off
- Emoji stuffing (>3 emojis per 100 chars on Xiaohongshu; any emoji on Douyin口播)
- Filler adverbs: "非常", "极其", "极度", "完全" (acceptable ≤1 per 100 chars)

Scanner implementation: ENG-019 (post-gen regex + keyword pass). Prompt-layer suppression: ENG-018.

---

## 3. Channel Adaptation Rulebook (Douyin + Xiaohongshu)

Per D10, Sprint 1 ships **Douyin + Xiaohongshu**. This rulebook is the input to ENG-021..026 (adapters, diff engine, UI). These are **product-logic** rules the system encodes, not marketing-of-the-product rules.

### 3.1 Douyin (抖音) adapter rules

**Format**: 口播 script (spoken narration), optionally storyboarded.

**Length rules** (v1.1: aligned to DECISIONS_LOG single source of truth):
- 60s mode: 190–210 total chars, **hard limit 210**. Auto-retry if over; trim fallback if retry fails.
- Long-form mode: 800–1000 chars.

**Pacing markers** (injected by adapter):
- 60s: `[0:00 钩子]` `[0:10 论点]` `[0:25 案例]` `[0:50 收尾]` with char budget per section
- Long-form: `[帧 N / 40]` per frame; 25–35 chars per frame unit

**Hook requirements** (first 8 seconds / ~30 chars):
- Must end on a question, a counterintuitive claim, or a specific number
- Must NOT start with greeting ("大家好", "Hi 朋友们")
- Must NOT describe what the video is about ("今天我想聊聊..."); must BE about it

**CTA** (last 5 chars ~):
- Formula 1 (挑衅断言): ends with a challenge — "你觉得呢？"
- Formula 2 (日常现象洞察): ends with a comment bait — "你身边还有哪些？"

**Forbidden on Douyin**:
- Links (platform strips them)
- @-mentions of competitors
- Currency figures in header (流量限流触发条件)
- Emoji anywhere in 口播 script (they don't render in TTS)

**Mandatory**:
- **CAC AI-generated label** injected at export — string constant in ENG-065 registry, middleware at ENG-066/039 applies on every Douyin export payload. Launch gate requires 100% label presence.
- Pacing markers visible in the script view (ENG-015)

**Diff annotation for Douyin** (what the diff UI shows when adapting from long-form):
- "缩短至 60s 口播节奏 (X → Y 字)"
- "开场改为反常识断言，替换原引言"
- "结尾加评论引导问题"
- "移除 N 处空洞过渡（[列出原短语]）"

### 3.2 Xiaohongshu (小红书) adapter rules

**Format**: 图文 note — title + body. No video in Sprint 1.

**Length rules**:
- Title: ≤20 chars, hard limit (platform rule)
- Body: 300–800 chars ideal; hard max 1000

**Title requirements**:
- Must contain one emoji OR one number (platform engagement heuristic) — enforced by adapter prompt, validated post-gen
- Must not use clickbait patterns the platform down-ranks: "震惊！", "必看！", "干货！"
- Must include a specific noun (not all-abstract)

**Body structure**:
- Lead paragraph: 1 sentence, no emoji, establishes the claim
- 3–5 short paragraphs, separated by single blank line
- Moderate emoji density: 2–5 emojis total in body, never clustered
- Hashtags at bottom: 3–5 tags, format `#关键词#` (platform syntax)

**Forbidden on Xiaohongshu**:
- External links (hidden by platform)
- Prices or hard sells (community flag risk)
- Long unbroken paragraphs (>120 chars without break)
- Hashtags inline in body (only at footer)
- Over 5 emojis in the body (looks like spam)

**Mandatory**:
- Adapter prompt instructs emoji placement by section, not carpet-bombing
- Hashtag block rendered separately in UI for easy copy

**Diff annotation for Xiaohongshu** (vs. long-form source):
- "标题从 X 字 → 18 字，加入具体数字"
- "段落切分为 N 段，每段 ≤120 字"
- "添加 3 个话题标签 (#...#)"
- "emoji 密度调整：X → Y（分段分布）"

### 3.3 Cross-channel diff engine (ENG-024)

Output shape per adaptation:
```
{
  channel: 'douyin' | 'xiaohongshu',
  content: <full text>,
  aiLabel?: <string, douyin only>,
  diff: [
    { category: 'length' | 'structure' | 'tone' | 'compliance', change: '...', rationale: '...' }
  ]
}
```

Rendered side-by-side in ENG-025 with diff highlights inline. Tooltips for each diff entry show the rationale.

---

## 4. UX Readiness Statement (Architect Sign-off)

**Verdict**: `UX_ARCHITECTURE.md` is implementation-ready. Frontend Developer unblocked.

**Implementation-ready sections cited verbatim**:
- §1 Information Architecture — site map + navigation + entry-point architecture (Quick Create vs. Strategy-First coexistence) are concrete
- §2 Core User Flows — 4 flows documented (Quick Create 60s Douyin · Brand Voice deferred · Topic Intelligence · Team Review)
- §3 Wireframes — 8 screens specified (Dashboard, Formula picker, Quick Create input, Script result, Brand voice, Review Solo, Topic Intelligence, Calendar)
- §4 Navigation & State — always-visible elements, content state surfacing, transitions
- §5 Component Inventory — specified
- §6 Design Principles — 5 principles that resolve ambiguity ("Checklist before button", "Quick Create as promise", "Diff as trust mechanism", "Brand voice learned", "State never ambiguous")

**Zero unresolved UX decisions identified.** Any UX question during implementation is resolvable against UX_ARCH §3–§5; if ambiguity found, Frontend Developer posts in standup, Architect adjudicates same-day.

**Screen → task mapping** (so FE engineers can proceed):

| UX_ARCH screen | Sprint week | Task IDs |
|---|---|---|
| Screen 1 · Dashboard / Home | W4 | ENG-053, 055 (kanban) |
| Screen 2 · Formula + Length selection | W2 | ENG-003, 004 |
| Screen 3 · Quick Create input | W2 | ENG-005, 006, 007 |
| Screen 4 · Script result + Storyboard | W2–W3 | ENG-015, 016 |
| Screen 5 · Brand Voice setup (deferred) | W4 | ENG-070 |
| Screen 6 · Review Workspace (Solo) | W3 | ENG-030, 034, 035 |
| Screen 7 · Topic Intelligence | W4 | ENG-045, 046 |
| Screen 8 · Content Calendar | W4 | ENG-053, 054, 055 |

---

## 5. Engineering Backlog (Dependency-Ordered, with Owners + Estimates + Critical Path)

This section consolidates `ENG_TASKS.md` into the single backlog engineers execute against.

### 5.1 Totals (v1.1 corrected)

- **v1.0 miscalculation**: v1.0 claimed "within 10% of capacity" — actual was 48.75 / 45 = **8.3% over aggregate**, but per-week and per-role distribution was far worse. W3 BE-alone was 13.75 eng-days vs. 5-day BE capacity = **175% over for BE in W3**.
- **v1.1 after cuts**: 70 tasks · ~44.75 eng-days total (14 + 16.5 + 14.25)
- Capacity: 3 engineers × 15 working days = 45 eng-days. **Within capacity at aggregate; W3 still ~10% over at per-engineer level.**
- **W3 role rebalance**: FS engineer no longer "float/review" — explicitly owns ~5 eng-days of BE-tagged overflow (see §5.4). Senior PM tracks daily FS-on-BE eng-days.
- Owner split: BE-heavy in W2 + W3 (even with cuts), FE-heavy in W4, FS role varies by week

### 5.2 Migration order (BLOCKING)

```
W2 Day 1: 001 content_sessions · 002 content_scripts · 003 suppression_list
W3 Day 1: 004 content_reviews · 005 content_adaptations + topic_analyses
W4 Day 1: 006 performance_logs + survey_responses · 007 brand_voices + FK patch
```
All tables Supabase RLS via JWT `tenantId` claim. Drizzle schema definitions co-located in `app/db/schema/`.

### 5.3 Critical path chain (cannot parallelize)

```
D3 sign-off (W1 Day 2)
  → Clerk JWT tenant-isolation spike (W1 Day 3, NEW v1.1) [2–4h]
  → CAC AI label copy from Legal (W1 Day 5, hard deadline 2026-04-21)
  → LLM abstraction (W1 Day 3–5)
  → ENG-001 (W2 Day 1)
  → ENG-002 (W2 Day 1–2)
  → ENG-006 wiring (W2 Day 2–3)
  → ENG-008 dispatch (W2 Day 2–3)
  → ENG-009/010 generators (W2 Day 3–5)
  → ENG-012 validation/retry (W2 Day 5)
  → ENG-014 polling (W2 Day 5)
  → ENG-015 result UI (W2 Day 6–7)
  → ENG-021 adaptChannels (W3 Day 1) — **branchable by D10 verdict; adapter shell is channel-agnostic**
  → ENG-022/023 adapters (W3 Day 2–4)
  → ENG-024 diff engine (W3 Day 4–5)
  → ENG-025 comparison UI (W3 Day 5–6)
  → ENG-028 submitReview (W3 Day 5–6)
  → ENG-031 Team state machine (W3 Day 6)
  → ENG-036 exportContent (W3 Day 7)
  → ENG-039 + 066 CAC label pipeline (W3 Day 7)
  → launch gate (W4 Day 6)
```

### 5.4 Owner assignment pattern

| Owner | Primary responsibility | Week 2 load | Week 3 load (v1.1) | Week 4 load |
|---|---|---|---|---|
| **BE** (1 engineer) | Migrations, tRPC procedures, LLM pipeline, state machines | ENG-001, 002, 008, 009, 010, 011, 012, 014, 017, 018, 019 | ENG-021, 022, 023, 024, 026, 027, 028, 029, 031, 036, 039, 041, 042, 043, 065, 066 **(cut: 013, 032, 033, 044)** | ENG-047, 048, 050, 052, 067, 068, 069, 073, 075 |
| **FE** (1 engineer) | UI screens, UX flows, PostHog client events | ENG-003, 004, 005, 007, 015, 020, 057, 058, 059 | ENG-025, 030, 034, 035, 037, 038, 040, 060, 061, 062, 063 **(cut: 016)** | ENG-045, 046, 049, 051, 053, 055, 064, 070, 071, 072, 074 |
| **FS** (1 engineer) | **v1.1 W3 role change**: BE overflow absorption (~5 eng-days of BE-tagged work), plus glue, wiring, PostHog integration, kanban drag | ENG-006, 056 | **Absorbs ~5 eng-days of W3 BE work** (PM + Eng Lead select from ENG-021/022/023/027/029/036/039/065/066 based on skill match). Plus own tasks: review PRs | ENG-054 + reserve for W4 polish |

*Senior PM confirms owner names before EOD Day 2 (today).*
*v1.1 addition: Senior PM publishes daily W3 FS-on-BE tracker — target ≥1 eng-day/day of BE work from FS during W3; if falls to <0.5/day for 2 days, escalate for further W3 cuts.*

### 5.5 Estimates (from ENG_TASKS sizes) — v1.1 post-cut

Sizes: XS = 0.25 day, S = 0.5 day, M = 1 day, L = 2 days.

- W2: 14 eng-days (21 tasks, unchanged)
- **W3: 16.5 eng-days (27 tasks, cut 4 eng-days / 5 tasks)**
- W4: 14.25 eng-days (22 tasks, unchanged)

### 5.6 Cut-list (v1.1 restructured)

**5.6.a — Already cut from Sprint 1 in v1.1** (moved to OPT backlog, not executed):

| ID | Task | Size | Rationale |
|---|---|---|---|
| ENG-013 | Storyboard brief generator | M | Non-critical path; adaptation works without it |
| ENG-016 | Storyboard display panel | S | Paired with ENG-013 |
| ENG-032 | Team named-owner assignment | S | Team mode launches with submitter-as-default owner |
| ENG-033 | Team 24h timeout reminder | M | Manual follow-up acceptable for MVP |
| ENG-044 | Emotion trigger breakdown | M | Topic Intelligence ships with generic rationale text |

Total cut: **4 eng-days** from W3. Mapped to OPT-013..015 + OPT-015/016 in LAUNCH_PACKAGE_TEMPLATE.md.

**5.6.b — Still cuttable if further slipping** (in this order, lowest-risk first):

1. ENG-074, 075 — Strategy-First entry (UX research says 80% of users won't use it)
2. ENG-020 — Suppression admin UI (internal; raw JSON editing suffices)
3. ENG-050, 051 — 48h deferred reminder (manual reminder acceptable)
4. ENG-045 lite — Topic Intelligence UI without emotion chips (bare-bones list acceptable)
5. Second formula in 60s mode — drop Formula 2 (Daily Phenomenon) for 60s; keep only for long-form

**DO NOT CUT under any circumstances** (launch-blocker): LLM abstraction + CN routing · Quick Create flow · 抖音 adapter (or WeChat adapter if D10 falsified) · Solo review · Export with CAC label · 8 PostHog events · kill-condition alerts · suppression list (D7) · Clerk JWT tenant isolation.

### 5.7 Contract tests required (API Tester owns)

From ENG_TASKS §API Contract Summary — 5 key endpoints:
1. `content.create` — happy path + each Zod validation failure
2. `content.generateScript` — happy path + retry exhaustion + QStash dispatch verification
3. `content.adaptChannels` — Douyin only · Xiaohongshu only · both · diff presence · CAC label on Douyin
4. `content.submitReview` — Solo without checklist (fails) · Solo with checklist (passes) · Team invalid transition · Team valid transition
5. `intelligence.getTopicSuggestions` — happy path · 4h cache hit · rate-limit behavior

---

*This package is the frozen Stage-2 output. Changes require PM + Eng Lead sign-off per Rule #5 of NEXUS_SPRINT_PLAN.*

## Change Log
- 2026-04-18 v1.0 — Consolidated from existing artifacts by NEXUS-Sprint orchestrator on Day 2.
- 2026-04-18 v1.1 — Review-driven revision (same-day):
  - 60s char limit → 210 hard cap (was 215; aligned with DECISIONS_LOG single source of truth)
  - 5 tasks cut from W3 (ENG-013, 016, 032, 033, 044); W3 re-estimated at 16.5 eng-days
  - FS engineer W3 role → explicit BE overflow absorption (not float)
  - Capacity math corrected (v1.0 miscounted per-role distribution)
  - Cut-list restructured to separate "already cut in v1.1" from "still cuttable"
  - D10 Plan B reference added (details in SPRINT_PLAN §3 Week 3)
  - Critical path updated to include Clerk JWT spike + CAC AI label copy deadlines
