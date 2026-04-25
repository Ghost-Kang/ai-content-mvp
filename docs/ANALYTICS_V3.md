# PostHog Event Schema — v3.0 Workflow

**Version**: 3.0
**Date**: 2026-04-23
**Owner**: W1-09-V3 (`app/src/lib/analytics/server.ts`)

All events ride this base properties block (set automatically by helpers):

```ts
{ tenantId: string, region: 'CN' | 'INTL', plan: 'solo' | 'team' }
```

`distinctId` is always `userId` (Drizzle UUID, NOT Clerk user id).

---

## Run-level events

| Event | When | Extra properties | Used for |
|---|---|---|---|
| `workflow_run_started` | `Orchestrator.run()` after preflight passes | `runId`, `topic` | Funnel top: how many runs are attempted |
| `workflow_run_completed` | All nodes done | `runId`, `totalCostFen`, `totalVideoCount`, `durationMs`, `nodeCount` | Funnel bottom: success rate, duration, gross margin |
| `workflow_run_failed` | Any terminal failure (preflight, node fail, cap mid-run) | `runId`, `failedNode`, `errorCode`, `errorMsg`, `totalCostFen`, `totalVideoCount`, `durationMs` | Bug surfacing, kill-gate signal |

---

## Node-level events

Fired from inside `NodeRunner.run()` for **every** node concrete impl, no per-node code needed.

| Event | When | Extra properties | Used for |
|---|---|---|---|
| `workflow_node_completed` | `execute()` returned ok | `runId`, `nodeType`, `stepIndex`, `costFen`, `videoCount`, `retryCount`, `durationMs`, `qualityIssue` | Per-node latency / cost / quality dashboards |
| `workflow_node_failed` | All retries exhausted | `runId`, `nodeType`, `stepIndex`, `errorCode`, `errorMsg`, `retryCount`, `durationMs` | Failure clustering by node type |
| `workflow_node_retried` | Mid-loop retry triggered | `runId`, `nodeType`, `stepIndex`, `attempt`, `errorCode`, `errorMsg`, `backoffMs` | Reliability of upstream LLM/API providers |

---

## Spend cap events

| Event | When | Extra properties | Used for |
|---|---|---|---|
| `monthly_cap_blocked` | Preflight refuses OR mid-run `SpendCapError` | `runId?`, `reason`, `totalCostFen`, `costCapFen`, `videoCount`, `videoCapCount`, `monthKey` | Detect users hitting plan ceiling — upsell signal + ARPU pressure dashboard |

`reason` is one of `cost_cap_exceeded` | `video_cap_exceeded`.

---

## Reused from v2 (still fired by content router, do NOT duplicate)

| Event | Owner | Note |
|---|---|---|
| `session_started` | `routers/content.ts` | v2 thin slice direct flow |
| `script_generated` | `routers/content.ts` | v2 thin slice direct flow |
| `script_approved` | `routers/content.ts` | v2 thin slice direct flow |
| `script_exported` | `routers/content.ts` | v2 thin slice direct flow |

The v3 workflow does **not** re-fire these events when ScriptNodeRunner runs, because:
1. v3 has its own `workflow_node_completed` event with `nodeType=script`
2. firing both would double-count in v2-funnel dashboards

If you ever want v3 runs to count in v2 funnels, add an explicit `fireScriptGenerated` call in `ScriptNodeRunner.execute()` after the success path.

---

## Required PostHog dashboards (W4 monitoring)

These should be wired up before W5 internal-test launch (2026-05-26):

1. **Workflow funnel** — `workflow_run_started → workflow_run_completed` conversion (target ≥80%)
2. **Per-node failure rate** — `workflow_node_failed` grouped by `nodeType` (kill gate: video > 30% in 24h)
3. **Per-run gross margin** — sum(`totalCostFen`) / count(`workflow_run_completed`) per user (target ≤500 fen avg)
4. **Cap-hit cohort** — distinct users with `monthly_cap_blocked` per week (signal: do internal-test users actually hit the cap?)
5. **Provider reliability** — `workflow_node_retried` grouped by `errorCode` (Seedance / Kimi specific)

---

## Verification protocol

After `pnpm wf:probe` completes, the following events MUST appear in PostHog within 30s:

```
workflow_run_started      × 5
workflow_node_completed   × 5  (nodeType=script)
workflow_run_completed    × 4-5
workflow_run_failed       × 0-1  (graceful degradation)
```

If any are missing, check:
1. `NEXT_PUBLIC_POSTHOG_KEY` set in `.env.local`
2. PostHog server-side flush interval (10s default)
3. `safeFire()` console.warn output
