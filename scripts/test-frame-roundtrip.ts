// W3-08 — End-to-end round-trip test for the per-frame editor.
//
// What this proves:
//   1. coerceScriptFrames / coerceStoryboardFrames safely consume realistic
//      production-shape outputJson (the actual JSON produced by ScriptNodeRunner
//      and StoryboardNodeRunner)
//   2. After patching frames + rebuildScriptOutput / rebuildStoryboardOutput,
//      the resulting payload PASSES the server-side ScriptOutputEditSchema /
//      StoryboardOutputEditSchema — i.e. the user's edits will not get
//      rejected at the editStep mutation boundary
//   3. Passthrough fields (provider, model, suppressionFlags, qualityIssue,
//      generatedAt, llmModel, promptVersion, …) survive the round-trip
//   4. Derived fields (charCount, frameCount, fullText, totalDurationSec) get
//      recomputed correctly post-edit
//   5. Frame mutations (insert/delete/move) all produce schema-valid payloads
//   6. Mode switch (frames → JSON → frames) preserves all data
//
// Run: pnpm wf:test:roundtrip
// (Pure logic — no DB, no network. Safe to run anywhere.)

import {
  coerceScriptFrames,
  coerceStoryboardFrames,
  rebuildScriptOutput,
  rebuildStoryboardOutput,
  insertFrameAt,
  deleteFrameAt,
  moveFrame,
  patchFrame,
  makeEmptyScriptFrame,
  makeEmptyStoryboardFrame,
  countNonWhitespace,
  type ScriptOutputShape,
  type StoryboardOutputShape,
} from '../src/components/workflow/frame-editor-logic';
import {
  ScriptOutputEditSchema,
  StoryboardOutputEditSchema,
} from '../src/lib/workflow/edit-schemas';

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

// ─── Realistic fixtures (mirror the actual NodeRunner output shape) ───────────

const realisticScriptOutput: ScriptOutputShape = {
  frames: [
    { index: 1, text: '今天聊聊早餐三件套，吃饱才有劲。', visualDirection: '吃早餐特写',     durationS: 4 },
    { index: 2, text: '第一是鸡蛋，蛋白质拉满，扛饿。',     visualDirection: '煎蛋出锅特写',   durationS: 4 },
    { index: 3, text: '第二是牛奶，钙好补，省心快手。',     visualDirection: '倒牛奶慢动作',   durationS: 4 },
    { index: 4, text: '第三是粥，温胃补水，老少皆宜。',     visualDirection: '粥盛碗特写',     durationS: 4 },
    { index: 5, text: '关注我每天给你三件套灵感。',         visualDirection: '主播微笑出镜',   durationS: 4 },
  ],
  charCount:           80,
  frameCount:          5,
  fullText:            '今天聊聊早餐三件套，吃饱才有劲。第一是鸡蛋…',
  commentBaitQuestion: '你早餐都吃啥？',
  suppressionFlags:    [],
  provider:            'kimi',
  model:               'moonshot-v1-32k',
  latencyMs:           4321,
  retryCount:          0,
  qualityIssue:        null,
};

const realisticStoryboardOutput: StoryboardOutputShape = {
  promptVersion:    'v0.2',
  frames: [
    { index: 1, voiceover: '今天聊聊早餐三件套', durationSec: 4, cameraLanguage: '中景',  scene: '厨房',  imagePrompt: '木质餐桌上摆着完整的早餐套装，温暖晨光从窗外洒入',                                onScreenText: '早餐三件套' },
    { index: 2, voiceover: '第一是鸡蛋',         durationSec: 4, cameraLanguage: '特写',  scene: '灶台',  imagePrompt: '一个金黄色的煎蛋在白瓷盘中央，蛋黄半流心状态，散发蒸汽',                            onScreenText: '蛋白质拉满' },
    { index: 3, voiceover: '第二是牛奶',         durationSec: 4, cameraLanguage: '俯拍',  scene: '餐桌',  imagePrompt: '透明玻璃杯倒入新鲜牛奶产生气泡，旁边一片切片面包',                                  onScreenText: '钙好补' },
    { index: 4, voiceover: '第三是粥',           durationSec: 4, cameraLanguage: '推近',  scene: '餐桌',  imagePrompt: '青花瓷碗中盛满温热白粥，蒸汽袅袅升起，旁边一碟咸菜小菜',                            onScreenText: '温胃补水' },
    { index: 5, voiceover: '关注我',             durationSec: 4, cameraLanguage: '全景',  scene: '厨房',  imagePrompt: '主播在明亮的厨房中微笑面对镜头，背景是完整的早餐桌面布置',                          onScreenText: '点关注' },
  ],
  totalDurationSec: 20,
  suppressionFlags: [],
  llmModel:         'moonshot-v1-32k',
  generatedAt:      '2026-04-24T09:00:00Z',
  provider:         'kimi',
  latencyMs:        5678,
  retryCount:       0,
  qualityIssue:     null,
};

