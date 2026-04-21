// W4-03 — 20-sample audit script
// Runs the same pipeline as content.generateScript (retry + best-of graceful
// degradation) across a diverse B2B SaaS sample set, then aggregates metrics
// into a markdown report. No DB writes — isolated probe.
//
// Run: pnpm tsx --env-file=.env.local scripts/audit-20-samples.ts
// Output: audit-report-YYYY-MM-DD.md in repo root.

import { writeFileSync } from 'node:fs';
import { executeWithFallback } from '../src/lib/llm';
import { LLMError } from '../src/lib/llm/types';
import {
  buildScriptPrompt,
  validateScriptLength,
  type Formula,
  type GeneratedScript,
} from '../src/lib/prompts/script-templates';
import { buildSuppressionScanner } from '../src/lib/prompts/suppression-scanner';

interface Case {
  id: string;
  productName: string;
  targetAudience: string;
  coreClaim: string;
  formula: Formula;
  industry: string;
}

// 20 cases: 5 industries × 2 formulas × 2 personas each
const CASES: Case[] = [
  // SaaS · CRM / sales
  { id: 'S1', industry: 'SaaS-CRM', formula: 'provocation',
    productName: 'LeadFlow', targetAudience: '10-30 人 B2B 销售团队',
    coreClaim: '你的 CRM 填了 3 年，没人真查——因为它不是你销售流程设计的' },
  { id: 'S2', industry: 'SaaS-CRM', formula: 'insight',
    productName: 'PipeSync', targetAudience: 'SaaS 创始人 + 销售 VP',
    coreClaim: '为什么销售每天花 2 小时填 CRM，留存率却在降？因为数据录入不等于客户关系' },

  // SaaS · 内容/营销
  { id: 'M1', industry: 'SaaS-Marketing', formula: 'provocation',
    productName: 'ContentForge', targetAudience: '10-100 人 B2B SaaS 市场负责人',
    coreClaim: 'AI 生成的内容没人看，不是因为 AI 不好，是因为缺少你自己的品牌声音' },
  { id: 'M2', industry: 'SaaS-Marketing', formula: 'insight',
    productName: 'BrandEcho', targetAudience: '独立咨询师 + 个人 IP 运营者',
    coreClaim: '你发 100 条 AI 内容不涨粉，因为观众已经能闻出 AI 腔的味道' },

  // SaaS · 协作/文档
  { id: 'C1', industry: 'SaaS-Collab', formula: 'provocation',
    productName: 'DocSpace', targetAudience: '30-80 人远程团队',
    coreClaim: '你的知识库没人搜，不是因为内容差，是因为没人知道它在哪' },
  { id: 'C2', industry: 'SaaS-Collab', formula: 'insight',
    productName: 'TeamPulse', targetAudience: 'HR 负责人 + 远程团队 Manager',
    coreClaim: '员工不是不想反馈，是反馈之后永远没人回——这才是你真正的留存问题' },

  // 开发者工具
  { id: 'D1', industry: 'DevTools', formula: 'provocation',
    productName: 'LinkBoost', targetAudience: '独立开发者 + 小团队',
    coreClaim: '你的产品没人用，不是因为功能不够，是因为发布渠道单一' },
  { id: 'D2', industry: 'DevTools', formula: 'insight',
    productName: 'BuildLog', targetAudience: 'startup 工程负责人',
    coreClaim: '为什么 startup 的技术债比大厂还重？因为从 Day 1 没人记录选型理由' },

  // 电商/零售 SaaS
  { id: 'E1', industry: 'Ecommerce', formula: 'provocation',
    productName: 'StockMind', targetAudience: '独立品牌电商运营负责人',
    coreClaim: '你备货总是踩雷，不是预测不准，是数据分散在 5 个后台里' },
  { id: 'E2', industry: 'Ecommerce', formula: 'insight',
    productName: 'ReviewRadar', targetAudience: '跨境电商品牌 Owner',
    coreClaim: '你 5 星评价一堆，店铺却卖不动——因为真正影响转化的是 3 星评论的具体内容' },

  // 财务/账单 SaaS
  { id: 'F1', industry: 'SaaS-Finance', formula: 'provocation',
    productName: 'Billable', targetAudience: '10-50 人咨询公司 Partner',
    coreClaim: '你团队记工时总是漏，不是不自觉，是工具对不上真实工作节奏' },
  { id: 'F2', industry: 'SaaS-Finance', formula: 'insight',
    productName: 'CashWave', targetAudience: 'B2B SaaS 创始人',
    coreClaim: '为什么 SaaS 营收在涨，现金流却在跌？因为你签的是年单，支出是月付' },

  // 人力/招聘
  { id: 'H1', industry: 'HR-Tech', formula: 'provocation',
    productName: 'HireGrid', targetAudience: '30-100 人科技公司 HR lead',
    coreClaim: '你 JD 发 30 天 0 简历，不是 JD 写得差，是你挂错了池子' },
  { id: 'H2', industry: 'HR-Tech', formula: 'insight',
    productName: 'OnboardQ', targetAudience: '成长期 SaaS HRBP',
    coreClaim: '新人 3 个月离职率高，不是文化问题，是入职第二周就没人再 onboard 他了' },

  // 教育/培训
  { id: 'ED1', industry: 'EdTech', formula: 'provocation',
    productName: 'LearnTrack', targetAudience: '企业内训负责人',
    coreClaim: '你员工培训完转头就忘，不是记性差，是你把培训当事件而不是过程' },
  { id: 'ED2', industry: 'EdTech', formula: 'insight',
    productName: 'CoachBot', targetAudience: '独立知识付费作者',
    coreClaim: '你课程完课率不到 10%，不是内容烂，是学员从第二节课就没人催他上课了' },

  // 客服/支持
  { id: 'SP1', industry: 'CustomerOps', formula: 'provocation',
    productName: 'TicketIQ', targetAudience: '30 人以上 SaaS 客服 Lead',
    coreClaim: '你客服回复越快，客户续费反而越低——因为速度替代了理解' },
  { id: 'SP2', industry: 'CustomerOps', formula: 'insight',
    productName: 'ChurnSense', targetAudience: 'SaaS CSM Lead',
    coreClaim: '真正要流失的客户从来不抱怨，他们只是悄悄减少登录——这比投诉危险 10 倍' },

  // 安全/合规
  { id: 'SEC1', industry: 'Security', formula: 'provocation',
    productName: 'AuditFlow', targetAudience: 'SaaS CTO + 合规负责人',
    coreClaim: 'SOC2 过审不是目标，是副作用——真正的问题是你每次找证据都要翻 3 天邮件' },
  { id: 'SEC2', industry: 'Security', formula: 'insight',
    productName: 'AccessGuard', targetAudience: '中台工程负责人',
    coreClaim: '离职员工 30 天后账号还没下，不是忘了，是没人知道他能访问什么' },
];

