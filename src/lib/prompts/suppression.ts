// ENG-017 / ENG-018 — Suppression list + prompt-level injection
// D7: Uncanny valley suppression. These patterns are banned pre-launch.

export interface SuppressionRule {
  category: string;
  description: string;
  examples: string[];
}

// Seed data — also written to suppression_list table via migration 001
export const SUPPRESSION_RULES: SuppressionRule[] = [
  {
    category: 'hollow_opener',
    description: '空洞过渡句 — 无实际信息量的开场套话',
    examples: [
      '在当今快节奏的商业环境中',
      '随着科技的飞速发展',
      '在这个充满机遇与挑战的时代',
      '作为一个现代人',
      '众所周知',
    ],
  },
  {
    category: 'symmetric_list',
    description: '对称列表结构 — 三点×三子条目的等长对称格式，机器感最强',
    examples: [
      '首先...其次...最后... 三点结构，每点完全等长',
      '1. X（三字） 2. Y（三字） 3. Z（三字）',
    ],
  },
  {
    category: 'false_claim',
    description: '对产品功能的自信错误描述 — 声称产品具备实际上没有的功能',
    examples: [
      '一键生成完整营销方案',
      '100%准确率',
      '全自动化无需人工干预',
    ],
  },
  {
    category: 'uniform_positive',
    description: '全程正向措辞，无不确定性 — 所有结论都是确定的、正面的，没有任何局限',
    examples: [
      '完全解决了...',
      '彻底改变了...',
      '所有用户都...',
      '必然会...',
    ],
  },
];

/**
 * Returns the suppression instruction block to inject into any system prompt.
 * Called by all content generation prompt builders.
 */
export function buildSuppressionInstruction(): string {
  return `
## 禁止输出模式（Suppression Rules）

以下模式会触发用户的"AI感"识别，必须严格避免：

**1. 空洞开场句**
绝对禁止使用以下类型的开场：
- "在当今快节奏的商业环境中..."
- "随着科技的飞速发展..."
- "作为一个现代人..."
- 任何以时代背景、宏大叙事开场的句式

**2. 对称列表结构**
禁止生成三点×三子条目的等长对称格式。如果必须列举，
使用不等长的自然语言，或只用1-2个具体例子，不要凑成整数。

**3. 产品功能的错误描述**
只描述用户明确告知的功能。不要声称"一键"、"自动化"、"100%"
等确定性表述，除非用户输入中明确包含这些信息。

**4. 全程正向无不确定性**
真实内容有局限性。适当使用"可能"、"对某些用户来说"、
"在特定场景下"等表述，而非"所有用户都会..."。
`.trim();
}
