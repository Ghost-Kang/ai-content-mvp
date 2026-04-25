# W4-03 · 20-Sample Audit Report

**Date**: 2026-04-21
**Samples**: 20 · 12 errored
**Pipeline**: content.generateScript (same retry + graceful-degradation loop, no DB writes)

---

## Summary

| Metric | Value |
|---|---|
| Valid (in 190-215 char window, 16-18 frames) | 3/20 (15%) |
| Degraded (best-of-retries returned) | 5/20 (25%) |
| Errors (LLM failed, no parseable output) | 12/20 |
| Provocation valid rate | 10% |
| Insight valid rate | 20% |
| Avg char count (successful) | 213 |
| Avg distance from target window | 10.4 chars |
| Avg retries per case | 0.80 |
| Avg latency | 17284ms |
| Total suppression flags | 0 (0.00 per script) |

---

## Suppression flag distribution

| Category | Count | Per-script rate |
|---|---|---|
| (none) | 0 | 0 |

---

## Per-case results

| # | Industry | Formula | Chars | Frames | Retries | Latency | Flags | Top flags | Issue |
|---|---|---|---|---|---|---|---|---|---|
| ⚠️ S1 | SaaS-CRM | provocation | 270 | 17 | 3 | 58793ms | 0 | — | 字数超出：270字，最多215字 |
| ⚠️ S2 | SaaS-CRM | insight | 218 | 17 | 3 | 50026ms | 0 | — | 字数超出：218字，最多215字 |
| ⚠️ M1 | SaaS-Marketing | provocation | 181 | 17 | 3 | 47722ms | 0 | — | 字数不足：181字，最少需要190字 |
| ✅ M2 | SaaS-Marketing | insight | 215 | 17 | 0 | 22518ms | 0 | — | — |
| ✅ C1 | SaaS-Collab | provocation | 203 | 17 | 0 | 16019ms | 0 | — | — |
| ⚠️ C2 | SaaS-Collab | insight | 222 | 17 | 3 | 57594ms | 0 | — | 字数超出：222字，最多215字 |
| ⚠️ D1 | DevTools | provocation | 181 | 17 | 3 | 47553ms | 0 | — | 字数不足：181字，最少需要190字 |
| ✅ D2 | DevTools | insight | 215 | 17 | 1 | 40719ms | 0 | — | — |
| ❌ E1 | Ecommerce | provocation | 0 | 0 | 0 | 4742ms | 0 | — | All providers exhausted. Errors: Kimi rate limit hit |
| ❌ E2 | Ecommerce | insight | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ F1 | SaaS-Finance | provocation | 0 | 0 | 0 | 1ms | 0 | — | All providers exhausted. Errors:  |
| ❌ F2 | SaaS-Finance | insight | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ H1 | HR-Tech | provocation | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ H2 | HR-Tech | insight | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ ED1 | EdTech | provocation | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ ED2 | EdTech | insight | 0 | 0 | 0 | 1ms | 0 | — | All providers exhausted. Errors:  |
| ❌ SP1 | CustomerOps | provocation | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ SP2 | CustomerOps | insight | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ SEC1 | Security | provocation | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |
| ❌ SEC2 | Security | insight | 0 | 0 | 0 | 0ms | 0 | — | All providers exhausted. Errors:  |

---

## Reading this report

- **Valid rate** is the headline KPI — target ≥60% for launch (D13 tolerance)
- **Per-script flag rate** measures W3-07 suppression effectiveness; <1 flag/script after 50-word list means the prompt is persuading Kimi to avoid AI-tells; >2 flags/script means prompt-level suppression is being ignored
- **Avg distance** measures how close degraded cases are to the target window; if most degraded cases have distance <20, the graceful-degradation fallback is producing usable content
- **Retries per case** > 2.5 means we're burning LLM budget on the same structural failure — revisit prompt, not retry count
