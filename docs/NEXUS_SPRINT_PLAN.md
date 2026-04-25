# NEXUS-Sprint Master Plan — AI 内容营销工作室 MVP

> ## 🔴 v2.0 SOLO SUPERSESSION (2026-04-19)
>
> 本文件（v1.1）基于 3 工程师团队假设编排。**2026-04-19 确认为 solo operator (60h/week)**，物理容量 ~24 eng-days，不匹配 v1.1 的 ~60 eng-days 计划。
>
> **当前执行真相**：
> - **STRATEGY_PACKAGE_V2_SOLO.md** — 替代 v1.1 策略包
> - **ENG_TASKS_V2_SOLO.md** — 替代 v1.1 75 任务清单（新清单 30 任务 / 21 eng-days）
>
> v1.1 正文保留作为**未来团队扩张时的 Plan B 参考**，不作为当前执行依据。
>
> **范围硬砍**：仅做抖音 60s 公式一单路径；小红书 / 公众号 / LinkedIn / 多渠道适配 / diff / 长视频 / 公式二 / 品牌音 / Topic Intelligence / Team review / 绩效日志 / kanban / Strategy-First / Survey / Suppression admin UI — **全部移入 OPT backlog**。
>
> **Agent 矩阵语义变化**：v1.1 的"BE Lead / Legal / DevOps / Research pair"等 role 名，在 solo 模式下**仅作为上下文切换语义**（某段时间你戴哪顶帽子），不是另一个人。需要签字的决策归并为"你签"。Claude 子 agent 按 STRATEGY_V2 §6 的调用清单使用。

---

**Version**: 1.1 (review-driven revision) — **superseded by v2.0 solo package above for execution; kept below as multi-team reference**
**Compiled**: 2026-04-18 v1.0 · **Revised**: 2026-04-18 v1.1 (same day)
**Sprint window**: 2026-04-17 → 2026-05-15 (4 weeks) · launch date under review (see §6 RR6)
**Current stage**: Stage 3 (Execution) — starting now
**Orchestrator**: NEXUS-Sprint

**v1.1 changes at a glance** (full diff in Change Log §11):
- Discovery reclassified **Provisionally Closed** pending Day 5 research verdict on D10
- Week 3 rebalanced: 5 tasks cut (ENG-013, 016, 032, 033, 044) + FS engineer explicitly shifts to BE overflow
- D10 Plan B added — channel-agnostic fallback if research falsifies抖音/小红书 pivot
- Clerk JWT tenant isolation spike inserted before ENG-001
- CAC Douyin AI label copy hard deadline: 2026-04-21 (Legal)
- 60s char limit aligned to 210 (single source of truth, was 215 in v1.0)
- Launch-date review (Friday 05-15 vs. Thursday 05-14 vs. Monday 05-18) added to RR6
- FAQ + Support activation pulled forward to 2026-05-07
- Experiment Tracker activation pulled forward to 2026-05-05 (W3 Day 5)

This is the single source of truth for how the remaining 26 days of the sprint get executed. It does not re-derive Discovery or Strategy conclusions; it references the existing artifacts and defines the operating system for the team through launch.

