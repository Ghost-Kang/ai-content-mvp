// W3-08 + W3-09 — Unit tests for the per-frame editor pure logic.
//
// Covers:
//   1.  reindex contiguity after every mutation
//   2.  insertFrameAt — start / middle / end / out-of-bounds clamping
//   3.  deleteFrameAt — middle / first / last / refuses to drop below 1
//   4.  moveFrame — middle ↑↓ swap, edge no-ops
//   5.  patchFrame — preserves index even if patch tries to overwrite it
//   6.  rebuildScriptOutput — recomputes charCount/frameCount/fullText,
//       preserves passthrough fields (provider, model, etc.)
//   7.  rebuildStoryboardOutput — recomputes totalDurationSec, preserves
//       passthrough fields
//   8.  coerce* — bad/partial/missing input → safe defaults, no throws
//   9.  countNonWhitespace — Chinese chars + ascii + whitespace
//   10. makeEmpty* — sane defaults
//   11. (W3-09) moveFrameTo — arbitrary from→to drag semantics, OOB safety
//   12. (W3-09) validateScriptFrame — empty / short / long / dur sign
//   13. (W3-09) validateStoryboardFrame — required fields + img prompt
//                bounds + onScreenText length
//
// Pure / no-DB / no-LLM / no-fs. Runs in <50ms.
//
// Run: pnpm wf:test:frames

import { CAMERA_LANGUAGE_VOCAB } from '../src/lib/prompts/storyboard-prompt';
import {
  type ScriptFrameShape,
  type ScriptOutputShape,
  type StoryboardFrameShape,
  type StoryboardOutputShape,
  coerceScriptFrames,
  coerceStoryboardFrames,
  countNonWhitespace,
  deleteFrameAt,
  insertFrameAt,
  makeEmptyScriptFrame,
  makeEmptyStoryboardFrame,
  moveFrame,
  moveFrameTo,
  patchFrame,
  rebuildScriptOutput,
  rebuildStoryboardOutput,
  reindex,
  validateScriptFrame,
  validateStoryboardFrame,
} from '../src/components/workflow/frame-editor-logic';

