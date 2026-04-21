// ENG-017 / ENG-018 / W3-07 — Suppression list + prompt-level injection
// D7: Uncanny valley suppression. These patterns are banned pre-launch.
//
// W3-07 expansion: 8 categories / 50 exemplars. Drawn from real Douyin B2B
// script audits — the phrases that consistently make users say "AI 写的".

export interface SuppressionRule {
  category: string;
  description: string;
  examples: string[];
}

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
      '不知道你有没有发现',
      '有这样一个现象',
      '在信息爆炸的今天',
      '在这个瞬息万变的时代',
    ],
  },
  {
    category: 'ai_tell_adjective',
    description: 'AI 高频正向形容词 — 几乎只在 AI 输出里密集出现的修饰词',
    examples: [
      '赋能',
      '助力',
      '打造',
      '焕新',
      '破局',
      '深耕',
      '革新',
      '焕发新活力',
      '解锁新可能',
    ],
  },
  {
    category: 'uniform_positive',
    description: '全程正向无不确定性 — 所有结论都是确定的，无任何局限',
    examples: [
      '完全解决了',
      '彻底改变了',
      '所有用户都',
      '必然会',
      '无可替代',
      '毫无疑问',
      '绝对能',
    ],
  },
  {
    category: 'false_claim',
    description: '夸张产品功能 — 产品实际没有的确定性承诺',
    examples: [
      '一键生成完整营销方案',
      '100%准确率',
      '全自动化无需人工干预',
      '零门槛',
      '秒级响应',
      '全网首创',
    ],
  },
  {
    category: 'hype_superlative',
    description: '情绪性最高级 — 震撼 / 颠覆 / 炸裂类标题党词汇',
    examples: [
      '震撼',
      '颠覆',
      '炸裂',
      '绝杀',
      '王炸',
      '史诗级',
      '现象级',
    ],
  },
  {
    category: 'symmetric_list',
    description: '对称列表结构 — 三点×等长子条目，机器感最强',
    examples: [
      '首先...其次...最后... 三点结构，每点完全等长',
      '1. X（三字） 2. Y（三字） 3. Z（三字）',
    ],
  },
  {
    category: 'hollow_closer',
    description: '空洞结尾 — 无行动号召的通用收尾套话',
    examples: [
      '让我们一起',
      '共创未来',
      '拥抱变化',
      '未来可期',
      '期待与你共同见证',
      '让改变开始发生',
    ],
  },
  {
    category: 'empty_connective',
    description: '无信息量连接词 — 承上启下时的填充物',
    examples: [
      '值得一提的是',
      '更重要的是',
      '不仅如此',
      '与此同时',
      '除此之外',
    ],
  },
];

/**
 * Returns the suppression instruction block to inject into any system prompt.
 * Called by all content generation prompt builders.
 */
export function buildSuppressionInstruction(): string {
  return `
## 禁止输出模式（Suppression Rules · 硬性）

以下 8 类表达会触发观众的"AI 感"识别，绝对禁止出现：

**1. 空洞开场句** — 禁用"在当今..."、"随着...发展"、"众所周知"、"有这样一个现象"、"不知道你有没有发现"等时代背景或提示性开场。直接进入钩子。

**2. AI 高频正向形容词** — 禁用"赋能 / 助力 / 打造 / 焕新 / 破局 / 深耕 / 革新"这些词。用具体动作替代（例："让销售回复快 3 倍"而非"赋能销售团队"）。

**3. 全程正向无不确定性** — 禁用"完全解决 / 彻底改变 / 所有用户都 / 必然会 / 毫无疑问 / 绝对能"。真实内容带有局限——用"对某些场景来说 / 在特定条件下 / 可能"等表述。

**4. 夸张产品功能** — 除非用户主张中明确，禁止"一键 / 100% / 全自动化 / 零门槛 / 秒级 / 全网首创"等确定性承诺。

**5. 情绪性最高级** — 禁用"震撼 / 颠覆 / 炸裂 / 绝杀 / 王炸 / 史诗级 / 现象级"。用具体数字或场景替代。

**6. 对称列表结构** — 禁止三点×等长子条目格式。如必须列举，字数故意不对称，或只用 1-2 个具体例子，不凑整数。

**7. 空洞结尾** — 禁用"让我们一起 / 共创未来 / 拥抱变化 / 未来可期"。结尾必须是具体行动号召或反问钩子。

**8. 无信息量连接词** — 删除"值得一提的是 / 更重要的是 / 不仅如此 / 与此同时"。直接说下一个要点。
`.trim();
}
