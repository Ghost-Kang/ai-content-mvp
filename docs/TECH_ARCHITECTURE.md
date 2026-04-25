# AI Content Marketing Studio — Technical Architecture

**Document Status**: Sprint 1 Build Spec Baseline
**Date**: 2026-04-17
**Audience**: Engineering team

---

## 1. System Architecture Overview

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  Next.js 14 App Router (TypeScript)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Quick Create │  │Strategy-First│  │   Review Workspace       │  │
│  │    Wizard    │  │    Flow      │  │   (Solo / Team)          │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
└─────────┼────────────────┼──────────────────────┼─────────────────┘
          │                │                       │
          ▼                ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API LAYER                                   │
│  Next.js API Routes + tRPC (type-safe end-to-end)                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Auth Middleware (Clerk)  │  Tenant Middleware  │  Rate Limit │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐   │
│  │  /content  │ │  /strategy   │ │  /review   │ │  /analytics  │   │
│  └────────────┘ └──────────────┘ └────────────┘ └──────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌─────────────────┐  ┌───────────────┐  ┌────────────────┐
│  GENERATION     │  │   WORKFLOW    │  │  ANALYTICS     │
│  SERVICE        │  │   ENGINE      │  │  SERVICE       │
│                 │  │               │  │                │
│ LLM Abstraction │  │ State Machine │  │ PostHog        │
│ Prompt Builder  │  │ Review Queue  │  │ Event Pipeline │
│ Diff Annotator  │  │ Notifier      │  │                │
└────────┬────────┘  └───────┬───────┘  └────────────────┘
         │                   │
         ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                   │
│  ┌─────────────────────┐     ┌─────────────────────────────────┐   │
│  │  Supabase Postgres  │     │  Upstash Redis (job queue +     │   │
│  │  (primary store)    │     │  rate limit + SSE state)        │   │
│  │  Row-Level Security │     └─────────────────────────────────┘   │
│  └─────────────────────┘     ┌─────────────────────────────────┐   │
│                               │  Vercel Blob / Cloudflare R2   │   │
│                               │  (exported assets, Xiaohongshu  │   │
│                               │  image attachments)             │   │
│                               └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    LLM PROVIDER MESH                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────┐  │
│  │ OpenAI   │  │Anthropic │  │  ERNIE   │  │  Qwen  │  │ Kimi  │  │
│  │  (INT)   │  │  (INT)   │  │  (CN)    │  │  (CN)  │  │ (CN)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  └───────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Monolithic deployment, modular code structure.** Given a 4-person-equivalent sprint team, the operational overhead of microservices is unjustifiable. The generation service, workflow engine, and API are co-deployed as a single Next.js application. They are separated as distinct modules with explicit interfaces so extraction later is mechanical, not architectural. The alternative — separate services from day one — would consume 40% of sprint capacity on infrastructure wiring.

**tRPC over REST for internal API.** The entire client-to-server surface is type-safe without a code generation step. This matters because the content lifecycle has complex nested types (variants, diff annotations, review states) that are error-prone without type propagation. REST with OpenAPI generation was considered but adds a build step and a schema-drift surface.

**Supabase over direct Postgres.** Row-Level Security (RLS) at the database layer is the primary enforcement mechanism for tenant isolation — this is non-negotiable given D8. Supabase gives RLS, real-time subscriptions (used for review state updates in Team mode), and a managed Postgres instance. The alternative — self-managed Postgres on a VPS — requires setting up RLS manually and adds an ops surface a 4-week sprint cannot absorb.

**Clerk for authentication.** Clerk handles multi-tenant org management natively (Solo = personal account, Team = org with members), JWT claims carry `tenantId` and `region`, which flow into LLM routing and RLS. The alternative — NextAuth — does not have first-class org primitives and would require building the team membership layer from scratch.

**Upstash Redis for job queue.** LLM calls are long-running (5–30 seconds). They must be queued, not awaited synchronously in API routes. Upstash's serverless Redis + QStash (HTTP-based job queue with retries) integrates directly with Vercel's edge runtime without managing a worker process. Alternative: BullMQ requires a persistent Node process, which complicates Vercel deployment.

### Technology Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.x |
| Language | TypeScript | 5.x |
| API contract | tRPC | 11.x |
| Auth | Clerk | latest |
| Database | Supabase (Postgres 15) | managed |
| Cache / Queue | Upstash Redis + QStash | serverless |
| File storage | Cloudflare R2 | S3-compatible |
| Deployment | Vercel (International) + Alibaba Cloud Function Compute (CN) | — |
| Analytics | PostHog (self-hosted on Alibaba Cloud for CN users) | latest |
| ORM | Drizzle ORM | 0.30.x |
| Styling | Tailwind CSS + shadcn/ui | — |
| Testing | Vitest + Playwright | — |

**Deployment topology note**: CN users hit an Alibaba Cloud Function Compute endpoint; international users hit Vercel. Both deployments share the same codebase. The routing decision happens at the CDN layer (Cloudflare for international, Alibaba CDN for CN) based on client IP geolocation. This is required by D3 and 《数据安全法》.

### Build vs. Buy

| Component | Decision | Rationale |
|---|---|---|
| LLM abstraction layer | Build | No existing library covers all 5 providers with the routing logic required |
| Auth + multi-tenant | Buy (Clerk) | Org management is solved; reinventing adds 2+ weeks |
| State machine | Build (lightweight) | The review workflow is simple enough (6 states) that XState is over-engineered; a plain enum + transition table is sufficient |
| Diff annotation | Build | No library produces "what changed + why" for marketing copy; this is a prompt-engineering output, not an algorithmic diff |
| AI content labeling (Douyin) | Build | CAC requirements are implementation-specific; no library handles this |
| Analytics events | Buy (PostHog) | Autocapture + custom events covers all 8 required events |

---

## 2. LLM Provider Abstraction Layer

**Complexity: High**

This is the highest-risk component. It must be correct at launch because swapping providers mid-sprint breaks in-flight content generation.

### Design Principles

- The rest of the application never imports a provider SDK directly — only through this layer
- Routing is determined at request time from the tenant's `region` claim in the JWT
- Fallback logic is provider-aware (CN fallback chain stays within CN; international stays within international)
- All provider calls are instrumented for latency, token counts, and failure mode before reaching the application layer

### File Structure

```
src/
  lib/
    llm/
      index.ts                    # Public API — only export used by app code
      types.ts                    # Shared interfaces and enums
      router.ts                   # Routing logic
      factory.ts                  # Provider instantiation
      providers/
        base.ts                   # Abstract base class
        openai.ts
        anthropic.ts
        ernie.ts                  # 文心一言
        qwen.ts                   # 通义千问
        kimi.ts
      fallback.ts                 # Fallback chain executor
      circuit-breaker.ts          # Per-provider circuit breaker state
      config.ts                   # Credential loading + routing rules
```

### Core Type Definitions

