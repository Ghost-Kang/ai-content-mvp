import type { ProviderName } from './types';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxRetries: number;
}

export function getProviderConfig(name: ProviderName): ProviderConfig {
  const configs: Record<ProviderName, ProviderConfig> = {
    openai: {
      apiKey: requireEnv('OPENAI_API_KEY'),
      model: 'gpt-4o',
      maxRetries: 2,
    },
    anthropic: {
      apiKey: requireEnv('ANTHROPIC_API_KEY'),
      model: 'claude-sonnet-4-6',
      maxRetries: 2,
    },
    ernie: {
      apiKey: requireEnv('ERNIE_API_KEY'),
      baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
      model: 'ernie-4.0-8k',
      maxRetries: 3,
    },
    qwen: {
      apiKey: requireEnv('QWEN_API_KEY'),
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      model: 'qwen-max',
      maxRetries: 3,
    },
    kimi: {
      apiKey: requireEnv('KIMI_API_KEY'),
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-128k',
      maxRetries: 3,
    },
  };
  return configs[name];
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
