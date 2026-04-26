// W2-03-V3 — Video provider config loader.
//
// Lazy: a missing key only blows up if the provider is actually used.
// This keeps `pnpm dev` runnable for engineers who don't have Seedance
// access yet.

import type { VideoProviderName } from './types';

export interface SeedanceConfig {
  apiKey:            string;
  baseUrl:           string;  // ark.cn-beijing.volces.com or BytePlus mirror
  model:             string;  // doubao-seedance-1-0-pro-250528 etc.
  costPerMTokensFen: number;
}

export interface VideoProviderConfig {
  seedance: SeedanceConfig;
}

const DEFAULT_SEEDANCE_BASE_URL = 'https://ark.cn-beijing.volces.com';
// 2026-04-26: empirically verified active SKU on this account. Earlier default
// `doubao-seedance-1-5-pro-251215` returned ModelNotOpen — that SKU exists but
// is gated separately from this account's Ark subscription.
const DEFAULT_SEEDANCE_MODEL    = 'doubao-seedance-1-0-pro-250528';
/**
 * D32 (2026-04-26): Volcengine Ark billing for doubao-seedance-1-0-pro-250528
 * is **¥15 / 百万 tokens** (read from the model details page). Earlier D24
 * assumption of ¥6/60s clip + per-second billing was wrong dimensionally —
 * the API exposes `usage.completion_tokens`, not seconds.
 *   1500 分/M tokens = 0.0015 分/token
 *   480p 5s ≈ 49,005 tokens → ¥0.74/clip   (measured 2026-04-26)
 *   720p 5s ≈ 103,818 tokens → ¥1.56/clip  (measured 2026-04-26)
 */
const DEFAULT_SEEDANCE_COST_PER_M_TOKENS_FEN = 1500;

export function getVideoProviderConfig<P extends VideoProviderName>(
  name: P,
): VideoProviderConfig[P] {
  switch (name) {
    case 'seedance':
      return {
        apiKey:  process.env.SEEDANCE_API_KEY ?? '',
        baseUrl: process.env.SEEDANCE_BASE_URL?.replace(/\/$/, '') ?? DEFAULT_SEEDANCE_BASE_URL,
        model:   process.env.SEEDANCE_MODEL ?? DEFAULT_SEEDANCE_MODEL,
        costPerMTokensFen: Number(
          process.env.SEEDANCE_COST_PER_M_TOKENS_FEN ?? DEFAULT_SEEDANCE_COST_PER_M_TOKENS_FEN,
        ),
      } as VideoProviderConfig[P];
    default:
      throw new Error(`Unknown video provider: ${String(name)}`);
  }
}
