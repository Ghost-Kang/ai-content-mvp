# W4-03 · 20-Sample Audit Report

**Date**: 2026-04-21
**Samples**: 20 · 1 errored
**Pipeline**: content.generateScript (same retry + graceful-degradation loop, no DB writes)

---

## Summary

| Metric | Value |
|---|---|
| Valid (in 190-215 char window, 16-18 frames) | 9/20 (45%) |
| Degraded (best-of-retries returned) | 10/20 (50%) |
| Errors (LLM failed, no parseable output) | 1/20 |
| Provocation valid rate | 30% |
| Insight valid rate | 60% |
| Avg char count (successful) | 192 |
| Avg distance from target window | 8.8 chars |
| Avg retries per case | 2.00 |
| Avg latency | 39906ms |
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
| ⚠️ S1 | SaaS-CRM | provocation | 180 | 17 | 3 | 66324ms | 0 | — | 字数不足：180字，最少需要190字 |
| ✅ S2 | SaaS-CRM | insight | 212 | 17 | 0 | 21511ms | 0 | — | — |
| ✅ M1 | SaaS-Marketing | provocation | 190 | 17 | 1 | 29823ms | 0 | — | — |
| ⚠️ M2 | SaaS-Marketing | insight | 156 | 17 | 3 | 45752ms | 0 | — | 字数不足：156字，最少需要190字 |
| ❌ C1 | SaaS-Collab | provocation | 0 | 0 | 1 | 22773ms | 0 | — | All providers exhausted. Errors: Kimi rate limit hit |
| ✅ C2 | SaaS-Collab | insight | 192 | 17 | 2 | 48980ms | 0 | — | — |
| ⚠️ D1 | DevTools | provocation | 158 | 17 | 3 | 45972ms | 0 | — | 字数不足：158字，最少需要190字 |
| ✅ D2 | DevTools | insight | 200 | 17 | 1 | 31056ms | 0 | — | — |
| ⚠️ E1 | Ecommerce | provocation | 181 | 17 | 3 | 53834ms | 0 | — | 字数不足：181字，最少需要190字 |
| ⚠️ E2 | Ecommerce | insight | 180 | 17 | 3 | 44857ms | 0 | — | 字数不足：180字，最少需要190字 |
| ⚠️ F1 | SaaS-Finance | provocation | 151 | 17 | 3 | 43337ms | 0 | — | 字数不足：151字，最少需要190字 |
| ✅ F2 | SaaS-Finance | insight | 197 | 17 | 0 | 16063ms | 0 | — | — |
| ⚠️ H1 | HR-Tech | provocation | 220 | 17 | 3 | 42646ms | 0 | — | 字数超出：220字，最多215字 |
| ⚠️ H2 | HR-Tech | insight | 217 | 17 | 3 | 46535ms | 0 | — | 字数超出：217字，最多215字 |
| ✅ ED1 | EdTech | provocation | 197 | 17 | 1 | 29128ms | 0 | — | — |
| ✅ ED2 | EdTech | insight | 205 | 17 | 1 | 32818ms | 0 | — | — |
| ⚠️ SP1 | CustomerOps | provocation | 231 | 17 | 3 | 54738ms | 0 | — | 字数超出：231字，最多215字 |
| ⚠️ SP2 | CustomerOps | insight | 179 | 17 | 3 | 44279ms | 0 | — | 字数不足：179字，最少需要190字 |
| ✅ SEC1 | Security | provocation | 212 | 17 | 1 | 33214ms | 0 | — | — |
| ✅ SEC2 | Security | insight | 192 | 17 | 2 | 44488ms | 0 | — | — |

---

## Reading this report

- **Valid rate** is the headline KPI — target ≥60% for launch (D13 tolerance)
- **Per-script flag rate** measures W3-07 suppression effectiveness; <1 flag/script after 50-word list means the prompt is persuading Kimi to avoid AI-tells; >2 flags/script means prompt-level suppression is being ignored
- **Avg distance** measures how close degraded cases are to the target window; if most degraded cases have distance <20, the graceful-degradation fallback is producing usable content
- **Retries per case** > 2.5 means we're burning LLM budget on the same structural failure — revisit prompt, not retry count
