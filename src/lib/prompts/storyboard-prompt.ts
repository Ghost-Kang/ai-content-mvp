// W2-01-V3 — Storyboard prompt template v0.
//
// Pipeline contract: takes a v2 ScriptOutput (17 frames of voiceover +
// visualDirection) and asks the LLM to enrich each frame with:
//   - scene: 中文场景描述（≤30 字，给人看，方便编辑）
//   - imagePrompt: ≤80 字 Seedance-ready 中文 image prompt
//   - cameraLanguage: 从 8 词术语库选 1（特写/中景/全景/拉远/推近/平移/俯拍/仰拍）
//   - onScreenText?: 可选屏幕字幕（≤12 字）
//
// Frame count is LOCKED — 1:1 mapping from script frames. The LLM may NOT
// add or drop frames. voiceover and durationS are passed through verbatim
// from the script frame; the LLM only generates the 4 visual fields above.
//
// Suppression: the 8-category scanner runs on the concatenation of
// (imagePrompt + scene + onScreenText) for every frame after generation.
// voiceover is excluded — it was already scanned at the script node.
//
// W2-01 acceptance (offline 10 runs):
//   - ≥ 8/10 frame count valid (= same length as script.frames)
//   - ≥ 9/10 suppression scan clean
//   - ≥ 9/10 all imagePrompts within length cap
//   - 10/10 cameraLanguage values within vocab

import { buildSuppressionInstruction } from './suppression';
import {
  buildSuppressionScanner,
  type SuppressionFlag,
} from './suppression-scanner';
import type { GeneratedScript } from './script-templates';

// ─── Constants (vocab + caps) ─────────────────────────────────────────────────

export const CAMERA_LANGUAGE_VOCAB = [
  '特写',
  '中景',
  '全景',
  '拉远',
  '推近',
  '平移',
  '俯拍',
  '仰拍',
] as const;
export type CameraLanguage = typeof CAMERA_LANGUAGE_VOCAB[number];

/** Hard cap chosen empirically; revisit after W2-04 Seedance PoC. */
export const IMAGE_PROMPT_MAX_CHARS = 80;

/**
 * Soft floor — under this we warn (LLM was lazy, missing subject/env/lighting).
 * Below floor still validates; the warning surfaces in probe stats so we can
 * retune the prompt if floor violations cluster.
 */
export const IMAGE_PROMPT_MIN_CHARS = 40;

/** Soft floor for camera language diversity across 17 frames. */
export const CAMERA_DIVERSITY_MIN = 5;

/** UI-facing scene description; users will read & edit these. */
export const SCENE_DESCRIPTION_MAX_CHARS = 30;

/** Subtitle burned into the video — short, punchy, brand-safe. */
export const ON_SCREEN_TEXT_MAX_CHARS = 12;

/** Bumped on incompatible schema changes. Stored in StoryboardOutput.promptVersion. */
export const STORYBOARD_PROMPT_VERSION = 'v0' as const;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StoryboardFrame {
  /** 1-based — matches script.frames[i].index. */
  index: number;
  /** Pass-through from script frame (voiceover line for this clip). */
  voiceover: string;
  /** Pass-through from script frame (target duration in seconds). */
  durationSec: number;
  /** Camera term, MUST be in CAMERA_LANGUAGE_VOCAB. */
  cameraLanguage: CameraLanguage;
  /** UI/edit-facing scene description (≤ SCENE_DESCRIPTION_MAX_CHARS chars). */
  scene: string;
  /** Seedance-ready image prompt (≤ IMAGE_PROMPT_MAX_CHARS chars). */
  imagePrompt: string;
  /** Optional on-screen subtitle (≤ ON_SCREEN_TEXT_MAX_CHARS chars). */
  onScreenText?: string;
}

export interface StoryboardOutput {
  promptVersion: typeof STORYBOARD_PROMPT_VERSION;
  frames: ReadonlyArray<StoryboardFrame>;
  totalDurationSec: number;
  suppressionFlags: ReadonlyArray<SuppressionFlag>;
  llmModel: string;
  generatedAt: string; // ISO timestamp
}

