// W4-03-V3 — Topic Analysis prompt.
//
// One LLM call, two questions:
//   1. 为什么火（3 句）— pattern recognition on the data we have
//   2. 怎么改造为你的内容（3 句）— concrete adaptation moves
//
// Strict JSON output. No streaming, no tool-calls, no chat history.
// All four platforms (dy/ks/xhs/bz) share the same prompt — the LLM
// sees the platform name in the user prompt and adjusts tone naturally.

import { NICHE_MAX_CHARS } from './types';
import type { TopicAnalysisInput } from './types';

const PLATFORM_LABEL: Record<TopicAnalysisInput['platform'], string> = {
  dy:  '抖音',
  ks:  '快手',
  xhs: '小红书',
  bz:  'B 站',
};

const SYSTEM_PROMPT = `你是中文短视频平台（抖音/快手/小红书/B 站）的爆款选题分析师，专门帮独立创作者快速读懂一条爆款视频。

## 你的任务

我会给你一条已经爆款的视频的元数据（标题/简介/分类/互动数据/平台/作者）。
你只回答两个问题，每个问题恰好 3 句话：

1. **whyItHit（为什么火）**：从「话题角度 / 内容形式 / 情绪钩子 / 数据信号」中挑 3 个最明显的角度各写 1 句，每句 15-80 字。讲事实，不空话；如果数据不足以支撑某个判断，**不要硬编**——换一个有依据的角度。
2. **howToAdapt（怎么改造为我的内容）**：3 句具体的、可执行的改造动作（不是"做更好的内容"这种废话）。每句 15-100 字。如果用户提供了「我的内容定位」，3 句必须紧扣那个定位；如果没有定位，写 3 个跨赛道通用的改造方向，并在第 1 句开头明确说"假设你的赛道是 XX"，**不要瞎猜**用户的赛道。

## 硬性输出格式

直接输出 JSON 对象，**不要** markdown 代码块包裹，**不要**任何解释性文字：

{
  "whyItHit":   ["第1句", "第2句", "第3句"],
  "howToAdapt": ["第1句", "第2句", "第3句"]
}

## 自检清单（每条都"是"才输出）

1. whyItHit 和 howToAdapt 数组长度都是 3 吗？
2. 每句中文字符数都在 [15, 100] 之间（whyItHit 上限 80，howToAdapt 上限 100）吗？
3. 没有任何尖括号占位符（如 \`<...>\` / \`{...}\`）残留在最终 JSON 里吗？
4. 没有空字符串、纯空格、纯标点的句子吗？
5. 如果用户没给定位，第 1 句 howToAdapt 是不是用了"假设你的赛道是..."的开头？
6. 没有用 markdown 代码块包裹 JSON 吗？
`.trim();

function formatNumber(n: number | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 1_000)         return String(n);
  if (n < 10_000)        return `${(n / 1_000).toFixed(1)}k`;
  if (n < 100_000_000)   return `${Math.round(n / 10_000)}万`;
  return `${(n / 100_000_000).toFixed(1)}亿`;
}

function buildUserPrompt(input: TopicAnalysisInput): string {
  const platformLabel = PLATFORM_LABEL[input.platform];

  const fields: Array<[string, string | null]> = [
    ['平台',          platformLabel],
    ['标题',          input.title?.trim() || null],
    ['简介/口播开头', input.description?.trim() ? input.description.slice(0, 300) : null],
    ['一级分类',      input.firstCategory ?? null],
    ['二级分类',      input.secondCategory ?? null],
    ['作者',          input.authorNickname ?? null],
    ['时长（秒）',    typeof input.duration === 'number' ? input.duration.toFixed(0) : null],
    ['点赞',          formatNumber(input.likeCount)],
    ['播放',          formatNumber(input.playCount)],
  ];

  const lines = fields
    .filter((kv): kv is [string, string] => kv[1] !== null && kv[1] !== '')
    .map(([k, v]) => `- ${k}：${v}`)
    .join('\n');

  // Niche is trimmed + truncated by the caller via NICHE_MAX_CHARS, but
  // belt-and-suspenders here in case a future caller forgets.
  const niche = input.niche?.trim().slice(0, NICHE_MAX_CHARS);
  const nicheBlock = niche
    ? `\n**我的内容定位**：${niche}\n\nhowToAdapt 的 3 句必须紧扣上面这个定位给具体动作。`
    : `\n**我没有提供内容定位**。\n\nhowToAdapt 的第 1 句必须用"假设你的赛道是 …"的开头，给 3 个跨赛道通用方向；不要替我瞎猜。`;

  return `
## 这条爆款视频的元数据

${lines}
${nicheBlock}

按 system prompt 的 JSON 格式输出。
`.trim();
}

export function buildAnalysisPrompt(input: TopicAnalysisInput): {
  systemPrompt: string;
  userPrompt:   string;
} {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt:   buildUserPrompt(input),
  };
}

export { SYSTEM_PROMPT as TOPIC_ANALYSIS_SYSTEM_PROMPT };
