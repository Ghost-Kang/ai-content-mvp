/**
 * Synthetic probes for reachability + rough latency (TTFB until response headers).
 *
 * Run from a mainland POP / CN VPS cron — NOT a substitute for cloud multi-region probes.
 *
 *   PROBE_BASE_URL=https://your-domain pnpm probe:public
 *   PROBE_BASE_URL=https://your-domain pnpm exec tsx scripts/probe-public-urls.ts --json
 *
 * Exit: 0 ok · 1 probe failed · 2 missing PROBE_BASE_URL
 */

type ProbeResult = {
  path: string;
  ok: boolean;
  status: number;
  ttfbMs: number;
  note?: string;
};

function baseUrl(): string | null {
  const raw = process.env.PROBE_BASE_URL?.trim() ?? '';
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) return null;
  return raw.replace(/\/$/, '');
}

async function probe(
  absoluteUrl: string,
  path: string,
  mode: 'health' | 'page',
): Promise<ProbeResult> {
  const t0 = performance.now();
  const res = await fetch(absoluteUrl, {
    method: 'GET',
    redirect: mode === 'page' ? 'manual' : 'follow',
    headers: { 'user-agent': 'ai-content-mvp-probe/1.0' },
  });
  const ttfbMs = Math.round(performance.now() - t0);

  if (mode === 'health') {
    if (res.status !== 200) {
      return { path, ok: false, status: res.status, ttfbMs, note: 'expected 200' };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { path, ok: false, status: res.status, ttfbMs, note: 'invalid json' };
    }
    const st = (body as { status?: string }).status;
    if (st !== 'ok') {
      return {
        path,
        ok: false,
        status: res.status,
        ttfbMs,
        note: `body.status=${st ?? 'missing'}`,
      };
    }
    return { path, ok: true, status: res.status, ttfbMs };
  }

  // Protected page: expect 200 (HTML) or redirect to sign-in
  if (res.status >= 200 && res.status < 400) {
    return { path, ok: true, status: res.status, ttfbMs };
  }
  return { path, ok: false, status: res.status, ttfbMs, note: 'unexpected status' };
}

async function runPublicUrlProbes(): Promise<void> {
  const BASE = baseUrl();
  if (!BASE) {
    console.error('Set PROBE_BASE_URL=https://your-production-host');
    process.exit(2);
  }

  const results: ProbeResult[] = [];
  results.push(await probe(`${BASE}/api/healthz`, '/api/healthz', 'health'));
  results.push(await probe(`${BASE}/sign-in`, '/sign-in', 'page'));
  results.push(await probe(`${BASE}/runs`, '/runs', 'page'));

  const jsonOut = process.argv.includes('--json');
  if (jsonOut) {
    console.log(
      JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2),
    );
  } else {
    for (const r of results) {
      const flag = r.ok ? 'OK' : 'FAIL';
      const extra = r.note ? ` (${r.note})` : '';
      console.log(`${flag}\t${r.status}\t${r.ttfbMs}ms\t${r.path}${extra}`);
    }
  }

  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

runPublicUrlProbes().catch((e) => {
  console.error(e);
  process.exit(1);
});