let failures = 0;
function expect(cond: boolean, msg: string) {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${tag}] ${msg}`);
}
function group(name: string) { console.log(`\n${name}`); }

// ─── Fixtures ────────────────────────────────────────────────────────────────

function scriptFrame(index: number, text = `f${index}`, dur = 2): ScriptFrameShape {
  return { index, text, visualDirection: `vd${index}`, durationS: dur };
}

function storyboardFrame(index: number, vo = `vo${index}`): StoryboardFrameShape {
  return {
    index,
    voiceover:      vo,
    durationSec:    3,
    cameraLanguage: CAMERA_LANGUAGE_VOCAB[index % CAMERA_LANGUAGE_VOCAB.length],
    scene:          `scene${index}`,
    imagePrompt:    `prompt${index}`,
    onScreenText:   '',
  };
}

console.log('--- W3-08 frame-editor pure-logic tests ---');

// ─── case 1: reindex ─────────────────────────────────────────────────────────

group('[case 1] reindex — contiguous from 1, no holes');
{
  const input = [scriptFrame(7), scriptFrame(99), scriptFrame(2)];
  const out = reindex(input);
  expect(out.length === 3, 'length preserved');
  expect(out[0].index === 1 && out[1].index === 2 && out[2].index === 3, 'indices renumbered to 1,2,3');
  expect(out[0].text === 'f7' && out[1].text === 'f99' && out[2].text === 'f2', 'order preserved');
  // pure
  expect(input[0].index === 7, 'input not mutated');
}

// ─── case 2: insertFrameAt ───────────────────────────────────────────────────

group('[case 2] insertFrameAt — start / middle / end / OOB clamp');
{
  const base = [scriptFrame(1), scriptFrame(2), scriptFrame(3)];
  const newF = makeEmptyScriptFrame(0);

  const inFront = insertFrameAt(base, 0, newF);
  expect(inFront.length === 4, 'insert at 0 → length 4');
  expect(inFront[0].text === '', 'new frame at front');
  expect(inFront[0].index === 1 && inFront[3].index === 4, 'reindexed contiguously');

  const inMid = insertFrameAt(base, 2, newF);
  expect(inMid[2].text === '' && inMid[1].text === 'f2', 'middle insert preserves prefix');
  expect(inMid[2].index === 3, 'middle inserted at index 3');

  const inEnd = insertFrameAt(base, 3, newF);
  expect(inEnd[3].text === '', 'end insert at exact length');

  const oobHi = insertFrameAt(base, 999, newF);
  expect(oobHi[oobHi.length - 1].text === '', 'OOB high → clamped to end');

  const oobLo = insertFrameAt(base, -5, newF);
  expect(oobLo[0].text === '', 'OOB low → clamped to start');
}

// ─── case 3: deleteFrameAt ───────────────────────────────────────────────────

group('[case 3] deleteFrameAt — middle / edges / refuses below 1');
{
  const base = [scriptFrame(1), scriptFrame(2), scriptFrame(3)];

  const delMid = deleteFrameAt(base, 1);
  expect(delMid.length === 2, 'middle delete → length 2');
  expect(delMid[0].text === 'f1' && delMid[1].text === 'f3', 'middle removed');
  expect(delMid[0].index === 1 && delMid[1].index === 2, 'reindexed');

  const delFirst = deleteFrameAt(base, 0);
  expect(delFirst[0].text === 'f2' && delFirst[1].text === 'f3', 'first delete');

  const delLast = deleteFrameAt(base, 2);
  expect(delLast[0].text === 'f1' && delLast[1].text === 'f2', 'last delete');

  const single = [scriptFrame(1)];
  const refused = deleteFrameAt(single, 0);
  expect(refused.length === 1, 'refuses to drop below 1 frame');
  expect(refused[0].text === 'f1', 'sole frame untouched');

  const oob = deleteFrameAt(base, 99);
  expect(oob.length === 3, 'OOB delete is no-op');
}

// ─── case 4: moveFrame ───────────────────────────────────────────────────────

group('[case 4] moveFrame — adjacent swap, edge clamps');
{
  const base = [scriptFrame(1, 'A'), scriptFrame(2, 'B'), scriptFrame(3, 'C')];

  const upMid = moveFrame(base, 1, -1);
  expect(upMid[0].text === 'B' && upMid[1].text === 'A' && upMid[2].text === 'C', 'middle ↑ swaps with prev');
  expect(upMid[0].index === 1 && upMid[1].index === 2, 'reindexed after swap');

  const downMid = moveFrame(base, 1, 1);
  expect(downMid[0].text === 'A' && downMid[1].text === 'C' && downMid[2].text === 'B', 'middle ↓ swaps with next');

  const upFirst = moveFrame(base, 0, -1);
  expect(upFirst[0].text === 'A', 'up at first is no-op');

  const downLast = moveFrame(base, 2, 1);
  expect(downLast[2].text === 'C', 'down at last is no-op');

  const oob = moveFrame(base, 99, -1);
  expect(oob.length === 3 && oob[0].text === 'A', 'OOB move is no-op');
}

// ─── case 5: patchFrame ──────────────────────────────────────────────────────

group('[case 5] patchFrame — overwrites fields but preserves index');
{
  const base = [scriptFrame(1, 'A'), scriptFrame(2, 'B'), scriptFrame(3, 'C')];

  const patched = patchFrame(base, 1, { text: 'B-edited', durationS: 5 });
  expect(patched[1].text === 'B-edited', 'text patched');
  expect(patched[1].durationS === 5, 'duration patched');
  expect(patched[1].index === 2, 'index NOT overwritten by patch');
  expect(patched[0].text === 'A' && patched[2].text === 'C', 'siblings unchanged');

  // try to patch index → must be ignored
  const sneakyPatched = patchFrame(base, 1, { index: 999, text: 'sneaky' } as Partial<ScriptFrameShape>);
  expect(sneakyPatched[1].index === 2, 'patch.index attempts are blocked');
  expect(sneakyPatched[1].text === 'sneaky', 'other fields still applied');

  const oob = patchFrame(base, 99, { text: 'X' });
  expect(oob.length === 3, 'OOB patch is no-op');
}

// ─── case 6: rebuildScriptOutput ─────────────────────────────────────────────

group('[case 6] rebuildScriptOutput — derived fields recomputed, passthrough preserved');
{
  const original: ScriptOutputShape = {
    frames:     [scriptFrame(1, '原始')],
    charCount:  999,            // wrong on purpose
    frameCount: 999,            // wrong on purpose
    fullText:   'STALE',        // wrong on purpose
    provider:   'openai-mock',  // passthrough
    model:      'gpt-4',        // passthrough
    qualityIssue: null,
    suppressionFlags: ['x'],
  } as ScriptOutputShape;

  const newFrames: ScriptFrameShape[] = [
    scriptFrame(1, '钩子'),       // 2 chars
    scriptFrame(2, '论点 hello'), // 7 non-ws chars (论点 = 2, hello = 5)
    scriptFrame(3, '收尾金句'),   // 4 chars
  ];

  const out = rebuildScriptOutput(original, newFrames);
  expect(out.frameCount === 3, `frameCount=${out.frameCount} → 3`);
  // 2 + 7 + 4 = 13
  expect(out.charCount === 13, `charCount=${out.charCount} → 13 (no-ws)`);
  expect(typeof out.fullText === 'string' && out.fullText.includes('钩子') && out.fullText.includes('hello'), 'fullText concatenated');
  expect(out.provider === 'openai-mock', 'provider passthrough preserved');
  expect(out.model === 'gpt-4', 'model passthrough preserved');
  expect(Array.isArray(out.suppressionFlags) && out.suppressionFlags[0] === 'x', 'suppressionFlags preserved');
  expect(out.qualityIssue === null, 'qualityIssue=null preserved');
  expect(out.frames.length === 3 && out.frames !== newFrames, 'frames cloned (not aliased)');
}

// ─── case 7: rebuildStoryboardOutput ─────────────────────────────────────────

group('[case 7] rebuildStoryboardOutput — totalDurationSec recomputed, passthrough preserved');
{
  const original: StoryboardOutputShape = {
    frames:           [storyboardFrame(1)],
    totalDurationSec: 999,
    promptVersion:    'v1',
    generatedAt:      '2025-01-01T00:00:00Z',
    llmModel:         'doubao-mock',
  } as StoryboardOutputShape;

  const newFrames: StoryboardFrameShape[] = [
    { ...storyboardFrame(1), durationSec: 2 },
    { ...storyboardFrame(2), durationSec: 4 },
    { ...storyboardFrame(3), durationSec: 1.5 },
  ];

  const out = rebuildStoryboardOutput(original, newFrames);
  expect(Math.abs(out.totalDurationSec! - 7.5) < 1e-9, `totalDurationSec=${out.totalDurationSec} → 7.5`);
  expect(out.promptVersion === 'v1', 'promptVersion passthrough');
  expect(out.generatedAt === '2025-01-01T00:00:00Z', 'generatedAt passthrough');
  expect(out.llmModel === 'doubao-mock', 'llmModel passthrough');
  expect(out.frames.length === 3, 'frames overwritten');
}

// ─── case 8: coerceScriptFrames ──────────────────────────────────────────────

group('[case 8] coerceScriptFrames — handles malformed input safely');
{
  expect(coerceScriptFrames(null).length === 0, 'null → empty array');
  expect(coerceScriptFrames(undefined).length === 0, 'undefined → empty');
  expect(coerceScriptFrames('not an array').length === 0, 'string → empty');
  expect(coerceScriptFrames(42).length === 0, 'number → empty');

  const partial = coerceScriptFrames([
    { index: 1, text: 'OK' },
    { text: 'no index' },                     // missing index → fallback
    null,                                     // null entry → filtered
    { index: 5, text: 'V', durationS: 2.5 },  // valid
    'string entry',                           // garbage → filtered
  ]);
  expect(partial.length === 3, `valid entries kept (got ${partial.length})`);
  expect(partial[0].text === 'OK' && partial[0].index === 1, 'first frame intact');
  expect(partial[1].text === 'no index' && partial[1].index === 2, 'fallback index = position+1');
  expect(partial[1].visualDirection === '' && partial[1].durationS === 0, 'missing fields → defaults');
  expect(partial[2].durationS === 2.5, 'numeric durationS preserved');
}

// ─── case 9: coerceStoryboardFrames ──────────────────────────────────────────

group('[case 9] coerceStoryboardFrames — handles bad camera lang + missing fields');
{
  const out = coerceStoryboardFrames([
    {
      index: 1, voiceover: 'A', durationSec: 2, cameraLanguage: '特写',
      scene: 's', imagePrompt: 'p',
    },
    {
      // unknown camera term → falls back to first vocab entry
      index: 2, voiceover: 'B', durationSec: 3, cameraLanguage: 'WACKY_TERM',
      scene: 's', imagePrompt: 'p', onScreenText: '字幕',
    },
    {
      // missing every optional field → all defaults
      voiceover: 'C',
    },
  ]);

  expect(out.length === 3, '3 frames coerced');
  expect(out[0].cameraLanguage === '特写', 'valid camera term preserved');
  expect(out[1].cameraLanguage === CAMERA_LANGUAGE_VOCAB[0], 'unknown camera term → first vocab entry');
  expect(out[1].onScreenText === '字幕', 'optional onScreenText preserved when present');
  expect(out[2].voiceover === 'C' && out[2].imagePrompt === '' && out[2].scene === '', 'missing string fields → empty string defaults');
  expect(out[2].index === 3, 'fallback index = position+1');
}

// ─── case 10: countNonWhitespace ─────────────────────────────────────────────

group('[case 10] countNonWhitespace — Chinese + ASCII + whitespace mix');
{
  expect(countNonWhitespace('') === 0, 'empty → 0');
  expect(countNonWhitespace('   \n\t  ') === 0, 'whitespace only → 0');
  expect(countNonWhitespace('hello') === 5, 'ASCII → 5');
  expect(countNonWhitespace('你好') === 2, 'Chinese 2 chars → 2');
  expect(countNonWhitespace('hello 你好') === 7, 'ASCII + Chinese with space → 7');
  expect(countNonWhitespace('  hello\n你好\t!  ') === 8, 'mixed with surrounding ws → 8');
}

// ─── case 11: makeEmpty* — sane defaults ─────────────────────────────────────

group('[case 11] makeEmpty factories produce valid blank frames');
{
  const sf = makeEmptyScriptFrame(7);
  expect(sf.index === 7, 'script blank index = arg');
  expect(sf.text === '' && sf.visualDirection === '', 'blank strings');
  expect(sf.durationS > 0, `blank durationS > 0 (${sf.durationS})`);

  const tf = makeEmptyStoryboardFrame(3);
  expect(tf.index === 3, 'storyboard blank index = arg');
  expect(tf.cameraLanguage === CAMERA_LANGUAGE_VOCAB[0], 'cameraLanguage defaults to vocab[0]');
  expect(tf.voiceover === '' && tf.scene === '' && tf.imagePrompt === '', 'blank text fields');
  expect(tf.onScreenText === '', 'onScreenText defaults to empty string');
}

// ─── case 12: moveFrameTo — arbitrary drag from→to (W3-09) ───────────────────

group('[case 12] moveFrameTo — arbitrary drag from→to semantics');
{
  const base = [
    scriptFrame(1, 'A'),
    scriptFrame(2, 'B'),
    scriptFrame(3, 'C'),
    scriptFrame(4, 'D'),
    scriptFrame(5, 'E'),
  ];

  // Drag B (pos 1) forward past D — lands at pos 3 in result array (dnd-kit
  // semantics: the dragged item ends up at the requested index).
  const fwd = moveFrameTo(base, 1, 3);
  expect(
    fwd.map((f) => f.text).join('') === 'ACDBE',
    `forward drag 1→3 → ACDBE (got ${fwd.map((f) => f.text).join('')})`,
  );
  expect(fwd.every((f, i) => f.index === i + 1), 'reindexed contiguously after forward drag');

  // Drag D (pos 3) backward to pos 1.
  const back = moveFrameTo(base, 3, 1);
  expect(
    back.map((f) => f.text).join('') === 'ADBCE',
    `backward drag 3→1 → ADBCE (got ${back.map((f) => f.text).join('')})`,
  );

  // Drag last to first (move E to index 0).
  const lastToFirst = moveFrameTo(base, 4, 0);
  expect(
    lastToFirst.map((f) => f.text).join('') === 'EABCD',
    `4→0 → EABCD (got ${lastToFirst.map((f) => f.text).join('')})`,
  );
  expect(lastToFirst[0].index === 1 && lastToFirst[4].index === 5, 'reindex after large jump');

  // Same position → no-op (still returns a new array, not the same ref).
  const same = moveFrameTo(base, 2, 2);
  expect(
    same.map((f) => f.text).join('') === 'ABCDE',
    'same-pos drag is no-op',
  );
  expect(same !== base, 'no-op still returns a fresh array (immutability contract)');

  // toPos === length → append (move first to past-end == push to end).
  const toEnd = moveFrameTo(base, 0, base.length);
  expect(
    toEnd.map((f) => f.text).join('') === 'BCDEA',
    `0→length (append) → BCDEA (got ${toEnd.map((f) => f.text).join('')})`,
  );

  // OOB safety.
  const oobFrom = moveFrameTo(base, 99, 1);
  expect(oobFrom.length === 5 && oobFrom[0].text === 'A', 'OOB from is no-op');
  const oobTo   = moveFrameTo(base, 0, -5);
  expect(oobTo.length === 5 && oobTo[0].text === 'A', 'OOB to is no-op');
  const oobToHi = moveFrameTo(base, 0, 999);
  expect(oobToHi.length === 5 && oobToHi[0].text === 'A', 'OOB to (high) is no-op');

  // Pure — input not mutated.
  expect(base[1].text === 'B', 'input array element untouched');
}

// ─── case 13: validateScriptFrame (W3-09) ────────────────────────────────────

group('[case 13] validateScriptFrame — empty / short / long / dur sign');
{
  // Empty text → error
  const v0 = validateScriptFrame(scriptFrame(1, '', 3));
  expect(v0.text?.level === 'error' && v0.text?.code === 'EMPTY', 'empty text → error EMPTY');
  expect(v0.durationS === undefined, 'positive duration → no issue');

  // Whitespace-only text → still error
  const v0b = validateScriptFrame(scriptFrame(1, '   \n  ', 3));
  expect(v0b.text?.level === 'error' && v0b.text?.code === 'EMPTY', 'whitespace-only text → error EMPTY');

  // Too short (1-7 non-ws chars) → warning
  const vShort = validateScriptFrame(scriptFrame(1, 'hi', 3));
  expect(vShort.text?.level === 'warning' && vShort.text?.code === 'TOO_SHORT', 'short text → warning TOO_SHORT');

  // In range (8-15 chars) → no issue
  const vOK = validateScriptFrame(scriptFrame(1, 'twelve chars', 3)); // 11 chars, in 8-15
  expect(vOK.text === undefined, 'in-range text → no text issue');

  // Boundary: exactly 8 → ok
  const vMin = validateScriptFrame(scriptFrame(1, '12345678', 3));
  expect(vMin.text === undefined, 'exactly 8 chars → ok');

  // Boundary: exactly 15 → ok
  const vMax = validateScriptFrame(scriptFrame(1, '123456789012345', 3));
  expect(vMax.text === undefined, 'exactly 15 chars → ok');

  // Boundary: 16 → too long
  const vLong = validateScriptFrame(scriptFrame(1, '1234567890123456', 3));
  expect(vLong.text?.level === 'warning' && vLong.text?.code === 'TOO_LONG', '16 chars → warning TOO_LONG');

  // Duration ≤ 0 → error
  const vDur0 = validateScriptFrame(scriptFrame(1, '1234567890', 0));
  expect(vDur0.durationS?.level === 'error' && vDur0.durationS?.code === 'INVALID', 'dur=0 → error');

  const vDurNeg = validateScriptFrame(scriptFrame(1, '1234567890', -2));
  expect(vDurNeg.durationS?.level === 'error', 'negative dur → error');

  const vDurNaN = validateScriptFrame({ ...scriptFrame(1, '1234567890', 0), durationS: NaN });
  expect(vDurNaN.durationS?.level === 'error', 'NaN dur → error');

  // Duration > 10 → warning
  const vDurLong = validateScriptFrame(scriptFrame(1, '1234567890', 12));
  expect(vDurLong.durationS?.level === 'warning' && vDurLong.durationS?.code === 'TOO_LONG', 'dur=12 → warning');
}

// ─── case 14: validateStoryboardFrame (W3-09) ────────────────────────────────

group('[case 14] validateStoryboardFrame — required + img prompt bounds + onscreen len');
{
  const longPrompt = 'a'.repeat(60); // in OK range (40-80)
  const baseOK: StoryboardFrameShape = {
    ...storyboardFrame(1),
    voiceover:   '今天我们聊聊夜跑',
    scene:       '夜晚街道，路灯昏黄',
    imagePrompt: longPrompt,
    durationSec: 3,
    onScreenText: '夜跑',
  };
  const vOK = validateStoryboardFrame(baseOK);
  expect(Object.keys(vOK).length === 0, `clean frame → no issues (got ${JSON.stringify(vOK)})`);

  // Empty voiceover → error
  const vEmptyVO = validateStoryboardFrame({ ...baseOK, voiceover: '' });
  expect(vEmptyVO.voiceover?.level === 'error' && vEmptyVO.voiceover?.code === 'EMPTY', 'empty voiceover → error');

  // Whitespace-only voiceover → error
  const vWsVO = validateStoryboardFrame({ ...baseOK, voiceover: '   ' });
  expect(vWsVO.voiceover?.level === 'error', 'whitespace voiceover → error');

  // Empty scene → error
  const vEmptyScene = validateStoryboardFrame({ ...baseOK, scene: '' });
  expect(vEmptyScene.scene?.level === 'error', 'empty scene → error');

  // Empty image prompt → error
  const vEmptyImg = validateStoryboardFrame({ ...baseOK, imagePrompt: '' });
  expect(vEmptyImg.imagePrompt?.level === 'error' && vEmptyImg.imagePrompt?.code === 'EMPTY', 'empty img prompt → error');

  // Short image prompt (1-39 chars) → warning
  const vShortImg = validateStoryboardFrame({ ...baseOK, imagePrompt: 'short' });
  expect(vShortImg.imagePrompt?.level === 'warning' && vShortImg.imagePrompt?.code === 'TOO_SHORT', 'short img prompt → warning');

  // Boundary: exactly 40 → ok
  const vImg40 = validateStoryboardFrame({ ...baseOK, imagePrompt: 'a'.repeat(40) });
  expect(vImg40.imagePrompt === undefined, 'img prompt = 40 chars → ok');

  // Boundary: exactly 80 → ok
  const vImg80 = validateStoryboardFrame({ ...baseOK, imagePrompt: 'a'.repeat(80) });
  expect(vImg80.imagePrompt === undefined, 'img prompt = 80 chars → ok');

  // 81 → too long warning
  const vImg81 = validateStoryboardFrame({ ...baseOK, imagePrompt: 'a'.repeat(81) });
  expect(vImg81.imagePrompt?.level === 'warning' && vImg81.imagePrompt?.code === 'TOO_LONG', 'img prompt > 80 → warning');

  // Duration ≤ 0 → error
  const vDur0 = validateStoryboardFrame({ ...baseOK, durationSec: 0 });
  expect(vDur0.durationSec?.level === 'error', 'dur=0 → error');

  // onScreenText > 12 → warning
  const vOST = validateStoryboardFrame({ ...baseOK, onScreenText: '一二三四五六七八九十十一十二十三' });
  expect(vOST.onScreenText?.level === 'warning' && vOST.onScreenText?.code === 'TOO_LONG', 'onScreenText > 12 → warning');

  // No onScreenText → no issue
  const vNoOST = validateStoryboardFrame({ ...baseOK, onScreenText: undefined });
  expect(vNoOST.onScreenText === undefined, 'undefined onScreenText → no issue');

  // onScreenText exactly 12 → ok
  const vOST12 = validateStoryboardFrame({ ...baseOK, onScreenText: 'a'.repeat(12) });
  expect(vOST12.onScreenText === undefined, 'onScreenText = 12 chars → ok');
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (failures === 0) {
  console.log('✅ All W3-08 + W3-09 frame-editor assertions pass.');
  process.exit(0);
} else {
  console.error(`❌ ${failures} assertion(s) failed.`);
  process.exit(1);
}
