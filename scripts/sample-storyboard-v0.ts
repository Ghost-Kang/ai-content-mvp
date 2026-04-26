// Quick sanity-check — run storyboard prompt v0 once, dump JSON + inline preview.
// Cost: ~¥0.05 KIMI · ~25s. Idempotent: overwrites fixture each run.
//
// Run: pnpm tsx --env-file=.env.local scripts/sample-storyboard-v0.ts

import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, tenants, users, llmSpendDaily } from '../src/db';
import { executeWithFallback, type LLMRegion } from '../src/lib/llm';
import {
  buildStoryboardPrompt,
  validateStoryboard,
} from '../src/lib/prompts/storyboard-prompt';
import type { ScriptOutput } from '../src/lib/workflow/nodes/script';

const SCRIPT_FIXTURE = path.resolve(__dirname, 'fixtures', 'script-output-sample.json');
const OUT_FIXTURE    = path.resolve(__dirname, 'fixtures', 'storyboard-output-sample.json');

interface FixtureFile {
  _meta: { topic: string; [k: string]: unknown };
  output: ScriptOutput;
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(SCRIPT_FIXTURE, 'utf8')) as FixtureFile;
  console.log(`topic: ${fixture._meta.topic}`);
  console.log(`script frames: ${fixture.output.frames.length}\n`);

  const ts = Date.now();
  const [tenant] = await db.insert(tenants)
    .values({ name: `sb-sample-${ts}`, region: 'CN', plan: 'solo' })
    .returning();
  await db.insert(users).values({
    tenantId:    tenant.id,
    clerkUserId: `sb-sample-${ts}`,
    email:       `sb-sample-${ts}@gen.test`,
    role:        'owner',
  });

  try {
    const { systemPrompt, userPrompt } = buildStoryboardPrompt({
      topic:        fixture._meta.topic,
      scriptFrames: fixture.output.frames,
    });

    const t0 = Date.now();
    const llm = await executeWithFallback({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      intent:           'draft',
      tenantId:         tenant.id,
      region:           'INTL' satisfies LLMRegion,
      preferredProvider: 'openai',  // gpt-4o-mini: ~10× cheaper, ~3× faster than KIMI for Chinese; KIMI auto-fallback if openai fails
      maxTokens:        3000,
      temperature:      0.5,
    });
    const ms = Date.now() - t0;

    const v = validateStoryboard(llm.content, fixture.output.frames, llm.model);
    if (!v.ok || !v.output) {
      console.log(`✗ validation failed: ${v.issues.map((x) => x.code).join(', ')}`);
      console.log('raw LLM output:');
      console.log(llm.content);
      process.exit(1);
    }

    await fs.writeFile(OUT_FIXTURE, JSON.stringify({
      _meta: {
        scriptTopic: fixture._meta.topic,
        generatedAt: new Date().toISOString(),
        model:       llm.model,
        latencyMs:   ms,
        warnings:    v.warnings,
      },
      output: v.output,
    }, null, 2), 'utf8');

    console.log(`✓ ${ms}ms · ${v.output.frames.length} frames · totalDur=${v.output.totalDurationSec}s`);
    console.log(`  warnings: ${v.warnings.length}  suppression: ${v.output.suppressionFlags.length}`);
    console.log(`  written → ${path.relative(process.cwd(), OUT_FIXTURE)}\n`);

    const cameraDist = new Map<string, number>();
    let onScreenCount = 0;
    let totalImageLen = 0;
    let totalSceneLen = 0;
    for (const f of v.output.frames) {
      cameraDist.set(f.cameraLanguage, (cameraDist.get(f.cameraLanguage) ?? 0) + 1);
      if (f.onScreenText) onScreenCount++;
      totalImageLen += f.imagePrompt.length;
      totalSceneLen += f.scene.length;
    }

    console.log('─── stats ─────────────────────────────────');
    console.log(`avg imagePrompt len:   ${(totalImageLen / v.output.frames.length).toFixed(1)} chars  (cap 80)`);
    console.log(`avg scene len:         ${(totalSceneLen / v.output.frames.length).toFixed(1)} chars  (cap 30)`);
    console.log(`onScreenText filled:   ${onScreenCount}/${v.output.frames.length} frames`);
    console.log(`camera distribution:   ${[...cameraDist.entries()].map(([k, c]) => `${k}×${c}`).join(' · ')}`);

    console.log('\n─── 4 sample frames ───────────────────────');
    for (const idx of [0, 4, 9, v.output.frames.length - 1]) {
      const f = v.output.frames[idx];
      console.log(`\n[frame ${f.index}] ${f.cameraLanguage}  ${f.durationSec}s`);
      console.log(`  voiceover:    ${f.voiceover}`);
      console.log(`  scene:        ${f.scene}`);
      console.log(`  imagePrompt:  ${f.imagePrompt}`);
      console.log(`  onScreenText: ${f.onScreenText ?? '(none)'}`);
    }
  } finally {
    await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, tenant.id));
    await db.delete(users).where(eq(users.tenantId, tenant.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
