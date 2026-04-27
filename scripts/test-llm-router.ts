// LLM router compliance + fallback tests.
//
// Why exist: PRD v0 / 数据安全法 / 个人信息保护法 require CN tenant data
// stay on domestic providers. A previous Cursor commit silently added
// `openai` to the CN fallback chain — caught by manual review, but a
// future edit could re-introduce it. This test locks the rule down so
// the regression can't slip past CI.
//
// Pure in-memory: no DB, no network, no LLM calls.

import {
  resolveProviderChain,
} from '../src/lib/llm/router';
import type { LLMRequest, ProviderName } from '../src/lib/llm/types';

const FOREIGN_PROVIDERS: ProviderName[] = ['openai', 'anthropic'];

const INTENTS: LLMRequest['intent'][] = [
  'strategy',
  'draft',
  'channel_adapt',
  'diff_annotate',
];

let failures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${tag}] ${msg}`);
};

function makeReq(
  region:            'CN' | 'INTL',
  intent:            LLMRequest['intent'],
  preferredProvider?: ProviderName,
): LLMRequest {
  return {
    messages:    [{ role: 'user', content: 'test' }],
    intent,
    tenantId:    'test-tenant',
    region,
    ...(preferredProvider ? { preferredProvider } : {}),
  };
}

// ─── Compliance: CN must never include foreign providers ─────────────────────

console.log('\n[compliance] CN chain has zero foreign providers (any intent)');
for (const intent of INTENTS) {
  const chain = resolveProviderChain(makeReq('CN', intent));
  const offenders = chain.filter((p) => FOREIGN_PROVIDERS.includes(p));
  expect(
    offenders.length === 0,
    `CN/${intent} chain has no foreign providers (got [${chain.join(',')}])`,
  );
  expect(chain.includes('kimi'), `CN/${intent} chain includes kimi`);
}

console.log('\n[compliance] CN ignores foreign preferredProvider');
for (const intent of INTENTS) {
  for (const foreign of FOREIGN_PROVIDERS) {
    const chain = resolveProviderChain(makeReq('CN', intent, foreign));
    expect(
      !chain.includes(foreign),
      `CN/${intent} drops preferredProvider=${foreign} (got [${chain.join(',')}])`,
    );
  }
}

console.log('\n[compliance] CN honors domestic preferredProvider');
const chainPrefKimi = resolveProviderChain(makeReq('CN', 'strategy', 'kimi'));
expect(
  chainPrefKimi[0] === 'kimi',
  `CN/strategy with preferredProvider=kimi puts kimi first (got [${chainPrefKimi.join(',')}])`,
);

// ─── Functional: INTL fallback chain ─────────────────────────────────────────

console.log('\n[functional] INTL chain = [kimi, openai] for all intents');
for (const intent of INTENTS) {
  const chain = resolveProviderChain(makeReq('INTL', intent));
  expect(
    chain.length === 2 && chain[0] === 'kimi' && chain[1] === 'openai',
    `INTL/${intent} chain = [kimi, openai] (got [${chain.join(',')}])`,
  );
}

console.log('\n[functional] INTL preferredProvider moves to front, no duplicate');
const intlPref = resolveProviderChain(makeReq('INTL', 'strategy', 'openai'));
expect(
  intlPref[0] === 'openai',
  `INTL preferredProvider=openai goes first (got [${intlPref.join(',')}])`,
);
expect(
  intlPref.filter((p) => p === 'openai').length === 1,
  `INTL preferredProvider=openai not duplicated (got [${intlPref.join(',')}])`,
);
expect(
  intlPref.includes('kimi'),
  `INTL preferredProvider=openai keeps kimi in chain (got [${intlPref.join(',')}])`,
);

// ─── Module-load guard ───────────────────────────────────────────────────────
// The IIFE in router.ts is what enforces the table-level rule. If it ever
// stops throwing on a CN/foreign mix, this test alone wouldn't catch it,
// but the import above would already have crashed before we got here. So
// reaching this line means the guard ran without error on a clean table —
// good. (We don't dynamically mutate ROUTING_TABLE to test the throwing
// case because the table is module-private.)

console.log('\n[guard] router.ts loaded without throwing — table is compliant');
expect(true, 'module loaded clean');

if (failures === 0) {
  console.log('\n✅ All router compliance assertions pass.');
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} assertion(s) failed.`);
  process.exit(1);
}