// ─── Cases ────────────────────────────────────────────────────────────────────

console.log('▶ W3-08 frame-editor → server schema round-trip\n');

// ─── Case 1: Coerce realistic script output ───────────────────────────────────
console.log('[case 1] coerceScriptFrames — realistic output');
{
  const frames = coerceScriptFrames(realisticScriptOutput.frames);
  expect(frames.length === 5, 'all 5 frames extracted');
  expect(frames[0].text === '今天聊聊早餐三件套，吃饱才有劲。', 'frame 1 text preserved');
  expect(frames[2].durationS === 4, 'frame 3 durationS preserved');
  expect(frames.every((f, i) => f.index === i + 1), 'indices contiguous 1..5');
}

// ─── Case 2: Trivial round-trip (no edits) — schema must accept ───────────────
console.log('\n[case 2] script: no-op round-trip → server schema accepts');
{
  const frames = coerceScriptFrames(realisticScriptOutput.frames);
  const rebuilt = rebuildScriptOutput(realisticScriptOutput, frames);
  const parsed = ScriptOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `Zod parse success: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.provider     === 'kimi',              'provider passthrough preserved');
  expect(rebuilt.model        === 'moonshot-v1-32k',   'model passthrough preserved');
  expect(rebuilt.qualityIssue === null,                'qualityIssue null passthrough preserved');
  expect(Array.isArray(rebuilt.suppressionFlags),      'suppressionFlags preserved');
  expect(rebuilt.frameCount   === 5,                   'frameCount recomputed');
  expect(rebuilt.charCount    === countNonWhitespace(realisticScriptOutput.frames.map((f) => f.text).join(' ')),
    'charCount recomputed from frames');
}

// ─── Case 3: Edit one script frame → schema accepts, derived fields update ────
console.log('\n[case 3] script: edit frame text → schema accepts, derived fields update');
{
  const frames = coerceScriptFrames(realisticScriptOutput.frames);
  const newText = '今天聊一个完全不一样的话题，先点关注。';
  const edited = patchFrame(frames, 0, { text: newText });
  const rebuilt = rebuildScriptOutput(realisticScriptOutput, edited);
  const parsed = ScriptOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `Zod parse success after edit: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.frames[0].text === newText, 'edited text preserved in payload');
  // Derived charCount should match the new total
  const expectedChars = countNonWhitespace(edited.map((f) => f.text).join(' '));
  expect(rebuilt.charCount === expectedChars, `charCount = ${rebuilt.charCount} matches recomputed ${expectedChars}`);
  expect(typeof rebuilt.fullText === 'string' && (rebuilt.fullText as string).includes(newText.slice(0, 5)),
    'fullText contains new text');
}

