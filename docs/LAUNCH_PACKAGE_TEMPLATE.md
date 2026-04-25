# Launch Package — AI 内容营销工作室 MVP

**Status**: TEMPLATE — populated during Week 4 (2026-05-08 → launch-day)
**Target launch**: **UNDER REVIEW** (options: Thu 2026-05-14 / Fri 2026-05-15 / **Mon 2026-05-18 recommended**) — decision deadline 2026-04-25 per SPRINT_PLAN RR6
**Version**: 1.1 (review-driven revision, same-day as v1.0)
**Owner**: Studio Producer
**Predecessor**: `NEXUS_SPRINT_PLAN.md` v1.1 (Stages 1–4 orchestration)
**Populated by**: Studio Producer · Experiment Tracker · Support Responder

**v1.1 changes**: (1) launch date status → under review; (2) 60s char limit in §1.2 → 210 hard cap; (3) OPT backlog pre-seeded with 5 tasks cut in SPRINT_PLAN v1.1 (ENG-013/016/032/033/044); (4) launch-day run-of-show gains timeline variant for Monday launch option.

This document is a **skeleton**. Checkboxes are intentionally unchecked — they will be filled as evidence is collected in Week 4. Do not edit structure without PM sign-off.

---

## 1. Launch Checklist

Every item requires a linked evidence artifact (screenshot path, test output, commit SHA, or doc URL). Reality Checker reviews this checklist as the final launch gate.

### 1.1 Legal & Compliance Gate

- [ ] **LLM provider routing — CN tenants → domestic (文心/通义/Kimi)**
  - Evidence: `[prod log sample, ≥20 requests, link]`
- [ ] **LLM provider routing — non-CN tenants → Claude/OpenAI**
  - Evidence: `[prod log sample, link]`
- [ ] **Data retention disclosure visible at brand voice capture (per D8)**
  - Evidence: `[screenshot path]`
- [ ] **Retention disclosure copy signed off by Legal**
  - Evidence: `[Legal sign-off doc]`
- [ ] **Douyin CAC AI-generated label injected on 100% of Douyin export payloads**
  - Evidence: `[test run output, 10 samples]`
- [ ] **Xiaohongshu output has no auto-publish path (export-only)**
  - Evidence: `[code review PR link]`
- [ ] **Supabase RLS tenant isolation verified on all 7 tables**
  - Evidence: `[cross-tenant probe test output]`
- [ ] **《数据安全法》 compliance statement written for internal reference**
  - Evidence: `[doc path]`
- [ ] **《个人信息保护法》 user data handling audit trail present**
  - Evidence: `[audit log query output]`

### 1.2 Functional Gate

- [ ] **End-to-end Quick Create cycle on production**
  - Formula selection → length → input → script → adapt (Douyin + Xiaohongshu) → Solo approve → export
  - Evidence: `[recorded flow, timestamp, duration]`
- [ ] **Team review state machine refuses invalid transitions**
  - Evidence: `[contract test output]`
- [ ] **Solo review checklist gate disables Approve until all 5 items ticked**
  - Evidence: `[test + screenshot]`
- [ ] **60s script char-limit compliance ≥90% on 20 generated samples** — **hard cap 210 chars** (v1.1 aligned), soft target 190–210
  - Evidence: `[sample sheet with char counts]`
- [ ] **Long-form script char range (800–1000) compliance ≥90% on 10 samples**
  - Evidence: `[sample sheet]`
- [ ] **Uncanny-valley scanner rejects all D7 patterns on 100% of test inputs**
  - Evidence: `[test suite output]`
- [ ] **Diff annotations render on 5 sample adaptations without manual edit**
  - Evidence: `[screenshots per sample]`
- [ ] **Brand voice capture flow completable in <3 minutes**
  - Evidence: `[unmoderated test result if available, else internal timed run]`
- [ ] **Topic Intelligence returns ≥5 suggestions with emotion rationale on 3 test inputs**
  - Evidence: `[API response samples]`
- [ ] **Performance logging 3-field form submits successfully**
  - Evidence: `[test output]`

### 1.3 Brand & Voice Gate

- [ ] **Product-surface voice rubric (STRATEGY §2.1) passes on every shipped screen**
  - Evidence: `[Brand Guardian report]`