```typescript
// src/lib/llm/types.ts

export type LLMRegion = 'CN' | 'INTL';

export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'ernie'
  | 'qwen'
  | 'kimi';

// v1.1: enum holds all 4 channels so D10 Plan B (revert to wechat_official+linkedin)
// is a feature-flag flip, not a schema/type migration. Sprint 1 enables only the 2
// channels surfaced by `SPRINT1_ENABLED_CHANNELS` below.
export type ContentChannel = 'douyin' | 'xiaohongshu' | 'wechat_official' | 'linkedin';

// Feature flag — Sprint 1 default reflects D10-P (provisional, validated 2026-04-23).
// On D10 falsification, flip to ['wechat_official', 'linkedin'] without touching DB.
export const SPRINT1_ENABLED_CHANNELS: ContentChannel[] = ['douyin', 'xiaohongshu'];

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  // Caller declares intent; router uses this to select optimal provider
  // within the region (e.g., Kimi is preferred for long-form reasoning)
  intent: 'strategy' | 'draft' | 'channel_adapt' | 'diff_annotate';
  tenantId: string;
  region: LLMRegion;
  // Optional override — used in admin/debug scenarios only
  preferredProvider?: ProviderName;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  provider: ProviderName;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  requestId: string;
}

export interface LLMStreamChunk {
  delta: string;
  done: boolean;
  requestId: string;
}

export type LLMErrorCode =
  | 'RATE_LIMITED'
  | 'CONTEXT_TOO_LONG'
  | 'CONTENT_FILTERED'  // Provider-side content policy rejection
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'UNKNOWN';

export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    public provider: ProviderName,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
```

### Provider Interface Contract

```typescript
// src/lib/llm/providers/base.ts

export abstract class BaseLLMProvider {
  abstract readonly name: ProviderName;
  abstract readonly region: LLMRegion;
  // Which intents this provider handles best — used for intent-aware routing
  abstract readonly preferredIntents: LLMRequest['intent'][];

  abstract complete(request: LLMRequest): Promise<LLMResponse>;

  abstract stream(
    request: LLMRequest,
    onChunk: (chunk: LLMStreamChunk) => void,
  ): Promise<LLMResponse>;

  abstract healthCheck(): Promise<boolean>;

  // Translate a generic LLMError into provider-specific error codes
  protected abstract normalizeError(raw: unknown): LLMError;

  // All providers must validate their credentials at startup
  abstract validateConfig(): void;
}
```

### Routing Logic

```typescript
// src/lib/llm/router.ts

import type { LLMRequest, ProviderName, LLMRegion } from './types';

// Priority order within each region, per intent.
// First provider in the list is attempted first.
// This is static config — not a database query — to keep routing on the hot path.
const ROUTING_TABLE: Record<
  LLMRegion,
  Record<LLMRequest['intent'], ProviderName[]>
> = {
  CN: {
    strategy:       ['kimi', 'qwen', 'ernie'],
    draft:          ['qwen', 'ernie', 'kimi'],
    channel_adapt:  ['qwen', 'kimi', 'ernie'],
    diff_annotate:  ['kimi', 'qwen', 'ernie'],
  },
  INTL: {
    strategy:       ['anthropic', 'openai'],
    draft:          ['openai', 'anthropic'],
    channel_adapt:  ['openai', 'anthropic'],
    diff_annotate:  ['anthropic', 'openai'],
  },
};

export function resolveProviderChain(request: LLMRequest): ProviderName[] {
  if (request.preferredProvider) {
    // Admin override: try preferred first, then fall back to normal chain
    const chain = ROUTING_TABLE[request.region][request.intent];
    return [
      request.preferredProvider,
      ...chain.filter((p) => p !== request.preferredProvider),
    ];
  }
  return ROUTING_TABLE[request.region][request.intent];
}
```

**Routing rationale**: Kimi (Moonshot AI) is assigned to `strategy` and `diff_annotate` in the CN region because its 128k context window handles brand voice examples + strategy documents without truncation. Qwen is assigned to `draft` because its instruction-following on structured Chinese output (Douyin script format, Xiaohongshu hooks) is superior. This is not a permanent ranking — the routing table is a constant, not database-driven, so it can be updated with a deploy rather than a config change.

### Fallback Chain Executor

```typescript
// src/lib/llm/fallback.ts

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
      // Skip providers with open circuit breakers
      continue;
    }

    const provider = getProvider(providerName);

    try {
      const response = await provider.complete(request);
      breaker.recordSuccess();
      return response;
    } catch (err) {
      const llmError = err instanceof LLMError
        ? err
        : new LLMError('UNKNOWN', providerName, String(err), true);

      breaker.recordFailure(llmError);
      errors.push(llmError);

      // Non-retryable errors (content policy, auth) — stop immediately
      // Do NOT silently fall back for content policy rejections:
      // the content that triggered the rejection needs to be surfaced
      if (!llmError.retryable) {
        throw llmError;
      }
    }
  }

  // All providers in chain failed
  throw new LLMError(
    'PROVIDER_UNAVAILABLE',
    chain[0],
    `All providers exhausted. Errors: ${errors.map((e) => e.message).join('; ')}`,
    false,
  );
}
```

### Circuit Breaker

```typescript
// src/lib/llm/circuit-breaker.ts

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerConfig {
  failureThreshold: number;   // failures before opening
  successThreshold: number;   // successes in HALF_OPEN before closing
  timeoutMs: number;          // how long to stay OPEN before trying HALF_OPEN
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
      // Rate limits open the breaker immediately for a longer window
      this.state = 'OPEN';
      return;
    }
    this.failureCount++;
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Module-level singleton map — one breaker per provider per process
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(providerName: string): CircuitBreaker {
  if (!breakers.has(providerName)) {
    breakers.set(providerName, new CircuitBreaker(providerName));
  }
  return breakers.get(providerName)!;
}
```

**Note on serverless circuit breakers**: In a serverless (Vercel/Function Compute) deployment, process memory is not shared across instances. This means circuit breaker state does not propagate across concurrent invocations. For Sprint 1, this is an acceptable trade-off — the fallback chain will still fire on individual invocations, and most provider outages are long enough that all warmed instances will open their local breakers within seconds. Persisting breaker state to Redis is the correct fix for Sprint 2.

### Configuration

```typescript
// src/lib/llm/config.ts
// Credentials loaded from environment variables — never from database.
// Environment variables are injected differently per deployment region.

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;    // For providers with configurable endpoints
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
      model: 'claude-sonnet-4-5',
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
```

### Integration with Brand Voice and Content Pipeline

The LLM layer is intentionally brand-voice-unaware. It accepts messages and returns text. Brand voice injection happens in the prompt builder (Section 4), which constructs the `messages` array before passing to `executeWithFallback`. This separation means the LLM layer can be tested without brand voice fixtures, and brand voice can be modified without touching provider code.

---

## 3. Data Model

**Complexity: Medium**

### Entity Relationship Overview

```
Tenant (1) ──────────── (N) User
Tenant (1) ──────────── (1) BrandVoiceProfile
Tenant (1) ──────────── (N) ContentPiece
ContentPiece (1) ─────── (1) ContentStrategy    [nullable — Quick Create skips]
ContentPiece (1) ─────── (1) ContentBrief
ContentPiece (1) ─────── (N) ChannelVariant      [one per channel]
ContentPiece (1) ─────── (1) ReviewWorkflow
ContentPiece (1) ─────── (0..1) PerformanceLog
ChannelVariant (1) ────── (N) DiffAnnotation
ReviewWorkflow (1) ─────── (N) ReviewEvent       [audit trail]
```

