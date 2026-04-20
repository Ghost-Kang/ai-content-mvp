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

export class OpenAIProvider extends BaseLLMProvider {
  readonly name = 'openai' as const;
  readonly region: LLMRegion = 'INTL';
  readonly preferredIntents: LLMRequest['intent'][] = ['draft', 'channel_adapt'];

  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    super();
    const config = getProviderConfig('openai');
    this.apiKey  = config.apiKey;
    this.model   = config.model;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  validateConfig(): void {
    if (!this.apiKey) throw new Error('OpenAI API key not configured');
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const requestId = randomUUID();

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          messages: request.messages.map((m) => ({
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
        content: data.choices[0]?.message?.content ?? '',
        provider: 'openai',
        model: this.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
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
    throw new Error('Streaming not implemented for Sprint 1');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected normalizeError(raw: unknown): LLMError {
    const r = raw as { status?: number; error?: { code?: string } };
    if (r?.status === 429) {
      return new LLMError('RATE_LIMITED', 'openai', 'OpenAI rate limit hit', true);
    }
    if (r?.status === 401) {
      return new LLMError('AUTH_FAILED', 'openai', 'OpenAI auth failed', false);
    }
    if (r?.error?.code === 'context_length_exceeded') {
      return new LLMError('CONTEXT_TOO_LONG', 'openai', 'Context too long', false);
    }
    return new LLMError('UNKNOWN', 'openai', String(raw), true);
  }
}
