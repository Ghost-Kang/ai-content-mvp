// W3-04-V3 unit tests for buildExportBundle.
//
// Pure offline — every fetch routes through a Map-backed mock so no network
// touches the loop. JSZip is real (the validation matters most).
//
// Cases:
//   1. happy 3-frame   — script + project.fcpxml + README + clips/*, media-rep paths rewritten
//   2. allowPartial    — 1 fetch fails → bundle still built, missingFrames lists it
//   3. fetch fail strict — 1 fetch fails → BundleError(FETCH_FAILED)
//   4. http-non-2xx     — 404 throws BundleError(FETCH_FAILED)
//   5. empty input      — BundleError(INPUT_INVALID)
//   6. suggested name   — slug + datestamp shape
//   7. path rewrite     — every <media-rep src="..."> rewritten to ./clips/frame-NN.mp4
//   8. compressed < uncompressed (zip actually compressed something — text + xml)
//
// Run: pnpm wf:test:export:bundle

import JSZip from 'jszip';
import {
  BundleError,
  buildExportBundle,
  type ClipFetcher,
  type ExportInput,
} from '../src/lib/export';

let totalFailures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) totalFailures++;
  console.log(`  [${tag}] ${msg}`);
};

const FROZEN_NOW = new Date('2026-04-24T08:30:00.000Z');

function makeFrames(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    index:        i + 1,
    videoUrl:     `https://cdn.seedance.example/clips/frame-${i + 1}.mp4`,
    durationSec:  5,
    voiceover:    `第 ${i + 1} 帧旁白`,
    onScreenText: i % 2 === 0 ? `字幕 ${i + 1}` : undefined,
  }));
}

function baseInput(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    topic:      'why-saas-trial-fails',
    frames:     makeFrames(3),
    resolution: '720p',
    ...overrides,
  };
}

/** Mock fetcher backed by a Map<url, Uint8Array>. Missing URLs return 404. */
function makeMockFetcher(
  payloads: Record<string, Uint8Array | { status: number; statusText?: string } | Error>,
): ClipFetcher {
  return async (url: string): Promise<Response> => {
    const p = payloads[url];
    if (p instanceof Error) throw p;
    if (p === undefined) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }
    if (p instanceof Uint8Array) {
      // Wrap in Blob so the Response constructor accepts it under TS DOM lib.
      return new Response(new Blob([p as BlobPart]), { status: 200 });
    }
    // Error-shape object
    return new Response('error', { status: p.status, statusText: p.statusText });
  };
}

/** Build N fake mp4 byte buffers — distinct sizes so collisions stand out. */
function fakeMp4(seed: number, sizeBytes = 1024): Uint8Array {
  const buf = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) buf[i] = (seed + i) & 0xff;
  return buf;
}

// ─── Cases ────────────────────────────────────────────────────────────────────

