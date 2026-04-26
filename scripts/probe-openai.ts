// One-shot — sanity check OpenAI provider works.
// Run: pnpm tsx --env-file=.env.local scripts/probe-openai.ts

import { OpenAIProvider } from '../src/lib/llm/providers/openai';

async function main() {
  const p = new OpenAIProvider();
  console.log('OpenAI key present:', !!process.env.OPENAI_API_KEY);
  console.log('OpenAI model:', process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

  const t0 = Date.now();
  try {
    const r = await p.complete({
      messages: [
        { role: 'user', content: '说"hello"两个字，不要任何其他内容。' },
      ],
      intent:    'draft',
      tenantId:  '00000000-0000-0000-0000-000000000000',
      region:    'INTL',
      maxTokens: 50,
    });
    console.log(`✓ ${Date.now() - t0}ms`);
    console.log(`  model: ${r.model}`);
    console.log(`  content: ${JSON.stringify(r.content)}`);
    console.log(`  tokens: ${r.usage.totalTokens}`);
  } catch (e) {
    console.log(`✗ ${Date.now() - t0}ms`);
    console.log(e);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
