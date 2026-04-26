// W4-06 · 抑制词 scanner 正例回归测试
//
// 目标：喂 10 条"明显该触发"的句子，要求 scanner 全部命中。
// 任一不命中 → 退出 1 → 发布阻塞。
//
// 跑：pnpm tsx scripts/test-suppression-scanner.ts

import { buildSuppressionScanner } from '../src/lib/prompts/suppression-scanner';

interface Case {
  text: string;
  expectedCategory: string;
  why: string;
}

const CASES: Case[] = [
  {
    text: '在当今快节奏的商业环境中，B2B SaaS 企业面临前所未有的挑战。',
    expectedCategory: 'hollow_opener',
    why: '典型的"在当今..."空洞开场',
  },
  {
    text: '我们的产品能够赋能销售团队，助力业务增长。',
    expectedCategory: 'ai_tell_adjective',
    why: '"赋能"+"助力"双 AI 高频词',
  },
  {
    text: '这款工具彻底改变了我们的工作方式，所有用户都会受益。',
    expectedCategory: 'uniform_positive',
    why: '"彻底改变"+"所有用户都"无不确定性',
  },
  {
    text: '支持一键生成完整营销方案，100%准确率保证。',
    expectedCategory: 'false_claim',
    why: '典型的"一键"+"100%"夸张承诺',
  },
  {
    text: '这是一款颠覆行业的炸裂级产品，现象级爆款。',
    expectedCategory: 'hype_superlative',
    why: '"颠覆"+"炸裂"+"现象级"三连最高级',
  },
  {
    text: '让我们一起拥抱变化，共创未来。',
    expectedCategory: 'hollow_closer',
    why: '典型的空洞结尾套话',
  },
  {
    text: '产品功能强大。值得一提的是，它还支持多平台同步。',
    expectedCategory: 'empty_connective',
    why: '"值得一提的是"无信息量连接',
  },
  {
    text: '众所周知，SaaS 行业的获客成本正在上升。',
    expectedCategory: 'hollow_opener',
    why: '"众所周知"属于空洞开场',
  },
  {
    text: '这款产品破局了传统营销的困境，深耕 B2B 场景，焕发新活力。',
    expectedCategory: 'ai_tell_adjective',
    why: '"破局"+"深耕"+"焕发新活力"AI 形容词密集',
  },
  {
    text: '我们的三大优势：1. 快速（省时间） 2. 省钱（降成本） 3. 好用（提效率）',
    expectedCategory: 'symmetric_list',
    why: '三点等长列表（每点 6-7 字），对称结构',
  },
];

function main() {
  console.log(`🧪 抑制词 scanner 回归测试 · ${CASES.length} 条正例\n`);

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const flags = buildSuppressionScanner(c.text);
    const hit = flags.some((f) => f.category === c.expectedCategory);

    if (hit) {
      passed++;
      console.log(
        `  ✅ [${i + 1}] ${c.expectedCategory} — ${c.text.slice(0, 30)}...`,
      );
    } else {
      failed++;
      console.log(`  ❌ [${i + 1}] 漏检 ${c.expectedCategory}`);
      console.log(`     文本：${c.text}`);
      console.log(`     原因：${c.why}`);
      console.log(`     实际触发类别：${flags.map((f) => f.category).join(', ') || '(无)'}`);
    }
  }

  console.log(`\n合计：${passed}/${CASES.length} 通过`);

  if (failed === 0) {
    console.log('✅ 全部命中 · 可发布');
    process.exit(0);
  } else {
    console.log(`❌ ${failed} 条漏检 · 发布阻塞 —— 需补充 SUPPRESSION_RULES.examples 或检查 symmetric_list 逻辑`);
    process.exit(1);
  }
}

main();
