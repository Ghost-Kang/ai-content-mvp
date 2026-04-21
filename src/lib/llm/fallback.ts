import { resolveProviderChain } from './router';
import { getProvider } from './factory';
import { getCircuitBreaker } from './circuit-breaker';
import { LLMError } from './types';
import type { LLMRequest, LLMResponse, ProviderName } from './types';

export async function executeWithFallback(
  request: LLMRequest,
): Promise<LLMResponse> {
  const chain = resolveProviderChain(request);
  const errors: LLMError[] = [];
  const skippedOpen: { provider: ProviderName; msUntilReset: number }[] = [];

  for (const providerName of chain) {
    const breaker = getCircuitBreaker(providerName);

    if (breaker.isOpen()) {
      skippedOpen.push({ provider: providerName, msUntilReset: breaker.msUntilReset() });
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

  // Every provider is either cooling down or just rate-limited. Surface the
  // soonest reset time so callers (and the UI) can wait instead of hammering.
  if (errors.length === 0 && skippedOpen.length > 0) {
    const soonest = skippedOpen.reduce((a, b) =>
      a.msUntilReset < b.msUntilReset ? a : b,
    );
    throw new LLMError(
      'RATE_LIMITED',
      soonest.provider,
      `All providers cooling down. Soonest reset: ${Math.ceil(soonest.msUntilReset / 1000)}s (${soonest.provider})`,
      true,
    );
  }

  throw new LLMError(
    'PROVIDER_UNAVAILABLE',
    chain[0],
    `All providers exhausted. Errors: ${errors.map((e) => e.message).join('; ')}`,
    false,
  );
}
