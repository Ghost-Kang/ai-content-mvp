# Engineering Task Breakdown — AI 内容营销工作室 (Weeks 2–4)

> **🔴 SUPERSEDED 2026-04-19**: 本清单 75 任务假设 3 工程师。Solo 执行请读 **ENG_TASKS_V2_SOLO.md**（30 任务 / 21 eng-days / 1 张 migration）。本文件保留作未来团队扩张的 Plan B。

**Date**: 2026-04-17 | **Version**: 1.1 (revised 2026-04-18) | **Status**: superseded by V2_SOLO

> **v1.1 changelog**:
> - Week 3: 5 tasks CUT (ENG-013/016/032/033/044) → 27 tasks / 16.5 eng-days
> - Week 1 prep: added **ENG-076** (Clerk JWT tenant-isolation spike, pre-ENG-001 blocker)
> - ENG-009 char limit locked to **190–210** (per D13, superseding earlier 215 draft)
> - R3 upgraded: CAC AI label copy has hard deadline 2026-04-21; ENG-065/066 blocked until Legal delivers
> - FS engineer shifts to BE overflow in W3 per STRATEGY_PACKAGE v1.1 §5.6

---

## Task Summary

71 tasks across 3 weeks + 1 W1 spike. Achievable with 3 engineers (1 BE, 1 FE, 1 FS→BE-overflow in W3).

| Week | Focus | Tasks | Eng-Days | Calendar Days |
|---|---|---|---|---|
| Week 1 (prep) | Clerk JWT spike + infra bootstrap | 1 | 1 | pre-W2 |
| Week 2 | Content Creation Engine | 21 | 14 | 7 |
| Week 3 | Adaptation + Review + Export | 27 | 16.5 | 7 |
| Week 4 | Calendar + Intelligence UI + Polish | 22 | 14.25 | 6 + 1 buffer |

---

## Week 1 Prep — Tenant Isolation Spike (v1.1 insert)

**Done definition**: Clerk JWT issues a `tenantId` claim correctly scoped to the user's org, Supabase RLS policy reads it from `auth.jwt()`, and a cross-tenant read attempt is blocked by a passing integration test. This must land **before ENG-001** per NEXUS_SPRINT_PLAN v1.1 RR1.

| ID | Task | Size | Owner | Blocking |
|---|---|---|---|---|
| ENG-076 | Clerk JWT `tenantId` claim spike + Supabase RLS policy + cross-tenant deny test | M | BE | **YES (blocks ENG-001 & every write path)** |

**Deadline**: 2026-04-22 EOD (Week 1 Day 3). If this slips, Week 2 critical path slips 1:1.

---

## Week 2 Tasks — Content Creation Engine

**Done definition**: User can select formula + length → fill Quick Create form → receive frame-segmented script with suppression applied. PostHog receives first 3 events.

| ID | Task | Size | Owner | Blocking |
|---|---|---|---|---|
| ENG-001 | Create `content_sessions` table migration + Drizzle schema | S | BE | YES |
| ENG-002 | Build `content.create` tRPC procedure with input validation | M | BE | YES |
| ENG-003 | Build formula selection UI (公式一/公式二 cards) | S | FE | YES |
| ENG-004 | Build length selection toggle (60s / 长视频) | XS | FE | No |
| ENG-005 | Build Quick Create input form (3 fields) | S | FE | YES |
| ENG-006 | Wire Quick Create form → `content.create` | S | FS | YES |
| ENG-007 | Implement optimistic loading state post-submit | S | FE | No |
| ENG-008 | Build `content.generateScript` procedure + QStash dispatch | M | BE | YES |
| ENG-009 | Implement 60s script generator (**190–210** char limit per D13, 15–18 frames) | L | BE | YES |
| ENG-010 | Implement long-form script generator (800–1000 chars, 40 frames) | L | BE | YES |
| ENG-011 | Build prompt template registry (公式一/公式二 × 60s/长视频) | M | BE | YES |
| ENG-012 | Implement char count validation + 3-retry logic | S | BE | YES |
| ENG-014 | Build `content.getGenerationStatus` polling endpoint | S | BE | YES |
| ENG-015 | Build script result display UI (frame-by-frame + char badge) | M | FE | No |
| ENG-017 | Define suppression list schema | XS | BE | YES |
| ENG-018 | Implement prompt-level suppression injection | S | BE | YES |
| ENG-019 | Build post-generation suppression scanner | S | BE | No |
| ENG-056 | Integrate PostHog SDK (client + server, with tenantId + region) | S | FS | YES |
| ENG-057 | Fire `session_started` event | XS | FE | No |
| ENG-058 | Fire `formula_selected` event | XS | FE | No |
| ENG-059 | Fire `script_generated` event | XS | FE | No |

