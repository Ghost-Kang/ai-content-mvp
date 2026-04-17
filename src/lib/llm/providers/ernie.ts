import { BaseLLMProvider } from './base';
import { LLMError } from '../types';
import { getProviderConfig } from '../config';
import { randomUUID } from 'crypto';
import type { LLMRequest, LLMResponse, LLMStreamChunk, LLMRegion } from '../types';

export class ErnieProvider extends BaseLLMProvider {
  readonly name = 'ernie' as const;
  readonly region: LLMRegion = 'CN';
  readonly preferredIntents: LLMRequest['intent'][] = ['draft'];

  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor() {
    super();
    const config = getProviderConfig('ernie');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl!;
  }

  validateConfig(): void {
    if (!this.apiKey) throw new Error('ERNIE API key not configured');
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // ERNIE uses a separate OAuth token endpoint
    const [apiKey, secretKey] = this.apiKey.split(':');
    const res = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
      { method: 'POST' },
    );

    if (!res.ok) {
      throw new LLMError('AUTH_FAILED', 'ernie', 'Failed to get ERNIE access token', false);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const requestId = randomUUID();
    const token = await this.ensureAccessToken();

    try {
      const endpoint = `${this.baseUrl}/chat/${this.model}?access_token=${token}`;
      const systemMessage = request.messages.find((m) => m.role === 'system');
      const chatMessages = request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));

      const body: Record<string, unknown> = {
        messages: chatMessages,
        temperature: request.temperature ?? 0.7,
      };
      if (systemMessage) {
        body.system = systemMessage.content;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw this.normalizeError({ status: res.status, error });
      }

      const data = await res.json();

      return {
        content: data.result ?? '',
        provider: 'ernie',
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
      await this.ensureAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  protected normalizeError(raw: unknown): LLMError {
    const r = raw as { status?: number; error?: { error_code?: number } };
    if (r?.status === 429 || r?.error?.error_code === 336100) {
      return new LLMError('RATE_LIMITED', 'ernie', 'ERNIE rate limit hit', true);
    }
    if (r?.status === 401) {
      return new LLMError('AUTH_FAILED', 'ernie', 'ERNIE auth failed', false);
    }
    return new LLMError('UNKNOWN', 'ernie', String(raw), true);
  }
}