Key reference artifacts:
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/DISCOVERY_PACKAGE.md` (v1.1)
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/DECISIONS_LOG.md` (D1–D9 confirmed; **D10-P Provisional** — 抖音 + 小红书 pending 2026-04-23 Day 5 research verdict; D11–D21 frameworks; see DECISIONS_LOG for canonical status)
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/UX_ARCHITECTURE.md` (implementation-ready)
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/TECH_ARCHITECTURE.md` (implementation-ready)
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/ENG_TASKS.md` v1.1 (70 W2–W4 tasks post-cut + 1 W1 prep spike ENG-076 = 71 total, dependency-ordered)
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/WEEK1_RESEARCH_PLAN.md` (running in parallel, Days 1–5)
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/STRATEGY_PACKAGE.md` (sibling doc — Stage 2 consolidated)
- `/Users/kang/github/AI-Content-Marketing-MVP/app/docs/LAUNCH_PACKAGE_TEMPLATE.md` (sibling doc — Stage 5 skeleton)

---

## 0. Operating Rules (NEXUS-Sprint canonical)

Every agent, PR, and decision in this sprint is bound by these five rules. They are referenced by number throughout this document (e.g., "Rule #4", "Rule #5"). Cold-starting agents must read this block first.

1. **Rule #1 — Stage handoffs are gated, not implicit.** Discovery → Strategy → Execution only advances when the prior stage's exit artifact exists and is referenced (DISCOVERY_PACKAGE / STRATEGY_PACKAGE / ENG_TASKS). No stage skips. No parallel speculation past a closed gate.
2. **Rule #2 — Dev↔QA runs the six-step loop (§4).** SPEC → BUILD → EVIDENCE → QA → REALITY CHECK → MERGE. No shortcuts. No verbal "it works." Max 3 FAIL cycles per task before Senior PM scope call.
3. **Rule #3 — No launch without Reality Checker.** §5 Launch Gate Criteria is the explicit checklist. Reality Checker defaults to **NEEDS WORK** on any inconclusive evidence. Unchecked box = no launch.
4. **Rule #4 — Evidence over claims.** Every merged PR carries an evidence bundle (screenshot / log / curl / test output per §4[3]). "I tested it locally" is not evidence. If it isn't attached to the PR, it didn't happen.
5. **Rule #5 — MVP scope is frozen; default to reject.** Scope-change requests follow §9 protocol: 3-line case, PM evaluates against PRD v0 cuts, default response is reject-and-log to OPT backlog. Only exception: change that reduces a top-5 risk, requires PM + Eng Lead + Reality Checker tri-sig.

---

## 1. Stage Status Summary

| Stage | Status (Day 2) | Evidence | Residual debt |
|---|---|---|---|
| 1 · Discovery | **PROVISIONALLY CLOSED** — formal close gate 2026-04-23 (Day 5) | DISCOVERY_PACKAGE.md v1.1, DECISIONS_LOG.md (D1–D10 confirmed). D10 pivot based on team judgment + single interview — **not user-validated yet** | (a) **D10 channel pivot to 抖音+小红书 contradicts PRD v0 cut decision** — must be validated by Day 5 research brief (A1/A2/A7). If falsified, trigger D10 re-decision same day, Plan B activates (see §3 Week 3); (b) Legal sign-off on D8 retention copy (deadline 2026-04-22) + D10 Douyin AI label exact copy string (deadline 2026-04-21, hard); (c) Eng lead sign-off on D3 LLM abstraction (blocks ENG-001, deadline today EOD) |
| 2 · Strategy | **DONE (consolidated today)** | STRATEGY_PACKAGE.md v1.1 written Day 2 from existing inputs | None. Further scope changes go through Rule #5 (rejected, logged to optimization backlog) |
| 3 · Execution | **STARTING** | ENG_TASKS.md serves as backlog; **70 W2–W4 tasks + 1 W1 prep spike (ENG-076) = 71 total** (5 cut in v1.1: ENG-013, 016, 032, 033, 044); database migration order defined | (a) Assign engineer owners (BE / FE / FS) to all 70 W2–W4 tasks by end of Day 2; (b) **ENG-076 Clerk JWT tenant-isolation spike** (2–4h, W1 Day 3, blocks ENG-001 and every write path) |
| 4 · Review | **NOT STARTED** | Gate criteria defined below (§5) | Legal pack open items tracked in §6 risk register |
| 5 · Delivery | **NOT STARTED** | LAUNCH_PACKAGE_TEMPLATE.md written Day 2 | Populated during Week 4 hardening. Launch date under RR6 review |

**Discovery closure verdict**: Week 1 research plan remains valid on Day 2, but Discovery is **not closed** until Day 5. The 7 assumptions A1–A7 in WEEK1_RESEARCH_PLAN are the highest-leverage validation targets; A2 (platform activity of B2B SaaS personas) and A7 (抖音/小红书 relevance for 李明/张薇) are now **formal D10 validation gates**. Day 5 research brief must ship 2026-04-23 and is a prerequisite to Week 2 Day 1 design review.

**Why the downgrade from v1.0 DONE → v1.1 Provisionally Closed**: PRD v0 explicitly cut 视频号/小红书 from Sprint 1; D10 reversed that decision on single-interview evidence. Until research falsifies OR confirms, Discovery cannot be called closed without risking Week 3 rework.

---

## 2. Agent Activation Matrix

Each row: **agent → when activated → input artifacts → expected output → gated by**. Agents are invoked individually against this plan; this is not a spawn list.

### Stage 1 · Discovery (closed, listed for traceability)

| Agent | When | Input | Output | Gate |
|---|---|---|---|---|
| Product Manager | Done | PRD v0 notes | Discovery Package §1 | Closed |
| Trend Researcher | Done | Market scan | Discovery Package §2 | Closed |
| UX Researcher | Done | User interview 2026-04-17 | Discovery Package §3 + WEEK1_RESEARCH_PLAN | Closed |
| Feedback Synthesizer | Done | PRD + UX conflict triage | Discovery Package conflict resolution | Closed |
| Analytics Reporter | Done | Target taxonomy | Discovery Package §6 metrics framework | Closed |

Residual Stage 1 action: **2026-04-23 Day 5 research brief** from WEEK1_RESEARCH_PLAN (owner: research pair A+B). This brief feeds Stage 3 Week 2.

### Stage 2 · Strategy (consolidated today in STRATEGY_PACKAGE.md)

| Agent | When | Input | Output | Gate |
|---|---|---|---|---|
| Sprint Prioritizer | Day 2 (done) | ENG_TASKS.md + PRD v0 P0 list | STRATEGY_PACKAGE §1 (4-week calendar) | Closed |
| Brand Guardian | Day 2 (done) | DECISIONS_LOG D9 positioning + uncanny valley list D7 | STRATEGY_PACKAGE §2 (product-surface voice + generation rubric) | Closed |
| Social Media Strategist + SEO Specialist + Growth Hacker | Day 2 (done) | D10 channel pivot | STRATEGY_PACKAGE §3 (Douyin + Xiaohongshu adaptation rulebook) | Closed |
| UX Architect | Confirmed ready | UX_ARCHITECTURE.md | STRATEGY_PACKAGE §4 (UX readiness statement) | Closed — **no unresolved UX decisions blocking Frontend Developer** |
| Senior Project Manager | Day 2 (done) | ENG_TASKS.md | STRATEGY_PACKAGE §5 (dependency-ordered backlog with owners + critical path) | Closed |

### Stage 3 · Execution (active from Day 2 onward)

| Agent | Week activated | Input artifacts | Expected output | Gate (merge criteria) |
|---|---|---|---|---|
| Rapid Prototyper | Week 2 Day 1–2 | STRATEGY §1 Week 2 goals; UX_ARCH Flow 1 | Thin vertical slice: Quick Create → script generator (happy path, 60s formula 1 only), no polish, no suppression | Reality Checker confirms end-to-end round-trip works before parallel polish starts |
| Frontend Developer | Week 2 Day 2 onward | UX_ARCHITECTURE §3 screens; STRATEGY §2 product-surface voice | Next.js 14 App Router + Tailwind implementations of screens 1–8 (Week 2: screens 2, 3, 4; Week 3: screens 6, 7; Week 4: screens 1, 5, 8) | Evidence Collector screenshots per screen + API Tester contract pass |
| Backend Architect | Week 2 Day 1 onward | TECH_ARCHITECTURE §2–§5 | LLM provider abstraction, content pipeline, review state machine, Drizzle migrations in order 001→007 | API Tester contract tests pass; Reality Checker merge sign-off |
| DevOps Automator | Week 2 Day 1–3 | TECH_ARCH §1 stack | Vercel preview deploys, Supabase RLS verified, Upstash QStash + Redis wired, PostHog integration, CI running `typecheck` + `lint` on every PR, observability baseline (Vercel logs + PostHog error events) | Preview deploy URL visible on every PR before review |
| Content Creator | Week 2 Day 3–5 | PRD §1 formulas, STRATEGY §2 generation rubric | Seed data: 3 golden-path demos per formula × per length (12 total) + 10 suppression-list negative examples | Brand Guardian signs off that demos match product positioning |
| Project Shepherd | Every day | Yesterday's PRs/evidence + standup dashboard (Discovery §6) | Async written standup (4 numbers + blocked list) posted daily | Standup posted by 10:00 local each weekday |
| Evidence Collector | Every completed task | PR diff + preview URL | Artifact bundle: screenshot (for UI) / log+test output (for BE) / curl transcript (for API) attached to PR | No merge without evidence bundle |
| API Tester | On every BE/FS PR | API contract from ENG_TASKS §API Contract Summary | Contract test run output — every endpoint hit with valid + invalid payload | Green run required for merge |
| Reality Checker | On every merge request | Evidence bundle + API Tester output | PASS / FAIL with specific remediation | **No merge without PASS**. Default to FAIL if evidence inconclusive |

### Stage 4 · Review (Week 4 Day 4–6)

| Agent | When | Input | Output | Gate |
|---|---|---|---|---|
| Legal Compliance Checker | Week 4 Day 4 | Running system + TECH_ARCH §8 + D3, D8, D10 | Written sign-off on: (a) 数据安全法 — LLM routing for CN tenants proven via prod log sample; (b) 个人信息保护法 — D8 retention text shipped, user visible; (c) Douyin AI label injected on every Douyin export (CAC) | Blocking — no launch without written sign-off |
| Brand Guardian | Week 4 Day 5 | Shipped surfaces + 20 generated samples (10 formula 1, 10 formula 2; 5 each 60s / long-form) | Fidelity report: product copy passes voice rubric; generation rubric scored ≥4/5 on ≥80% of samples | Blocking — ≥80% threshold for launch |
| Reality Checker | Week 4 Day 6 | All above + full regression test run | Launch gate verdict (see §5) | Blocking — explicit checklist |
| Evidence Collector | Week 4 Day 5–6 | All artifacts across Stages 3–4 | `EVIDENCE_PACK.md` (assembled) with screenshots, test outputs, compliance checklist | Required input to Reality Checker final gate |
| Infrastructure Maintainer | Week 4 Day 4–5 | Live stack | Production-readiness report: runbook, alerts, backup/restore drill result, rate-limit caps on LLM spend (per-tenant + global) | Blocking — LLM cost cap must be active before public access |

### Stage 5 · Delivery (Week 4 Day 6 → launch-day)

| Agent | When | Input | Output | Gate |
|---|---|---|---|---|
| Studio Producer | Launch-day −2 → launch-day | LAUNCH_PACKAGE.md | Launch-day run-of-show, comms plan, rollback decision tree. **Launch-date decision (Thu 05-14 / Fri 05-15 / Mon 05-18) must be locked by 2026-04-25** (RR6) | Launch-day execution |
| Experiment Tracker | **2026-05-05** (W3 Day 5) onward — pulled forward from 05-08 | Discovery §6 taxonomy (8 required events) + 5 success criteria + 5 kill conditions | Instrumented dashboards live before first user; A/B assignment logic (example-first vs. descriptor-first) verified | Blocking — cannot launch without event instrumentation confirmed |
| Support Responder | **FAQ draft starts 2026-05-07** (W3 Day 7) — pulled forward from 05-14. Active support from launch-day → launch+28 | FAQ draft + escalation path + onboarding walkthrough annotations | Daily support triage + kill-condition #5 monitoring (>10% support-contact rate before first cycle completion = stop) | Daily metric reported in standup |

---

## 3. Week-by-Week Execution Schedule

### Week 1 (2026-04-17 → 2026-04-24) — Research + Foundation

Sprint started Day 1 (yesterday). **Today is Day 2.**

- **Parallel track A (research, 2 ppl)**: WEEK1_RESEARCH_PLAN in flight. Day 5 brief ships 2026-04-23.
- **Parallel track B (eng foundation, 3 ppl)**: Activate today.
  - Day 2 (today): Eng lead signs off D3 LLM abstraction decision (blocker for ENG-001). Assign owners to all 70 post-cut tasks.
  - Day 2–3: DevOps Automator — CI pipeline, Vercel preview deploys, Supabase project, Upstash, PostHog.
  - **Day 3 (NEW, v1.1)**: Clerk JWT tenant-isolation spike — BE Lead verifies `tenantId` claim format, RLS policy behavior, cross-tenant probe. 2–4h. Blocks ENG-001.
  - Day 3–5: Rapid Prototyper builds thin vertical slice (Formula 1 + 60s + Quick Create → script output, ignoring suppression, ignoring brand voice, ignoring adaptation).
  - Day 5 gate: Reality Checker confirms end-to-end stub works on preview URL. If not: Week 2 plan slips. **Same-day: Day 5 research brief reviewed; D10 verdict locked.**
  - Day 6–7: Begin ENG-001 (migration 001 content_sessions) once D3 + Clerk spike signed off. Start suppression list schema (ENG-017) and PostHog (ENG-056).

**Week 1 exit criteria**:
- [ ] D3, D8 sign-offs documented in DECISIONS_LOG
- [ ] **D10 verdict**: either CONFIRMED (proceed with抖音+小红书 adapters) or FALSIFIED (activate Plan B — see §3 Week 3)
- [ ] **CAC AI label copy** finalized by Legal (2026-04-21 deadline) — stored as constant in ENG-065 registry spec
- [ ] Day 5 research brief posted; A1/A2/A7 verdicts logged
- [ ] CI + preview deploys + PostHog working
- [ ] **Clerk JWT tenant-isolation spike passed** (cross-tenant probe returns empty)
- [ ] Thin vertical slice demo'd on preview URL
- [ ] Migration 001 merged; `content.create` endpoint stubbed

### Week 2 (2026-04-24 → 2026-05-01) — Content Creation Engine

**Theme**: User can select formula + length → fill Quick Create form → receive frame-segmented script with suppression applied. PostHog receives first 3 events.

**Must-ship this week** (21 tasks per ENG_TASKS Week 2 block):
- ENG-001, 002 — sessions schema + `content.create`
- ENG-003, 004, 005, 006, 007 — formula/length/input UI + wiring
- ENG-008, 009, 010, 011, 012, 014 — generation pipeline (60s + long-form) with char validation + 3-retry + polling
- ENG-015 — script result display (frame-by-frame + char badge)
- ENG-017, 018, 019 — suppression schema + prompt injection + post-gen scanner
- ENG-056, 057, 058, 059 — PostHog + first 3 events

**Critical path**: ENG-001 → 002 → 008 → 009/010 → 012 → 014 → 015

**Dev↔QA loop exits** (must all be green before Week 3):
- Every endpoint has a contract test passing in CI
- Evidence bundle on every merged PR
- Reality Checker PASS signature on screen 2, 3, 4 each
- PostHog dashboard shows `session_started`, `formula_selected`, `script_generated` firing from preview

**Reality Checker gate**: Generate 10 scripts (5 formula 1, 5 formula 2; mix 60s + long-form). Char-limit compliance ≥90%. Zero uncanny-valley patterns visible in output (scanner + human spot-check).

### Week 3 (2026-05-01 → 2026-05-08) — Adaptation, Review, Export

**Theme**: Script → 抖音 + 小红书 adaptation with diff annotations → Solo/Team review → CAC-compliant export. Topic Intelligence returns suggestions.

**v1.1 capacity rebalance**: v1.0 W3 = 20.5 eng-days (37% over 3-eng capacity). v1.1 cuts 4 eng-days via 5 task removals. **Cut from Sprint 1 entirely** (moved to OPT backlog): ENG-013 (storyboard brief gen), ENG-016 (storyboard display), ENG-032 (Team named-owner), ENG-033 (Team 24h timeout reminder), ENG-044 (emotion-trigger breakdown). Rationale: all are **non-critical-path "No" blocking flag in ENG_TASKS.md**; none are PRD v0 P0 features. Cycle still completes without them; Team mode launches with submitter-as-default owner.

**Post-cut W3 total**: 27 tasks / 16.5 eng-days. Still ~10% over capacity — **FS engineer shifts explicitly to BE overflow for W3** (not just float/review). Senior PM tracks FS-on-BE eng-days daily.

**Must-ship this week** (27 tasks):
- ENG-021, 022, 023, 024, 025, 026 — channel adaptation + diff + 抖音 AI label
- ENG-027, 028, 029, 030, 031, 034, 035 — review workflow (Solo checklist + Team state machine; named-owner/timeout deferred to OPT)
- ENG-036, 037, 038, 039, 040 — export pipeline
- ENG-041, 042, 043 — Topic Intelligence BE (no emotion breakdown)
- ENG-060, 061, 062, 063 — events 4–7
- ENG-065, 066 — CAC label middleware

**Dev↔QA loop exits**:
- Solo review cannot be approved until 5 checklist items are ticked (UI test + BE test)
- Team review state machine passes all valid/invalid transition tests (Draft → InReview → Approved → Published)
- Every 抖音 export payload contains the CAC label string (100% of samples)
- Diff annotation UI renders on 5 sample adaptations without manual intervention
- Topic Intelligence returns ≥5 suggestions on 3 test inputs (emotion rationale optional, shipped as generic text)

**Reality Checker gate**: End-to-end cycle (Quick Create → script → adapt → Solo approve → export) completes in <40 min on preview by a human tester following no prior instructions.

---

#### 🛡️ D10 Plan B — Channel pivot fallback (v1.1 addition)

**Trigger**: Day 5 research brief (2026-04-23) falsifies A2/A7 — B2B SaaS personas (李明/张薇) are NOT meaningfully active on 抖音/小红书.

**Actions (same day as verdict)**:
1. PM calls D10 re-decision meeting within 24h. Required attendees: PM, Eng Lead, Research pair.
2. Revert Sprint 1 channels to **WeChat 公众号 + LinkedIn** (PRD v0 original).
3. Update DECISIONS_LOG with D10-R (reversal) entry; preserve D10 for history.
4. Architecture impact: ENG-021..026 adapter code is channel-agnostic at the shell level. Swap adapter prompt templates + diff templates + CAC label middleware → WeChat/LinkedIn equivalents. Estimated rework: 2–3 eng-days (acceptable slippage in W3).
5. CAC AI label → not required (WeChat/LinkedIn no equivalent CN mandate at present); replace with WeChat editorial guideline check (no mass-publish patterns) and LinkedIn native tone check.
6. Eng_tasks renames: ENG-022 抖音 → WeChat; ENG-023 小红书 → LinkedIn; ENG-026/039/065/066 CAC label → WeChat compliance check.

**Plan B cost**: 2–3 eng-days rework mid-W3 + Legal savings (no CAC work) + generation rubric needs WeChat/LinkedIn platform-fit scoring rewrite.

**Cannot pivot if**: Day 5 brief is inconclusive. In that case, proceed with D10 on current evidence but add explicit monitoring: if first-week adoption signals show platform mismatch, Sprint 2 flips.

### Week 4 (2026-05-08 → 2026-05-15) — Calendar, Intelligence UI, Polish, Launch

**Theme**: Kanban calendar + topic intelligence UI + brand voice setup (deferred flow) + performance logging + surveys + Strategy-First entry. Shippable MVP.

**Must-ship this week** (22 tasks):
- ENG-045, 046 — Topic Intelligence UI + "Use this topic"
- ENG-047, 048, 049, 050, 051, 064 — performance log + 48h reminder + event
- ENG-052, 053, 054, 055 — kanban board (Content Calendar)
- ENG-067, 068, 069, 070 — brand voice capture (example-first + analysis + before/after UI)
- ENG-020 — suppression admin UI (internal)
- ENG-071, 072, 073 — surveys A + B
- ENG-074, 075 — Strategy-First entry + analysis step

**Daily cadence (Week 4)** — calendar depends on final launch-date decision (RR6). Below assumes launch-date = 2026-05-15 (current default, under review):
- Day 1 (Mon 2026-05-08): kick off all Week 4 tasks; lock scope (Rule #5 — no new work)
- Day 2–3 (Tue–Wed 05-09..05-10): feature complete push
- Day 4 (Thu 2026-05-11): **Feature freeze at EOD.** Legal + Brand Guardian start review.
- Day 5 (Fri 2026-05-12): hardening, bug bash, infrastructure production-readiness drill
- Day 6 (Mon 2026-05-13): Evidence pack assembled; Reality Checker launch gate review
- Day 7 (Tue 2026-05-14): pre-launch day; Studio Producer run-of-show
- Launch day (Wed 2026-05-15): staged rollout to first 5 → 10 users

**If launch-date moves to Mon 2026-05-18** (preferred per RR6): feature freeze → Thu 05-14; hardening → Fri 05-15; evidence pack + gate → Thu 05-14 EOD; run-of-show Fri 05-15 + weekend buffer. Gains: weekend to catch prod issues before Monday escalates to business hours; safer.

**Reality Checker gate**: See §5.

---

## 4. Dev↔QA Loop Contract (Task Lifecycle)

Every Stage-3 task follows this exact lifecycle. No shortcuts. No verbal "it works". Rule #4 — evidence over claims.

```
[1] SPEC
    Engineer reads the ENG-### row + the UX_ARCH / TECH_ARCH section it references.
    Engineer posts the acceptance criteria as a comment on the task before writing code.
    (forces thinking about "how do I prove this is done?")

