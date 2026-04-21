// ENG-011 — Prompt template registry
// formula × length_mode → system + user prompt builders

import { buildSuppressionInstruction } from './suppression';

export type Formula = 'provocation' | 'insight';
export type LengthMode = 'short' | 'long';

export interface ScriptPromptInput {
  formula: Formula;
  lengthMode: LengthMode;
  productName: string;
  targetAudience: string;
  coreClaim: string;
  brandVoiceNotes?: string;
}

export interface FrameSpec {
  index: number;
  text: string;
  visualDirection: string;
  durationS: number;
}

export interface GeneratedScript {
  frames: FrameSpec[];
  charCount: number;
  frameCount: number;
  fullText: string;
  commentBaitQuestion: string;
}

// ─── 60-second short video ────────────────────────────────────────────────────

const SHORT_VIDEO_SYSTEM = `你是一个抖音短视频脚本专家，专门为B2B产品创作60秒口播脚本。

## 输出格式要求（严格遵守）

输出一个JSON对象，格式如下：
{
  "frames": [
    {
      "index": 1,
      "text": "这段的口播文字（每帧独立完整）",
      "visualDirection": "画面建议：xxx",
      "durationS": 3
    }
  ],
  "commentBaitQuestion": "引导观众在评论区讨论的问题（开放式，引发共鸣）"
}

## 核心约束

- **总字数必须在 200-210 字之间**（所有 frame.text 拼接后去空白的字符数）。这是硬性要求。
- **总帧数：16-18 帧**
- 节奏：开场 3 帧快切（每帧 2 秒）→ 中间 10-12 帧正常（每帧 3-4 秒）→ 结尾 3 帧减速（每帧 4-5 秒）
- 结构：开场钩子约 40 字 → 核心论点约 55 字 → 单一案例约 80 字 → 金句收尾约 35 字（共 ~210 字）
- 评论引导问题：单独 commentBaitQuestion 字段，不计入 frames 字数

${buildSuppressionInstruction()}`;

const LONG_VIDEO_SYSTEM = `你是一个抖音/小红书内容脚本专家，专门为B2B产品创作深度口播脚本。

## 输出格式要求（严格遵守）

输出一个JSON对象，格式如下：
{
  "frames": [
    {
      "index": 1,
      "text": "这段的口播文字",
      "visualDirection": "画面建议：xxx",
      "durationS": 6
    }
  ],
  "commentBaitQuestion": "引导观众在评论区讨论的问题"
}

## 核心约束

- 总字数：800-1000字
- 总帧数：38-42帧（约4分钟视频）
- 每帧时长：5-8秒
- 结构：问题引入（8帧）→ 现象分析（12帧）→ 核心论点（10帧）→ 案例×2（8帧）→ 行动号召（4帧）

${buildSuppressionInstruction()}`;

// ─── 挑衅断言型（公式一）user prompt ──────────────────────────────────────────

function buildProvocationUserPrompt(input: ScriptPromptInput, isShort: boolean): string {
  const brandNote = input.brandVoiceNotes
    ? `\n\n## 品牌声音要求\n${input.brandVoiceNotes}`
    : '';

  return `
## 创作任务

为以下产品创作一条**挑衅断言型**${isShort ? '60秒' : '长视频'}口播脚本：

- **产品名称**：${input.productName}
- **目标受众**：${input.targetAudience}
- **核心主张**：${input.coreClaim}

## 公式结构（挑衅断言型）

按照以下四步结构展开：
1. **反常识开场**：说出一个与主流认知相悖的断言，让人产生"这说的不对吧"的反应
2. **痛感词汇**：用目标受众最熟悉的痛苦场景具体化这个断言，让人觉得"说的是我"
3. **案例证明**：用一个真实感强的具体案例（时间、数字、结果）来支撑断言
4. **真相揭示**：给出产品解决这个痛点的核心机制，不是功能列表，是底层逻辑${brandNote}

请严格遵守字数和帧数约束，输出JSON格式。
`.trim();
}

// ─── 日常现象洞察型（公式二）user prompt ──────────────────────────────────────

function buildInsightUserPrompt(input: ScriptPromptInput, isShort: boolean): string {
  const brandNote = input.brandVoiceNotes
    ? `\n\n## 品牌声音要求\n${input.brandVoiceNotes}`
    : '';

  return `
## 创作任务

为以下产品创作一条**日常现象洞察型**${isShort ? '60秒' : '长视频'}口播脚本：

- **产品名称**：${input.productName}
- **目标受众**：${input.targetAudience}
- **核心主张**：${input.coreClaim}

## 公式结构（日常现象洞察型）

按照以下四步结构展开：
1. **现象切入**：找一个与产品相关的、人人见过但没人想过为什么的日常现象（优先选最近1-2年出现的新现象）
2. **本质揭示**：用经济学/心理学/商业逻辑解释这个现象背后的真实原因，给观众认知升级感
3. **产品连接**：将这个底层逻辑自然连接到产品解决的问题上（不要突兀，要有逻辑必然性）
4. **共鸣落地**：用目标受众的日常场景具体化"如果你也有这个问题，这里有一个方向"

**重要提醒**：这个公式的质量70%取决于选题。你必须找到一个真实存在、有洞察价值的现象，而不是编造。如果找不到合适的现象，请在输出中说明，不要强行套用。${brandNote}

请严格遵守字数和帧数约束，输出JSON格式。
`.trim();
}

// ─── Public registry ──────────────────────────────────────────────────────────

export function buildScriptPrompt(input: ScriptPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const isShort = input.lengthMode === 'short';

  const systemPrompt = isShort ? SHORT_VIDEO_SYSTEM : LONG_VIDEO_SYSTEM;

  const userPrompt =
    input.formula === 'provocation'
      ? buildProvocationUserPrompt(input, isShort)
      : buildInsightUserPrompt(input, isShort);

  return { systemPrompt, userPrompt };
}

// ─── Post-generation char count validation (ENG-012) ─────────────────────────

export const CHAR_LIMITS = {
  short: { min: 190, max: 215 },
  long:  { min: 800, max: 1000 },
};

export const FRAME_LIMITS = {
  short: { min: 15, max: 18 },
  long:  { min: 38, max: 42 },
};

export function validateScriptLength(
  fullText: string,
  frameCount: number,
  mode: LengthMode,
): { valid: boolean; charCount: number; issue?: string } {
  const charCount = fullText.replace(/\s/g, '').length;
  const limits = CHAR_LIMITS[mode];
  const frameLimits = FRAME_LIMITS[mode];

  if (charCount < limits.min) {
    return { valid: false, charCount, issue: `字数不足：${charCount}字，最少需要${limits.min}字` };
  }
  if (charCount > limits.max) {
    return { valid: false, charCount, issue: `字数超出：${charCount}字，最多${limits.max}字` };
  }
  if (frameCount < frameLimits.min || frameCount > frameLimits.max) {
    return {
      valid: false,
      charCount,
      issue: `帧数不符：${frameCount}帧，应为${frameLimits.min}-${frameLimits.max}帧`,
    };
  }

  return { valid: true, charCount };
}
