import { BaseLLMProvider } from './base';
import { LLMError } from '../types';
import { getProviderConfig } from '../config';
import { randomUUID } from 'crypto';
import type {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMRegion,
} from '../types';

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = 'anthropic' as const;
  readonly region: LLMRegion = 'INTL';
  readonly preferredIntents: LLMRequest['intent'][] = ['strategy', 'diff_annotate'];

  private apiKey: string;
  private model: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor() {
    super();
    const config = getProviderConfig('anthropic');
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  validateConfig(): void {
    if (!this.apiKey) throw new Error('Anthropic API key not configured');
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const requestId = randomUUID();

    const systemMessage = request.messages.find((m) => m.role === 'system');
    const userMessages = request.messages.filter((m) => m.role !== 'system');

    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          system: systemMessage?.content,
          messages: userMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw this.normalizeError({ status: res.status, error });
      }

      const data = await res.json();

      return {
        content: data.content[0]?.text ?? '',
        provider: 'anthropic',
        model: this.model,
        usage: {
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
          totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
        latencyMs: Date.now() - start,
        requestId,
      };
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw this.normalizeError(err);
    }
  }

  async stream(
    _request: LLMRequest,
    _onChunk: (chunk: LLMStreamChunk) => void,
  ): Promise<LLMResponse> {
    // Streaming implementation placeholder — Sprint 1 uses non-streaming complete()
    throw new Error('Streaming not implemented for Sprint 1');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected normalizeError(raw: unknown): LLMError {
    const r = raw as { status?: number; error?: { type?: string } };
    if (r?.status === 429) {
      return new LLMError('RATE_LIMITED', 'anthropic', 'Anthropic rate limit hit', true);
    }
    if (r?.status === 401) {
      return new LLMError('AUTH_FAILED', 'anthropic', 'Anthropic auth failed', false);
    }
    if (r?.error?.type === 'invalid_request_error') {
      return new LLMError('CONTEXT_TOO_LONG', 'anthropic', 'Context too long', false);
    }
    return new LLMError('UNKNOWN', 'anthropic', String(raw), true);
  }
}
