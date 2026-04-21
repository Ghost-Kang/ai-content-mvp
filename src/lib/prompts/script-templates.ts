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

## 最重要的两个硬性指标（违反任何一个 = 输出无效，会被系统拒绝）

**指标 1 — frames 数组必须有 17 个元素**（允许 16 或 18，严禁 ≤15 或 ≥19）
**指标 2 — 所有 frame.text 拼接后去空白字符数必须在 200-210 之间**

在你开始写之前，先在心里数一遍：你打算写几帧？如果不是 16/17/18，立即重新规划。
在你输出之前，再数一遍 frames.length。这个字段长度就是我的验证脚本检查的第一件事。

## 17 帧的标准分配（照这个模板拆）

| 区段 | 帧号 | 帧数 | 每帧时长 | 每帧字数 | 累计字数 |
|---|---|---|---|---|---|
| 钩子（反常识） | 1-3 | 3 | 2s | 12-15 | ~40 |
| 痛点/论点展开 | 4-7 | 4 | 3s | 12-16 | ~55 |
| 案例证据 | 8-13 | 6 | 3-4s | 12-14 | ~80 |
| 真相揭示 + 金句 | 14-17 | 4 | 3-5s | 8-12 | ~35 |
| **合计** | | **17** | **60s** | | **~210** |

每一帧 = 一个画面切换 = 一个小意群。不要把两句话塞进同一帧。如果一帧超过 16 字，大概率应该拆成两帧。

## 输出 JSON 格式

{
  "frames": [
    { "index": 1, "text": "每帧独立的一小段口播（8-16字）", "visualDirection": "画面：xxx", "durationS": 2 },
    { "index": 2, "text": "...", "visualDirection": "...", "durationS": 2 },
    ... // 必须有 17 个 frame 对象
    { "index": 17, "text": "...", "visualDirection": "...", "durationS": 4 }
  ],
  "commentBaitQuestion": "引导观众在评论区讨论的开放式问题（不计入 frames 字数）"
}

## 输出前自检（对自己提问，全部"是"才输出）

1. frames.length === 17（或 16/18）吗？
2. 所有 text 拼起来去空白后在 200-210 字之间吗？
3. 开场 3 帧每帧是 2 秒快切吗？
4. 没有任何一帧超过 18 字吗？（超过说明你应该拆）

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

## 公式结构（挑衅断言型）—— 每一步对应的帧号已标好，必须按此分帧

1. **反常识开场**（帧 1-3，每帧 2 秒）：说出一个与主流认知相悖的断言，让人产生"这说的不对吧"的反应。三帧按"断言→停顿字→反问"节奏拆。
2. **痛感具体化**（帧 4-7，每帧 3 秒）：用目标受众最熟悉的痛苦场景具体化这个断言，让人觉得"说的是我"。四帧 = 四个具体痛点片段。
3. **案例证明**（帧 8-13，每帧 3-4 秒）：用一个真实感强的具体案例（时间、数字、结果）来支撑断言。六帧足够展开"背景→尝试→失败→转折→数字→结果"。
4. **真相揭示 + 金句**（帧 14-17，每帧 3-5 秒）：给出产品解决这个痛点的核心机制（不是功能列表，是底层逻辑），最后一帧必须是一句让人想记住或讨论的金句。${brandNote}

## 输出前最后检查

- frames 数组长度是 17 吗？（必须，或允许 16/18）
- 所有 frame.text 拼接去空白字符数在 200-210 吗？
- 每步对应的帧号范围对吗？
- 最后一帧是金句而不是空洞结尾吗？

输出 JSON。
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

## 公式结构（日常现象洞察型）—— 每一步对应的帧号已标好，必须按此分帧

1. **现象切入**（帧 1-3，每帧 2 秒）：找一个与产品相关的、人人见过但没人想过为什么的日常现象（优先选最近 1-2 年出现的新现象）。三帧 = "画面描述→提出疑问→稍作停顿"。
2. **本质揭示**（帧 4-8，每帧 3 秒）：用经济学/心理学/商业逻辑解释这个现象背后的真实原因。五帧足够拆成"看起来是A→其实是B→原因1→原因2→总结"。这是认知升级点，展开要够。
3. **产品连接**（帧 9-13，每帧 3-4 秒）：将这个底层逻辑自然连接到产品解决的问题上。五帧 = "从现象看到产品→产品的底层机制→具体场景→和别的方案的区别→一句话总结"。
4. **共鸣落地 + 金句**（帧 14-17，每帧 4-5 秒）：用目标受众的日常场景具体化"如果你也有这个问题…"，最后一帧必须是让人想转发或评论的金句。${brandNote}

## 选题硬性要求

现象必须是真实存在且有洞察价值的。**不允许**以"找不到合适现象"为由简化输出——如果一时想不到，就从"为什么这个行业的从业者最近 1 年都在抱怨 X"、"为什么过去 6 个月同类产品都在做 Y" 这类角度切入，一定能找到。

## 输出前最后检查

- frames 数组长度是 17 吗？（必须，或允许 16/18）
- 所有 frame.text 拼接去空白字符数在 200-210 吗？
- 每步对应的帧号范围对吗？
- 最后一帧是金句而不是空洞结尾吗？

输出 JSON。
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
  short: { min: 16, max: 18 },
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
