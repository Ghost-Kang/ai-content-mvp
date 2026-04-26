// W4-01 — LLM spend counter + daily cap.
// All money stored as 分 (fen, 0.01 CNY) to avoid float drift.
// UTC-day boundary — matches Kimi's billing reset.

import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { ProviderName } from './types';

const SYSTEM_TENANT_UUID = '00000000-0000-0000-0000-000000000000';

// Provider pricing (分 per 1K tokens, approximate, config via env for overrides).
// Kimi moonshot-v1-32k: ~1.2 CNY / 1M tokens ~= 0.12 分 / 1K. Rounded up for safety margin.
function costPer1kTokensFen(provider: ProviderName): number {
  switch (provider) {
    case 'kimi':
      return Number(process.env.LLM_COST_PER_1K_FEN_KIMI ?? 20); // 0.2 元/1K ~= generous upper bound
    case 'openai':
      return Number(process.env.LLM_COST_PER_1K_FEN_OPENAI ?? 40);
    case 'anthropic':
      return Number(process.env.LLM_COST_PER_1K_FEN_ANTHROPIC ?? 150);
    case 'qwen':
      return Number(process.env.LLM_COST_PER_1K_FEN_QWEN ?? 12);
    case 'ernie':
      return Number(process.env.LLM_COST_PER_1K_FEN_ERNIE ?? 12);
    default:
      return 30;
  }
}

export function estimateCostFen(provider: ProviderName, totalTokens: number): number {
  return Math.ceil((totalTokens / 1000) * costPer1kTokensFen(provider));
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function globalCapFen(): number {
  const cny = Number(process.env.LLM_DAILY_CAP_CNY ?? 50);
  return Math.round(cny * 100);
}

function tenantCapFen(): number {
  const cny = Number(process.env.LLM_TENANT_DAILY_CAP_CNY ?? 5);
  return Math.round(cny * 100);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export interface SpendCheckResult {
  allowed: boolean;
  globalSpentFen: number;
  tenantSpentFen: number;
  globalCapFen: number;
  tenantCapFen: number;
  reason?: 'global_cap' | 'tenant_cap';
}

export async function checkSpendCap(tenantId: string): Promise<SpendCheckResult> {
  const date = utcDate();
  const gCap = globalCapFen();
  const tCap = tenantCapFen();

  const globalRow = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(cost_fen), 0)::int AS total
    FROM llm_spend_daily
    WHERE spend_date = ${date}
  `);
  const globalSpent = Number(globalRow[0]?.total ?? 0);

  const tenantKey = isUuid(tenantId) ? tenantId : SYSTEM_TENANT_UUID;
  const tenantRow = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(cost_fen), 0)::int AS total
    FROM llm_spend_daily
    WHERE spend_date = ${date}
      AND COALESCE(tenant_id, '${sql.raw(SYSTEM_TENANT_UUID)}'::uuid) = ${tenantKey}::uuid
  `);
  const tenantSpent = Number(tenantRow[0]?.total ?? 0);

  if (globalSpent >= gCap) {
    return {
      allowed: false, globalSpentFen: globalSpent, tenantSpentFen: tenantSpent,
      globalCapFen: gCap, tenantCapFen: tCap, reason: 'global_cap',
    };
  }
  if (tenantSpent >= tCap) {
    return {
      allowed: false, globalSpentFen: globalSpent, tenantSpentFen: tenantSpent,
      globalCapFen: gCap, tenantCapFen: tCap, reason: 'tenant_cap',
    };
  }
  return {
    allowed: true, globalSpentFen: globalSpent, tenantSpentFen: tenantSpent,
    globalCapFen: gCap, tenantCapFen: tCap,
  };
}

export async function recordSpend(
  tenantId: string,
  provider: ProviderName,
  totalTokens: number,
): Promise<void> {
  const date = utcDate();
  const fen = estimateCostFen(provider, totalTokens);
  const tenantKey = isUuid(tenantId) ? tenantId : null;

  try {
    // Upsert by (COALESCE(tenant_id, SYSTEM), spend_date, provider). The partial
    // unique index handles NULL tenant via COALESCE.
    await db.execute(sql`
      INSERT INTO llm_spend_daily (tenant_id, spend_date, provider, total_tokens, cost_fen, call_count, updated_at)
      VALUES (${tenantKey}, ${date}, ${provider}, ${totalTokens}, ${fen}, 1, now())
      ON CONFLICT (COALESCE(tenant_id, '${sql.raw(SYSTEM_TENANT_UUID)}'::uuid), spend_date, provider) DO UPDATE SET
        total_tokens = llm_spend_daily.total_tokens + EXCLUDED.total_tokens,
        cost_fen     = llm_spend_daily.cost_fen + EXCLUDED.cost_fen,
        call_count   = llm_spend_daily.call_count + 1,
        updated_at   = now()
    `);
  } catch (err) {
    // Never break the user flow on accounting failures. Log and move on.
    console.warn('[spend-tracker] recordSpend failed', err);
  }
}
