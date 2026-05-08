// One-shot probe: confirm DEEPSEEK_API_KEY in .env.local actually
// reaches the API and returns a non-empty completion. Mirrors
// scripts/probe-llm.ts but isolated to deepseek so we don't burn
// other providers' quota during a routing-chain change.
//
// Run: pnpm tsx --env-file=.env.local scripts/probe-deepseek.ts

import { DeepSeekProvider } from '../src/lib/llm/providers/deepseek';

async function main() {
  const provider = new DeepSeekProvider();
  provider.validateConfig();

  console.log('# probe-deepseek');
  console.log(`  base = https://api.deepseek.com/v1`);
  console.log(`  model = ${process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'}`);

  const t0 = Date.now();
  const res = await provider.complete({
    messages: [
      { role: 'system', content: '回答必须是简体中文，且不超过 20 字。' },
      { role: 'user',   content: '说"通"两个字。' },
    ],
    intent:      'draft',
    tenantId:    '00000000-0000-0000-0000-000000000000',
    region:      'CN',
    maxTokens:   32,
    temperature: 0.1,
  });
  const dt = Date.now() - t0;

  console.log(`\n  status: ✅`);
  console.log(`  latency: ${dt}ms (provider-reported ${res.latencyMs}ms)`);
  console.log(`  model: ${res.model}`);
  console.log(`  tokens: prompt=${res.usage.promptTokens} completion=${res.usage.completionTokens}`);
  console.log(`  content: ${JSON.stringify(res.content)}`);
}

main().catch((e) => {
  console.error('probe-deepseek FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