- [ ] **No forbidden phrases in shipped copy** ("一键", "智能生成", "赋能", "亲", "您稍等", "精心打造", emoji in chrome)
  - Evidence: `[grep audit output]`
- [ ] **Generation rubric (STRATEGY §2.2) scores ≥4/5 on ≥80% of 20-sample audit**
  - Evidence: `[audit spreadsheet — 10 formula 1, 10 formula 2; 5 each 60s/long-form]`
- [ ] **Platform fit confirmed — Douyin sample passes native-fluency check**
  - Evidence: `[sample + reviewer note]`
- [ ] **Platform fit confirmed — Xiaohongshu sample passes native-fluency check**
  - Evidence: `[sample + reviewer note]`

### 1.4 Analytics & Experiments Gate

- [ ] **All 8 required events fire with correct properties on full happy-path run**
  - Events: `brand_voice_saved` · `content_started` · `draft_generated` · `review_approved` · `cycle_completed` · `survey_shown`+`survey_submitted` · `full_regenerate_requested` · `generation_error`
  - Evidence: `[PostHog screenshot of event stream during test cycle]`
- [ ] **A/B assignment deterministic on user_id hash (example-first vs. descriptor-first)**
  - Evidence: `[unit test output — 10 seeded user IDs with stable variant assignment]`
- [ ] **Survey A fires non-blocking on first `cycle_completed`**
  - Evidence: `[test flow screenshot]`
- [ ] **Survey B fires 60s after `review_approved` (non-blocking)**
  - Evidence: `[test flow screenshot]`
- [ ] **Standup dashboard live and showing preview data**
  - Evidence: `[dashboard screenshot]`
- [ ] **WACC metric formula implemented and query-verified on seed data**
  - Evidence: `[SQL query + expected-value test]`

### 1.5 Operational Gate

- [ ] **Runbook: LLM provider outage**
  - Evidence: `[runbook doc path]`
- [ ] **Runbook: QStash outage → Supabase Realtime fallback**
  - Evidence: `[runbook doc path]`
- [ ] **Runbook: Supabase downtime procedure**
  - Evidence: `[runbook doc path]`
- [ ] **Per-tenant LLM spend cap active; tested by forcing cap breach**
  - Evidence: `[test transcript + graceful error]`
- [ ] **Global daily LLM spend cap active**
  - Evidence: `[config + alert definition]`
- [ ] **Backup/restore drill completed**
  - Evidence: `[drill timestamp + restored-row count]`
- [ ] **Error rate <5% on last 24h of preview traffic**
  - Evidence: `[error dashboard screenshot]`
- [ ] **Support Responder has access + FAQ draft + escalation path documented**
  - Evidence: `[FAQ doc + access confirmation]`

### 1.6 Kill-Condition Monitoring Gate

- [ ] **Alert: Avg edit time >25 min in first 10 sessions**
  - Owner: `[name]` · Evidence: `[alert rule link]`
- [ ] **Alert: Onboarding completion rate <60% in any 7-day cohort**
  - Owner: `[name]` · Evidence: `[alert rule link]`
- [ ] **Alert: Survey B mean <3.0 AND D14 return <40% concurrent**
  - Owner: `[name]` · Evidence: `[alert rule link]`
- [ ] **Alert: Performance log entry <30% at day 30**
  - Owner: `[name]` · Evidence: `[alert rule link]`
- [ ] **Alert: Support contact rate >10% before first cycle completion**
  - Owner: `[name]` · Evidence: `[alert rule link]`

### 1.7 Final Sign-offs (human, in order)

- [ ] **Legal Compliance Checker** — signed `[date]` · `[name]`
- [ ] **Brand Guardian** — signed `[date]` · `[name]`
- [ ] **Infrastructure Maintainer** — signed `[date]` · `[name]`
- [ ] **Reality Checker (launch gate)** — signed `[date]` · `[name]`
- [ ] **Senior PM** — signed `[date]` · `[name]`

**Reality Checker authority**: If any 1.1–1.6 item is unchecked or evidence is inconclusive, Reality Checker defaults to NEEDS WORK. No launch. No negotiation.

---

## 2. First-Week Operating Cadence (post-launch, 2026-05-15 → 2026-05-22)

Defined now so the team has a ready operating system on launch day.

### 2.1 Daily rituals

