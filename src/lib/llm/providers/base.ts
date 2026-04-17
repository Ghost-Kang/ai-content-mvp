import type {
  ProviderName,
  LLMRegion,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMError,
} from '../types';

export abstract class BaseLLMProvider {
  abstract readonly name: ProviderName;
  abstract readonly region: LLMRegion;
  abstract readonly preferredIntents: LLMRequest['intent'][];

  abstract complete(request: LLMRequest): Promise<LLMResponse>;

  abstract stream(
    request: LLMRequest,
    onChunk: (chunk: LLMStreamChunk) => void,
  ): Promise<LLMResponse>;

  abstract healthCheck(): Promise<boolean>;

  protected abstract normalizeError(raw: unknown): LLMError;

  abstract validateConfig(): void;
}
