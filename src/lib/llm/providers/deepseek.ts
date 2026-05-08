import { BaseLLMProvider } from './base';
import { LLMError, ProviderConfigError } from '../types';
import { getProviderConfig } from '../config';
import { randomUUID } from 'crypto';
import type { LLMRequest, LLMResponse, LLMStreamChunk, LLMRegion } from '../types';

// DeepSeek (深度求索) — 国内 LLM，OpenAI-compatible API。Region=CN so the
// router-level `assertCnRoutingCompliance` accepts it. Used as the
// near-term fallback for kimi while QWEN_API_KEY / ERNIE_API_KEY are
// missing in prod (2026-05-08 incident: kimi 60s timeout + chain had
// no working domestic fallback).
export class DeepSeekProvider extends BaseLLMProvider {
  readonly name = 'deepseek' as const;
  readonly region: LLMRegion = 'CN';
  readonly preferredIntents: LLMRequest['intent'][] = ['draft', 'channel_adapt'];

  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    super();
    const config = getProviderConfig('deepseek');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl!;
  }

  validateConfig(): void {
    if (!this.apiKey) throw new ProviderConfigError('deepseek', 'DeepSeek API key not configured');
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const requestId = randomUUID();

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model:       this.model,
          max_tokens:  request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          messages:    request.messages.map((m) => ({
            role:    m.role,
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
        content:  data.choices[0]?.message?.content ?? '',
        provider: 'deepseek',
        model:    this.model,
        usage: {
          promptTokens:     data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens:      data.usage?.total_tokens ?? 0,
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
      const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected normalizeError(raw: unknown): LLMError {
    const r = raw as { status?: number; error?: { type?: string; message?: string } };
    const type = r?.error?.type ?? '';
    const msg  = r?.error?.message ?? '';
    if (r?.status === 429) {
      // DeepSeek 429 is generally rate-limit; quota/billing reads as
      // "Insufficient Balance" in the message body.
      if (/balance|quota|insufficient/i.test(msg)) {
        return new LLMError('AUTH_FAILED', 'deepseek', `DeepSeek quota/billing: ${msg || type}`, false);
      }
      return new LLMError('RATE_LIMITED', 'deepseek', 'DeepSeek rate limit hit', true);
    }
    if (r?.status === 401) {
      return new LLMError('AUTH_FAILED', 'deepseek', 'DeepSeek auth failed', false);
    }
    return new LLMError('UNKNOWN', 'deepseek', msg || String(raw), true);
  }
}
