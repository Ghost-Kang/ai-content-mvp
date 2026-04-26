// W2-01-V3 — Offline storyboard validator unit tests.
//
// Pure: no LLM, no DB, no network. Run: pnpm wf:test:storyboard
//
// Covers all 4 hard-fail paths + soft-warning paths in
// `validateStoryboard()`:
//   1. happy path — clean 17-frame input passes, suppression clean
//   2. frame count mismatch — 16 in, 17 expected → FRAME_COUNT_MISMATCH
//   3. camera language out of vocab → CAMERA_LANGUAGE_OUT_OF_VOCAB
//   4. missing required field (scene) → FIELD_MISSING
//   + soft: imagePrompt > 80 chars → truncate + warning, still ok
//   + suppression hit → flagged but doesn't fail

import {
  validateStoryboard,
  CAMERA_LANGUAGE_VOCAB,
  IMAGE_PROMPT_MAX_CHARS,
  IMAGE_PROMPT_MIN_CHARS,
  CAMERA_DIVERSITY_MIN,
} from '../src/lib/prompts/storyboard-prompt';
import type { GeneratedScript } from '../src/lib/prompts/script-templates';

// ─── Test harness ─────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assert(cond: unknown, label: string): void {
  if (cond) {
    console.log(`  [PASS] ${label}`);
    pass++;
  } else {
    console.log(`  [FAIL] ${label}`);
    fail++;
  }
}

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeScriptFrames(n: number): GeneratedScript['frames'] {
  return Array.from({ length: n }, (_, i) => ({
    index:           i + 1,
    text:            `脚本第 ${i + 1} 帧的口播文本`,
    visualDirection: `画面：第 ${i + 1} 帧的视觉建议`,
    durationS:       i < 3 ? 2 : 3,
  }));
}

function makeStoryboardJson(
  n: number,
  override: (i: number) => Partial<{
    index: number | string;
    scene: string;
    imagePrompt: string;
    cameraLanguage: string;
    onScreenText: string;
  }> = () => ({}),
): string {
  const frames = Array.from({ length: n }, (_, i) => {
    const base = {
      index:          i + 1,
      scene:          `场景 ${i + 1} 内一组主体互动`,
      // ~48-char realistic imagePrompt — above MIN floor (40), below MAX cap (80).
      // Keep this wide enough that frame 1's 1-digit index doesn't dip below floor.
      imagePrompt:    `写实风格纪录片感，明亮办公室内景，第 ${i + 1} 帧主体与前景道具互动，顶光柔和浅景深构图`,
      cameraLanguage: CAMERA_LANGUAGE_VOCAB[i % CAMERA_LANGUAGE_VOCAB.length],
    };
    return { ...base, ...override(i) };
  });
  return JSON.stringify({ frames });
}

// ─── Cases ────────────────────────────────────────────────────────────────────

console.log('--- W2-01-V3 storyboard validator unit tests ---\n');

// ─── Case 1: happy path ──────────────────────────────────────────────────────
console.log('[case 1] happy path — 17 clean frames, in vocab, under caps');
{
  const scriptFrames = makeScriptFrames(17);
  const raw = makeStoryboardJson(17);
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === true, 'r.ok === true');
  assert(r.issues.length === 0, 'no issues');
  assert(r.warnings.length === 0, 'no warnings');
  assert(r.output?.frames.length === 17, '17 frames assembled');
  assert(r.output?.promptVersion === 'v0', 'promptVersion = v0');
  assert(r.output?.totalDurationSec === 3 * 2 + 14 * 3, 'totalDurationSec = 6+42=48');
  assert(r.output?.suppressionFlags.length === 0, 'no suppression flags on clean input');
  assert(
    r.output?.frames[0].voiceover === '脚本第 1 帧的口播文本',
    'voiceover passed through from script frame',
  );
  assert(r.output?.frames[0].durationSec === 2, 'durationSec passed through');
}

