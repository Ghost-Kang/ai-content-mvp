// W3-01-V3 + W3-02-V3 + W3-03-V3 unit tests for the pure export serializers.
//
// No DB, no LLM, no clock — every test pins `now` + a deterministic IdMaker
// so output diffs are stable. Pure CPU; runs in < 100ms.
//
// Cases:
//   1. script-text — happy 3-frame round-trip
//   2. script-text — frames missing on-screen text are gracefully omitted
//   3. script-text — empty watermarkOverride falls back to default (compliance)
//   4. script-text — empty frames throws
//   5. fcpxml      — top-level shape (XML decl + DOCTYPE + version + format + sequence)
//   6. fcpxml      — user-subtitle <title lane="1"> count matches frames-with-onScreenText
//   7. fcpxml      — every asset-clip ref resolves; spine offsets monotonic, frame-aligned
//   8. fcpxml      — downloadHints aligned with input frames + zero-padded filenames
//   9. fcpxml      — empty frames throws
//  10. fcpxml      — W3-03 disclosure title present by default + spans full sequence
//  11. fcpxml      — W3-03 disclosure suppressed when disabled=true
//  12. fcpxml      — W3-03 custom text + whitespace-only override fallback
//  13. fcpxml      — W3-03 disclosure exists even when no user subtitles
//
// Run: pnpm wf:test:export

import {
  buildFcpxmlProject,
  buildScriptText,
  DEFAULT_WATERMARK,
  AI_DISCLOSURE_TAG,
  framesToFcpxmlTime,
  resolutionToPx,
  secondsToFrames,
  type ExportFrame,
  type ExportInput,
  type IdMaker,
} from '../src/lib/export';
import { CAC_AI_DISCLOSURE_LABEL } from '../src/lib/cac-label';

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function deterministicIds(): IdMaker {
  // Per-prefix counter so the XML diff is stable across runs.
  const counters: Record<string, number> = {};
  return {
    next: (prefix: string) => {
      counters[prefix] = (counters[prefix] ?? 0) + 1;
      return `${prefix}${counters[prefix]}`;
    },
  };
}

const FROZEN_NOW = new Date('2026-04-24T08:30:00.000Z');

function makeFrames(count: number, opts: { withSubtitles?: boolean } = {}): ExportFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    index:        i + 1,
    videoUrl:     `https://cdn.seedance.example/clips/frame-${i + 1}.mp4`,
    durationSec:  3 + (i % 3),
    voiceover:    `第 ${i + 1} 帧的旁白文本`,
    onScreenText: opts.withSubtitles === false
      ? undefined
      : (i % 2 === 0 ? `字幕 ${i + 1}` : undefined),
  }));
}

function baseInput(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    topic:      '为什么 SaaS 产品免费试用反而留不住用户',
    frames:     makeFrames(3),
    resolution: '720p',
    ...overrides,
  };
}

// ─── Cases ────────────────────────────────────────────────────────────────────

function caseScriptHappy() {
  console.log('\n[case 1] script-text — happy 3-frame round-trip');
  const input = baseInput();
  const text  = buildScriptText(input, FROZEN_NOW);

  expect(text.startsWith('标题：为什么 SaaS'),         '首行是标题');
  expect(text.includes(`${input.frames.length} 帧`),    '总帧数出现在 header');
  expect(text.includes('2026-04-24 08:30'),             '时间戳格式 YYYY-MM-DD HH:mm');
  expect(text.endsWith('\n'),                           '尾部带换行（POSIX 友好）');
  expect(text.trimEnd().endsWith(DEFAULT_WATERMARK),    '末行是 AI 水印');

  for (const f of input.frames) {
    expect(text.includes(`帧 ${f.index} (`),            `frame ${f.index} 头行存在`);
    expect(text.includes(`旁白：${f.voiceover}`),       `frame ${f.index} 旁白行存在`);
    expect(text.includes(`视频：${f.videoUrl}`),         `frame ${f.index} 视频 URL 存在`);
  }

  const f1Dur = input.frames[0].durationSec;
  const f2Start = `${Math.floor(f1Dur / 60)}:${(f1Dur % 60).toString().padStart(2, '0')}`;
  expect(text.includes(`帧 2 (${f2Start} →`),           `frame 2 起点 = frame 1 终点 (${f2Start})`);
}