[2] BUILD
    Engineer implements against criteria on a feature branch.
    Branch naming: eng-<id>-<slug> (e.g., eng-009-60s-script-gen)
    Open a draft PR against main on Day 1 of work. Preview deploy auto-attached.

[3] EVIDENCE
    Before marking PR ready-for-review, Evidence Collector attaches:
      - UI task: screenshot(s) of every state specified in UX_ARCH
      - BE task: log excerpt OR curl transcript OR unit test output showing the happy path + one error path
      - Migration: drizzle-kit output + psql \d verification of new table
      - Analytics: PostHog event payload screenshot for the event added

[4] QA
    API Tester runs contract tests against the preview (for any endpoint change).
    For UI-only: Evidence Collector records the flow video or screenshot trail.
    Test output posted as PR comment.

[5] REALITY CHECKER
    Gatekeeper reviews: does the evidence match the spec?
    Decision is binary: PASS or FAIL.
    On FAIL: specific remediation list posted; engineer loops back to [2].
    On PASS: merge allowed.
    Max 3 FAIL cycles per task before escalation to Senior PM for scope call.

[6] MERGE
    Squash-merge with commit SHA referencing ENG-### in the message.
    Project Shepherd logs the completion on the standup sheet the next morning.
```

**Loop telemetry tracked on the dashboard**:
- Tasks in flight, by column (Spec / Build / Evidence / QA / RealityCheck / Merged)
- FAIL rate per engineer (flagged if >30% — suggests spec ambiguity, not engineer quality)
- Tasks >3 days in Build column (flagged for unblocking)

---

## 5. Launch Gate Criteria (Reality Checker's Explicit Checklist)

**No launch without every box checked. Default to NEEDS WORK if any item inconclusive.**

### Legal & Compliance
- [ ] **LLM routing proof**: prod log sample shows Chinese tenants' requests hit domestic provider (文心/通义/Kimi), non-CN tenants hit Claude/OpenAI. Sample size ≥20 requests.
- [ ] **D8 data retention disclosure** visible in-product at brand voice capture point. Copy signed off by Legal (deadline 2026-04-22).
- [ ] **抖音 CAC AI content label copy finalized by Legal** (deadline **2026-04-21**, hard — ENG-065 constant must be locked before ENG-026/039/066 start).
- [ ] **抖音 CAC AI content label** injected in 100% of 抖音 export payloads. Verified on 10 export samples.
- [ ] **小红书** content output has no auto-publish path (export-only is compliant).
- [ ] **Tenant isolation** — Supabase RLS verified on all 7 tables; attempted cross-tenant read returns empty. **Clerk JWT spike from W1 Day 3 serves as evidence baseline.**

### Functional
- [ ] Quick Create → script → adapt → Solo approve → export cycle completes end-to-end on prod environment.
- [ ] Team review state machine refuses invalid transitions (Draft → Approved without InReview).
- [ ] Solo checklist gate disabled Approve button until all 5 items ticked.
- [ ] Char limit compliance ≥90% on 20 generated 60s scripts (hard cap **210 chars**, soft target 190–210).
- [ ] Uncanny-valley scanner rejects patterns from D7 list on 100% of test cases.

### Brand & Voice
- [ ] Brand Guardian report: product-surface voice rubric passes on every shipped screen.
- [ ] Generation rubric scores ≥4/5 on ≥80% of 20-sample audit (10 formula 1, 10 formula 2).

### Analytics & Experiments
- [ ] All 8 required events firing with correct properties (verified on preview with a full happy-path run).
- [ ] A/B assignment logic (example-first vs. descriptor-first) deterministic on user_id hash; tested with 10 seeded users.
- [ ] Standup dashboard live and showing real data from preview.
- [ ] Survey A + Survey B fire non-blocking at correct triggers.

### Operational
- [ ] Runbook exists for: LLM provider outage, QStash outage, Supabase downtime.
- [ ] Per-tenant LLM spend cap active; global daily cap active; alerts wired.
- [ ] Backup/restore drill completed with timestamped artifact.
- [ ] Error rate <5% on last 24h of preview traffic (or explicit rationale for any spike).
- [ ] Support escalation path documented; Support Responder has access.

### Kill-Condition Monitoring
- [ ] Alerts wired for all 5 kill conditions from PRD v0:
  - Avg edit time >25 min in first 10 sessions
  - Onboarding completion <60%
  - Survey B mean <3.0 AND D14 return <40% concurrent
  - Performance log entry <30% at day 30
  - Support contact rate >10% before first cycle completion
- [ ] Each alert has a named owner.

---

## 6. Risk Register (Top 5, with owners + mitigations)

| # | Risk | Prob | Impact | Owner | Mitigation |
|---|---|---|---|---|---|
| RR1 | D10 channel pivot (抖音 + 小红书) not validated by users; PRD v0 explicitly cut these and D10 reversed on single-interview evidence | **High** (upgraded from v1.0 Medium) | **Critical** — would force D10 re-decision and Week 3 rework | PM + Research pair | **Plan B now documented in §3 Week 3.** Day 5 research brief (2026-04-23) must answer A2/A7 explicitly. If falsified, revert to WeChat+LinkedIn; 2–3 eng-days rework. ENG-001..020 are channel-agnostic and start regardless. |
| RR2 | LLM 60s char-constraint failures (190–210 hard cap, aligned v1.1) persistent even with 3 retries | High | High | BE Lead | Implement post-gen trim/pad fallback (ENG-012 extension). Instrument retry counts. If >20% of generations hit max retries, enable safe-truncation fallback. |
| RR3 | LLM spend blows through budget before launch (especially with retries + Topic Intelligence + brand voice analysis) | Medium | High | DevOps + BE | Per-tenant + global spend caps active from Week 1 Day 3 (ENG-056 extension). Daily spend report in standup. Hard kill at cap with graceful error. |
| RR4 | Clerk JWT org claims missing/misformed in Team review → cross-tenant data leak potential | Medium | **Critical** | BE Lead | **v1.1: dedicated Clerk JWT spike Week 1 Day 3** before ENG-001 starts. ENG-028 must include JWT claim validation before any DB op. Redis-cached org members check. Reality Checker specifically tests cross-tenant access in launch gate. |
| RR5 | Week 2 output quality fails Brand Guardian rubric (<80% pass rate on audit) | Medium | High | BE + Content Creator | Golden-path seed data (ENG Week 2 Day 3–5) used as regression suite. Suppression list (D7) enforced at prompt layer AND post-gen scanner. If rubric fails in Week 3, escalate to PM for scope call — consider cutting formula 2 or long-form mode. |
| **RR6** (v1.1 new) | Launch on Friday 2026-05-15 limits weekend support coverage; if prod breaks late Friday, 2–3 day escalation window | Medium | High | Studio Producer + PM | **Lock launch date by 2026-04-25.** Options: (a) pull to Thu 05-14 — adds 1 day risk but weekday support coverage; (b) push to Mon 05-18 — adds weekend to hardening + full-week post-launch support. **Recommendation: push to Mon 05-18.** |
| **RR7** (v1.1 new) | W3 BE load ~2× engineer capacity even post-cuts; FS engineer must absorb BE overflow | **High** | High | Senior PM + Eng Lead | FS explicit role shift in W3 (per §3 W3 note). Daily FS-on-BE eng-days tracked in standup. If FS falls behind own tasks (ENG-006, 056, 054) by >1 day, PM calls scope review and cuts from top of OPT list. |

Additional watch-list items (not top 7 but monitored):
- R8: QStash cold-start latency >30s (documented in ENG_TASKS R2) — mitigation: Supabase Realtime as alternate push channel
- R9: Week 4 scope creep — Rule #5 enforcement, weekly retro check
- R10: Research pair behind schedule — Day 3 checkpoint; if <3 interviews booked, PM drops into recruiting
- R11: CAC AI label copy not finalized by 2026-04-21 — fallback: use conservative placeholder "本内容由 AI 辅助生成" with Legal-approved retroactive swap

---

## 7. Dependency Graph (Critical Path View)

Condensed, abstracted from ENG_TASKS.md to show load-bearing chains. Full 75-task dependency ordering is in STRATEGY_PACKAGE §5.

```
[Week 1 foundation]
  D3 sign-off → LLM abstraction scaffolding → ENG-008 (generateScript dispatch)
  Supabase setup → Migration 001 (ENG-001) → ENG-002 (content.create)
  PostHog (ENG-056) → all event firings (ENG-057..064)

