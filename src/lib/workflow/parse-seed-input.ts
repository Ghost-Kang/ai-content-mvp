// Parse workflow_runs.seed_input (JSON) into a typed bag consumed by
// TopicNodeRunner / ScriptNodeRunner via NodeContext.
//
// Fails closed: unknown/invalid shape → treat as "no seed input", which
// puts the run back on the manual-entry code path. The orchestrator must
// stay tolerant because:
//   - Older runs predating this column will read NULL.
//   - Future entry points may add keys we don't yet recognize — silently
//     dropping them is preferable to throwing inside the QStash worker.
//
// Mirrors the precedent set by parse-export-overrides.ts.

import type { Formula, LengthMode } from '@/lib/prompts/script-templates';
import type { TopicSourceMeta } from './nodes/topic';

export interface ParsedSeedInput {
  formula?:        Formula;
  lengthMode?:     LengthMode;
  productName?:    string;
  targetAudience?: string;
  coreClaim?:      string;
  sourceMeta?:     TopicSourceMeta;
}

const FORMULA_VALUES: ReadonlySet<Formula> = new Set(['provocation', 'insight']);
const LENGTH_VALUES:  ReadonlySet<LengthMode> = new Set(['short', 'long']);
const PLATFORM_VALUES: ReadonlySet<NonNullable<TopicSourceMeta['platform']>> =
  new Set(['dy', 'ks', 'xhs', 'bz']);

// String-field length caps (mirror content_sessions varchar caps so the
// downstream prompt path can't be fed pathologically large strings).
const PRODUCT_NAME_MAX = 100;
const AUDIENCE_MAX     = 200;
const CORE_CLAIM_MAX   = 300;

function clampString(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function parseSourceMeta(raw: unknown): TopicSourceMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: TopicSourceMeta = {};
  if (typeof r.platform === 'string' && PLATFORM_VALUES.has(r.platform as NonNullable<TopicSourceMeta['platform']>)) {
    out.platform = r.platform as TopicSourceMeta['platform'];
  }
  if (typeof r.opusId === 'string' && r.opusId.length > 0 && r.opusId.length <= 120) {
    out.opusId = r.opusId;
  }
  if (typeof r.rank === 'number' && Number.isFinite(r.rank) && r.rank >= 1) {
    out.rank = Math.floor(r.rank);
  }
  if (typeof r.url === 'string' && /^https?:\/\//.test(r.url) && r.url.length <= 500) {
    out.url = r.url;
  }
  if (typeof r.authorNickname === 'string' && r.authorNickname.length <= 60) {
    out.authorNickname = r.authorNickname.trim() || undefined;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseRunSeedInput(raw: unknown): ParsedSeedInput | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: ParsedSeedInput = {};

  if (typeof o.formula === 'string' && FORMULA_VALUES.has(o.formula as Formula)) {
    out.formula = o.formula as Formula;
  }
  if (typeof o.lengthMode === 'string' && LENGTH_VALUES.has(o.lengthMode as LengthMode)) {
    out.lengthMode = o.lengthMode as LengthMode;
  }

  const productName    = clampString(o.productName,    PRODUCT_NAME_MAX);
  const targetAudience = clampString(o.targetAudience, AUDIENCE_MAX);
  const coreClaim      = clampString(o.coreClaim,      CORE_CLAIM_MAX);
  if (productName)    out.productName    = productName;
  if (targetAudience) out.targetAudience = targetAudience;
  if (coreClaim)      out.coreClaim      = coreClaim;

  const sourceMeta = parseSourceMeta(o.sourceMeta);
  if (sourceMeta) out.sourceMeta = sourceMeta;

  return Object.keys(out).length > 0 ? out : undefined;
}
