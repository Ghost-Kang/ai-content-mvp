import { ProviderConfigError, type ProviderName } from './types';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxRetries: number;
}

// Lazy per-provider resolution — only the providers actually wired into the
// routing table need their env vars set. Missing API keys throw
// ProviderConfigError (not plain Error) so executeWithFallback's catch can
// distinguish "deployment problem" from "runtime reliability signal" and
// avoid tripping the circuit breaker on what is actually just config drift.
//
// Prior behavior (before 2026-05-08): plain `Error` thrown here was caught
// in fallback.ts as `UNKNOWN`, recordFailure'd the breaker, and locked out
// the provider permanently from the chain — observed in prod when QWEN_API_KEY
// + ERNIE_API_KEY were missing and the missing-key error tripped breakers
// that no future call could reset.
export function getProviderConfig(name: ProviderName): ProviderConfig {
  switch (name) {
    case 'openai':
      return {
        apiKey:     requireEnv(name, 'OPENAI_API_KEY'),
        model:      process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        maxRetries: 2,
      };
    case 'anthropic':
      return {
        apiKey:     requireEnv(name, 'ANTHROPIC_API_KEY'),
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
        maxRetries: 2,
      };
    case 'ernie':
      return {
        apiKey:     requireEnv(name, 'ERNIE_API_KEY'),
        baseUrl:    'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
        model:      'ernie-4.0-8k',
        maxRetries: 3,
      };
    case 'qwen':
      return {
        apiKey:     requireEnv(name, 'QWEN_API_KEY'),
        baseUrl:    'https://dashscope.aliyuncs.com/api/v1',
        model:      'qwen-max',
        maxRetries: 3,
      };
    case 'kimi':
      return {
        apiKey:     requireEnv(name, 'KIMI_API_KEY'),
        baseUrl:    'https://api.moonshot.cn/v1',
        model:      process.env.KIMI_MODEL ?? 'moonshot-v1-32k',
        maxRetries: 3,
      };
    case 'deepseek':
      return {
        apiKey:     requireEnv(name, 'DEEPSEEK_API_KEY'),
        baseUrl:    'https://api.deepseek.com/v1',
        model:      process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        maxRetries: 3,
      };
  }
}

function requireEnv(provider: ProviderName, key: string): string {
  const value = process.env[key];
  if (!value) throw new ProviderConfigError(provider, `Missing required environment variable: ${key}`);
  return value;
}
