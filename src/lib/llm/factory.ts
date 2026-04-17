import type { ProviderName } from './types';
import type { BaseLLMProvider } from './providers/base';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { QwenProvider } from './providers/qwen';
import { KimiProvider } from './providers/kimi';
import { ErnieProvider } from './providers/ernie';

// Module-level singletons — instantiated once, reused across requests in same process
const providers = new Map<ProviderName, BaseLLMProvider>();

function buildProvider(name: ProviderName): BaseLLMProvider {
  switch (name) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai':    return new OpenAIProvider();
    case 'qwen':      return new QwenProvider();
    case 'kimi':      return new KimiProvider();
    case 'ernie':     return new ErnieProvider();
  }
}

export function getProvider(name: ProviderName): BaseLLMProvider {
  if (!providers.has(name)) {
    const p = buildProvider(name);
    p.validateConfig();
    providers.set(name, p);
  }
  return providers.get(name)!;
}