### Table Definitions

```sql
-- Tenant: the unit of isolation. Region drives LLM routing and data residency.
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  region        TEXT NOT NULL CHECK (region IN ('CN', 'INTL')),
  plan          TEXT NOT NULL DEFAULT 'solo' CHECK (plan IN ('solo', 'team')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ          -- soft delete only
);

-- Users belong to exactly one tenant.
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  clerk_user_id TEXT NOT NULL UNIQUE,  -- Clerk external ID
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_clerk ON users(clerk_user_id);

-- BrandVoiceProfile: one per tenant, mutable.
-- voice_examples, tone_descriptors, blocklist are JSON arrays.
-- Rationale for JSONB over normalized tables: these are always read and written
-- as a unit, never queried individually. Normalization adds joins with no benefit.
CREATE TABLE brand_voice_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL UNIQUE REFERENCES tenants(id),
  tone_descriptors  JSONB NOT NULL DEFAULT '[]',  -- e.g. ["professional", "warm"]
  voice_examples    JSONB NOT NULL DEFAULT '[]',  -- [{text, source_url, notes}]
  blocklist         JSONB NOT NULL DEFAULT '[]',  -- phrases never to use
  style_notes       TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES users(id),
  -- Retention: profiles older than this date are flagged for deletion review
  retention_review_at TIMESTAMPTZ
);

-- Content pieces are the top-level work item.
CREATE TABLE content_pieces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  created_by      UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  -- Entry path: drives which fields are populated
  creation_path   TEXT NOT NULL CHECK (creation_path IN ('quick_create', 'strategy_first')),
  -- The seed input from the user
  topic           TEXT NOT NULL,
  target_audience TEXT,
  core_message    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_pieces_tenant ON content_pieces(tenant_id);

-- ContentStrategy: only present when creation_path = 'strategy_first'
CREATE TABLE content_strategies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id  UUID NOT NULL UNIQUE REFERENCES content_pieces(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  goals             JSONB NOT NULL DEFAULT '[]',
  positioning       TEXT,
  key_messages      JSONB NOT NULL DEFAULT '[]',
  channel_rationale JSONB NOT NULL DEFAULT '{}',  -- {douyin: "...", xiaohongshu: "..."}
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ
);

-- ContentBrief: the structured brief fed into channel content generation
CREATE TABLE content_briefs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id  UUID NOT NULL UNIQUE REFERENCES content_pieces(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  hook              TEXT NOT NULL,    -- The opening hook / angle
  core_argument     TEXT NOT NULL,
  supporting_points JSONB NOT NULL DEFAULT '[]',
  call_to_action    TEXT,
  brand_voice_snapshot JSONB NOT NULL,  -- Snapshot of BrandVoiceProfile at generation time
  -- Snapshotting brand voice is critical: if voice is updated, old content
  -- should still reflect what was in force when it was generated
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ChannelVariant: one row per channel per content piece.
CREATE TABLE channel_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id  UUID NOT NULL REFERENCES content_pieces(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  -- v1.1: CHECK covers all 4 channels (D10 Plan B compatible). Application layer
  -- gates Sprint 1 to SPRINT1_ENABLED_CHANNELS; no DB migration needed to pivot.
  channel           TEXT NOT NULL CHECK (channel IN ('douyin', 'xiaohongshu', 'wechat_official', 'linkedin')),
  -- Structured output varies by channel; stored as JSONB for flexibility
  -- Douyin: {script_sections: [{scene_cue, spoken_text, duration_hint}], total_duration}
  -- Xiaohongshu: {hook_title, body_paragraphs, hashtags, image_prompts}
  structured_content JSONB NOT NULL,
  -- Plain text rendering for display and export
  rendered_text      TEXT NOT NULL,
  -- AI content label metadata (required for Douyin, stored for all)
  ai_label_metadata  JSONB,
  version            INTEGER NOT NULL DEFAULT 1,
  is_current         BOOLEAN NOT NULL DEFAULT true,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_piece_id, channel, version)
);

CREATE INDEX idx_channel_variants_piece ON channel_variants(content_piece_id);

-- DiffAnnotation: explains what changed from brief → channel variant, and why
CREATE TABLE diff_annotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_variant_id UUID NOT NULL REFERENCES channel_variants(id),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  element_path       TEXT NOT NULL,  -- e.g. "hook_title", "script_sections[0].spoken_text"
  original_text      TEXT,           -- From brief
  adapted_text       TEXT NOT NULL,  -- In this channel variant
  reason             TEXT NOT NULL,  -- "Shortened for Douyin's 3-second hook window"
  change_type        TEXT NOT NULL CHECK (change_type IN (
    'tone_shift', 'length_adjustment', 'format_requirement',
    'platform_convention', 'brand_voice_application', 'channel_specific_addition'
  )),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ReviewWorkflow: one per content_piece, tracks the current state machine.
CREATE TABLE review_workflows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id  UUID NOT NULL UNIQUE REFERENCES content_pieces(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  mode              TEXT NOT NULL CHECK (mode IN ('solo', 'team')),
  current_state     TEXT NOT NULL DEFAULT 'draft' CHECK (current_state IN (
    'draft', 'in_review', 'changes_requested', 'approved', 'exported'
  )),
  -- Team mode: who currently owns the review action
  current_owner_id  UUID REFERENCES users(id),
  -- Solo mode: was the cognitive checklist completed before approval?
  checklist_completed_at TIMESTAMPTZ,
  checklist_responses    JSONB,  -- {item_id: boolean}
  -- Team mode: when does the current owner's review window expire?
  review_due_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ReviewEvent: immutable audit log of all state transitions
CREATE TABLE review_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       UUID NOT NULL REFERENCES review_workflows(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  from_state        TEXT NOT NULL,
  to_state          TEXT NOT NULL,
  actor_id          UUID NOT NULL REFERENCES users(id),
  comment           TEXT,
  metadata          JSONB,  -- e.g. {checklist_completed: true, channels_approved: [...]}
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_events_workflow ON review_events(workflow_id);

-- PerformanceLog: 3-field minimal structure per D (Sprint 1).
-- Deliberately denormalized — no foreign key to external analytics systems.
CREATE TABLE performance_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id  UUID NOT NULL UNIQUE REFERENCES content_pieces(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  -- The 3 required fields
  channel           TEXT NOT NULL,
  metric_name       TEXT NOT NULL,   -- e.g. "views", "engagement_rate", "leads"
  metric_value      NUMERIC NOT NULL,
  -- Optional free-form notes
  notes             TEXT,
  period_start      DATE,
  period_end        DATE,
  logged_by         UUID REFERENCES users(id),
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Row-Level Security Policies

```sql
-- Every table follows the same RLS pattern.
-- The tenant_id is extracted from the JWT claim set by Clerk.

ALTER TABLE content_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_pieces_tenant_isolation ON content_pieces
  USING (tenant_id = (current_setting('app.tenant_id'))::UUID);

-- This pattern repeats for all tables.
-- The application middleware sets app.tenant_id at the start of every request:
--   SET LOCAL app.tenant_id = '<tenant_id_from_jwt>';
```

---

## 4. Content Generation Pipeline

**Complexity: High**

### Quick Create Flow

```
User Input
  └─ {topic, channel_targets, [optional: audience, core_message]}
       │
       ▼