**Critical path Week 2**: ENG-001 → ENG-002 → ENG-008 → ENG-009/010 → ENG-012 → ENG-014 → ENG-015

---

## Week 3 Tasks — Adaptation, Review, Export

**Done definition**: Script → Douyin + Xiaohongshu adaptation with diff annotations → Solo/Team review → CAC-compliant export. Topic Intelligence returns suggestions.

| ID | Task | Size | Owner | Blocking |
|---|---|---|---|---|
| ~~ENG-013~~ | ~~Build storyboard brief generator (per-frame visual direction)~~ — **CUT v1.1** (OPT-015, deferred to Sprint 2) | ~~M~~ | ~~BE~~ | — |
| ~~ENG-016~~ | ~~Build storyboard brief display panel (collapsible)~~ — **CUT v1.1** (OPT-016, deferred to Sprint 2) | ~~S~~ | ~~FE~~ | — |
| ENG-021 | Build `content.adaptChannels` procedure shell | S | BE | YES |
| ENG-022 | Implement Douyin adapter (hooks, pacing markers, CTA) | M | BE | YES |
| ENG-023 | Implement Xiaohongshu adapter (emoji density, title limit) | M | BE | YES |
| ENG-024 | Build diff annotation engine (what changed + why per channel) | M | BE | YES |
| ENG-025 | Build channel comparison UI (side-by-side + diff highlights) | M | FE | No |
| ENG-026 | Build Douyin AI label injector at adaptation layer | S | BE | YES |
| ENG-027 | Create `content_reviews` table migration | S | BE | YES |
| ENG-028 | Build `content.submitReview` with Solo/Team routing | M | BE | YES |
| ENG-029 | Implement Solo cognitive checklist gate (5 items before approve) | S | BE | No |
| ENG-030 | Build checklist gate UI (modal, disabled until all checked) | S | FE | No |
| ENG-031 | Implement Team review state machine (Draft→InReview→Approved→Published) | M | BE | YES |
| ~~ENG-032~~ | ~~Implement named owner assignment (Team mode)~~ — **CUT v1.1** (OPT-017, Team mode Sprint 2; Solo default per D5-A) | ~~S~~ | ~~BE~~ | — |
| ~~ENG-033~~ | ~~Implement review timeout reminder (QStash, 24h)~~ — **CUT v1.1** (OPT-018, paired with ENG-032) | ~~M~~ | ~~BE~~ | — |
| ENG-034 | Build review status badge + owner display | S | FE | No |
| ENG-035 | Build Team review action UI (approve / request changes + comment) | M | FE | No |
| ENG-036 | Build `content.exportContent` procedure | S | BE | YES |
| ENG-037 | Implement copy-to-clipboard per channel | XS | FE | No |
| ENG-038 | Implement download action (.txt/.md per channel) | S | FE | No |
| ENG-039 | Inject Douyin AI label into export payload | XS | BE | YES |
| ENG-040 | Build export success state + fire PostHog event | XS | FE | No |
| ENG-041 | Create `topic_analyses` table migration | XS | BE | No |
| ENG-042 | Build `intelligence.getTopicSuggestions` procedure | M | BE | YES |
| ENG-043 | Implement Claude trend analysis prompt (→ 5 topic suggestions) | M | BE | YES |
| ~~ENG-044~~ | ~~Implement emotion trigger breakdown prompt (per topic)~~ — **CUT v1.1** (folded into ENG-043 single prompt, deep-dive deferred to Sprint 2) | ~~M~~ | ~~BE~~ | — |
| ENG-060 | Fire `adaptation_viewed` event | XS | FE | No |
| ENG-061 | Fire `review_submitted` event | XS | FE | No |
| ENG-062 | Fire `content_approved` event | XS | FE | No |
| ENG-063 | Fire `content_exported` event | XS | FE | No |
| ENG-065 | Build CAC label constants registry (**blocked by Legal copy, deadline 2026-04-21 per D14**) | XS | BE | YES |
| ENG-066 | Implement CAC label injection middleware at export (**blocked by ENG-065**) | S | BE | YES |

---

## Week 4 Tasks — Calendar, Intelligence UI, Polish

**Done definition**: Kanban calendar + topic intelligence UI + brand voice setup + performance logging + surveys + Strategy-First entry. Shippable MVP.