interface AuditRow {
  id: string;
  industry: string;
  formula: Formula;
  productName: string;
  outcome: 'valid' | 'degraded' | 'error';
  errorCode?: string;
  charCount: number;
  frameCount: number;
  retryCount: number;
  distance: number;           // distance from [190, 215]
  suppressionFlags: { category: string; matchedText: string }[];
  latencyMs: number;
  provider: string;
  qualityIssue: string | null;
}

const MAX_RETRIES = 3;
const CHAR_TARGET_LO = 190;
const CHAR_TARGET_HI = 215;

async function runCase(c: Case): Promise<AuditRow> {
  const t0 = Date.now();
  const { systemPrompt, userPrompt } = buildScriptPrompt({
    formula:        c.formula,
    lengthMode:     'short',
    productName:    c.productName,
    targetAudience: c.targetAudience,
    coreClaim:      c.coreClaim,
  });

  type Best = {
    charCount: number;
    frameCount: number;
    distance: number;
    valid: boolean;
    issue: string | null;
    fullText: string;
    provider: string;
  };
  let best: Best | null = null;
  let lastFeedback: string | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const messages: { role: 'system' | 'user'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ];
    if (lastFeedback) {
      messages.push({
        role: 'user',
        content: `上次输出不合规：${lastFeedback}\n目标字数 190-215（含），最理想 200-210 字。请精确控制，避免过度修正。只输出 JSON。`,
      });
    }

    let res;
    try {
      res = await executeWithFallback({
        messages,
        intent:   'draft',
        tenantId: 'audit',
        region:   'CN',
        maxTokens: 1500,
        temperature: attempt === 0 ? 0.6 : 0.3,
      });
    } catch (e) {
      if (e instanceof LLMError && !e.retryable) {
        return {
          id: c.id, industry: c.industry, formula: c.formula, productName: c.productName,
          outcome: 'error', errorCode: e.code,
          charCount: 0, frameCount: 0, retryCount, distance: 999,
          suppressionFlags: [], latencyMs: Date.now() - t0,
          provider: 'none', qualityIssue: e.message,
        };
      }
      retryCount++;
      lastFeedback = '上次请求因服务端问题失败';
      continue;
    }

    let parsed: GeneratedScript;
    try {
      const raw = res.content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      retryCount++;
      lastFeedback = '输出不是合法 JSON';
      continue;
    }

    const fullText  = parsed.frames.map((f) => f.text).join('');
    const charCount = fullText.replace(/\s/g, '').length;
    const frameCount = parsed.frames.length;
    const v = validateScriptLength(fullText, frameCount, 'short');
    const distance = charCount < CHAR_TARGET_LO ? CHAR_TARGET_LO - charCount
                   : charCount > CHAR_TARGET_HI ? charCount - CHAR_TARGET_HI : 0;

    if (!best || distance < best.distance) {
      best = {
        charCount, frameCount, distance,
        valid: v.valid,
        issue: v.valid ? null : (v.issue ?? null),
        fullText,
        provider: res.provider,
      };
    }

    if (v.valid) break;
    retryCount++;
    lastFeedback = v.issue ?? '字数或帧数不合规';
  }

  if (!best) {
    return {
      id: c.id, industry: c.industry, formula: c.formula, productName: c.productName,
      outcome: 'error', errorCode: 'NO_PARSEABLE',
      charCount: 0, frameCount: 0, retryCount, distance: 999,
      suppressionFlags: [], latencyMs: Date.now() - t0,
      provider: 'none', qualityIssue: '3 次重试零解析',
    };
  }

  const suppressionFlags = buildSuppressionScanner(best.fullText).map(
    (f) => ({ category: f.category, matchedText: f.matchedText }),
  );

  return {
    id: c.id, industry: c.industry, formula: c.formula, productName: c.productName,
    outcome: best.valid ? 'valid' : 'degraded',
    charCount: best.charCount, frameCount: best.frameCount, retryCount,
    distance: best.distance, suppressionFlags,
    latencyMs: Date.now() - t0, provider: best.provider,
    qualityIssue: best.issue,
  };
}

