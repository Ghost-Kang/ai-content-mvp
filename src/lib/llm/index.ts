// Public API for the LLM abstraction layer.
// All application code imports exclusively from this file.
// Never import from providers/* or factory.ts directly.

export { executeWithFallback } from './fallback';
export type {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMMessage,
  LLMRegion,
  ProviderName,
  ContentChannel,
  LLMErrorCode,
} from './types';
export { LLMError } from './types';
