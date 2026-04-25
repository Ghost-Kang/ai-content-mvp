# W4-03 · 20-Sample Audit Report

**Date**: 2026-04-21
**Samples**: 20 · no errors
**Pipeline**: content.generateScript (same retry + graceful-degradation loop, no DB writes)

---

## Summary

| Metric | Value |
|---|---|
| Valid (in 190-215 char window, 16-18 frames) | 9/20 (45%) |
| Degraded (best-of-retries returned) | 11/20 (55%) |
| Errors (LLM failed, no parseable output) | 0/20 |
| Provocation valid rate | 60% |
| Insight valid rate | 30% |
| Avg char count (successful) | 215 |
| Avg distance from target window | 14.2 chars |
| Avg retries per case | 2.05 |
| Avg latency | 44888ms |
| Total suppression flags | 1 (0.05 per script) |

---

## Suppression flag distribution

| Category | Count | Per-script rate |
|---|---|---|
| ai_tell_adjective | 1 | 0.05 |

---

## Per-case results

| # | Industry | Formula | Chars | Frames | Retries | Latency | Flags | Top flags | Issue |
|---|---|---|---|---|---|---|---|---|---|
| ✅ S1 | SaaS-CRM | provocation | 194 | 17 | 2 | 52739ms | 0 | — | — |
| ⚠️ S2 | SaaS-CRM | insight | 223 | 17 | 3 | 52758ms | 0 | — | 字数超出：223字，最多215字 |
| ✅ M1 | SaaS-Marketing | provocation | 200 | 17 | 2 | 51330ms | 0 | — | — |
| ✅ M2 | SaaS-Marketing | insight | 213 | 17 | 1 | 35740ms | 1 | ai_tell_adjective:打造 | — |
| ✅ C1 | SaaS-Collab | provocation | 192 | 17 | 2 | 47317ms | 0 | — | — |
| ⚠️ C2 | SaaS-Collab | insight | 176 | 17 | 3 | 54578ms | 0 | — | 字数不足：176字，最少需要190字 |
| ⚠️ D1 | DevTools | provocation | 220 | 17 | 3 | 63347ms | 0 | — | 字数超出：220字，最多215字 |
| ⚠️ D2 | DevTools | insight | 263 | 17 | 3 | 56399ms | 0 | — | 字数超出：263字，最多215字 |
| ✅ E1 | Ecommerce | provocation | 211 | 17 | 1 | 34247ms | 0 | — | — |
| ✅ E2 | Ecommerce | insight | 214 | 17 | 0 | 16019ms | 0 | — | — |
| ⚠️ F1 | SaaS-Finance | provocation | 244 | 18 | 3 | 55035ms | 0 | — | 字数超出：244字，最多215字 |
| ⚠️ F2 | SaaS-Finance | insight | 287 | 17 | 3 | 58106ms | 0 | — | 字数超出：287字，最多215字 |
| ✅ H1 | HR-Tech | provocation | 202 | 17 | 0 | 17182ms | 0 | — | — |
| ⚠️ H2 | HR-Tech | insight | 163 | 17 | 3 | 64103ms | 0 | — | 字数不足：163字，最少需要190字 |
| ⚠️ ED1 | EdTech | provocation | 176 | 17 | 3 | 50572ms | 0 | — | 字数不足：176字，最少需要190字 |
| ⚠️ ED2 | EdTech | insight | 226 | 17 | 3 | 51444ms | 0 | — | 字数超出：226字，最多215字 |
| ⚠️ SP1 | CustomerOps | provocation | 220 | 17 | 3 | 48644ms | 0 | — | 字数超出：220字，最多215字 |
| ⚠️ SP2 | CustomerOps | insight | 266 | 17 | 3 | 56095ms | 0 | — | 字数超出：266字，最多215字 |
| ✅ SEC1 | Security | provocation | 211 | 17 | 0 | 16403ms | 0 | — | — |
| ✅ SEC2 | Security | insight | 206 | 17 | 0 | 15705ms | 0 | — | — |

---

## Reading this report

- **Valid rate** is the headline KPI — target ≥60% for launch (D13 tolerance)
- **Per-script flag rate** measures W3-07 suppression effectiveness; <1 flag/script after 50-word list means the prompt is persuading Kimi to avoid AI-tells; >2 flags/script means prompt-level suppression is being ignored
- **Avg distance** measures how close degraded cases are to the target window; if most degraded cases have distance <20, the graceful-degradation fallback is producing usable content
- **Retries per case** > 2.5 means we're burning LLM budget on the same structural failure — revisit prompt, not retry count
