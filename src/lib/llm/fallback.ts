import { resolveProviderChain } from './router';
import { getProvider } from './factory';
import { getCircuitBreaker } from './circuit-breaker';
import { checkSpendCap, recordSpend } from './spend-tracker';
import { LLMError, ProviderConfigError } from './types';
import type { LLMRequest, LLMResponse, ProviderName } from './types';

export async function executeWithFallback(
  request: LLMRequest,
): Promise<LLMResponse> {
  const chain = resolveProviderChain(request);

  // W4-01 — spend cap gate. Fail closed before spending a single token.
  const cap = await checkSpendCap(request.tenantId);
  if (!cap.allowed) {
    throw new LLMError(
      'SPEND_CAP_EXCEEDED',
      chain[0],
      cap.reason === 'global_cap'
        ? `Global daily cap hit: ${cap.globalSpentFen}/${cap.globalCapFen} 分`
        : `Tenant daily cap hit: ${cap.tenantSpentFen}/${cap.tenantCapFen} 分`,
      false,
    );
  }

  const errors: LLMError[] = [];
  const skippedOpen: { provider: ProviderName; msUntilReset: number }[] = [];

  for (const providerName of chain) {
    const breaker = getCircuitBreaker(providerName);

    if (breaker.isOpen()) {
      skippedOpen.push({ provider: providerName, msUntilReset: breaker.msUntilReset() });
      continue;
    }

    try {
      const provider = getProvider(providerName);
      const response = await provider.complete(request);
      breaker.recordSuccess();
      // Fire-and-forget accounting — don't block on DB writes.
      void recordSpend(request.tenantId, response.provider, response.usage.totalTokens);
      return response;
    } catch (err) {
      // Missing API key: this is a deployment problem, not a runtime
      // reliability signal. Skip to the next provider WITHOUT touching the
      // breaker — recording a failure here would burn the (still healthy)
      // provider's budget every time the chain hits an unconfigured slot.
      // We still record an LLMError in `errors` so the final
      // "all providers exhausted" message is actionable.
      if (err instanceof ProviderConfigError) {
        errors.push(new LLMError('AUTH_FAILED', providerName, err.message, false));
        continue;
      }

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
