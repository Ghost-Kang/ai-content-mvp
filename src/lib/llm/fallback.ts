import { resolveProviderChain } from './router';
import { getProvider } from './factory';
import { getCircuitBreaker } from './circuit-breaker';
import { LLMError } from './types';
import type { LLMRequest, LLMResponse } from './types';

export async function executeWithFallback(
  request: LLMRequest,
): Promise<LLMResponse> {
  const chain = resolveProviderChain(request);
  const errors: LLMError[] = [];

  for (const providerName of chain) {
    const breaker = getCircuitBreaker(providerName);

    if (breaker.isOpen()) {
      continue;
    }

    const provider = getProvider(providerName);

    try {
      const response = await provider.complete(request);
      breaker.recordSuccess();
      return response;
    } catch (err) {
      const llmError =
        err instanceof LLMError
          ? err
          : new LLMError('UNKNOWN', providerName, String(err), true);

      breaker.recordFailure(llmError);
      errors.push(llmError);

      // Content policy and auth failures must surface immediately — silent fallback
      // would mask the actual problem and produce unexpected output for users.
      if (!llmError.retryable) {
        throw llmError;
      }
    }
  }

  throw new LLMError(
    'PROVIDER_UNAVAILABLE',
    chain[0],
    `All providers exhausted. Errors: ${errors.map((e) => e.message).join('; ')}`,
    false,
  );
}