/** Subset of GeneratedScript fields the storyboard prompt actually consumes. */
export interface StoryboardPromptInput {
  topic: string;
  scriptFrames: GeneratedScript['frames'];
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个抖音/小红书短视频分镜导演，把 17 帧口播脚本转化为可直接喂给文生视频模型（Seedance）的分镜表。

## 你的唯一职责

输入是一个已经定稿的 17 帧（也可能是 16 或 18 帧）口播脚本。你**不能**新增或删除帧，**不能**改 voiceover 文案，**不能**改 durationS。你只为每一帧补充以下 4 个视觉字段：

1. **scene**（10-30 字）— 中文场景描述，写给人看的，方便用户在 UI 里校对/编辑。
2. **imagePrompt**（**目标 50-75 字，硬上限 80 字**）— 中文 image-gen prompt，会**直接喂给 Seedance**。**短于 40 字 = 信息不足，不合格**。必须包含 5 个要素：(a) 风格关键词（写实/纪录片/电影感） (b) 具体主体（人物职业/年龄/性别 或 物体形态） (c) 环境（具体场所） (d) 光照（顶光/侧光/自然光/屏幕冷光等） (e) 构图细节（景深/角度/前景元素）。
3. **cameraLanguage**（必选词表内 1 个）— 从这 8 个词里选**且只选 1 个**：特写 / 中景 / 全景 / 拉远 / 推近 / 平移 / 俯拍 / 仰拍。词表外的输出会被系统拒绝。
4. **onScreenText**（可选，≤12 字）— 屏幕上的字幕。一般留空，**只在以下情况填写**：(a) 该帧 voiceover 包含金句或核心数字，需要视觉强化 (b) 该帧是反问、对比、揭示等高强度信息节点。如不填，该字段省略。

## 镜头语言运用硬性要求

- **17 帧中至少要使用 5 种不同的 cameraLanguage**（仅用 2-3 种 = 不合格，画面单调观众会划走）
- **快切节奏的钩子段（前 3 帧）**：优先用"特写 / 推近"制造紧张感
- **痛点/案例段（中段）**：用"中景 / 全景 / 平移"展示场景细节
- **真相揭示/金句段（末 4 帧）**：用"拉远 / 俯拍 / 仰拍"配合画面收束
- **禁止连续 3 帧用同一个镜头语言**（任何剧情下都不行）

## imagePrompt 写作硬性要求

- 用写实风格关键词（写实/纪录片/电影感），不要卡通/插画/二次元
- 数字、品牌名、屏幕文字**不要**写进 imagePrompt（image gen 模型容易把字渲染成乱码），改用 onScreenText 字段
- **每一帧的 imagePrompt 必须不同** — 两帧 imagePrompt 重复 ≥ 60% 关键词 = 不合格
- 50-75 字目标，**最少 40 字**，硬上限 80 字。低于 40 字说明你偷懒了，请补足主体/环境/光照/构图细节

## 输出 JSON 格式（占位符语义，不要照抄字面）

\`\`\`
{
  "frames": [
    {
      "index": <整数，与输入帧 index 一一对应>,
      "scene": "<10-30 字中文场景描述，由你根据 voiceover 自己写>",
      "imagePrompt": "<40-80 字中文 image prompt，由你根据 voiceover + visualDirection 自己写>",
      "cameraLanguage": "<8 词词表中的 1 个>",
      "onScreenText": "<可选，≤12 字字幕；不填则省略此字段>"
    }
  ]
}
\`\`\`

**关于上面的格式**：尖括号 \`<...>\` 是占位符，**严禁**把占位符或 \`<>\` 符号原样输出到 JSON 里。每一帧的 4 个字段都必须根据该帧的 voiceover 和上下文你自己创作。

**绝对不要**输出 voiceover 或 durationS 字段（这些是脚本节点的产物，不归你管）。
**绝对不要**用 markdown 代码块包裹最终 JSON。直接输出 JSON 对象。

${buildSuppressionInstruction()}

## 输出前自检（全部"是"才输出）

1. frames 数组长度与输入脚本一致吗？（不能多也不能少）
2. 每帧 cameraLanguage 都在 8 词表内吗？整体使用了至少 5 种不同的镜头语言吗？
3. 每帧 imagePrompt 都在 40-80 字之间吗？没有 30 字以内的偷懒帧吗？
4. 每帧 imagePrompt 各不相同（重复关键词 < 60%）吗？
5. 每帧 scene 都 ≤30 字吗？
6. onScreenText（如填写）都 ≤12 字吗？
7. imagePrompt 都用写实风格吗？没有数字/品牌字渲染要求吗？
8. 整体 8 类抑制词都没踩吗？
9. JSON 里没有任何 \`<\` 或 \`>\` 占位符残留吗？
`.trim();

function buildUserPrompt(input: StoryboardPromptInput): string {
  const framesJson = input.scriptFrames.map((f) => ({
    index:           f.index,
    voiceover:       f.text,
    durationS:       f.durationS,
    visualDirection: f.visualDirection,
  }));

  return `
## 任务

为下面这条 60 秒短视频脚本（共 ${input.scriptFrames.length} 帧）生成分镜表。

**视频主题**：${input.topic}

**脚本帧**（已锁定，你只补 scene/imagePrompt/cameraLanguage/onScreenText）：

\`\`\`json
${JSON.stringify(framesJson, null, 2)}
\`\`\`

按 system prompt 的格式输出 JSON。frames 数组必须正好 ${input.scriptFrames.length} 条，与输入一一对应（按 index 匹配）。
`.trim();
}

export function buildStoryboardPrompt(input: StoryboardPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt:   buildUserPrompt(input),
  };
}