[Week 2 critical chain]
  ENG-001 → ENG-002 → ENG-006 (FE wiring)
           → ENG-008 → ENG-009/010 → ENG-012 → ENG-014 → ENG-015
  ENG-017 (suppression schema) → ENG-018 (prompt injection) → ENG-019 (scanner)

[Week 3 critical chain]
  Migration 004/005 → ENG-021 (adaptChannels) → ENG-022/023 (per-channel) → ENG-024 (diff) → ENG-025 (UI)
  ENG-026 (Douyin AI label at adapt) + ENG-065/066 (CAC registry + middleware) + ENG-039 (export label)
    → all three chained into compliance gate
  Migration 004 → ENG-027 → ENG-028 → ENG-029/031 (Solo/Team) → ENG-030/034/035 (UI)

[Week 4 critical chain]
  Migration 006 → ENG-047 → ENG-048 → ENG-049/050/051 (performance log + reminder)
  Migration 007 → ENG-067 → ENG-068 → ENG-069 → ENG-070 (brand voice flow)
  ENG-074 + ENG-075 (Strategy-First entry) — LOWEST priority; sacrifice first if Week 4 slips
```

**Slack items** (lowest-priority, cuttable if timeline slips):
1. ENG-074/075 — Strategy-First entry (Quick Create covers 80% per UX research)
2. ENG-020 — Suppression admin UI (internal tool; raw JSON edit is acceptable for MVP)
3. ENG-044 — Emotion trigger breakdown (nice-to-have on Topic Intelligence)
4. ENG-013/016 — Storyboard brief generator (useful but not blocking cycle completion)

**Non-negotiable** (launch blockers — cutting any = no launch):
- LLM abstraction + CN routing
- Quick Create → script pipeline
- Multi-channel adaptation (at least Douyin)
- Solo review mode
- Export with CAC label
- 8 PostHog events
- All 5 kill-condition alerts

---

## 8. Daily Cadence

### Standup (async, written, posted by 10:00 weekdays)

Project Shepherd owns. Template:

```
## YYYY-MM-DD Standup