API Route: POST /api/trpc/content.quickCreate
  └─ Validates input
  └─ Creates content_piece (creation_path = 'quick_create')
  └─ Enqueues job to QStash: {jobType: 'generate_brief', contentPieceId}
  └─ Returns {contentPieceId, status: 'queued'}
       │
       ▼ (async, QStash delivers to worker endpoint)
Worker: POST /api/jobs/generate-brief
  └─ Loads tenant brand voice snapshot
  └─ Builds brief-generation prompt (see below)
  └─ Calls executeWithFallback({intent: 'draft', ...})
  └─ Parses structured JSON response into ContentBrief
  └─ Saves content_brief record
  └─ Enqueues: {jobType: 'generate_channel_variants', contentPieceId}
       │
       ▼
Worker: POST /api/jobs/generate-channel-variants
  └─ For each channel in channel_targets (parallel):
       └─ Builds channel-specific prompt
       └─ Calls executeWithFallback({intent: 'channel_adapt', ...})
       └─ Parses structured output (Douyin script | Xiaohongshu post)
       └─ Calls executeWithFallback({intent: 'diff_annotate', ...})
       └─ Saves channel_variant + diff_annotations
  └─ Updates content_piece.status = 'draft'
  └─ Publishes Supabase realtime event: content_piece_id ready
       │
       ▼
Client receives realtime update → navigates to Review Workspace
```

### Strategy-First Flow

```
User Input
  └─ {topic, goals, audience, competitive_context}
       │
       ▼
Worker: generate_strategy
  └─ Calls executeWithFallback({intent: 'strategy', ...})
  └─ Saves content_strategy (status: pending_approval)
  └─ User reviews and approves strategy in UI
       │
       ▼ (after user approval)
Worker: generate_brief_from_strategy
  └─ Loads approved strategy + brand voice
  └─ Calls executeWithFallback({intent: 'draft', ...})
  └─ [Continues same as Quick Create from this point]
```

The strategy approval step is a synchronous user action that gates the pipeline — the brief is not generated until the user explicitly approves the strategy. This is intentional: Strategy-First is for users who want creative control at the direction stage.

### Brand Voice Injection

Brand voice is injected into every prompt that produces user-facing content. It is never injected into the diff annotation prompt (which should describe changes analytically, not in brand voice).

```typescript
// src/lib/prompts/brand-voice.ts

export function buildBrandVoiceBlock(profile: BrandVoiceProfileSnapshot): string {
  const toneList = profile.toneDescriptors.join(', ');
  const examplesBlock = profile.voiceExamples
    .slice(0, 3)  // Cap at 3 examples to manage token budget
    .map((ex, i) => `Example ${i + 1}: "${ex.text}"`)
    .join('\n');
  const blocklistBlock = profile.blocklist.length > 0
    ? `\nNEVER use these words or phrases: ${profile.blocklist.join(', ')}`
    : '';

  return `
## Brand Voice
Tone: ${toneList}
Style: ${profile.styleNotes ?? 'Not specified'}

Examples of on-brand writing:
${examplesBlock}
${blocklistBlock}
`.trim();
}
```

Brand voice is appended to the system message of every generation prompt. It is loaded from the `brand_voice_snapshot` stored on the brief (not re-fetched from the live profile) so that regeneration produces consistent results even if the brand voice was updated after initial generation.

### Diff Annotation Generation

After each channel variant is generated, a separate LLM call generates the diff annotations:

```typescript
// src/lib/prompts/diff-annotator.ts

