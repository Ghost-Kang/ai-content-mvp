import type { LLMError } from './types';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  rateLimitTimeoutMs: number;
}

const DEFAULTS: BreakerConfig = {
  failureThreshold: 3,
  successThreshold: 1,
  timeoutMs: 30_000,
  // Rate limit windows are typically longer than transient errors — Kimi's 429s
  // often clear in 45-60s. Short-circuiting for 30s means the retry burns the
  // quota before it actually resets.
  rateLimitTimeoutMs: 60_000,
};

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private currentTimeoutMs: number;

  constructor(
    private readonly providerName: string,
    private readonly config: BreakerConfig = DEFAULTS,
  ) {
    this.currentTimeoutMs = config.timeoutMs;
  }

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.currentTimeoutMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  /** Milliseconds until the breaker transitions to HALF_OPEN. 0 if not OPEN. */
  msUntilReset(): number {
    if (this.state !== 'OPEN') return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.currentTimeoutMs - elapsed);
  }

  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  recordFailure(error: LLMError): void {
    this.lastFailureTime = Date.now();
    if (error.code === 'RATE_LIMITED') {
      this.state = 'OPEN';
      this.currentTimeoutMs = this.config.rateLimitTimeoutMs;
      return;
    }
    this.failureCount++;
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.currentTimeoutMs = this.config.timeoutMs;
    }
  }
}

// Module-level singleton — one breaker per provider per process instance.
// Note: in serverless deployments, state is not shared across concurrent invocations.
// Redis-backed state is planned for Sprint 2.
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(providerName: string): CircuitBreaker {
  if (!breakers.has(providerName)) {
    breakers.set(providerName, new CircuitBreaker(providerName));
  }
  return breakers.get(providerName)!;
}