| ID | Task | Size | Owner | Blocking |
|---|---|---|---|---|
| ENG-045 | Build Topic Intelligence UI (input + topic cards + emotion chips) | M | FE | No |
| ENG-046 | Build "Use this topic" → pre-fill Quick Create | S | FE | No |
| ENG-047 | Create `performance_logs` table migration | XS | BE | No |
| ENG-048 | Build `content.logPerformance` procedure (3-field) | S | BE | No |
| ENG-049 | Build performance log entry form UI | S | FE | No |
| ENG-050 | Implement 48h deferred reminder QStash job | M | BE | No |
| ENG-051 | Build in-app reminder banner (dismissible) | S | FE | No |
| ENG-052 | Build `content.listByStatus` procedure (paginated, per column) | S | BE | No |
| ENG-053 | Build kanban board UI (4 columns, 20 cards/column) | L | FE | No |
| ENG-054 | Implement drag-to-transition (triggers state procedure) | M | FS | No |
| ENG-055 | Build kanban card component (title, channels, owner, due date) | S | FE | No |
| ENG-064 | Fire `performance_logged` event | XS | FE | No |
| ENG-067 | Create `brand_voices` table migration | XS | BE | No |
| ENG-068 | Build `brandVoice.create` procedure (example-first input) | S | BE | No |
| ENG-069 | Implement Claude brand voice analysis prompt | M | BE | No |
| ENG-070 | Build before/after brand voice comparison UI | M | FE | No |
| ENG-020 | Build suppression list admin UI (internal) | S | FE | No |
| ENG-071 | Build post-export efficiency survey UI | S | FE | No |
| ENG-072 | Build per-piece quality rating UI (1–5 stars) | S | FE | No |
| ENG-073 | Build `content.submitSurveyResponse` procedure | S | BE | No |
| ENG-074 | Build Strategy-First entry point UI | M | FE | No |
| ENG-075 | Implement strategy analysis step (Claude → positioning brief) | M | BE | No |

---

## Database Migration Order

```
Week 2 Day 1:
  Migration 001 — content_sessions          ← BLOCKS ALL
  Migration 002 — content_scripts
  Migration 003 — suppression_list

Week 3 Day 1:
  Migration 004 — content_reviews
  Migration 005 — content_adaptations + topic_analyses

Week 4 Day 1:
  Migration 006 — performance_logs + survey_responses
  Migration 007 — brand_voices + FK patch on content_sessions
```

All tables: Supabase RLS tenant isolation via JWT `tenantId` claim.

---

## Top 5 Engineering Risks

| # | Risk | Prob | Impact | Key Mitigation |
|---|---|---|---|---|
| R1 | LLM 60s char constraint failures (190–210 range per D13) | High | High | Post-gen trim/pad fallback; soft constraint in prompt; instrument retries |
| R2 | QStash + Vercel cold start pushes wait >30s | Medium | Medium | Add Supabase Realtime as push alternative to polling |
| R3 | **CAC AI label copy not delivered by Legal 2026-04-21** (D14 hard deadline) | Medium | High | ENG-065/066 blocked without copy; escalate to Legal 2026-04-19 if no draft; fallback placeholder copy prepared but blocks export shipping |
| R4 | Clerk JWT org claims missing in Team review | Medium | Medium | Cache org members Redis 5min; validate org_id before any DB ops |
| R5 | Drizzle + Supabase RLS SET LOCAL session leak | Low | High | Use supabase-js anon key + per-request JWT; never pool admin connection |

---

## API Contract Summary (5 Key Endpoints)

### `content.create`
- Input: `{ entryPoint, formula, lengthMode, productName, targetAudience, coreClaim }`
- Output: `{ sessionId, estimatedGenerationSeconds }`
- Side effects: Creates session row; fires `session_started`

### `content.generateScript`
- Input: `{ sessionId, regenerate? }`
- Output: `{ jobId, estimatedSeconds }`
- Side effects: Dispatches QStash job; worker writes to `content_scripts` on completion

### `content.adaptChannels`
- Input: `{ sessionId, scriptId, channels: ['douyin'|'xiaohongshu'] }`
- Output: `{ adaptations: { douyin?: { content, aiLabel, diff[] }, xiaohongshu?: { title, body, diff[] } } }`
- Side effects: Writes `content_adaptations`; injects CAC label

### `content.submitReview`
- Input: `{ sessionId, reviewMode, checklistCompleted?, assigneeUserId?, dueAt? }`
- Output: `{ reviewId, previousStatus, newStatus }`
- Side effects: Solo → `approved`; Team → `in_review` + timeout job queued

### `intelligence.getTopicSuggestions`
- Input: `{ industry, targetAudience, contentGoal }`
- Output: `{ suggestions: [{ title, hook, primaryEmotion, emotionRationale, trendSignals, formulaAffinity }] }`
- Side effects: Calls Claude; persists to `topic_analyses`; caches Redis 4h