export function buildDiffAnnotationPrompt(
  brief: ContentBrief,
  variant: ChannelVariantDraft,
  channel: ContentChannel,
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are a content adaptation analyst. Compare the source brief
to the channel-specific variant and identify every meaningful change.
For each change, output a JSON array of DiffAnnotation objects.
Be specific about WHY the change was made for ${channel}.
Use only these change types: tone_shift, length_adjustment, format_requirement,
platform_convention, brand_voice_application, channel_specific_addition.`,
    },
    {
      role: 'user',
      content: `SOURCE BRIEF:
${JSON.stringify(brief, null, 2)}

${channel.toUpperCase()} VARIANT:
${JSON.stringify(variant, null, 2)}

Output a JSON array. Each object must have: element_path, original_text,
adapted_text, reason, change_type.`,
    },
  ];
}
```

Diff annotation is a separate LLM call (not embedded in the main generation prompt) because embedding it degrades the quality of both the content and the annotations. The separation also allows the annotation to be regenerated independently if the user requests a rephrase.

### Uncanny Valley Suppression

The suppression list is a tenant-level concept but has a global seed list that applies to all tenants. It is implemented as a post-processing step, not a prompt instruction, because prompt-based suppression is unreliable.

```typescript
// src/lib/content/suppressor.ts

// Global seed list — AI writing tells
const GLOBAL_SUPPRESSION_PATTERNS: RegExp[] = [
  /\b(当然|诚然|毋庸置疑|值得注意的是)\b/g,     // filler openings
  /\b(深入探讨|全面了解|让我们一起)\b/g,          // AI-ish phrasing
  /\b(As an AI|作为AI|作为人工智能)\b/gi,
];

export function applySuppression(
  text: string,
  tenantBlocklist: string[],
): { text: string; suppressionsApplied: string[] } {
  const applied: string[] = [];
  let result = text;

  for (const pattern of GLOBAL_SUPPRESSION_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      applied.push(...matches);
      result = result.replace(pattern, '');  // Remove entirely; editor fills naturally
    }
  }

  for (const phrase of tenantBlocklist) {
    if (result.includes(phrase)) {
      applied.push(phrase);
      result = result.replace(new RegExp(phrase, 'g'), '');
    }
  }

  return { text: result.trim(), suppressionsApplied: applied };
}
```

Suppressions applied are logged in the channel variant's `ai_label_metadata` field for transparency and debugging.

### Prompt Structures

**Douyin (口播脚本) Prompt**

```typescript
export function buildDouyinScriptPrompt(
  brief: ContentBrief,
  brandVoiceBlock: string,
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are an expert Douyin 口播 scriptwriter. You write scripts
that feel natural when spoken aloud, not read. You understand:
- The first 3 seconds determine watch completion rate
- Scene cues must be actionable for a solo creator with no crew
- Spoken rhythm > grammatical perfection

${brandVoiceBlock}

Output ONLY valid JSON matching this schema:
{
  "script_sections": [
    {
      "scene_cue": string,      // e.g. "直视镜头，保持轻松姿态"
      "spoken_text": string,    // Exactly what is said
      "duration_hint": string,  // e.g. "约8秒"
      "emphasis_words": string[] // Words to stress vocally
    }
  ],
  "total_duration": string,
  "hook_type": "question" | "shock_stat" | "relatable_pain" | "bold_claim",
  "ai_disclosure_text": string  // Required by CAC: e.g. "本视频由AI辅助创作"
}`,
    },
    {
      role: 'user',
      content: `Create a Douyin 口播 script based on:
Hook: ${brief.hook}
Core argument: ${brief.coreArgument}
Supporting points: ${brief.supportingPoints.join('; ')}
Call to action: ${brief.callToAction ?? 'Follow for more'}
Target duration: 60-90 seconds`,
    },
  ];
}
```

**Xiaohongshu (图文笔记) Prompt**

```typescript
export function buildXiaohongshuPrompt(
  brief: ContentBrief,
  brandVoiceBlock: string,
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are an expert Xiaohongshu content creator for B2B topics.
You know that Xiaohongshu's algorithm rewards:
- Hook titles with specific numbers or emotional triggers (under 20 characters)
- First paragraph that delivers immediate value (the "开门见山" principle)
- 3-5 structured paragraphs with line breaks for mobile readability
- 5-8 targeted hashtags (mix of broad and niche)
- Conversational, first-person voice that doesn't sound corporate

${brandVoiceBlock}

Output ONLY valid JSON matching this schema:
{
  "hook_title": string,         // Under 20 chars, must contain number or trigger word
  "subtitle": string,           // Secondary title line, optional
  "body_paragraphs": string[],  // 3-5 paragraphs, each under 100 chars
  "call_to_action": string,
  "hashtags": string[],         // 5-8 items, with # prefix
  "image_prompts": string[]     // 1-3 image description suggestions for designer
}`,
    },
    {
      role: 'user',
      content: `Create a Xiaohongshu 图文笔记 based on:
Hook: ${brief.hook}
Core argument: ${brief.coreArgument}
Supporting points: ${brief.supportingPoints.join('; ')}
Call to action: ${brief.callToAction ?? 'Save this post'}`,
    },
  ];
}
```

---

## 5. Review Workflow State Machine

**Complexity: Medium**

### States and Valid Transitions

```
         ┌─────────────────────────────────────────────────────┐
         │                  STATE MACHINE                      │
         │                                                     │
         │   [draft] ──submit──► [in_review]                   │
         │                           │                         │
         │                    ┌──────┴──────┐                  │
         │                    ▼             ▼                   │
         │           [changes_requested]  [approved]           │
         │                    │             │                   │
         │                    └──revise──►[draft]  [exported]  │
         │                               approved──►exported   │
         └─────────────────────────────────────────────────────┘
```

### State Transition Rules

```typescript
// src/lib/workflow/state-machine.ts

type ReviewState =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'exported';

type ReviewMode = 'solo' | 'team';

interface TransitionGuard {
  fromState: ReviewState;
  toState: ReviewState;
  modes: ReviewMode[];
  // Returns null if allowed, error string if blocked
  guard: (workflow: ReviewWorkflow, actor: User) => string | null;
}

const TRANSITION_GUARDS: TransitionGuard[] = [
  {
    fromState: 'draft',
    toState: 'in_review',
    modes: ['solo', 'team'],
    guard: (workflow, actor) => {
      // Both modes: creator can submit their own draft
      if (workflow.createdById !== actor.id) return 'Only the creator can submit for review';
      return null;
    },
  },
  {
    fromState: 'in_review',
    toState: 'approved',
    modes: ['solo'],
    guard: (workflow, _actor) => {
      // Solo mode: checklist must be completed
      if (!workflow.checklistCompletedAt) {
        return 'Complete the cognitive checklist before approving';
      }
      const responses = workflow.checklistResponses as Record<string, boolean>;
      const allChecked = Object.values(responses).every(Boolean);
      if (!allChecked) return 'All checklist items must be confirmed';
      return null;
    },
  },
  {
    fromState: 'in_review',
    toState: 'approved',
    modes: ['team'],
    guard: (workflow, actor) => {
      // Team mode: only the assigned reviewer can approve
      if (workflow.currentOwnerId !== actor.id) {
        return 'Only the assigned reviewer can approve';
      }
      return null;
    },
  },
  {
    fromState: 'in_review',
    toState: 'changes_requested',
    modes: ['solo', 'team'],
    guard: (workflow, actor) => {
      if (workflow.mode === 'team' && workflow.currentOwnerId !== actor.id) {
        return 'Only the assigned reviewer can request changes';
      }
      return null;
    },
  },
  {
    fromState: 'changes_requested',
    toState: 'draft',
    modes: ['solo', 'team'],
    guard: (_workflow, _actor) => null,  // Anyone on the tenant can revise
  },
  {
    fromState: 'approved',
    toState: 'exported',
    modes: ['solo', 'team'],
    guard: (_workflow, _actor) => null,
  },
];

export function validateTransition(
  workflow: ReviewWorkflow,
  toState: ReviewState,
  actor: User,
): { allowed: boolean; reason?: string } {
  const guard = TRANSITION_GUARDS.find(
    (g) =>
      g.fromState === workflow.currentState &&
      g.toState === toState &&
      g.modes.includes(workflow.mode),
  );

  if (!guard) {
    return {
      allowed: false,
      reason: `Transition from ${workflow.currentState} to ${toState} is not valid`,
    };
  }

  const error = guard.guard(workflow, actor);
  return error ? { allowed: false, reason: error } : { allowed: true };
}
```

### Solo Mode: Cognitive Checklist

The checklist is **blocking** — the approve button is disabled until all items are confirmed. This is intentional: the product is positioned as a quality control layer (D9), and non-blocking checklists are ignored.

The checklist items are stored in a server-side constant (not the database) so they can be updated with a deploy:

```typescript
// src/lib/workflow/solo-checklist.ts

export interface ChecklistItem {
  id: string;
  category: 'accuracy' | 'brand' | 'platform' | 'legal';
  prompt: string;
}

export const SOLO_REVIEW_CHECKLIST: ChecklistItem[] = [
  {
    id: 'accuracy_facts',
    category: 'accuracy',
    prompt: '所有数据和事实已经过人工验证，非AI生成内容',
  },
  {
    id: 'brand_voice',
    category: 'brand',
    prompt: '内容语气与品牌调性一致，无明显AI腔',
  },
  {
    id: 'platform_fit',
    category: 'platform',
    prompt: '内容格式符合目标平台规范（字数、话题标签、图片要求）',
  },
  {
    id: 'douyin_ai_label',
    category: 'legal',
    prompt: '抖音视频已添加AI生成内容标识（CAC规定）',
  },
  {
    id: 'no_sensitive_claims',
    category: 'legal',
    prompt: '内容不含无依据的效果承诺或敏感声明',
  },
];
```

Checklist responses are stored in `review_workflows.checklist_responses` as `{item_id: boolean}`. The `checklist_completed_at` timestamp is set when all items are first confirmed — partial saves are supported (user can check items progressively without losing state on page reload).

### Team Mode: Ownership and Timeouts

When content is submitted for review in Team mode:
1. The submitter nominates a reviewer (or the system assigns round-robin within the tenant)
2. `current_owner_id` and `review_due_at` (default: 48 hours) are set
3. A QStash scheduled job is enqueued to fire at `review_due_at`
4. If the job fires and the state is still `in_review`, an email notification is sent to the reviewer and the submitter via Resend

```typescript
// Enqueued when team review is submitted
interface ReviewReminderJob {
  jobType: 'review_reminder';
  workflowId: string;
  reviewerEmail: string;
  submitterEmail: string;
  contentTitle: string;
  dueAt: string;
}
```

### API Endpoints for State Transitions

```typescript
// src/server/routers/review.ts (tRPC)

export const reviewRouter = router({
  // Submit draft for review (both modes)
  submitForReview: protectedProcedure
    .input(z.object({
      contentPieceId: z.string().uuid(),
      reviewerId: z.string().uuid().optional(),  // Team mode only
    }))
    .mutation(async ({ input, ctx }) => { ... }),

  // Update checklist item (Solo mode)
  updateChecklist: protectedProcedure
    .input(z.object({
      workflowId: z.string().uuid(),
      itemId: z.string(),
      checked: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => { ... }),

  // Approve (Solo: requires complete checklist; Team: requires ownership)
  approve: protectedProcedure
    .input(z.object({
      workflowId: z.string().uuid(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => { ... }),

  // Request changes
  requestChanges: protectedProcedure
    .input(z.object({
      workflowId: z.string().uuid(),
      comment: z.string().min(1),  // Required — must explain what to change
    }))
    .mutation(async ({ input, ctx }) => { ... }),

  // Export (moves to exported state; triggers download URL generation)
  export: protectedProcedure
    .input(z.object({
      workflowId: z.string().uuid(),
      // v1.1: enum carries all 4 values; router refine()s against SPRINT1_ENABLED_CHANNELS
      channels: z.array(z.enum(['douyin', 'xiaohongshu', 'wechat_official', 'linkedin']))
        .refine((cs) => cs.every((c) => SPRINT1_ENABLED_CHANNELS.includes(c)),
                { message: 'channel not enabled in current sprint' }),
    }))
    .mutation(async ({ input, ctx }) => { ... }),
});
```

---

## 6. Frontend Architecture

**Complexity: Medium**

### Framework: Next.js 14 App Router

**Rationale over alternatives**: Next.js App Router enables server components for initial data fetches (content piece list, brand voice profile) which reduces client bundle size and eliminates loading waterfalls. The App Router's streaming support is used for generation status updates. The alternative — Vite + React SPA — requires a separate server for SSR and adds a deployment target. Remix was considered but the ecosystem of shadcn/ui components and tRPC integration is more mature with Next.js.

### Key Views and Data Requirements

**1. Quick Create Wizard**
- Step 1: Topic + audience input
- Step 2: Channel selection (Douyin / Xiaohongshu / both)
- Step 3: Generation loading state (SSE stream)
- Data: No initial fetch required; form state is local

**2. Strategy-First Flow**
- Step 1: Extended brief input (goals, positioning)
- Step 2: Strategy review and approval (fetches `content_strategy`)
- Step 3: Transitions to same generation loading as Quick Create
- Data: `content_strategy` record on load

**3. Review Workspace** (primary workspace view)
- Channel variant side-by-side view
- Diff annotation panel (collapsible)
- Review controls (checklist panel for Solo; reviewer assignment for Team)
- Data: `content_piece` + `channel_variants` + `diff_annotations` + `review_workflow`
- Real-time: Supabase realtime subscription for workflow state changes (Team mode)

**4. Brand Voice Setup**
- Deferred per D2 — accessible from Settings, not onboarding
- Form: tone descriptors (tag input), voice examples (textarea list), blocklist
- Data: `brand_voice_profile` for tenant

**5. Performance Log Entry**
- Minimal 3-field form, accessible from the approved/exported content piece
- Data: POST to `performance_logs`

**6. Content Library**
- List view of all content pieces with status filters
- Data: paginated `content_pieces` query

### Diff Annotation UI

The diff annotation panel renders alongside each channel variant. The design principle is that annotations are contextual — they appear next to the element they describe, not in a separate list.

```
┌─────────────────────────────────────────────────────────────────────┐
│  抖音版本                              [显示/隐藏改动说明]            │
├────────────────────────────┬────────────────────────────────────────┤
│                            │  改动说明                               │
│  【开场白】                 │  ┌──────────────────────────────────┐  │
│  "很多B2B营销人都不知道..." │  │ 钩子标题                          │  │
│                ▲           │  │ 类型: platform_convention         │  │
│                │           │  │ 原文: "三个被忽视的营销策略"        │  │
│     ┌──────────┘           │  │ 改动: 缩短至15字以内，前置数字     │  │
│     │  [改动标记]           │  └──────────────────────────────────┘  │
│     ▼                      │                                        │
│  "90%的B2B内容..."          │                                        │
└────────────────────────────┴────────────────────────────────────────┘
```

Implementation: diff annotation highlights are rendered as `<mark>` elements with `data-annotation-id` attributes. Clicking a highlight activates the corresponding annotation card in the side panel. This is a pure CSS + React state implementation — no third-party diff library required.

### Real-time vs. Polling

**Generation status: Server-Sent Events (SSE)**
Generation takes 10–30 seconds. Polling at 2-second intervals creates 5–15 unnecessary round-trips. SSE (via a Next.js Route Handler) pushes job progress updates as the QStash worker processes them. The worker writes progress to a Redis key; the SSE endpoint polls Redis on the server side (not the client), which means the SSE connection is the only persistent client connection.

```typescript
// src/app/api/generation-status/[contentPieceId]/route.ts
export async function GET(req: Request, { params }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const interval = setInterval(async () => {
        const status = await redis.get(`gen:status:${params.contentPieceId}`);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(status)}\n\n`));
        if (status?.done) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