function formatReport(rows: AuditRow[]): string {
  const total      = rows.length;
  const valid      = rows.filter((r) => r.outcome === 'valid').length;
  const degraded   = rows.filter((r) => r.outcome === 'degraded').length;
  const errors     = rows.filter((r) => r.outcome === 'error').length;
  const avgLat     = Math.round(rows.reduce((s, r) => s + r.latencyMs, 0) / total);
  const avgRetry   = (rows.reduce((s, r) => s + r.retryCount, 0) / total).toFixed(2);
  const avgChar    = Math.round(rows.filter((r) => r.outcome !== 'error').reduce((s, r) => s + r.charCount, 0) / (total - errors || 1));
  const avgDist    = (rows.filter((r) => r.outcome !== 'error').reduce((s, r) => s + r.distance, 0) / (total - errors || 1)).toFixed(1);

  const flagByCategory = new Map<string, number>();
  let totalFlags = 0;
  for (const r of rows) {
    for (const f of r.suppressionFlags) {
      flagByCategory.set(f.category, (flagByCategory.get(f.category) ?? 0) + 1);
      totalFlags++;
    }
  }

  const byFormula = (f: Formula) => rows.filter((r) => r.formula === f);
  const validRateFormula = (f: Formula) => {
    const subset = byFormula(f);
    return subset.length === 0 ? 0 : Math.round((subset.filter((r) => r.outcome === 'valid').length / subset.length) * 100);
  };

  const flagLines = [...flagByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `| ${cat} | ${n} | ${((n / total).toFixed(2))} |`)
    .join('\n');

  const rowLines = rows.map((r) => {
    const icon = r.outcome === 'valid' ? '✅' : r.outcome === 'degraded' ? '⚠️' : '❌';
    const flags = r.suppressionFlags.length > 0
      ? r.suppressionFlags.slice(0, 3).map((f) => `${f.category}:${f.matchedText}`).join(', ') + (r.suppressionFlags.length > 3 ? '…' : '')
      : '—';
    return `| ${icon} ${r.id} | ${r.industry} | ${r.formula} | ${r.charCount} | ${r.frameCount} | ${r.retryCount} | ${r.latencyMs}ms | ${r.suppressionFlags.length} | ${flags} | ${r.qualityIssue ?? '—'} |`;
  }).join('\n');

  const dateStr = new Date().toISOString().slice(0, 10);

  return `# W4-03 · 20-Sample Audit Report

**Date**: ${dateStr}
**Samples**: ${total} · ${errors ? `${errors} errored` : 'no errors'}
**Pipeline**: content.generateScript (same retry + graceful-degradation loop, no DB writes)

---

## Summary

| Metric | Value |
|---|---|
| Valid (in 190-215 char window, 16-18 frames) | ${valid}/${total} (${Math.round((valid / total) * 100)}%) |
| Degraded (best-of-retries returned) | ${degraded}/${total} (${Math.round((degraded / total) * 100)}%) |
| Errors (LLM failed, no parseable output) | ${errors}/${total} |
| Provocation valid rate | ${validRateFormula('provocation')}% |
| Insight valid rate | ${validRateFormula('insight')}% |
| Avg char count (successful) | ${avgChar} |
| Avg distance from target window | ${avgDist} chars |
| Avg retries per case | ${avgRetry} |
| Avg latency | ${avgLat}ms |
| Total suppression flags | ${totalFlags} (${(totalFlags / total).toFixed(2)} per script) |

---

## Suppression flag distribution

| Category | Count | Per-script rate |
|---|---|---|
${flagLines || '| (none) | 0 | 0 |'}

---

## Per-case results

| # | Industry | Formula | Chars | Frames | Retries | Latency | Flags | Top flags | Issue |
|---|---|---|---|---|---|---|---|---|---|
${rowLines}

---

## Reading this report

- **Valid rate** is the headline KPI — target ≥60% for launch (D13 tolerance)
- **Per-script flag rate** measures W3-07 suppression effectiveness; <1 flag/script after 50-word list means the prompt is persuading Kimi to avoid AI-tells; >2 flags/script means prompt-level suppression is being ignored
- **Avg distance** measures how close degraded cases are to the target window; if most degraded cases have distance <20, the graceful-degradation fallback is producing usable content
- **Retries per case** > 2.5 means we're burning LLM budget on the same structural failure — revisit prompt, not retry count
`;
}