### 4 Numbers
1. Cycles completed yesterday (preview): [n] (7-day trend: ▁▂▃...)
2. Onboarding funnel drop: [%] at each step
3. Draft acceptance rate (48h rolling): [%] — GREEN/YELLOW/RED
4. Survey response rates: A [%] · B [%]

### Tasks merged yesterday
- ENG-###: [title] — [author] — [evidence link]

### Tasks in flight
- ENG-###: [title] — [owner] — [column: Build/Evidence/QA/RC]

### Blocked
- ENG-###: [reason] — [unblock owner] — [ETA]

### FAIL-loop watch
- ENG-###: attempt [n/3]

### Spend (LLM)
- Yesterday: [$X] · MTD: [$Y] / [$cap]
```

### Weekly Retro (Friday 16:00)

Every Friday — 30 minutes. Inputs: FAIL rate, tasks-over-3-days, scope-change requests received & rejected (Rule #5 log), kill-condition readings.

Output: 1 keep · 1 drop · 1 try for next week.

---

## 9. Scope Change Protocol (Rule #5 Enforcement)

Any proposal to add scope this sprint:
1. Proposer writes a 3-line case (what / why / who benefits).
2. PM evaluates against PRD v0 P0 cuts (视频号, 小红书, full dashboard, descriptor-first voice, strategy-first forced).
3. **Default response is reject** and log to `LAUNCH_PACKAGE_TEMPLATE.md` → Post-Launch Optimization Backlog.
4. Only exception: scope change that reduces risk on a top-5 risk register item. Requires PM + Eng Lead + Reality Checker tri-sig.

---

## 10. Next Concrete Actions (Day 2, today 2026-04-18) — v1.1 revised

Ordered by urgency. **P0 = today EOD · P1 = this week · P2 = next action**.

### P0 (today, 2026-04-18 EOD)
1. **Eng Lead**: sign off D3 (LLM abstraction) decision doc. Blocks ENG-001 migration start.
2. **Senior PM**: assign BE/FE/FS owners to the **70 post-cut tasks** in ENG_TASKS (ENG-013, 016, 032, 033, 044 removed). Log owners in STRATEGY §5.4.
3. **PM**: update DECISIONS_LOG to reflect D10 **provisional** status (not yet validated); add reference to Plan B in §3 Week 3.
4. **Senior PM**: lock W3 capacity plan — confirm FS engineer takes ~5 eng-days of BE overflow in W3.

### P1 (this week, by 2026-04-24)
5. **Legal**: CAC 抖音 AI label exact copy draft. **Hard deadline 2026-04-21.** Fallback placeholder: "本内容由 AI 辅助生成".
6. **Legal**: D8 retention copy draft. Deadline 2026-04-22.
7. **BE Lead**: Clerk JWT tenant-isolation spike (2–4h). W1 Day 3 (2026-04-19 or 20).
8. **DevOps Automator**: spin up Vercel preview, Supabase project, Upstash QStash+Redis, PostHog project. Deadline 2026-04-20.
9. **Research pair**: continue WEEK1_RESEARCH_PLAN. Day 5 brief (2026-04-23) must **explicitly answer A2/A7 to lock or falsify D10**.
10. **Rapid Prototyper**: thin vertical slice on throwaway branch; demo target 2026-04-22.
11. **Project Shepherd**: post first standup 2026-04-19 morning.

### P2 (by 2026-04-25)
12. **Studio Producer + PM**: lock launch date per RR6 (Thu 05-14 / Fri 05-15 / Mon 05-18). Recommendation: Mon 05-18.
13. **Experiment Tracker**: activate 2026-05-05 (W3 Day 5). Preparation reading list shared this week.
14. **Support Responder**: FAQ outline due 2026-05-07 (W3 Day 7); full draft by 2026-05-11.
15. **BE Lead**: confirm 60s char limit single source of truth = **210 hard cap** (matches DECISIONS_LOG); update ENG-009 spec + ENG-012 validation.

---

*This plan is the operating system. Changes require PM + Eng Lead sign-off and must be logged at the bottom of this file with date and rationale.*

## Change Log

- 2026-04-18 v1.0 — Initial plan compiled by NEXUS-Sprint orchestrator on Day 2.
- 2026-04-18 v1.1 — Review-driven revision (same-day):
  - Discovery status: DONE → **Provisionally Closed** (Day 5 research is formal close gate)
  - Week 3 rebalanced: cut ENG-013, 016, 032, 033, 044 (5 tasks, 4 eng-days); FS engineer shifts to BE overflow
  - D10 Plan B added (channel revert to WeChat+LinkedIn if A2/A7 falsified)
  - Clerk JWT tenant-isolation spike inserted W1 Day 3
  - CAC 抖音 AI label copy hard deadline 2026-04-21 (blocks ENG-065)
  - 60s char limit aligned to 210 hard cap (was 215 in v1.0, DECISIONS_LOG source of truth)
  - RR6 (launch-date timing) + RR7 (W3 BE overload) added to risk register
  - Experiment Tracker activation pulled to 2026-05-05 (was 05-08)
  - Support Responder / FAQ draft pulled to 2026-05-07 (was 05-14)
  - Legal launch gate: CAC AI label copy is now an explicit pre-W3 deliverable