// ─── Validator + assembly ─────────────────────────────────────────────────────

export interface ValidationIssue {
  code:
    | 'PARSE_FAILED'
    | 'FRAME_COUNT_MISMATCH'
    | 'FRAME_INDEX_MISMATCH'
    | 'FIELD_MISSING'
    | 'CAMERA_LANGUAGE_OUT_OF_VOCAB'
    | 'PLACEHOLDER_LEAKED'
    | 'IMAGE_PROMPT_TOO_LONG'
    | 'SCENE_TOO_LONG'
    | 'ON_SCREEN_TEXT_TOO_LONG';
  frameIndex?: number;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  output?: StoryboardOutput;
  issues: ReadonlyArray<ValidationIssue>;
  /** Soft warnings (truncations) that did NOT cause failure. */
  warnings: ReadonlyArray<string>;
}

interface RawStoryboardFrame {
  index?:          unknown;
  scene?:          unknown;
  imagePrompt?:    unknown;
  cameraLanguage?: unknown;
  onScreenText?:   unknown;
}

interface RawStoryboard {
  frames?: unknown;
}

/**
 * Validate the raw LLM output and zip it back together with script frames.
 * - Hard fails: frame count off, missing fields, camera vocab violation
 * - Soft fails (warnings): imagePrompt > cap → truncate; scene/onScreenText > cap → truncate
 *
 * Caller should retry once on hard fail before accepting the truncation.
 */
