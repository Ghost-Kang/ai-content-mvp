// LLM abstraction layer — shared types
// NEVER import provider SDKs directly outside of src/lib/llm/providers/

export type LLMRegion = 'CN' | 'INTL';

export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'ernie'
  | 'qwen'
  | 'kimi';

export type ContentChannel = 'douyin' | 'xiaohongshu';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  intent: 'strategy' | 'draft' | 'channel_adapt' | 'diff_annotate';
  tenantId: string;
  region: LLMRegion;
  preferredProvider?: ProviderName;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  provider: ProviderName;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  requestId: string;
}

export interface LLMStreamChunk {
  delta: string;
  done: boolean;
  requestId: string;
}

export type LLMErrorCode =
  | 'RATE_LIMITED'
  | 'CONTEXT_TOO_LONG'
  | 'CONTENT_FILTERED'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'UNKNOWN';

export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    public provider: ProviderName,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