**Morning triage (09:30, 15 min, Studio Producer hosts)**
- Read overnight support tickets (Support Responder presents)
- Check 4 numbers:
  1. Cycles completed yesterday
  2. Onboarding funnel drop rate
  3. Draft acceptance rate (48h rolling)
  4. Survey response rates
- Any kill-condition alert hit? → Stop, call PM, assess.
- Decide: any hotfix today? any user outreach?

**Afternoon check (15:00, 10 min, async written in standup channel)**
- LLM spend MTD vs. cap
- Error rate last 4h
- New users activated today
- Open P0/P1 bugs count

**End-of-day log (Studio Producer, 18:00)**
- 3 lines: today's number, today's surprise, tomorrow's focus.

### 2.2 Weekly rituals

**Monday product review (60 min)**
- Cohort review: last 7 days' users on 5 success criteria
- A/B test status (example-first vs. descriptor-first)
- Top 3 support themes
- Roadmap adjustment decision

**Wednesday user conversation (30 min)**
- 1 user call per week minimum — observe use, ask about surprises
- Written summary posted; direct quotes preserved

**Friday retro (30 min)**
- Kill-condition dashboard review
- 1 keep / 1 drop / 1 try for next week
- Optimization backlog re-ranking

### 2.3 First-week specific watchlist

- Days 1–3: onboarding drop watch. If drop >40% at any step → immediate UX intervention
- Days 3–7: first `cycle_completed` samples — Brand Guardian spot-checks generation quality on real user data
- Days 5–7: first Survey A responses — efficiency self-report
- Day 7: 7-day activation cohort evaluated against 75% target

### 2.4 Escalation tree

- P0 (broken core flow, data integrity, compliance): wake PM + Eng Lead · target resolution <4h
- P1 (degraded experience, high-friction bug): fix same day · standup report
- P2 (cosmetic, edge case): add to optimization backlog · review Monday

---

## 3. Post-Launch Optimization Backlog

Populated during Sprint 1 as items are cut via Rule #5 (scope change protocol) plus post-launch feedback. Maintained by PM. Ranked by impact/effort.

### 3.1 Structure

Each item:
```
ID: OPT-###
Title: <short>
Origin: <cut-from-sprint-1 | user-feedback | kill-condition-trigger | retro>
Impact: H/M/L
Effort: XS/S/M/L/XL
Notes:
Proposed sprint: Sprint 2 / Sprint 3 / parking lot
```

### 3.2 Pre-seeded items (known cuts from PRD v0 and Sprint 1)

| ID | Title | Origin | Impact | Effort | Proposed sprint |
|---|---|---|---|---|---|
| OPT-001 | Full performance retrospective dashboard | PRD v0 cut (gated on >30% performance_logged completion in Sprint 1) | M | L | Sprint 2 (conditional) |
| OPT-002 | 视频号 channel adapter | PRD v0 cut | M | L | Sprint 2 |
| OPT-003 | LinkedIn channel adapter | D10 pivot | M | M | Sprint 2 (if demand signals from B2B users) |
| OPT-004 | WeChat 公众号 channel adapter | D10 pivot | M | M | Sprint 2 (if demand signals) |
| OPT-005 | Descriptor-first brand voice UI | PRD v0 cut | L | M | Parking lot (killed unless A/B evidence flips) |
| OPT-006 | Strategy-First as default entry | PRD v0 cut | L | S | Parking lot (80% users are ad-hoc) |
| OPT-007 | Brand voice thumbs-up/down + adjustment options | Sprint 2 stage | M | M | Sprint 2 |
| OPT-008 | Edit rate decline visualization (trust proof) | Sprint 2 stage | M | S | Sprint 2 |
| OPT-009 | Advanced brand voice cross-session consistency | Sprint 2 stage | M | L | Sprint 3 |
| OPT-010 | Native publishing (Douyin + Xiaohongshu API push) | Scope-cut | H | XL | Sprint 3 (API access dependent) |
| OPT-011 | Multi-user RBAC (beyond Solo/Team modes) | Scope-cut | M | L | Sprint 3 |
| OPT-012 | Independent bilingual drafts (not translation-based) | Scope-cut | L | L | Parking lot |
| OPT-013 | Suppression admin UI (beyond raw JSON) | Likely cut from W4 | L | S | Sprint 2 |
| OPT-014 | Emotion trigger breakdown per topic | Possibly cut from W3 | M | M | Sprint 2 |
| OPT-015 | Storyboard brief generator (ENG-013 + 016) | **CUT v1.1** from W3 | M | M | Sprint 2 |
| OPT-016 | Team review named-owner assignment (ENG-032) | **CUT v1.1** from W3 | M | S | Sprint 2 |
| OPT-017 | Team review 24h timeout reminder (ENG-033) | **CUT v1.1** from W3 | M | M | Sprint 2 |
| OPT-018 | Topic Intelligence emotion-trigger breakdown (ENG-044) | **CUT v1.1** from W3 | M | M | Sprint 2 |

