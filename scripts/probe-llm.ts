// W1-05 LLM smoke probe
// Run: pnpm llm:probe
//
// Hits executeWithFallback() with 3 different draft prompts and asserts
// each returns non-empty content. Uses real OpenAI billing — keep prompts
// tiny and runs infrequent.

import { executeWithFallback } from '../src/lib/llm';

const PROMPTS = [
  '用一句话（不超过 30 字）说明什么是抖音 60 秒短视频公式一「挑衅断言型」。',
  '给一个 SaaS 产品起一个中文名，要求 3-5 字，返回仅产品名。',
  '用一句话解释"抑制清单"在 AI 内容生成里的作用，30 字以内。',
];

async function main() {
  console.log('--- W1-05 LLM probe (intent=draft) ---');
  let failures = 0;

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    const label  = `#${i + 1}`;
    try {
      const res = await executeWithFallback({
        messages: [
          { role: 'system', content: 'You answer in concise Chinese. Keep responses under 60 characters.' },
          { role: 'user',   content: prompt },
        ],
        intent:   'draft',
        tenantId: 'probe',
        region:   'INTL',
        maxTokens:   200,
        temperature: 0.3,
      });

      const ok = typeof res.content === 'string' && res.content.trim().length > 0;
      console.log(
        `  [${ok ? 'PASS' : 'FAIL'}] ${label} provider=${res.provider} model=${res.model} ` +
          `latency=${res.latencyMs}ms chars=${res.content.length}`,
      );
      console.log(`    prompt: ${prompt}`);
      console.log(`    reply : ${res.content.trim().slice(0, 80)}${res.content.length > 80 ? '…' : ''}`);
      if (!ok) failures++;
    } catch (e) {
      failures++;
      console.log(`  [FAIL] ${label} threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (failures === 0) {
    console.log('\n✅ 3/3 draft calls returned non-empty content.');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures}/${PROMPTS.length} failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Probe errored:', e);
  process.exit(1);
});