```

**Review state changes: Supabase Realtime**
Team mode requires that all members see review state changes without polling. Supabase Realtime (Postgres change notifications) is used here because it integrates directly with the data model — no additional message broker. Solo mode does not need real-time updates (single user), but the same subscription is used for both modes to simplify the frontend.

**Rationale for not using WebSockets**: WebSockets require a persistent connection managed by the server. Vercel's serverless functions do not support persistent WebSocket connections. Supabase Realtime uses a managed WebSocket connection through Supabase's own infrastructure, not Vercel's.

### State Management

**Server state: TanStack Query (via tRPC)** — all data fetched from the API is managed by TanStack Query. Cache invalidation on mutations is handled automatically by tRPC's React Query integration.

**Client/UI state: Zustand** — used only for UI state that does not map to server data (active annotation highlight, checklist panel open/closed, generation progress from SSE). No Redux; the domain complexity does not require it.

**Form state: React Hook Form + Zod** — validates against the same Zod schemas used in the tRPC router input validation, eliminating schema duplication.

---

## 7. Instrumentation & Analytics

**Complexity: Low**

### Analytics Service: PostHog

**Rationale**: PostHog is self-hostable (required for CN deployment due to data residency), supports feature flags (useful for A/B testing prompt variations in Sprint 2), and has a React SDK that makes custom event tracking trivial. Mixpanel and Amplitude require cloud-only hosting, which is incompatible with CN data residency requirements. Google Analytics 4 does not support structured custom event properties cleanly.

**CN deployment**: PostHog is self-hosted on Alibaba Cloud (ECS instance, standard PostHog Docker deployment). International users hit PostHog Cloud (EU region). The SDK initialization diverges based on tenant region.

### Event Mapping

```typescript
// src/lib/analytics/events.ts

import posthog from 'posthog-js';

