import type { LLMError } from './types';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
}

const DEFAULTS: BreakerConfig = {
  failureThreshold: 3,
  successThreshold: 1,
  timeoutMs: 30_000,
};

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly providerName: string,
    private readonly config: BreakerConfig = DEFAULTS,
  ) {}

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.timeoutMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
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
      return;
    }
    this.failureCount++;
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
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
