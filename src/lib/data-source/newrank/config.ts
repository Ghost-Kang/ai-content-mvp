// D31 (2026-04-25) — 新榜 provider config.

export interface NewrankConfig {
  apiKey:  string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://api.newrank.cn/api/v2/custom/wx';

export function loadNewrankConfig(): NewrankConfig {
  const apiKey  = process.env.NEWRANK_API_KEY;
  const baseUrl = process.env.NEWRANK_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      'NEWRANK_API_KEY is not set. Add it to .env.local. ' +
      '密钥见 D31 vendor onboarding (2026-04-25).',
    );
  }
  return { apiKey: apiKey.trim(), baseUrl };
}

/** Lightweight presence check for places that want to gate behavior on config. */
export function isNewrankConfigured(): boolean {
  return Boolean(process.env.NEWRANK_API_KEY?.trim());
}