export const Analytics = {
  brandVoiceSaved: (props: {
    hasExamples: boolean;
    blocklistCount: number;
    toneDescriptorCount: number;
  }) => {
    posthog.capture('brand_voice_saved', props);
  },

  contentStarted: (props: {
    path: 'quick_create' | 'strategy_first';
    channels: string[];
    hasBrandVoice: boolean;
  }) => {
    posthog.capture('content_started', props);
  },

  draftGenerated: (props: {
    contentPieceId: string;
    channels: string[];
    generationTimeMs: number;
    provider: string;  // Which LLM provider was used
    tokensUsed: number;
  }) => {
    posthog.capture('draft_generated', props);
  },

  generationError: (props: {
    contentPieceId: string;
    errorCode: string;
    provider: string;
    fallbackAttempted: boolean;
    channel?: string;
  }) => {
    posthog.capture('generation_error', props);
  },

  reviewApproved: (props: {
    contentPieceId: string;
    reviewMode: 'solo' | 'team';
    timeInReviewMs: number;
    checklistAllChecked?: boolean;  // Solo mode
  }) => {
    posthog.capture('review_approved', props);
  },

  cycleCompleted: (props: {
    contentPieceId: string;
    formatsExported: string[];
    totalCycleTimeMs: number;  // from content_started to exported
  }) => {
    posthog.capture('cycle_completed', props);
  },

  surveyShown: (props: { surveyId: string; trigger: string }) => {
    posthog.capture('survey_shown', props);
  },

  surveySubmitted: (props: {
    surveyId: string;
    rating?: number;
    freeText?: string;
  }) => {
    posthog.capture('survey_submitted', props);
  },

  fullRegenerateRequested: (props: {
    contentPieceId: string;
    channel: string;
    reason?: string;
  }) => {
    posthog.capture('full_regenerate_requested', props);
  },
};
```

### Event Placement

- `brand_voice_saved` — called in the brand voice tRPC mutation `onSuccess` handler
- `content_started` — called in the Quick Create / Strategy-First wizard on first submission
- `draft_generated` — called in the QStash worker after all channel variants are saved (server-side PostHog Node SDK)
- `generation_error` — called in `executeWithFallback` when all providers are exhausted (server-side)
- `review_approved` — called in the `approve` tRPC mutation `onSuccess` handler
- `cycle_completed` — called in the `export` tRPC mutation `onSuccess` handler
- `survey_shown` / `survey_submitted` — called in the survey modal component
- `full_regenerate_requested` — called in the regenerate button click handler

**Server-side events** (`draft_generated`, `generation_error`) use PostHog's Node.js SDK to ensure they are captured even if the client loses connection during generation. All other events fire from the client SDK.

---

## 8. Security & Compliance

**Complexity: Medium-High**

### Data Residency Enforcement

Tenant region is set at signup and cannot be changed without admin intervention (changing region = changing data residency = requires data deletion + migration). It is stored in the `tenants.region` column and also embedded in the Clerk JWT as a custom claim.

At the application layer, two mechanisms enforce residency:

1. **LLM routing** (Section 2): CN tenants only use CN providers; INTL tenants only use INTL providers. The routing table has no cross-region paths.

2. **Database deployment**: CN tenants' data is stored in a Supabase project hosted on Alibaba Cloud (Supabase supports custom deployment via their enterprise tier, or alternatively a self-managed Supabase stack on Alibaba Cloud ECS). INTL tenants use Supabase's EU-West region. The Next.js middleware inspects the JWT region claim and sets the correct database connection string for the request.

```typescript
// src/middleware.ts
export function middleware(req: NextRequest) {
  const token = req.cookies.get('__session');
  const claims = decodeClerkJWT(token);
  // Inject region into request headers for use in API routes
  const headers = new Headers(req.headers);
  headers.set('x-tenant-region', claims.region);
  headers.set('x-tenant-id', claims.tenantId);
  return NextResponse.next({ request: { headers } });
}
```

### Brand Voice Data Isolation

Three-layer isolation:

1. **Row-Level Security** (primary): All tables with `tenant_id` have RLS enabled. The `app.tenant_id` session variable is set at the start of every request from the JWT claim. No query can return data outside the current tenant's scope.

2. **Application layer validation**: Every tRPC procedure that accepts a `contentPieceId` or `workflowId` explicitly verifies that the resolved record's `tenant_id` matches the caller's tenant before proceeding. This is a defense-in-depth measure against bugs that might bypass RLS.

3. **LLM prompt isolation**: Brand voice examples are loaded by tenant and injected as context only for that tenant's requests. Prompts never include cross-tenant data. The `brand_voice_snapshot` stored on the brief is the definitive record of what was used — it cannot be contaminated by another tenant's profile.

Per D8: brand voice data is explicitly excluded from any shared model fine-tuning. This is enforced by policy (no data pipeline routes to model training infrastructure) and by the fact that all CN LLM calls go to third-party providers (ERNIE, Qwen, Kimi) over their standard APIs, not to any training endpoint.

### Douyin AI Content Labeling (CAC Compliance)

The Cyberspace Administration of China's 《互联网信息服务深度合成管理规定》 (effective January 2023) requires that AI-generated content be labeled. For Douyin specifically:

**Technical implementation**:

1. **Metadata labeling**: The `channel_variants.ai_label_metadata` JSONB field stores the disclosure text, generation timestamp, and provider used. This metadata is exported with the content.

2. **In-content disclosure**: The Douyin script prompt (Section 4) requires the LLM to output an `ai_disclosure_text` field (e.g., `"本视频由AI辅助创作"`). This text is included in the script and must appear in the video's description or as an opening frame.

3. **Export enforcement**: The export function for Douyin channel variants appends the disclosure text to the exported content and blocks export if `ai_disclosure_text` is empty or has been removed.

4. **Checklist enforcement**: The Solo review checklist includes the item `"抖音视频已添加AI生成内容标识（CAC规定）"` (Section 5). This is a blocking item — approval is not possible without confirming it.

**What the product does NOT do**: Watermark or C2PA signing of video files. That is a Douyin platform-level requirement enforced by the platform's upload API, not by this content creation tool. The tool's responsibility is ensuring the disclosure text is present in the content before it leaves the tool.

### API Key Management

All provider API keys are environment variables, never stored in the database. For each deployment region:

- **International (Vercel)**: Keys stored in Vercel environment variables, encrypted at rest
- **CN (Alibaba Cloud Function Compute)**: Keys stored in Alibaba Cloud KMS (Key Management Service), injected as environment variables at function startup

**No tenant-level API keys in Sprint 1**: All LLM calls use the platform's own API keys. Tenant-provided keys (BYOK) is a Sprint 3 feature.

Key rotation: documented runbook, not automated. Rotation requires a redeploy, which is acceptable for a 4-week MVP.

### Authentication

**Solo mode**: Standard Clerk authentication (email + password or social login). Single user, personal account. Clerk's `userId` maps 1:1 to a `users` record.

**Team mode**: Clerk Organizations. The org ID maps to the `tenants` record. Members can have `owner` or `member` roles. `owner` can manage brand voice, invite members, and approve content. `member` can create and review content but not manage tenant settings.

**Session security**: Clerk JWTs expire in 1 hour. Short-lived tokens limit the blast radius of a stolen token. Refresh is handled transparently by Clerk's SDK.

---

## 9. 4-Week Build Sequence

### Week 1: Infrastructure and Skeleton

**Goal**: A request can travel from browser to LLM and back. No UI polish.

- Supabase project setup + all table migrations with RLS policies
- Clerk configuration: Solo (personal accounts) + Team (organizations) modes
- Next.js project scaffold: App Router, tRPC, Drizzle ORM connected to Supabase
- LLM abstraction layer: all 5 providers implemented, routing table, circuit breaker (in-process)
- QStash integration: job enqueue + worker endpoint skeleton
- Vercel deployment pipeline: main branch auto-deploys to preview
- PostHog initialization (INTL only in Week 1)
- Basic auth flows: signup, login, tenant creation
- Milestone gate: a manual `curl` to the tRPC API can enqueue a generation job, call a CN or INTL provider based on a hardcoded region, and return a text response

### Week 2: Core Generation Pipeline

**Goal**: Quick Create works end-to-end in the browser.

- Brief generation prompt + parser
- Douyin script prompt + structured output parser + suppression pass
- Xiaohongshu post prompt + structured output parser
- Diff annotation prompt + parser
- Channel variant storage + brand voice snapshot
- SSE generation status endpoint + Redis progress keys
- Quick Create wizard UI (steps 1–3)
- Review workspace: read-only view of channel variants with diff annotations
- Brand voice setup page (not required for generation — D2 — but the settings page must exist)
- `content_started` and `draft_generated` events firing
- Milestone gate: a real user can complete Quick Create from topic input to reviewing two channel variants in the browser

### Week 3: Review Workflow and Channel Polish

**Goal**: Content can be approved and exported. Strategy-First is available.

- Solo review workflow: checklist implementation, blocking approve, state transitions
- Team review workflow: reviewer assignment, ownership guard, QStash-scheduled reminder email via Resend
- Export function: formatted text export for Douyin (script with scene cues) and Xiaohongshu (formatted post)
- Douyin AI label enforcement in export
- Strategy-First flow: strategy generation, review/approval UI, transition to brief generation
- Review event audit log writes
- All remaining analytics events wired
- Supabase Realtime subscription in Team mode review workspace
- `review_approved` and `cycle_completed` events firing
- Milestone gate: a content piece can complete the full cycle: Quick Create → draft → in_review → approved → exported

### Week 4: Performance Logging, Hardening, CN Deployment

**Goal**: Sprint-complete and deployable to CN users.

- Performance log entry form (3-field)
- CN deployment: Alibaba Cloud Function Compute setup, environment variables via KMS, PostHog self-hosted
- Error handling: LLMError surfaced to UI with user-facing messages (no raw stack traces)
- Retry UI: "Regenerate" button for failed or unsatisfactory channel variants
- Rate limiting: per-tenant generation limits (prevent runaway costs during MVP)
- End-to-end tests (Playwright): Quick Create happy path, Team review cycle
- Load test: 10 concurrent generation jobs (validates QStash + circuit breaker behavior)
- Survey trigger: show PostHog survey after first `cycle_completed` event
- `survey_shown` / `survey_submitted` events firing
- Milestone gate: a CN-region user can complete the full cycle using domestic LLM providers

### What is NOT Built in 4 Weeks

- BYOK (bring your own LLM API key)
- Content calendar / scheduling
- Direct platform publishing (Douyin API, Xiaohongshu API) — export is copy-paste only
- Image generation for Xiaohongshu image prompts (prompts are generated; images are not)
- Analytics dashboard inside the product (PostHog used directly)
- Competitor analysis or market research features
- Content versioning UI (database supports versions; no UI to browse/restore)
- Mobile-optimized UI (desktop-first for Sprint 1)
- Webhook integrations
- Persistent circuit breaker state in Redis (in-process only in Sprint 1)

---

### Three Highest Technical Risks

**Risk 1: CN LLM provider instability**
- Likelihood: High. ERNIE, Qwen, and Kimi all have documented rate limits, inconsistent structured JSON output compliance, and occasional service disruptions.
- Impact: Generation failures block the core user loop entirely.
- Mitigation:
  - The 3-provider CN fallback chain means no single provider failure is fatal.
  - Structured output parsing must be tolerant: attempt JSON parse → if fails, extract JSON substring → if fails, treat as plain text and mark variant as needing review.
  - Week 1 milestone gate explicitly tests all 3 CN providers before any UI is built.
  - Maintain a "degraded mode" UI state that shows the best partial output with a "retry" option rather than a blank error screen.

**Risk 2: Structured output reliability across providers**
- Likelihood: Medium-High. Not all providers reliably return valid JSON even when instructed. Kimi and Qwen are generally more reliable than ERNIE for structured outputs. OpenAI and Anthropic have function calling / tool use which enforces schema compliance.
- Impact: Corrupt structured output breaks the diff annotation step and the channel-specific UI rendering.
- Mitigation:
  - All generation prompts use a JSON schema in the system message and request JSON-only output.
  - OpenAI and Anthropic calls use the `response_format: { type: 'json_object' }` and tool use APIs respectively.
  - A parsing layer between raw LLM output and database storage attempts structured extraction, with a fallback to plain text storage if parsing fails.
  - Unit tests cover the parser against known-bad provider outputs captured from real calls during Week 1.

**Risk 3: Supabase RLS misconfiguration causing cross-tenant data leakage**
- Likelihood: Low in production, but the consequence is severe (brand voice data from Tenant A visible to Tenant B).
- Impact: Trust-destroying data breach. Directly contradicts D8.
- Mitigation:
  - RLS policies are written and reviewed before any application code touches the database.
  - Integration test suite (Week 1, runs in CI) creates two test tenants and asserts that queries from Tenant A's session cannot return Tenant B's rows across all tables.
  - The application-layer ownership check (Section 8) is a defense-in-depth guard that catches bugs before they reach the database layer.
  - RLS is never disabled on any table, even for admin queries. Admin access uses a separate service role key that is not exposed to the application runtime.

---

## Component Complexity Summary

| Component | Complexity | Primary Risk |
|---|---|---|
| LLM abstraction layer | High | CN provider JSON compliance |
| Content generation pipeline | High | Prompt tuning iteration time |
| Data model + RLS | Medium | RLS misconfiguration |
| Review state machine | Medium | Edge cases in Team mode ownership |
| Frontend architecture | Medium | SSE + Realtime state reconciliation |
| Diff annotation | Medium | LLM annotation quality |
| Analytics instrumentation | Low | Event property inconsistency |
| Security and compliance | Medium-High | CAC labeling enforcement gaps |
| CN deployment | High | Alibaba Cloud infra setup time |

The single highest-risk week is Week 4 (CN deployment). The Alibaba Cloud Function Compute + KMS + self-hosted PostHog setup requires infrastructure work that is harder to parallelize than application code. If the sprint is running behind, the mitigation is to ship Week 4's application features (performance log, error handling, rate limiting) on the international deployment first, and treat CN deployment as a hard dependency before any CN-region marketing.agentId: aaaf65b8ba661878b (use SendMessage with to: 'aaaf65b8ba661878b' to continue this agent)
<usage>total_tokens: 29780
tool_uses: 0
duration_ms: 288146</usage>