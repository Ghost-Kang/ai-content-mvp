import type { ProviderName } from './types';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxRetries: number;
}

// Lazy per-provider resolution — only the providers actually wired into the
// routing table need their env vars set. MVP currently uses openai only.
export function getProviderConfig(name: ProviderName): ProviderConfig {
  switch (name) {
    case 'openai':
      return {
        apiKey:     requireEnv('OPENAI_API_KEY'),
        model:      process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        maxRetries: 2,
      };
    case 'anthropic':
      return {
        apiKey:     requireEnv('ANTHROPIC_API_KEY'),
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
        maxRetries: 2,
      };
    case 'ernie':
      return {
        apiKey:     requireEnv('ERNIE_API_KEY'),
        baseUrl:    'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
        model:      'ernie-4.0-8k',
        maxRetries: 3,
      };
    case 'qwen':
      return {
        apiKey:     requireEnv('QWEN_API_KEY'),
        baseUrl:    'https://dashscope.aliyuncs.com/api/v1',
        model:      'qwen-max',
        maxRetries: 3,
      };
    case 'kimi':
      return {
        apiKey:     requireEnv('KIMI_API_KEY'),
        baseUrl:    'https://api.moonshot.cn/v1',
        model:      process.env.KIMI_MODEL ?? 'moonshot-v1-8k',
        maxRetries: 3,
      };
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