// ─── Case 4: Insert a script frame → 6 frames, schema accepts ─────────────────
console.log('\n[case 4] script: insert frame at position 2 → 6 frames, schema accepts');
{
  const frames = coerceScriptFrames(realisticScriptOutput.frames);
  const newFrame = { ...makeEmptyScriptFrame(0), text: '插入的新一帧。', durationS: 3, visualDirection: '过场' };
  const edited = insertFrameAt(frames, 2, newFrame);
  const rebuilt = rebuildScriptOutput(realisticScriptOutput, edited);
  const parsed = ScriptOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `Zod parse success after insert: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.frames.length === 6, '6 frames after insert');
  expect(rebuilt.frames[2].text === '插入的新一帧。', 'inserted frame at position 2');
  expect(rebuilt.frames.every((f, i) => f.index === i + 1), 'indices contiguous after insert');
  expect(rebuilt.frameCount === 6, 'frameCount = 6 recomputed');
}

// ─── Case 5: Delete a script frame → 4 frames, schema accepts ─────────────────
console.log('\n[case 5] script: delete frame at position 4 → 4 frames, schema accepts');
{
  const frames = coerceScriptFrames(realisticScriptOutput.frames);
  const edited = deleteFrameAt(frames, 4);
  const rebuilt = rebuildScriptOutput(realisticScriptOutput, edited);
  const parsed = ScriptOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `Zod parse success after delete: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.frames.length === 4, '4 frames after delete');
  expect(rebuilt.frames.every((f, i) => f.index === i + 1), 'indices contiguous after delete');
}

// ─── Case 6: Move a script frame → schema accepts, order preserved ────────────
console.log('\n[case 6] script: move frame up → schema accepts');
{
  const frames = coerceScriptFrames(realisticScriptOutput.frames);
  const before = frames[2].text;
  const edited = moveFrame(frames, 2, -1);
  const rebuilt = rebuildScriptOutput(realisticScriptOutput, edited);
  const parsed = ScriptOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, 'Zod parse success after move');
  expect(rebuilt.frames[1].text === before, 'frame moved from position 2 to 1');
  expect(rebuilt.frames.every((f, i) => f.index === i + 1), 'indices reindexed after move');
}

// ─── Case 7: Storyboard no-op round-trip ──────────────────────────────────────
console.log('\n[case 7] storyboard: no-op round-trip → server schema accepts');
{
  const frames = coerceStoryboardFrames(realisticStoryboardOutput.frames);
  const rebuilt = rebuildStoryboardOutput(realisticStoryboardOutput, frames);
  const parsed = StoryboardOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `Zod parse success: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.promptVersion    === 'v0.2',                   'promptVersion passthrough preserved');
  expect(rebuilt.llmModel         === 'moonshot-v1-32k',        'llmModel passthrough preserved');
  expect(rebuilt.generatedAt      === '2026-04-24T09:00:00Z',   'generatedAt passthrough preserved');
  expect(rebuilt.provider         === 'kimi',                   'provider passthrough preserved');
  expect(rebuilt.totalDurationSec === 20,                       'totalDurationSec = 20 recomputed');
}

// ─── Case 8: Storyboard edit cameraLanguage + duration → schema accepts ───────
console.log('\n[case 8] storyboard: edit cameraLanguage + duration → schema accepts');
{
  const frames = coerceStoryboardFrames(realisticStoryboardOutput.frames);
  const edited = patchFrame(frames, 1, { cameraLanguage: '俯拍', durationSec: 6 });
  const rebuilt = rebuildStoryboardOutput(realisticStoryboardOutput, edited);
  const parsed = StoryboardOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `Zod parse success after edit: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.frames[1].cameraLanguage === '俯拍', 'cameraLanguage updated');
  expect(rebuilt.frames[1].durationSec === 6,         'durationSec updated');
  expect(rebuilt.totalDurationSec === 22,             'totalDurationSec recomputed = 4+6+4+4+4 = 22');
}

