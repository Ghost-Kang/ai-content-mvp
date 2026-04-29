// Probe-only: inspect most recent workflow run + video step error.
// Usage: pnpm tsx --env-file=.env.local scripts/inspect-recent-run.ts

import { db, workflowRuns, workflowSteps } from '../src/db';
import { desc, eq } from 'drizzle-orm';

(async () => {
  const [latest] = await db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt)).limit(1);
  if (!latest) { console.log('no runs'); process.exit(0); }

  console.log('=== RUN ===');
  console.log({
    id: latest.id, topic: latest.topic, status: latest.status,
    errorMsg: latest.errorMsg,
    totalCostFen: latest.totalCostFen,
    totalVideoCount: latest.totalVideoCount,
    createdAt: latest.createdAt, completedAt: latest.completedAt,
    durationS: latest.completedAt && latest.startedAt ? ((+latest.completedAt - +latest.startedAt)/1000).toFixed(1) : null,
  });

  const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, latest.id));
  console.log('\n=== STEPS ===');
  for (const s of steps.sort((a,b) => a.stepIndex - b.stepIndex)) {
    const dur = s.startedAt && s.completedAt ? ((+s.completedAt - +s.startedAt)/1000).toFixed(1) : null;
    console.log(`#${s.stepIndex} ${s.nodeType.padEnd(10)} status=${s.status.padEnd(8)} retry=${s.retryCount} dur=${dur}s cost=${s.costFen}fen err=${(s.errorMsg||'').slice(0,500)}`);
  }

  const videoStep = steps.find(s => s.nodeType === 'video');
  if (videoStep?.outputJson) {
    const out = videoStep.outputJson as Record<string, unknown>;
    console.log('\n=== VIDEO OUTPUT ===');
    console.log('frames count:', Array.isArray(out.frames) ? (out.frames as unknown[]).length : 'n/a');
    console.log('totalCostFen:', out.totalCostFen);
    console.log('provider:', out.provider, 'model:', out.model);
    console.log('resolution:', out.resolution);
    console.log('incomplete?:', out.incomplete);
    if (Array.isArray(out.frames)) {
      console.log('frame samples (first 3):');
      (out.frames as Array<Record<string, unknown>>).slice(0,3).forEach((f) => {
        console.log(`  #${f.index} jobId=${String(f.jobId).slice(0,30)} url=${String(f.videoUrl||'').slice(0,60)}... cost=${f.costFen}fen attempts=${f.attemptCount}`);
      });
    }
  }
  process.exit(0);
})();