// ─── Case 2: frame count mismatch ─────────────────────────────────────────────
console.log('\n[case 2] frame count mismatch — 16 in, 17 expected');
{
  const scriptFrames = makeScriptFrames(17);
  const raw = makeStoryboardJson(16);
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === false, 'r.ok === false');
  assert(r.output === undefined, 'no output assembled');
  assert(r.issues.length === 1, 'exactly 1 issue');
  assert(r.issues[0].code === 'FRAME_COUNT_MISMATCH', 'code = FRAME_COUNT_MISMATCH');
  assert(r.issues[0].detail.includes('expected 17'), 'detail mentions expected count');
  assert(r.issues[0].detail.includes('got 16'), 'detail mentions actual count');
}

// ─── Case 3: camera language out of vocab ─────────────────────────────────────
console.log('\n[case 3] camera language out of vocab — "鸟瞰" not in 8-vocab');
{
  const scriptFrames = makeScriptFrames(17);
  const raw = makeStoryboardJson(17, (i) => (i === 5 ? { cameraLanguage: '鸟瞰' } : {}));
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === false, 'r.ok === false');
  const vocabIssues = r.issues.filter((x) => x.code === 'CAMERA_LANGUAGE_OUT_OF_VOCAB');
  assert(vocabIssues.length === 1, 'exactly 1 vocab issue');
  assert(vocabIssues[0].frameIndex === 6, 'frame index 6 (1-based) flagged');
  assert(vocabIssues[0].detail.includes('鸟瞰'), 'detail names the offending term');
}

// ─── Case 4: missing required field ───────────────────────────────────────────
console.log('\n[case 4] missing required field — scene empty on frame 3');
{
  const scriptFrames = makeScriptFrames(17);
  const raw = makeStoryboardJson(17, (i) => (i === 2 ? { scene: '' } : {}));
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === false, 'r.ok === false');
  const missing = r.issues.filter((x) => x.code === 'FIELD_MISSING');
  assert(missing.length === 1, 'exactly 1 missing-field issue');
  assert(missing[0].frameIndex === 3, 'frame index 3 flagged');
  assert(missing[0].detail.includes('scene'), 'detail names "scene"');
}

// ─── Case 5: imagePrompt over cap → soft truncate + warning ──────────────────
console.log('\n[case 5] imagePrompt over cap — soft truncate, still ok');
{
  const scriptFrames = makeScriptFrames(17);
  const longPrompt = '写实风格，' + '细节'.repeat(50); // 5 + 100 = 105 chars
  const raw = makeStoryboardJson(17, (i) => (i === 0 ? { imagePrompt: longPrompt } : {}));
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === true, 'r.ok === true (soft truncate, not hard fail)');
  assert(r.warnings.length === 1, 'exactly 1 warning');
  assert(r.warnings[0].includes('imagePrompt truncated'), 'warning describes truncation');
  assert(
    r.output?.frames[0].imagePrompt.length === IMAGE_PROMPT_MAX_CHARS,
    `frame 1 imagePrompt = exactly ${IMAGE_PROMPT_MAX_CHARS} chars after truncate`,
  );
}

// ─── Case 6: suppression flag on imagePrompt ─────────────────────────────────
console.log('\n[case 6] suppression scan picks up "震撼" in imagePrompt');
{
  const scriptFrames = makeScriptFrames(17);
  const raw = makeStoryboardJson(17, (i) =>
    i === 0 ? { imagePrompt: '震撼场景，写实风格' } : {},
  );
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === true, 'still ok (suppression is reported, not fatal)');
  assert(
    r.output !== undefined && r.output.suppressionFlags.length >= 1,
    'at least 1 suppression flag returned',
  );
  const hypeFlag = r.output?.suppressionFlags.find((f) => f.matchedText === '震撼');
  assert(hypeFlag !== undefined, '震撼 flagged under hype_superlative');
  assert(hypeFlag?.category === 'hype_superlative', 'category=hype_superlative');
}