// ─── Case 9: Storyboard insert + delete → schema accepts ──────────────────────
console.log('\n[case 9] storyboard: insert + delete → schema accepts');
{
  const frames = coerceStoryboardFrames(realisticStoryboardOutput.frames);
  const blank  = { ...makeEmptyStoryboardFrame(0), voiceover: '过渡帧', durationSec: 2, scene: '过场', imagePrompt: '黑场叠白色字幕「下一段」', onScreenText: '↓' };
  const withInsert = insertFrameAt(frames, 3, blank);
  const withDelete = deleteFrameAt(withInsert, 0);
  const rebuilt = rebuildStoryboardOutput(realisticStoryboardOutput, withDelete);
  const parsed = StoryboardOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `Zod parse success after insert+delete: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.frames.length === 5, '5 frames (5 - 1 + 1)');
  expect(rebuilt.frames.every((f, i) => f.index === i + 1), 'indices reindexed after both ops');
}

// ─── Case 10: Mode switch round-trip — frames → JSON → frames ─────────────────
console.log('\n[case 10] mode switch: frames → JSON.stringify → JSON.parse → frames preserves data');
{
  const frames = coerceScriptFrames(realisticScriptOutput.frames);
  const edited = patchFrame(frames, 1, { text: '改后的文案。' });
  const rebuilt = rebuildScriptOutput(realisticScriptOutput, edited);
  // Simulate user clicking JSON tab
  const jsonString = JSON.stringify(rebuilt, null, 2);
  // Simulate user clicking back to frames tab
  const reparsed = JSON.parse(jsonString) as ScriptOutputShape;
  const recoercedFrames = coerceScriptFrames(reparsed.frames);
  expect(recoercedFrames.length === 5, '5 frames after JSON round-trip');
  expect(recoercedFrames[1].text === '改后的文案。', 'edited text survived JSON round-trip');
  // And the rebuilt-from-recoerced should still pass server schema
  const reroundtripped = rebuildScriptOutput(reparsed, recoercedFrames);
  const parsed = ScriptOutputEditSchema.safeParse(reroundtripped);
  expect(parsed.success, 'Zod parse still succeeds after frames→JSON→frames round-trip');
}

// ─── Case 11: Server schema rejects malformed payload — proves it's enforcing ─
console.log('\n[case 11] server schema: rejects malformed payload (sanity check)');
{
  // Empty frames array
  const empty = ScriptOutputEditSchema.safeParse({ frames: [] });
  expect(!empty.success, 'empty frames array → rejected');

  // Frame with empty text
  const emptyText = ScriptOutputEditSchema.safeParse({ frames: [{ index: 1, text: '' }] });
  expect(!emptyText.success, 'frame with empty text → rejected');

  // Frame with index 0
  const zeroIndex = ScriptOutputEditSchema.safeParse({ frames: [{ index: 0, text: 'hi' }] });
  expect(!zeroIndex.success, 'frame with index 0 → rejected');

  // Storyboard missing required fields
  const missingScene = StoryboardOutputEditSchema.safeParse({
    frames: [{ index: 1, voiceover: 'x', durationSec: 1, cameraLanguage: '近景', imagePrompt: 'y' }],
  });
  expect(!missingScene.success, 'storyboard frame missing scene → rejected');
}

// ─── Case 12: realistic edited output passes server validation ────────────────
console.log('\n[case 12] realistic full edit session → schema accepts');
{
  // Simulate: open script editor, edit frame 1 text, insert new frame after frame 2,
  // delete frame 5, save.
  let frames = coerceScriptFrames(realisticScriptOutput.frames);
  frames = patchFrame(frames, 0, { text: '今天换个新开场，更直接。' });
  frames = insertFrameAt(frames, 2, { ...makeEmptyScriptFrame(0), text: '加一个钩子。', visualDirection: '紧凑切镜', durationS: 3 });
  frames = deleteFrameAt(frames, frames.length - 1);
  const rebuilt = rebuildScriptOutput(realisticScriptOutput, frames);
  const parsed = ScriptOutputEditSchema.safeParse(rebuilt);
  expect(parsed.success, `realistic edit session → Zod accept: ${parsed.success ? 'OK' : JSON.stringify(parsed.error.issues)}`);
  expect(rebuilt.frames.length === 5, '5 frames after edit+insert+delete');
  expect(rebuilt.frames[0].text === '今天换个新开场，更直接。', 'frame 0 edit preserved');
  expect(rebuilt.frames[2].text === '加一个钩子。', 'inserted frame preserved');
  expect(rebuilt.qualityIssue === null
    && Array.isArray(rebuilt.suppressionFlags)
    && (rebuilt.suppressionFlags as unknown[]).length === 0,
    'metadata passthrough survives full edit session');
}

console.log(`\n${totalFailures === 0 ? '✅' : '❌'} W3-08 round-trip assertions complete (${totalFailures} failure${totalFailures === 1 ? '' : 's'}).`);
process.exit(totalFailures === 0 ? 0 : 1);
