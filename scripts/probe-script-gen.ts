// W1-07 script-generation probe — runs the same retry+feedback loop as
// content.generateScript without needing auth or DB. Tests whether the
// tightened 60s prompt + feedback retry can hit the 190-215 char window.
//
// Run: pnpm tsx --env-file=.env.local scripts/probe-script-gen.ts

import { executeWithFallback } from '../src/lib/llm';
import {
  buildScriptPrompt,
  validateScriptLength,
  type GeneratedScript,
} from '../src/lib/prompts/script-templates';

const CASES = [
  {
    productName:    'ContentForge',
    targetAudience: '10-100 人 B2B SaaS 市场负责人',
    coreClaim:      'AI 生成的内容没人看，不是因为 AI 不好，是因为缺少你自己的品牌声音',
  },
  {
    productName:    'LinkBoost',
    targetAudience: '独立开发者 + 小团队',
    coreClaim:      '你的产品没人用，不是因为功能不够，是因为发布渠道单一',
  },
];

const MAX_RETRIES = 3;

const CHAR_TARGET_LO = 190;
const CHAR_TARGET_HI = 215;

async function runCase(idx: number, c: typeof CASES[0]) {
  console.log(`\n=== Case #${idx + 1}: ${c.productName} ===`);
  const { systemPrompt, userPrompt } = buildScriptPrompt({
    formula:        'provocation',
    lengthMode:     'short',
    productName:    c.productName,
    targetAudience: c.targetAudience,
    coreClaim:      c.coreClaim,
  });

  type Best = { charCount: number; frameCount: number; distance: number; valid: boolean; issue: string | null };
  let best: Best | null = null;
  let lastFeedback: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const messages: { role: 'system' | 'user'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ];
    if (lastFeedback) {
      messages.push({
        role: 'user',
        content: `上次输出不合规：${lastFeedback}\n目标字数 190-215（含），最理想是 200-210 字。请精确控制，避免过度修正。只输出 JSON。`,
      });
    }

    const t0 = Date.now();
    let res;
    try {
      res = await executeWithFallback({
        messages,
        intent:     'draft',
        tenantId:   'probe',
        region:     'CN',
        maxTokens:  1500,
        temperature: attempt === 0 ? 0.6 : 0.3,
      });
    } catch (e) {
      console.log(`  attempt ${attempt + 1}: LLM threw ${e instanceof Error ? e.message : e}`);
      return best?.valid ?? false;
    }
    const dt = Date.now() - t0;

    let parsed: GeneratedScript;
    try {
      const raw = res.content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      console.log(`  attempt ${attempt + 1}: bad JSON (${dt}ms)`);
      lastFeedback = '输出不是合法 JSON';
      continue;
    }

    const fullText = parsed.frames.map((f) => f.text).join('');
    const charCount = fullText.replace(/\s/g, '').length;
    const frameCount = parsed.frames.length;
    const v = validateScriptLength(fullText, frameCount, 'short');
    const distance = charCount < CHAR_TARGET_LO ? CHAR_TARGET_LO - charCount
                   : charCount > CHAR_TARGET_HI ? charCount - CHAR_TARGET_HI : 0;

    if (!best || distance < best.distance) {
      best = { charCount, frameCount, distance, valid: v.valid, issue: v.valid ? null : (v.issue ?? null) };
    }

    if (v.valid) {
      console.log(`  ✅ attempt ${attempt + 1} PASS (${dt}ms) chars=${charCount} frames=${frameCount} provider=${res.provider}`);
      return true;
    }
    console.log(`  ❌ attempt ${attempt + 1} (${dt}ms) chars=${charCount} frames=${frameCount} issue=${v.issue}`);
    lastFeedback = v.issue ?? '字数或帧数不合规';
  }

  if (best) {
    const tag = best.valid ? '✅ VALID' : `⚠️  DEGRADED (distance=${best.distance})`;
    console.log(`  → best-of-retries: ${tag} chars=${best.charCount} frames=${best.frameCount}${best.issue ? ` issue=${best.issue}` : ''}`);
  }
  return best?.valid ?? false;
}

async function main() {
  console.log('--- W1-07 script-gen probe (Kimi · 60s 挑衅断言型) ---');
  let pass = 0;
  for (let i = 0; i < CASES.length; i++) {
    if (await runCase(i, CASES[i])) pass++;
  }
  console.log(`\n${pass}/${CASES.length} cases passed`);
  process.exit(pass === CASES.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
