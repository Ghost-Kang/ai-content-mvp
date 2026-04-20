import type { LLMRequest, ProviderName, LLMRegion } from './types';

// MVP v2.0: kimi (Moonshot) only, both regions. Other providers remain in
// the codebase so we can fan out later without a refactor — just add them
// back into these chains and ensure their env vars are set.
const ROUTING_TABLE: Record<
  LLMRegion,
  Record<LLMRequest['intent'], ProviderName[]>
> = {
  CN: {
    strategy:      ['kimi'],
    draft:         ['kimi'],
    channel_adapt: ['kimi'],
    diff_annotate: ['kimi'],
  },
  INTL: {
    strategy:      ['kimi'],
    draft:         ['kimi'],
    channel_adapt: ['kimi'],
    diff_annotate: ['kimi'],
  },
};

export function resolveProviderChain(request: LLMRequest): ProviderName[] {
  if (request.preferredProvider) {
    const chain = ROUTING_TABLE[request.region][request.intent];
    return [
      request.preferredProvider,
      ...chain.filter((p) => p !== request.preferredProvider),
    ];
  }
  return ROUTING_TABLE[request.region][request.intent];
}
