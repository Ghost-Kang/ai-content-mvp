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

  protected async fetchWithTimeout(
    input: string | URL | Request,
    init: RequestInit = {},
    timeoutMs = Number(process.env.LLM_PROVIDER_TIMEOUT_MS ?? 60_000),
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }
}
