# RESEARCH · DeepSeek 灰度上 draft intent 头位

**作者**：xukang.wang@gmail.com（2026-05-08 草拟，等 launch 后实施）
**状态**：DRAFT — launch 后第二周（W6+）若数据支持再启动
**前置**：deepseek 已加入 CN chain 第 2 位（commit `18c641d`）；live probe 671ms 打通

---

## 为什么不在 launch 前做

| 信号 | 状态 |
|---|---|
| deepseek 真实长 prompt（3000+ tokens system + 用户字段）的 JSON 输出稳定性 | ❌ 未验证 |
| deepseek 的 17-frame schema 遵循率（vs kimi） | ❌ 未验证 |
| deepseek 在 ¥0.27-1.10/M tokens 实际产出 vs 估算（5 fen/1K 默认） | ❌ 未验证 |
| script step P95 实际改善幅度 | ❌ 未量化 |
| launch 周代码冻结 | ✅ 不允许首选 provider 切换 |

**结论**：launch 前 deepseek 只做「kimi 失败 fallback」用，不上 chain 头位。

---

## 假说（要验证的）

切换 draft 链头 `kimi → deepseek` 能：
1. **P50** 从 92s 降到 30-50s（DeepSeek-chat 长 prompt 实测约 kimi 的 1/2-1/3）
2. **P95** 从 145s（已含 retry 优化）降到 ~90s
3. 字数合规率 **不显著下降**（核心风险）
4. JSON 解析失败率 **不显著上升**（核心风险）

---

## 灰度方案（按风险/收益）

### Phase 1 · D14（launch 后 D+5 / 2026-05-20）· 影子模式

**做法**：保持当前 `[kimi, deepseek, qwen, ernie]` 不变，新增**影子调用**：
- 每次 script step 正常走 kimi
- 同时**异步**用相同 prompt 调 deepseek，结果不返回给用户
- 两个结果都写到新表 `script_shadow_results`（schema 见下）
- 30 个真实样本即可统计学比对

**新建表**：
```sql
CREATE TABLE script_shadow_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES workflow_runs(id),
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  primary_provider   TEXT NOT NULL,         -- 'kimi'
  primary_latency_ms INT NOT NULL,
  primary_chars      INT NOT NULL,
  primary_frames     INT NOT NULL,
  primary_valid      BOOLEAN NOT NULL,
  primary_retries    INT NOT NULL,
  shadow_provider    TEXT NOT NULL,         -- 'deepseek'
  shadow_latency_ms  INT NOT NULL,
  shadow_chars       INT NOT NULL,
  shadow_frames      INT NOT NULL,
  shadow_valid       BOOLEAN NOT NULL,
  shadow_error       TEXT
);
CREATE INDEX idx_shadow_run ON script_shadow_results(run_id);
```

**判定门槛**（30 样本后）：
- shadow_valid 率 ≥ primary_valid 率 - 10pp（不显著退化）
- shadow JSON 解析失败 ≤ 5%
- shadow_latency P50 < 60s（≥ 30s 改善）
→ 全部满足，进 Phase 2。任一不满足 → 报告归档，结束。

### Phase 2 · D21（launch 后 D+12 / 2026-05-27）· 单 tenant 切换

把 `tenant_id IN (一个志愿 seed user)` 的 draft chain 临时换 `[deepseek, kimi, qwen, ernie]`，其它 tenant 维持原样。

**实现**：router.ts 新增 tenant-level override（feature flag 风格），不改全局表：
```typescript
// 新增：tenant-level chain override (env-based, ops-controllable)
const TENANT_DRAFT_PRIMARY: Record<string, ProviderName> = parseEnvJson(
  process.env.TENANT_DRAFT_PRIMARY ?? '{}'
);
// resolveProviderChain() 内：先看 tenant override，再 fallback 到 ROUTING_TABLE
```

跑 7 天，对比该 tenant 的 perf-snapshots.csv P50/P95 vs 其他 tenant。

### Phase 3 · D35（launch 后 D+26 / 2026-06-10）· 全量切换

对照实验数据全过 → 全量改 `ROUTING_TABLE.CN.draft = ['deepseek', 'kimi', 'qwen', 'ernie']`。

router.test.ts 加新 case 锁定新顺序。

---

## 风险 / 回滚

| 风险 | 探测信号 | 回滚 |
|---|---|---|
| deepseek 长 prompt 退化 | shadow_valid 率 < primary - 10pp | Phase 1 不进 Phase 2 |
| deepseek JSON 不稳 | shadow JSON parse 失败 > 5% | Phase 1 不进 Phase 2 |
| 单 tenant 实测变差 | 7 天 P95 比对照 tenant 高 | env 删 TENANT_DRAFT_PRIMARY |
| 全量后用户投诉激增 | 内测群 + Vercel logs 错误率 | revert ROUTING_TABLE 顺序 |

---

## 不做的事

- **不在 launch 周（5/9-5/15）做**：codebase 冻结期
- **不直接全量切换**：没有数据支撑的事不做
- **不下线 kimi**：即使 deepseek 全面更优，kimi 仍要在链上做 fallback
- **不替换 INTL chain**：那条链有 openai 在管，不动

---

## 接受 / 推迟

- 🟢 **接受**：launch 后 5/20 起跑 Phase 1，最迟 6/10 拍板
- 🟡 **推迟**：如 launch 一周内出现非 LLM 相关 P0 bug 占主要工程时间
- 🔴 **放弃**：DeepSeek API 在 launch 期间出现 ≥ 2 次连续 5 分钟以上中断