function caseScriptOmitsEmptySubtitles() {
  console.log('\n[case 2] script-text — frames without onScreenText omit 字幕 line');
  const input = baseInput({ frames: makeFrames(3, { withSubtitles: false }) });
  const text  = buildScriptText(input, FROZEN_NOW);

  expect(!text.includes('字幕：'),                       '无字幕帧不输出 字幕 行');
  const frameHeaderMatches = text.match(/^帧 \d+ \(/gm) ?? [];
  expect(frameHeaderMatches.length === 3,                `仍输出 3 个 帧 块 (got ${frameHeaderMatches.length})`);
}

function caseScriptWatermarkFallback() {
  console.log('\n[case 3] script-text — empty watermarkOverride falls back to default');
  const text = buildScriptText({
    ...baseInput(),
    watermarkOverride: '   ',
  }, FROZEN_NOW);

  expect(text.trimEnd().endsWith(DEFAULT_WATERMARK),    '空白 override 兜底为默认水印');
}

function caseScriptEmptyThrows() {
  console.log('\n[case 4] script-text — empty frames throws');
  let thrown: unknown;
  try { buildScriptText({ ...baseInput(), frames: [] }, FROZEN_NOW); } catch (e) { thrown = e; }
  expect(thrown instanceof Error,                       'buildScriptText threw');
  if (thrown instanceof Error) {
    expect(/empty/i.test(thrown.message),               'error message mentions empty');
  }
}

// ─── FCPXML helpers ───────────────────────────────────────────────────────────

function attrOf(elementMatch: string, attr: string): string | null {
  const m = elementMatch.match(new RegExp(`\\b${attr}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Match all `<{tag} ...>` and `<{tag} .../>` opening tags as raw strings. */
function findOpenTags(xml: string, tag: string): string[] {
  // `(?=[\s/>])` after the tag name prevents `asset` matching the prefix of
  // `asset-clip` (a classic XML foot-gun when naïvely using `\b` on `asset`).
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex  = new RegExp(`<${safe}(?=[\\s/>])[^>]*>`, 'g');
  return xml.match(regex) ?? [];
}

function caseFcpxmlShape() {
  console.log('\n[case 5] fcpxml — top-level shape (XML decl + DOCTYPE + format + sequence)');
  const input = baseInput();
  const art   = buildFcpxmlProject(input, { idMaker: deterministicIds(), now: FROZEN_NOW });
  const xml   = art.fcpxml;

  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
                                                        'XML declaration is the first line');
  expect(xml.includes('<!DOCTYPE fcpxml>'),             'DOCTYPE fcpxml present');
  expect(/<fcpxml version="1\.13">/.test(xml),          'fcpxml version=1.13');
  expect(xml.includes('</fcpxml>'),                     'fcpxml closing tag present');
  expect(/<resources>[\s\S]*<\/resources>/.test(xml),   '<resources> block present');
  expect(/<library>[\s\S]*<\/library>/.test(xml),       '<library> block present');

  // <format> defines canvas size for the chosen resolution
  const formats = findOpenTags(xml, 'format');
  expect(formats.length === 1,                          `exactly 1 <format> (got ${formats.length})`);
  const px = resolutionToPx('720p');
  expect(attrOf(formats[0], 'width')  === String(px.width),
                                                        `format width = ${px.width}`);
  expect(attrOf(formats[0], 'height') === String(px.height),
                                                        `format height = ${px.height}`);
  expect(/frameDuration="100\/3000s"/.test(formats[0]),  'frameDuration = 100/3000s (30fps)');

  // <sequence> duration === Σ frame-aligned durations
  const sequenceTag = findOpenTags(xml, 'sequence')[0]!;
  const expectedTotalFrames = input.frames.reduce((s, f) => s + secondsToFrames(f.durationSec), 0);
  const expectedDur = framesToFcpxmlTime(expectedTotalFrames);
  expect(attrOf(sequenceTag, 'duration') === expectedDur,
                                                        `sequence.duration = ${expectedDur} (got ${attrOf(sequenceTag, 'duration')})`);

  // exactly one effect (Basic Title) for both lanes
  const effects = findOpenTags(xml, 'effect');
  expect(effects.length === 1,                          `exactly 1 <effect> (got ${effects.length})`);
  expect(/Basic Title/.test(effects[0]),                'effect name = Basic Title');
}

function caseFcpxmlUserSubtitles() {
  console.log('\n[case 6] fcpxml — user-subtitle <title lane="1"> count matches frames-with-onScreenText');
  const frames = makeFrames(4); // mixed: indices 1,3 have text; 2,4 do not
  const expectedSubtitleFrames = frames.filter((f) => (f.onScreenText ?? '').length > 0).length;

  const art = buildFcpxmlProject(
    { ...baseInput(), frames },
    { idMaker: deterministicIds(), now: FROZEN_NOW },
  );
  const xml = art.fcpxml;

  // assets per frame
  const assets = findOpenTags(xml, 'asset');
  expect(assets.length === frames.length,               `asset count === frames (${assets.length})`);

  // asset-clips per frame
  const clips = findOpenTags(xml, 'asset-clip');
  expect(clips.length === frames.length,                `asset-clip count === frames (${clips.length})`);

  // user subtitles = lane="1" titles
  const userSubtitleTitles = findOpenTags(xml, 'title').filter((t) => attrOf(t, 'lane') === '1');
  expect(userSubtitleTitles.length === expectedSubtitleFrames,
                                                        `lane=1 title count === frames-with-subtitles (${userSubtitleTitles.length})`);
}

function caseFcpxmlReferentialIntegrity() {
  console.log('\n[case 7] fcpxml — every asset-clip ref resolves + monotonic frame-aligned offsets');
  const art   = buildFcpxmlProject(baseInput(), { idMaker: deterministicIds(), now: FROZEN_NOW });
  const xml   = art.fcpxml;

  // Collect declared <asset id="...">
  const assetIds = new Set<string>();
  for (const a of findOpenTags(xml, 'asset')) {
    const id = attrOf(a, 'id');
    if (id) assetIds.add(id);
  }
  expect(assetIds.size > 0,                             `${assetIds.size} <asset id> declared`);

  // Every <asset-clip ref="..."> must resolve
  const clips = findOpenTags(xml, 'asset-clip');
  let unresolved = 0;
  for (const c of clips) {
    const ref = attrOf(c, 'ref');
    if (!ref || !assetIds.has(ref)) unresolved++;
  }
  expect(unresolved === 0,                              `0 dangling asset-clip ref (got ${unresolved})`);

  // <title ref="..."> must point at the declared <effect id>
  const effectIds = new Set<string>();
  for (const e of findOpenTags(xml, 'effect')) {
    const id = attrOf(e, 'id');
    if (id) effectIds.add(id);
  }
  let badTitleRef = 0;
  for (const t of findOpenTags(xml, 'title')) {
    const ref = attrOf(t, 'ref');
    if (!ref || !effectIds.has(ref)) badTitleRef++;
  }
  expect(badTitleRef === 0,                             `0 dangling title ref (got ${badTitleRef})`);

  // Spine offsets monotonic + frame-aligned (offset(N) === offset(N-1) + duration(N-1))
  const expectedFrames = baseInput().frames.map((f) => secondsToFrames(f.durationSec));
  const expectedOffsetsTime: string[] = [];
  let acc = 0;
  for (const fc of expectedFrames) {
    expectedOffsetsTime.push(framesToFcpxmlTime(acc));
    acc += fc;
  }
  let monotonic = true;
  for (let i = 0; i < clips.length; i++) {
    if (attrOf(clips[i], 'offset') !== expectedOffsetsTime[i]) { monotonic = false; break; }
  }
  expect(monotonic,                                     'asset-clip offsets laid end-to-end + frame-aligned');
}

function caseFcpxmlDownloadHints() {
  console.log('\n[case 8] fcpxml — downloadHints aligned + zero-padded filenames');
  const frames = makeFrames(12);
  const art = buildFcpxmlProject(
    { ...baseInput(), frames },
    { idMaker: deterministicIds(), now: FROZEN_NOW },
  );

  expect(art.downloadHints.length === frames.length,    `hints.length === frames (${art.downloadHints.length})`);
  expect(art.downloadHints[0].localFilename === 'frame-01.mp4',
                                                        `frame 1 filename zero-padded ('frame-01.mp4'); got '${art.downloadHints[0].localFilename}'`);
  expect(art.downloadHints[11].localFilename === 'frame-12.mp4',
                                                        `frame 12 filename ('frame-12.mp4'); got '${art.downloadHints[11].localFilename}'`);
  expect(art.downloadHints.every((h, i) => h.videoUrl === frames[i].videoUrl),
                                                        'every hint.videoUrl matches input frame');
  expect(art.schemaVersion === 'fcpxml-1.13',           'schemaVersion stamped');
}

function caseFcpxmlEmptyThrows() {
  console.log('\n[case 9] fcpxml — empty frames throws');
  let thrown: unknown;
  try { buildFcpxmlProject({ ...baseInput(), frames: [] }, { now: FROZEN_NOW }); } catch (e) { thrown = e; }
  expect(thrown instanceof Error,                       'buildFcpxmlProject threw');
  if (thrown instanceof Error) {
    expect(/empty/i.test(thrown.message),               'error message mentions empty');
  }
}

// ─── W3-03 — CAC AI disclosure title ─────────────────────────────────────────

/** Find a single <title> element body whose `name` attribute equals AI_DISCLOSURE_TAG. */
function findDisclosureTitleBody(xml: string): { open: string; body: string } | null {
  const re = new RegExp(
    `(<title\\b[^>]*\\bname="${AI_DISCLOSURE_TAG}"[^>]*>)([\\s\\S]*?)<\\/title>`,
  );
  const m = xml.match(re);
  if (!m) return null;
  return { open: m[1], body: m[2] };
}

function caseFcpxmlDisclosureDefault() {
  console.log('\n[case 10] fcpxml — W3-03 disclosure ON by default + spans full sequence');
  const input = baseInput();
  const art   = buildFcpxmlProject(input, { idMaker: deterministicIds(), now: FROZEN_NOW });
  const xml   = art.fcpxml;

  const found = findDisclosureTitleBody(xml);
  expect(!!found,                                       'disclosure <title> exists');
  if (!found) return;

  expect(attrOf(found.open, 'lane') === '2',            'disclosure on lane=2 (above user subtitles on lane=1)');

  // Default text matches CAC_AI_DISCLOSURE_LABEL, in <text-style>...</text-style>
  expect(found.body.includes(`>${CAC_AI_DISCLOSURE_LABEL}</text-style>`),
                                                        `default text === '${CAC_AI_DISCLOSURE_LABEL}'`);

  // Spans full sequence
  const totalFrames = input.frames.reduce((s, f) => s + secondsToFrames(f.durationSec), 0);
  const expectedDur = framesToFcpxmlTime(totalFrames);
  expect(attrOf(found.open, 'duration') === expectedDur,
                                                        `disclosure duration === sequence (${expectedDur})`);
  expect(attrOf(found.open, 'offset') === '0s',         'disclosure starts at offset=0s of first clip');
}

function caseFcpxmlDisclosureDisabled() {
  console.log('\n[case 11] fcpxml — W3-03 disclosure suppressed when disabled=true');
  const input = baseInput({ aiDisclosureLabel: { disabled: true } });
  const art   = buildFcpxmlProject(input, { idMaker: deterministicIds(), now: FROZEN_NOW });

  expect(!findDisclosureTitleBody(art.fcpxml),          'no disclosure title when disabled');
  // No lane="2" titles at all (only user subs on lane=1)
  const lane2 = findOpenTags(art.fcpxml, 'title').filter((t) => attrOf(t, 'lane') === '2');
  expect(lane2.length === 0,                            'no lane=2 titles when disclosure disabled');
  // Asset clips still emitted
  expect(findOpenTags(art.fcpxml, 'asset-clip').length === input.frames.length,
                                                        'asset-clips still present');
}

function caseFcpxmlDisclosureCustom() {
  console.log('\n[case 12] fcpxml — W3-03 custom text + whitespace fallback to default');
  const customText = '本片由 AI 生成 · 内容仅供参考';
  const art = buildFcpxmlProject(
    baseInput({ aiDisclosureLabel: { text: customText, position: 'top' } }),
    { idMaker: deterministicIds(), now: FROZEN_NOW },
  );
  const found = findDisclosureTitleBody(art.fcpxml);
  expect(!!found,                                       'disclosure title with custom text');
  if (found) {
    expect(found.body.includes(`>${customText}</text-style>`),
                                                        `custom text rendered`);
  }

  // Whitespace-only override defends compliance contract
  const artBlank = buildFcpxmlProject(
    baseInput({ aiDisclosureLabel: { text: '   ' } }),
    { idMaker: deterministicIds(), now: FROZEN_NOW },
  );
  const foundBlank = findDisclosureTitleBody(artBlank.fcpxml);
  expect(foundBlank?.body.includes(`>${CAC_AI_DISCLOSURE_LABEL}</text-style>`) ?? false,
                                                        'whitespace-only override falls back to default');
}

function caseFcpxmlDisclosureWithoutUserSubtitles() {
  console.log('\n[case 13] fcpxml — W3-03 disclosure exists even when no user subtitles');
  const frames = makeFrames(3, { withSubtitles: false });
  const art = buildFcpxmlProject(
    { ...baseInput(), frames },
    { idMaker: deterministicIds(), now: FROZEN_NOW },
  );
  const xml = art.fcpxml;

  // No lane=1 titles
  const lane1 = findOpenTags(xml, 'title').filter((t) => attrOf(t, 'lane') === '1');
  expect(lane1.length === 0,                            'no lane=1 titles when no user subtitles');

  // Disclosure (lane=2) still present
  const lane2 = findOpenTags(xml, 'title').filter((t) => attrOf(t, 'lane') === '2');
  expect(lane2.length === 1,                            `exactly 1 lane=2 disclosure title (got ${lane2.length})`);
  expect(!!findDisclosureTitleBody(xml),                'disclosure body resolves');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('--- W3-01 + W3-02 + W3-03 export serializer unit tests (pure, no DB) ---');

  caseScriptHappy();
  caseScriptOmitsEmptySubtitles();
  caseScriptWatermarkFallback();
  caseScriptEmptyThrows();
  caseFcpxmlShape();
  caseFcpxmlUserSubtitles();
  caseFcpxmlReferentialIntegrity();
  caseFcpxmlDownloadHints();
  caseFcpxmlEmptyThrows();
  caseFcpxmlDisclosureDefault();
  caseFcpxmlDisclosureDisabled();
  caseFcpxmlDisclosureCustom();
  caseFcpxmlDisclosureWithoutUserSubtitles();

  if (totalFailures === 0) {
    console.log('\n✅ All assertions pass.');
    process.exit(0);
  }
  console.log(`\n❌ ${totalFailures} assertion(s) failed.`);
  process.exit(1);
}

main();