export function validateStoryboard(
  rawText: string,
  scriptFrames: GeneratedScript['frames'],
  llmModel: string,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];

  // 1. JSON parse (strip ```json fences if present)
  let parsed: RawStoryboard;
  try {
    const cleaned = rawText
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      issues: [
        { code: 'PARSE_FAILED', detail: e instanceof Error ? e.message : String(e) },
      ],
      warnings,
    };
  }

  // 2. Shape check
  if (!Array.isArray(parsed.frames)) {
    return {
      ok: false,
      issues: [{ code: 'FIELD_MISSING', detail: 'frames is not an array' }],
      warnings,
    };
  }

  // 3. Frame count check (hard)
  if (parsed.frames.length !== scriptFrames.length) {
    issues.push({
      code: 'FRAME_COUNT_MISMATCH',
      detail: `expected ${scriptFrames.length} frames, got ${parsed.frames.length}`,
    });
    return { ok: false, issues, warnings };
  }

  // 4. Per-frame check + assemble
  const cameraVocabSet = new Set<string>(CAMERA_LANGUAGE_VOCAB);
  const assembled: StoryboardFrame[] = [];

  for (let i = 0; i < parsed.frames.length; i++) {
    const raw = parsed.frames[i] as RawStoryboardFrame;
    const scriptFrame = scriptFrames[i];

    if (typeof raw.index !== 'number' || raw.index !== scriptFrame.index) {
      issues.push({
        code: 'FRAME_INDEX_MISMATCH',
        frameIndex: scriptFrame.index,
        detail: `frame[${i}].index expected ${scriptFrame.index}, got ${String(raw.index)}`,
      });
      continue;
    }

    const sceneRaw          = typeof raw.scene === 'string' ? raw.scene.trim() : '';
    const imagePromptRaw    = typeof raw.imagePrompt === 'string' ? raw.imagePrompt.trim() : '';
    const cameraLanguageRaw = typeof raw.cameraLanguage === 'string' ? raw.cameraLanguage.trim() : '';
    const onScreenTextRaw   = typeof raw.onScreenText === 'string' ? raw.onScreenText.trim() : '';

    if (!sceneRaw || !imagePromptRaw || !cameraLanguageRaw) {
      issues.push({
        code: 'FIELD_MISSING',
        frameIndex: scriptFrame.index,
        detail: `missing required field(s): ${[
          !sceneRaw && 'scene',
          !imagePromptRaw && 'imagePrompt',
          !cameraLanguageRaw && 'cameraLanguage',
        ].filter(Boolean).join(', ')}`,
      });
      continue;
    }

    if (!cameraVocabSet.has(cameraLanguageRaw)) {
      issues.push({
        code: 'CAMERA_LANGUAGE_OUT_OF_VOCAB',
        frameIndex: scriptFrame.index,
        detail: `"${cameraLanguageRaw}" not in vocab [${CAMERA_LANGUAGE_VOCAB.join('/')}]`,
      });
      continue;
    }

    // Hard fail if the LLM leaked our `<…>` placeholder tokens into any field
    // (typical failure: "<40-80 字中文 image prompt>"). This used to pass pre-v0.1
    // prompt tightening — guard defensively so we catch regressions.
    const placeholderField = [
      ['scene', sceneRaw],
      ['imagePrompt', imagePromptRaw],
      ['cameraLanguage', cameraLanguageRaw],
      ['onScreenText', onScreenTextRaw],
    ].find(([, v]) => /[<>]/.test(v));
    if (placeholderField) {
      issues.push({
        code: 'PLACEHOLDER_LEAKED',
        frameIndex: scriptFrame.index,
        detail: `${placeholderField[0]} contains placeholder marker: ${placeholderField[1]}`,
      });
      continue;
    }

    let scene = sceneRaw;
    if (scene.length > SCENE_DESCRIPTION_MAX_CHARS) {
      scene = scene.slice(0, SCENE_DESCRIPTION_MAX_CHARS);
      warnings.push(`frame ${scriptFrame.index}: scene truncated ${sceneRaw.length} → ${SCENE_DESCRIPTION_MAX_CHARS}`);
    }

    let imagePrompt = imagePromptRaw;
    if (imagePrompt.length > IMAGE_PROMPT_MAX_CHARS) {
      imagePrompt = imagePrompt.slice(0, IMAGE_PROMPT_MAX_CHARS);
      warnings.push(`frame ${scriptFrame.index}: imagePrompt truncated ${imagePromptRaw.length} → ${IMAGE_PROMPT_MAX_CHARS}`);
    } else if (imagePrompt.length < IMAGE_PROMPT_MIN_CHARS) {
      warnings.push(`frame ${scriptFrame.index}: imagePrompt below floor ${imagePrompt.length} < ${IMAGE_PROMPT_MIN_CHARS} (missing subject/env/lighting detail)`);
    }

    let onScreenText: string | undefined = onScreenTextRaw || undefined;
    if (onScreenText && onScreenText.length > ON_SCREEN_TEXT_MAX_CHARS) {
      onScreenText = onScreenText.slice(0, ON_SCREEN_TEXT_MAX_CHARS);
      warnings.push(`frame ${scriptFrame.index}: onScreenText truncated ${onScreenTextRaw.length} → ${ON_SCREEN_TEXT_MAX_CHARS}`);
    }

    assembled.push({
      index:          scriptFrame.index,
      voiceover:      scriptFrame.text,
      durationSec:    scriptFrame.durationS,
      cameraLanguage: cameraLanguageRaw as CameraLanguage,
      scene,
      imagePrompt,
      ...(onScreenText ? { onScreenText } : {}),
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues, warnings };
  }

  // 5. Camera diversity check (soft). Prompt requires ≥ 5 distinct terms
  // across 17 frames; anything below signals lazy/repetitive visual storytelling.
  const distinctCameras = new Set(assembled.map((f) => f.cameraLanguage)).size;
  if (assembled.length >= CAMERA_DIVERSITY_MIN && distinctCameras < CAMERA_DIVERSITY_MIN) {
    warnings.push(`low camera diversity: ${distinctCameras} distinct terms across ${assembled.length} frames (min ${CAMERA_DIVERSITY_MIN})`);
  }

  // 6. Suppression scan on concatenation of (imagePrompt + scene + onScreenText)
  // across all frames. voiceover is excluded (script node already scanned it).
  const concatForScan = assembled
    .map((f) => `${f.imagePrompt} ${f.scene} ${f.onScreenText ?? ''}`)
    .join(' ');
  const suppressionFlags = buildSuppressionScanner(concatForScan);

  const totalDurationSec = assembled.reduce((sum, f) => sum + f.durationSec, 0);

  const output: StoryboardOutput = {
    promptVersion:    STORYBOARD_PROMPT_VERSION,
    frames:           assembled,
    totalDurationSec,
    suppressionFlags,
    llmModel,
    generatedAt:      new Date().toISOString(),
  };

  return { ok: true, output, issues, warnings };
}