// ─── Case 7: frame index mismatch ─────────────────────────────────────────────
console.log('\n[case 7] frame index mismatch — index=99 on slot 0');
{
  const scriptFrames = makeScriptFrames(17);
  const raw = makeStoryboardJson(17, (i) => (i === 0 ? { index: 99 } : {}));
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === false, 'r.ok === false');
  const idxIssue = r.issues.find((x) => x.code === 'FRAME_INDEX_MISMATCH');
  assert(idxIssue !== undefined, 'FRAME_INDEX_MISMATCH issue raised');
  assert(idxIssue?.detail.includes('expected 1'), 'detail mentions expected 1');
}

// ─── Case 8: malformed JSON ───────────────────────────────────────────────────
console.log('\n[case 8] malformed JSON');
{
  const scriptFrames = makeScriptFrames(17);
  const r = validateStoryboard('not json {{{', scriptFrames, 'mock-llm');
  assert(r.ok === false, 'r.ok === false');
  assert(r.issues[0]?.code === 'PARSE_FAILED', 'code = PARSE_FAILED');
}

// ─── Case 9: placeholder leak (hard fail) ─────────────────────────────────────
console.log('\n[case 9] placeholder "<…>" leaked into a field');
{
  const scriptFrames = makeScriptFrames(17);
  const raw = makeStoryboardJson(17, (i) =>
    i === 3 ? { imagePrompt: '<40-80 字中文 image prompt>' } : {},
  );
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === false, 'r.ok === false');
  const placeholderIssue = r.issues.find((x) => x.code === 'PLACEHOLDER_LEAKED');
  assert(placeholderIssue !== undefined, 'PLACEHOLDER_LEAKED raised');
  assert(placeholderIssue?.frameIndex === 4, 'frame 4 flagged');
  assert(placeholderIssue?.detail.includes('imagePrompt'), 'detail names imagePrompt');
}

// ─── Case 10: imagePrompt below floor → soft warning ──────────────────────────
console.log('\n[case 10] imagePrompt below floor → soft warning, still ok');
{
  const scriptFrames = makeScriptFrames(17);
  const shortPrompt = '写实风格，特写'; // 7 chars < MIN 40
  const raw = makeStoryboardJson(17, (i) => (i === 0 ? { imagePrompt: shortPrompt } : {}));
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === true, 'r.ok === true (soft warning)');
  const floorWarning = r.warnings.find((w) => w.includes('below floor'));
  assert(floorWarning !== undefined, 'below-floor warning emitted');
  assert(
    floorWarning?.includes(String(IMAGE_PROMPT_MIN_CHARS)),
    `warning names min floor ${IMAGE_PROMPT_MIN_CHARS}`,
  );
}

// ─── Case 11: low camera diversity → soft warning ─────────────────────────────
console.log('\n[case 11] camera diversity < 5 → soft warning');
{
  const scriptFrames = makeScriptFrames(17);
  // Force all 17 frames to use just "特写" + "中景" (2 distinct < 5 floor)
  const raw = makeStoryboardJson(17, (i) => ({
    cameraLanguage: i % 2 === 0 ? '特写' : '中景',
  }));
  const r = validateStoryboard(raw, scriptFrames, 'mock-llm');
  assert(r.ok === true, 'r.ok === true (soft warning)');
  const divWarning = r.warnings.find((w) => w.includes('camera diversity'));
  assert(divWarning !== undefined, 'camera diversity warning emitted');
  assert(divWarning?.includes('2 distinct'), 'warning reports 2 distinct');
  assert(divWarning?.includes(String(CAMERA_DIVERSITY_MIN)), `warning names min ${CAMERA_DIVERSITY_MIN}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n--- ${pass} pass / ${fail} fail ---`);
if (fail > 0) {
  console.log('❌ assertions failed');
  process.exit(1);
}
console.log('✅ All assertions pass.');
