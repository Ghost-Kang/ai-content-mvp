import type { LLMRequest, ProviderName, LLMRegion } from './types';

// CN compliance — 《数据安全法》/《个人信息保护法》:
// CN tenants 的用户数据（topic / niche / 脚本 / 分镜 / 反馈 etc.）
// **不允许出境** —— CN 路由必须 100% 走 domestic provider（kimi / qwen / ernie）。
// 任何 foreign provider（openai / anthropic）只能挂在 INTL 链上。
//
// 历史: 2026-04-27 Cursor commit `e3c1968` 把 openai 加进了 CN 的 fallback
// 链以缓解 Kimi 限流，被本次 commit 撤回。CN Kimi 限流真出问题时，
// 加 qwen / ernie 作为 domestic fallback，**不要**再把 foreign provider
// 塞回 CN 链。

const FOREIGN_PROVIDERS: ReadonlySet<ProviderName> = new Set([
  'openai',
  'anthropic',
]);

const ROUTING_TABLE: Record<
  LLMRegion,
  Record<LLMRequest['intent'], ProviderName[]>
> = {
  // CN — kimi primary, qwen + ernie as domestic fallback (audit #5, 2026-04-30).
  // Kimi rate-limit / outage used to mean 100% CN failures; the fallback chain
  // means a single provider hiccup degrades to slower-but-working domestic
  // providers. assertCnRoutingCompliance below guarantees no foreign provider
  // ever sneaks in here.
  CN: {
    strategy:      ['kimi', 'qwen', 'ernie'],
    draft:         ['kimi', 'qwen', 'ernie'],
    channel_adapt: ['kimi', 'qwen', 'ernie'],
    diff_annotate: ['kimi', 'qwen', 'ernie'],
  },
  INTL: {
    strategy:      ['kimi', 'openai'],
    draft:         ['kimi', 'openai'],
    channel_adapt: ['kimi', 'openai'],
    diff_annotate: ['kimi', 'openai'],
  },
};

// Build-time guard: any future edit that puts a foreign provider into the
// CN chain (or accidentally swaps regions) explodes on module load instead
// of silently exfiltrating CN user data. Cheap insurance against the kind
// of "small refactor" that PRD v0 explicitly calls out as "compliance cannot
// be retrofitted".
(function assertCnRoutingCompliance(): void {
  for (const intent of Object.keys(ROUTING_TABLE.CN) as Array<
    keyof (typeof ROUTING_TABLE)['CN']
  >) {
    const chain = ROUTING_TABLE.CN[intent];
    const offenders = chain.filter((p) => FOREIGN_PROVIDERS.has(p));
    if (offenders.length > 0) {
      throw new Error(
        `[llm/router] CN routing chain for intent=${intent} contains foreign providers ` +
          `(${offenders.join(', ')}). CN tenants must stay on domestic providers ` +
          `(数据安全法 / 个人信息保护法). Add qwen/ernie instead — never openai/anthropic.`,
      );
    }
  }
})();

export function resolveProviderChain(request: LLMRequest): ProviderName[] {
  const baseChain = ROUTING_TABLE[request.region][request.intent];

  if (request.preferredProvider) {
    // CN must never widen the chain to a foreign provider, even if the caller
    // explicitly asks for one. The build-time guard above protects the table;
    // this protects the dynamic path. Silently drop the preference rather
    // than throw — the request still completes via the compliant chain.
    if (request.region === 'CN' && FOREIGN_PROVIDERS.has(request.preferredProvider)) {
      return baseChain;
    }
    return [
      request.preferredProvider,
      ...baseChain.filter((p) => p !== request.preferredProvider),
    ];
  }
  return baseChain;
}