### 3.3 Reserved slots (populated post-launch)

- OPT-016..050 reserved for user-feedback-driven items discovered in first 4 weeks

---

## 4. Launch-Day Run-of-Show

Studio Producer populates. Launch date is **under review** (see RR6, deadline 2026-04-25). Two templates:

### 4.a — If launch = Wed 2026-05-15 (current default, Friday-adjacent)

```
Tue 05-14 17:00 — Pre-launch gate lock (Reality Checker final)
Wed 05-15:
  05:00 — Final deploy to production (DevOps)
  07:00 — Smoke test on prod (BE + FE)
  08:00 — Reality Checker final gate review (this doc §1)
  09:00 — If PASS: enable feature flag for first 5 users
  10:00 — Send welcome emails to 5 users
  11:00 — Active monitoring begins (error rate, first events)
  13:00 — Midday check: first cycles completed? first errors?
  15:00 — If green: enable flag for next 5 users (10 total)
  17:00 — End-of-day metrics posted
Thu–Fri 05-16..17 — Normal support cadence, remaining 10 user activations by Tue 05-20
```

⚠️ **Risk**: Fri 05-15 is weekend-adjacent. If prod breaks Fri evening, limited weekend response coverage. Recommendation: use 4.b.

### 4.b — If launch = Mon 2026-05-18 (RR6 recommendation)

```
Thu 05-14 EOD — Feature freeze
Fri 05-15 — Hardening, bug bash, infrastructure production-readiness drill
Weekend 05-16..17 — Evidence pack assembly + Reality Checker gate review (can be done remote)
Mon 05-18:
  05:00 — Final deploy to production (DevOps)
  07:00 — Smoke test on prod (BE + FE)
  08:00 — Reality Checker final gate review (this doc §1)
  09:00 — If PASS: enable feature flag for first 5 users
  10:00–17:00 — Full-week support coverage starts; staged activation as 4.a
Tue–Thu 05-19..21 — Add remaining 15 users; daily metric review
```

✅ **Rationale**: Full week support coverage post-launch. Weekend buffer for final hardening. Better alignment with kill-condition monitoring cadence.

### 4.1 Rollback decision tree

| Condition | Action |
|---|---|
| Compliance gate (§1.1) fails in prod log audit | **Immediate rollback** · disable flag · investigate |
| Error rate >15% in any 1h window | **Immediate rollback** |
| Cross-tenant data leak detected | **Immediate rollback** · incident response · Legal notified |
| LLM spend >2× daily cap projection | Hotfix cap · if not fixable in 1h, rollback |
| Support contact rate >20% in first 5 users | Pause new activations · diagnose · then resume or rollback |
| Error rate 5–15% | Active triage · hotfix or pause · no rollback unless worsening |
| First user Survey A <3.0 | Log · continue · plan week 2 intervention (not a rollback trigger) |

---

*This is the Stage-5 launch template. Populate during Week 4. Every unchecked item blocks launch unless Reality Checker explicitly waives with rationale documented inline.*

## Change Log
- 2026-04-18 v1.0 — Template scaffolded by NEXUS-Sprint orchestrator on Day 2.
- 2026-04-18 v1.1 — Review-driven revision (same-day):
  - Launch date status → under review (Thu 05-14 / Fri 05-15 / **Mon 05-18 recommended**), decision by 2026-04-25
  - §1.2 60s char-limit aligned to 210 hard cap
  - §3.2 OPT backlog pre-seeded with 4 Sprint-1-cut tasks (ENG-013/016/032/033/044 → OPT-015..018)
  - §4 run-of-show gains Monday launch variant (4.b) with weekend buffer rationale
