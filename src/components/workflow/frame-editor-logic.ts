// W3-08 — Pure logic for the per-frame editor.
//
// Kept separate from the React component so it's:
//   • Unit-testable without jsdom / RTL (just `tsx` + `assert`).
//   • Reusable if a future workflow node needs frame editing too.
//
// Invariants enforced here (the UI mirrors them in the disabled-state of buttons):
//   • Frames are always reindexed contiguously starting at 1 after any
//     mutation. The original `index` field on each frame is overwritten.
//   • Minimum frame count = 1 (a script with 0 frames is invalid per Zod
//     schema and downstream nodes break).
//   • Move at edges is a no-op (UI hides the button anyway).
//   • Add inserts an empty frame; the user MUST fill it in before saving
//     (validation lives server-side via Zod min(1) on string fields).
//   • Script frame derived metadata (charCount, frameCount, fullText) is
//     re-derived on every payload change so power-users editing JSON
//     directly don't end up with stale counts that confuse downstream.

import { CAMERA_LANGUAGE_VOCAB, type CameraLanguage } from '@/lib/prompts/storyboard-prompt';

// ─── Frame shapes (mirror the Zod schemas in workflow router) ────────────────

export interface ScriptFrameShape {
  index:           number;
  text:            string;
  visualDirection: string;
  durationS:       number;
}

export interface StoryboardFrameShape {
  index:          number;
  voiceover:      string;
  durationSec:    number;
  cameraLanguage: CameraLanguage;
  scene:          string;
  imagePrompt:    string;
  onScreenText?:  string;
}

// ─── Output shapes (passthrough — preserve unknown keys) ─────────────────────

export interface ScriptOutputShape {
  frames:               ScriptFrameShape[];
  charCount?:           number;
  frameCount?:          number;
  fullText?:            string;
  commentBaitQuestion?: string;
  // Anything else (provider, model, suppressionFlags, qualityIssue, …) is
  // preserved verbatim via `extra` and re-merged on output.
  [key: string]: unknown;
}

export interface StoryboardOutputShape {
  frames:           StoryboardFrameShape[];
  totalDurationSec?: number;
  promptVersion?:   string;
  generatedAt?:     string;
  llmModel?:        string;
  [key: string]: unknown;
}

// ─── Empty-frame factories ───────────────────────────────────────────────────

/** Inserted-but-unfilled marker. UI shows placeholder; server-side Zod will
 *  reject `text:""` if the user tries to save without typing. */
export function makeEmptyScriptFrame(index: number): ScriptFrameShape {
  return {
    index,
    text:            '',
    visualDirection: '',
    durationS:       3, // matches the v2 prompt's mid-range frame duration
  };
}

/** First option in the vocab is a sensible default ("特写" — close-up,
 *  matches the prompt's hook-segment recommendation). User can change it. */
export function makeEmptyStoryboardFrame(index: number): StoryboardFrameShape {
  return {
    index,
    voiceover:      '',
    durationSec:    3,
    cameraLanguage: CAMERA_LANGUAGE_VOCAB[0],
    scene:          '',
    imagePrompt:    '',
    onScreenText:   '',
  };
}

// ─── Generic reindex / move / insert / delete ────────────────────────────────

/**
 * Renumber `index` field on each frame to be contiguous from 1. We do this
 * after every mutation so downstream node validators (which expect strictly
 * increasing index from 1) never see a hole.
 */
export function reindex<T extends { index: number }>(frames: ReadonlyArray<T>): T[] {
  return frames.map((f, i) => ({ ...f, index: i + 1 }));
}

/** Insert at position (0-based). Reindexes after insert. */
export function insertFrameAt<T extends { index: number }>(
  frames: ReadonlyArray<T>,
  position: number,
  newFrame: T,
): T[] {
  const clamped = Math.max(0, Math.min(position, frames.length));
  const next = [...frames.slice(0, clamped), newFrame, ...frames.slice(clamped)];
  return reindex(next);
}

/** Remove at position. Reindexes after delete. Refuses to drop below 1 frame. */
export function deleteFrameAt<T extends { index: number }>(
  frames: ReadonlyArray<T>,
  position: number,
): T[] {
  if (frames.length <= 1) return [...frames]; // refuse — caller's UI should hide btn
  if (position < 0 || position >= frames.length) return [...frames];
  const next = [...frames.slice(0, position), ...frames.slice(position + 1)];
  return reindex(next);
}

/** Move one slot. direction = -1 (up) / +1 (down). Edge-clamped no-op. */
export function moveFrame<T extends { index: number }>(
  frames: ReadonlyArray<T>,
  position: number,
  direction: -1 | 1,
): T[] {
  const target = position + direction;
  if (position < 0 || position >= frames.length) return [...frames];
  if (target < 0   || target   >= frames.length) return [...frames];
  const next = [...frames];
  const tmp = next[position];
  next[position] = next[target];
  next[target]   = tmp;
  return reindex(next);
}

