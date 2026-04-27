import type { LLMRequest, ProviderName, LLMRegion } from './types';

// Primary route is still Kimi for CN-first cost/latency. Add OpenAI as a
// hot standby so transient Kimi throttling does not block workflow probes
// and long-running chained executions.
const ROUTING_TABLE: Record<
  LLMRegion,
  Record<LLMRequest['intent'], ProviderName[]>
> = {
  CN: {
    strategy:      ['kimi', 'openai'],
    draft:         ['kimi', 'openai'],
    channel_adapt: ['kimi', 'openai'],
    diff_annotate: ['kimi', 'openai'],
  },
  INTL: {
    strategy:      ['kimi', 'openai'],
    draft:         ['kimi', 'openai'],
    channel_adapt: ['kimi', 'openai'],
    diff_annotate: ['kimi', 'openai'],
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