const SAMPLE_COOLDOWN_MS = 2000;
const RATE_LIMIT_COOLDOWN_MS = 30_000;

async function main() {
  console.log(`🔍 Running W4-03 audit on ${CASES.length} samples...\n`);

  const rows: AuditRow[] = [];
  let consecutiveRateLimits = 0;
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    process.stdout.write(`  [${i + 1}/${CASES.length}] ${c.id} · ${c.industry} · ${c.formula}... `);
    const row = await runCase(c);
    rows.push(row);
    const icon = row.outcome === 'valid' ? '✅' : row.outcome === 'degraded' ? '⚠️' : '❌';
    console.log(`${icon} chars=${row.charCount} frames=${row.frameCount} retries=${row.retryCount} flags=${row.suppressionFlags.length} (${row.latencyMs}ms)`);

    const hitRate =
      row.outcome === 'error' &&
      (row.qualityIssue?.includes('rate limit') || row.errorCode === 'RATE_LIMITED');
    consecutiveRateLimits = hitRate ? consecutiveRateLimits + 1 : 0;

    if (i < CASES.length - 1) {
      if (consecutiveRateLimits >= 2) {
        console.log(`    ↳ rate-limit 冷却 ${RATE_LIMIT_COOLDOWN_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, RATE_LIMIT_COOLDOWN_MS));
        consecutiveRateLimits = 0;
      } else {
        await new Promise((r) => setTimeout(r, SAMPLE_COOLDOWN_MS));
      }
    }
  }

  const report = formatReport(rows);
  const outPath = `../audit-report-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(outPath, report, 'utf-8');
  console.log(`\n📄 Report written: ${outPath}`);

  const valid    = rows.filter((r) => r.outcome === 'valid').length;
  const degraded = rows.filter((r) => r.outcome === 'degraded').length;
  const errors   = rows.filter((r) => r.outcome === 'error').length;
  console.log(`\n✅ valid=${valid}  ⚠️ degraded=${degraded}  ❌ error=${errors}  (total=${rows.length})`);

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