/**
 * Move from `fromPos` to `toPos` (both 0-based). Intended for drag-and-drop
 * where the user can move any item to any position in one gesture. Unlike
 * `moveFrame` which only swaps adjacent items, this preserves the relative
 * order of all other frames.
 *
 * Semantics match `@dnd-kit/sortable`'s `arrayMove(arr, from, to)`:
 *   `result[to] === arr[from]` for valid in-bounds calls. We implement it
 *   ourselves (vs. importing from dnd-kit) so the logic layer stays free
 *   of UI deps and is unit-testable.
 *
 * Edge cases:
 *   • Same position → no-op (returns a fresh array — immutability contract
 *     so React-style `===` comparisons still re-render predictably).
 *   • OOB on either side → no-op.
 *   • `toPos === frames.length` is allowed (== append to end).
 */
export function moveFrameTo<T extends { index: number }>(
  frames: ReadonlyArray<T>,
  fromPos: number,
  toPos: number,
): T[] {
  if (fromPos < 0 || fromPos >= frames.length) return [...frames];
  if (toPos < 0   || toPos   >  frames.length) return [...frames];
  if (fromPos === toPos) return [...frames];
  const next = [...frames];
  const [moved] = next.splice(fromPos, 1);
  // After splice-out the array is one shorter, but dnd-kit's `arrayMove`
  // uses `toPos` directly against the post-splice array — which gives the
  // correct landing slot whether the drag was forward or backward.
  next.splice(toPos, 0, moved);
  return reindex(next);
}

/** Patch one frame's fields. Pure — does not mutate input. */
export function patchFrame<T extends { index: number }>(
  frames: ReadonlyArray<T>,
  position: number,
  patch: Partial<T>,
): T[] {
  if (position < 0 || position >= frames.length) return [...frames];
  const next = [...frames];
  next[position] = { ...next[position], ...patch, index: next[position].index };
  return next;
}

// ─── Output recomputation (preserve passthrough fields) ──────────────────────

/**
 * Take the (possibly user-edited) frames + the original output and produce
 * a fresh output object. Recomputes `charCount`, `frameCount`, `fullText`
 * for script and `totalDurationSec` for storyboard. All other keys (provider,
 * model, suppressionFlags, qualityIssue, …) are preserved verbatim.
 */
export function rebuildScriptOutput(
  original: ScriptOutputShape,
  frames:   ReadonlyArray<ScriptFrameShape>,
): ScriptOutputShape {
  const fullText   = frames.map((f) => f.text).join(' ');
  const charCount  = countNonWhitespace(fullText);
  const frameCount = frames.length;
  return {
    ...original,
    frames: [...frames],
    charCount,
    frameCount,
    fullText,
  };
}

export function rebuildStoryboardOutput(
  original: StoryboardOutputShape,
  frames:   ReadonlyArray<StoryboardFrameShape>,
): StoryboardOutputShape {
  const totalDurationSec = frames.reduce((acc, f) => acc + (f.durationSec ?? 0), 0);
  return {
    ...original,
    frames: [...frames],
    totalDurationSec,
  };
}

/** Strip whitespace + count remaining chars. Mirrors the v2 prompt's char
 *  budget definition (200-215 chars, whitespace-stripped). */
export function countNonWhitespace(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (!/\s/.test(ch)) n++;
  }
  return n;
}

// ─── Field validation (W3-09 — onBlur nudges, NOT save-blockers) ─────────────
//
// Soft-validation only — server-side Zod is the real gate. These helpers
// report per-field issues so the UI can color the input border on blur.
// Two severity levels:
//
//   • 'error'   — field is unambiguously wrong (empty required string,
//                 non-positive duration). Red border.
//   • 'warning' — field is filled but outside the recommended range
//                 (script line too long/short, image prompt too long, …).
//                 Amber border.
//
// Save is NEVER blocked by these — power users can override and the server
// will reject hard errors. Saves only block on JSON parse errors and Zod
// rejections from the server.

export type FieldIssueLevel = 'error' | 'warning';

export interface FieldIssue {
  level: FieldIssueLevel;
  /** UI-facing Chinese message. Short — fits a small <span> under the input. */
  msg:   string;
  /** Stable code for tests; UI shouldn't depend on this. */
  code:  string;
}

export type ScriptFrameIssues     = Partial<Record<keyof ScriptFrameShape,     FieldIssue>>;
export type StoryboardFrameIssues = Partial<Record<keyof StoryboardFrameShape, FieldIssue>>;

/** v2 prompt: 8-15 chars per script line is the sweet spot. */
const SCRIPT_LINE_MIN = 8;
const SCRIPT_LINE_MAX = 15;

/** v2 prompt: image prompt 50-75 target, hard cap 80. We treat <40 as too
 *  short (LLM produced a fragment) and >80 as too long (will be truncated). */
const IMG_PROMPT_MIN_OK = 40;
const IMG_PROMPT_MAX_OK = 80;

/** On-screen text is overlay copy — keep readable on mobile, ≤ 12 chars. */
const ONSCREEN_TEXT_MAX = 12;