async function case1Happy() {
  console.log('\n[case 1] happy 3-frame — all metadata + clips present, paths rewritten');
  const input = baseInput();
  const payloads: Record<string, Uint8Array> = {};
  for (const f of input.frames) payloads[f.videoUrl] = fakeMp4(f.index, 2048);

  const result = await buildExportBundle(input, {
    fetcher: makeMockFetcher(payloads),
    now:     FROZEN_NOW,
  });

  expect(result.bytes.byteLength > 0,                        'zip bytes non-empty');
  expect(result.missingFrames.length === 0,                  'no missing frames');
  expect(result.clipFilenames.length === 3,                  '3 clip filenames recorded');
  expect(result.compressedBytes === result.bytes.byteLength, 'compressedBytes === bytes.length');
  expect(result.uncompressedBytes > result.compressedBytes,  'compression actually happened');

  // Inspect the zip
  const z = await JSZip.loadAsync(result.bytes);
  for (const name of [
    'script.txt',
    'project.fcpxml',
    'README.md',
    'subtitles/disclosure.srt',
    'subtitles/narration.srt',
  ]) {
    expect(z.file(name) !== null,                            `zip contains ${name}`);
  }
  for (const c of result.clipFilenames) {
    expect(z.file(`clips/${c}`) !== null,                    `zip contains clips/${c}`);
  }

  // SRT shape — 剪映 import 兜底字幕路径，必须真生成且语义对得上
  const disclosureSrt = await z.file('subtitles/disclosure.srt')!.async('string');
  const narrationSrt  = await z.file('subtitles/narration.srt')!.async('string');
  expect(disclosureSrt.includes('本视频由 AI 辅助生成'),       'disclosure SRT contains compliance text');
  expect(/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/m.test(disclosureSrt), 'disclosure SRT timestamps well-formed');
  expect(/^1\s*\n00:00:00,000\s*-->/m.test(disclosureSrt),    'disclosure SRT starts at 00:00:00,000');
  // 3 frames @ baseInput() → 3 narration cues w/ accumulated timestamps
  const narrationCueCount = (narrationSrt.match(/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/gm) ?? []).length;
  expect(narrationCueCount === 3,                            `narration SRT has 3 cues (got ${narrationCueCount})`);
  for (const f of input.frames) {
    expect(narrationSrt.includes(f.voiceover),               `narration SRT includes frame ${f.index} voiceover`);
  }

  // Path rewrite check — FCPXML <media-rep src="...">, not JianYing JSON draft
  const fcpxml    = await z.file('project.fcpxml')!.async('string');
  const repSrcs   = [...fcpxml.matchAll(/<media-rep\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
  expect(
    repSrcs.every((p) => p.startsWith('./clips/frame-')),
    `every media-rep src → ./clips/frame-*; got ${JSON.stringify(repSrcs)}`,
  );
  expect(!repSrcs.some((p) => p.startsWith('http')),         'no HTTPS URL leaked into fcpxml media-rep');

  // README mentions topic + frame count
  const readme = await z.file('README.md')!.async('string');
  expect(readme.includes(input.topic),                        'README mentions topic');
  expect(readme.includes('3'),                                'README mentions frame count');
  expect(readme.includes('AI 生成'),                           'README has compliance reminder');
  expect(readme.includes('subtitles/disclosure.srt'),         'README references disclosure SRT');
  expect(readme.includes('subtitles/narration.srt'),          'README references narration SRT');
  expect(readme.includes('无音轨'),                            'README warns about missing audio track');
}

async function case2AllowPartial() {
  console.log('\n[case 2] allowPartial — 1 fetch fails → bundle built, missingFrames lists it');
  const input = baseInput();
  const payloads: Record<string, Uint8Array> = {};
  // Skip frame 2 entirely → mock returns 404
  payloads[input.frames[0].videoUrl] = fakeMp4(1);
  payloads[input.frames[2].videoUrl] = fakeMp4(3);

  const result = await buildExportBundle(input, {
    fetcher:      makeMockFetcher(payloads),
    now:          FROZEN_NOW,
    allowPartial: true,
  });

  expect(result.missingFrames.length === 1,                  '1 frame missing');
  expect(result.missingFrames[0].index === 2,                'missing frame index === 2');
  expect(result.clipFilenames.length === 2,                  '2 clip filenames recorded');

  const z = await JSZip.loadAsync(result.bytes);
  expect(z.file('clips/frame-01.mp4') !== null,              'frame 1 clip present');
  expect(z.file('clips/frame-02.mp4') === null,              'frame 2 clip ABSENT (was 404)');
  expect(z.file('clips/frame-03.mp4') !== null,              'frame 3 clip present');
}

async function case3FetchFailStrict() {
  console.log('\n[case 3] strict mode — 1 fetch fails → BundleError(FETCH_FAILED)');
  const input = baseInput();
  const payloads: Record<string, Uint8Array> = {
    [input.frames[0].videoUrl]: fakeMp4(1),
    // frame 2 missing — will 404
    [input.frames[2].videoUrl]: fakeMp4(3),
  };

  let thrown: unknown;
  try {
    await buildExportBundle(input, { fetcher: makeMockFetcher(payloads), now: FROZEN_NOW });
  } catch (e) { thrown = e; }

  expect(thrown instanceof BundleError,                      'threw BundleError');
  if (thrown instanceof BundleError) {
    expect(thrown.code === 'FETCH_FAILED',                   `code === FETCH_FAILED (got ${thrown.code})`);
    expect(thrown.message.includes('frame 2'),                'error names the failing frame');
  }
}

async function case4HttpNon2xx() {
  console.log('\n[case 4] HTTP 500 → BundleError(FETCH_FAILED)');
  const input = baseInput({ frames: makeFrames(2) });
  const payloads: Record<string, Uint8Array | { status: number; statusText?: string }> = {
    [input.frames[0].videoUrl]: fakeMp4(1),
    [input.frames[1].videoUrl]: { status: 500, statusText: 'Internal Server Error' },
  };

  let thrown: unknown;
  try {
    await buildExportBundle(input, { fetcher: makeMockFetcher(payloads), now: FROZEN_NOW });
  } catch (e) { thrown = e; }

  expect(thrown instanceof BundleError,                      'threw BundleError on HTTP 500');
  if (thrown instanceof BundleError) {
    expect(thrown.message.includes('500'),                   `error includes 500 (got: ${thrown.message})`);
  }
}

async function case5EmptyInput() {
  console.log('\n[case 5] empty frames → BundleError(INPUT_INVALID)');
  let thrown: unknown;
  try {
    await buildExportBundle({ ...baseInput(), frames: [] }, {
      fetcher: makeMockFetcher({}),
      now:     FROZEN_NOW,
    });
  } catch (e) { thrown = e; }
  expect(thrown instanceof BundleError,                      'threw BundleError');
  if (thrown instanceof BundleError) {
    expect(thrown.code === 'INPUT_INVALID',                  `code === INPUT_INVALID (got ${thrown.code})`);
  }
}

async function case6SuggestedName() {
  console.log('\n[case 6] suggestedName — slug + datestamp shape');
  const input = baseInput({ topic: 'Why  My  SaaS  Trial  Sucks!!' });
  const payloads: Record<string, Uint8Array> = {};
  for (const f of input.frames) payloads[f.videoUrl] = fakeMp4(f.index);

  const result = await buildExportBundle(input, {
    fetcher: makeMockFetcher(payloads),
    now:     FROZEN_NOW,
  });
  expect(/^export-why-my-saas-trial-sucks-\d{8}\.zip$/.test(result.suggestedName),
                                                              `suggestedName matches slug pattern (got '${result.suggestedName}')`);
  expect(result.suggestedName.endsWith('-20260424.zip'),     'datestamp = 20260424');
}

async function case7AllPathsRewrittenChineseTopic() {
  console.log('\n[case 7] Chinese-only topic → hash slug fallback, paths still rewritten');
  const input = baseInput({ topic: '为什么 SaaS 试用留不住人' });
  const payloads: Record<string, Uint8Array> = {};
  for (const f of input.frames) payloads[f.videoUrl] = fakeMp4(f.index);

  const result = await buildExportBundle(input, {
    fetcher: makeMockFetcher(payloads),
    now:     FROZEN_NOW,
  });
  // Slug must be either ASCII subset (saas-only) or hash-fallback `topic-XXXXXXXX`
  const usedFallback = /^export-topic-[0-9a-f]{8}-/.test(result.suggestedName);
  const usedAscii    = /^export-saas-/.test(result.suggestedName);
  expect(usedFallback || usedAscii,                          `slug fallback OK (got '${result.suggestedName}')`);

  const z     = await JSZip.loadAsync(result.bytes);
  const xml   = await z.file('project.fcpxml')!.async('string');
  const paths = [...xml.matchAll(/<media-rep\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
  expect(paths.every((p) => p.startsWith('./clips/')),       'fcpxml media-rep paths rewritten under Chinese topic');
}

async function case8ReadmeListsClips() {
  console.log('\n[case 8] README lists every clip filename');
  const input = baseInput({ frames: makeFrames(5) });
  const payloads: Record<string, Uint8Array> = {};
  for (const f of input.frames) payloads[f.videoUrl] = fakeMp4(f.index);

  const result = await buildExportBundle(input, {
    fetcher: makeMockFetcher(payloads),
    now:     FROZEN_NOW,
  });
  const z = await JSZip.loadAsync(result.bytes);
  const readme = await z.file('README.md')!.async('string');
  for (const name of result.clipFilenames) {
    expect(readme.includes(name),                            `README lists ${name}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- W3-04-V3 buildExportBundle unit tests (offline, mocked fetcher) ---');

  await case1Happy();
  await case2AllowPartial();
  await case3FetchFailStrict();
  await case4HttpNon2xx();
  await case5EmptyInput();
  await case6SuggestedName();
  await case7AllPathsRewrittenChineseTopic();
  await case8ReadmeListsClips();

  if (totalFailures === 0) {
    console.log('\n✅ All assertions pass.');
    process.exit(0);
  }
  console.log(`\n❌ ${totalFailures} assertion(s) failed.`);
  process.exit(1);
}

main().catch((e) => {
  console.error('test errored:', e);
  process.exit(1);
});
