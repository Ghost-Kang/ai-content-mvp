import type { LLMRequest, ProviderName, LLMRegion } from './types';

const ROUTING_TABLE: Record<
  LLMRegion,
  Record<LLMRequest['intent'], ProviderName[]>
> = {
  CN: {
    strategy:      ['kimi', 'qwen', 'ernie'],
    draft:         ['qwen', 'ernie', 'kimi'],
    channel_adapt: ['qwen', 'kimi', 'ernie'],
    diff_annotate: ['kimi', 'qwen', 'ernie'],
  },
  INTL: {
    strategy:      ['anthropic', 'openai'],
    draft:         ['openai', 'anthropic'],
    channel_adapt: ['openai', 'anthropic'],
    diff_annotate: ['anthropic', 'openai'],
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