export function validateScriptFrame(frame: ScriptFrameShape): ScriptFrameIssues {
  const issues: ScriptFrameIssues = {};
  const trimmed = frame.text.trim();
  const len = countNonWhitespace(frame.text);
  if (trimmed.length === 0) {
    issues.text = { level: 'error', code: 'EMPTY', msg: '文案不能为空' };
  } else if (len < SCRIPT_LINE_MIN) {
    issues.text = { level: 'warning', code: 'TOO_SHORT', msg: `偏短（建议 ${SCRIPT_LINE_MIN}-${SCRIPT_LINE_MAX} 字）` };
  } else if (len > SCRIPT_LINE_MAX) {
    issues.text = { level: 'warning', code: 'TOO_LONG', msg: `偏长（建议 ${SCRIPT_LINE_MIN}-${SCRIPT_LINE_MAX} 字）` };
  }
  if (!Number.isFinite(frame.durationS) || frame.durationS <= 0) {
    issues.durationS = { level: 'error', code: 'INVALID', msg: '时长必须 > 0' };
  } else if (frame.durationS > 10) {
    issues.durationS = { level: 'warning', code: 'TOO_LONG', msg: '单帧时长偏长（建议 ≤ 10s）' };
  }
  return issues;
}

export function validateStoryboardFrame(frame: StoryboardFrameShape): StoryboardFrameIssues {
  const issues: StoryboardFrameIssues = {};
  if (frame.voiceover.trim().length === 0) {
    issues.voiceover = { level: 'error', code: 'EMPTY', msg: '口播不能为空' };
  }
  if (frame.scene.trim().length === 0) {
    issues.scene = { level: 'error', code: 'EMPTY', msg: '场景描述不能为空' };
  }
  const promptLen = frame.imagePrompt.length;
  if (promptLen === 0) {
    issues.imagePrompt = { level: 'error', code: 'EMPTY', msg: 'image prompt 不能为空' };
  } else if (promptLen < IMG_PROMPT_MIN_OK) {
    issues.imagePrompt = { level: 'warning', code: 'TOO_SHORT', msg: `偏短（目标 ${IMG_PROMPT_MIN_OK}-${IMG_PROMPT_MAX_OK} 字）` };
  } else if (promptLen > IMG_PROMPT_MAX_OK) {
    issues.imagePrompt = { level: 'warning', code: 'TOO_LONG', msg: `超出硬上限 ${IMG_PROMPT_MAX_OK} 字（会被截断）` };
  }
  if (!Number.isFinite(frame.durationSec) || frame.durationSec <= 0) {
    issues.durationSec = { level: 'error', code: 'INVALID', msg: '时长必须 > 0' };
  }
  if (frame.onScreenText && frame.onScreenText.length > ONSCREEN_TEXT_MAX) {
    issues.onScreenText = { level: 'warning', code: 'TOO_LONG', msg: `字幕偏长（建议 ≤ ${ONSCREEN_TEXT_MAX} 字）` };
  }
  return issues;
}

// ─── Best-effort coercion of unknown server payload → editable shape ─────────
//
// Server returns `outputJson: unknown`. We need to coerce into the editor
// shape WITHOUT throwing — bad values just become safe defaults. The user
// gets a working editor even if the LLM produced weirdness; server-side
// Zod is the real guard at save time.

export function coerceScriptFrames(raw: unknown): ScriptFrameShape[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f, i) => coerceOneScriptFrame(f, i + 1))
    .filter((f): f is ScriptFrameShape => f !== null);
}

function coerceOneScriptFrame(raw: unknown, fallbackIndex: number): ScriptFrameShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    index:           typeof r.index === 'number' ? r.index : fallbackIndex,
    text:            typeof r.text  === 'string' ? r.text  : '',
    visualDirection: typeof r.visualDirection === 'string' ? r.visualDirection : '',
    durationS:       typeof r.durationS === 'number' ? r.durationS : 0,
  };
}

export function coerceStoryboardFrames(raw: unknown): StoryboardFrameShape[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f, i) => coerceOneStoryboardFrame(f, i + 1))
    .filter((f): f is StoryboardFrameShape => f !== null);
}

function coerceOneStoryboardFrame(raw: unknown, fallbackIndex: number): StoryboardFrameShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const cam = typeof r.cameraLanguage === 'string'
    && (CAMERA_LANGUAGE_VOCAB as readonly string[]).includes(r.cameraLanguage)
      ? (r.cameraLanguage as CameraLanguage)
      : CAMERA_LANGUAGE_VOCAB[0];
  return {
    index:          typeof r.index === 'number' ? r.index : fallbackIndex,
    voiceover:      typeof r.voiceover === 'string' ? r.voiceover : '',
    durationSec:    typeof r.durationSec === 'number' ? r.durationSec : 0,
    cameraLanguage: cam,
    scene:          typeof r.scene === 'string' ? r.scene : '',
    imagePrompt:    typeof r.imagePrompt === 'string' ? r.imagePrompt : '',
    onScreenText:   typeof r.onScreenText === 'string' ? r.onScreenText : '',
  };
}
