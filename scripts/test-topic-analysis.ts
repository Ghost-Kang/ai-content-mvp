// W4-03-V3 — Offline topic-analysis unit tests.
//
// Run: pnpm topic:test:analysis
// Scope:
//   - 10 analyzeTopic fixture runs (no network, mocked llmCall)
//   - validator quality gate: >= 9 / 10 fixtures succeed
//   - includes 1 intentional malformed-output case

import {
  analyzeTopic,
  NICHE_MAX_CHARS,
  TopicAnalysisError,
  type TopicAnalysisInput,
} from '../src/lib/topic-analysis/index';
import type { LLMRequest, LLMResponse } from '../src/lib/llm/types';

type Fixture = {
  label: string;
  input: TopicAnalysisInput;
  llmRaw: string;
  shouldPass: boolean;
};

let pass = 0;
let fail = 0;

function assert(cond: unknown, label: string): void {
  if (cond) {
    console.log(`  [PASS] ${label}`);
    pass++;
  } else {
    console.log(`  [FAIL] ${label}`);
    fail++;
  }
}

function mkInput(i: number, niche?: string): TopicAnalysisInput {
  const platforms: TopicAnalysisInput['platform'][] = ['dy', 'ks', 'xhs', 'bz'];
  return {
    platform: platforms[i % platforms.length],
    opusId: `opus-${i + 1}`,
    title: `案例标题 ${i + 1}：普通人也能用的增长动作`,
    description: `第 ${i + 1} 条样本，测试选题分析链路，包含话题角度与数据线索。`,
    firstCategory: i % 2 === 0 ? '知识' : '生活',
    secondCategory: i % 2 === 0 ? '职场' : '家居',
    likeCount: 1200 + i * 300,
    playCount: 30000 + i * 5000,
    duration: 25 + i,
    authorNickname: `作者${i + 1}`,
    niche,
  };
}

function validRaw(prefix: string, withNoNicheHint = false): string {
  const firstAdapt = withNoNicheHint
    ? '假设你的赛道是效率工具测评，把原视频结构改成“痛点演示+三步拆解+结果对比”，并在前 5 秒给出明确可验证收益。'
    : `${prefix}先把题材切到你的细分人群，沿用“冲突开场+具体案例+可复用模板”的三段结构，确保第一屏就出现核心收益。`;
  return JSON.stringify({
    whyItHit: [
      `${prefix}标题直接点出人群痛点并承诺可执行结果，降低了用户理解成本，所以首屏留存更高。`,
      `${prefix}叙事采用“反常识开头+步骤拆解+即时反馈”，情绪节奏清晰，促使用户继续观看。`,
      `${prefix}点赞与播放比值表现健康，说明内容不只被刷到，还能触发认同与转发动机。`,
    ],
    howToAdapt: [
      firstAdapt,
      `${prefix}把你的真实案例替换到中段步骤，用“前后对比截图+关键参数”提升可信度，并在每一步后给一个可马上执行的小动作。`,
      `${prefix}结尾增加“本周可落地检查清单”，引导评论区打卡反馈，这样能同时提升互动率和后续选题素材沉淀。`,
    ],
  });
}

async function runFixture(fx: Fixture): Promise<boolean> {
  let seenRequest: LLMRequest | null = null;

  const llmCall = async (req: LLMRequest): Promise<LLMResponse> => {
    seenRequest = req;
    return {
      content: fx.llmRaw,
      provider: 'qwen',
      model: 'qwen-mock',
      usage: {
        promptTokens: 200,
        completionTokens: 220,
        totalTokens: 420,
      },
      latencyMs: 50,
      requestId: `req-${fx.input.opusId}`,
    };
  };

  try {
    const out = await analyzeTopic(
      {
        tenantId: '00000000-0000-0000-0000-000000000001',
        input: fx.input,
      },
      {
        llmCall,
        bypassCache: true,
      },
    );

    if (!fx.shouldPass) {
      assert(false, `${fx.label} should fail but passed`);
      return false;
    }

    assert(seenRequest !== null, `${fx.label} llmCall invoked`);
    assert(out.whyItHit.length === 3, `${fx.label} whyItHit length=3`);
    assert(out.howToAdapt.length === 3, `${fx.label} howToAdapt length=3`);
    assert(out.cacheHit === false, `${fx.label} cacheHit=false on fresh analyze`);
    assert(out.llmModel === 'qwen-mock', `${fx.label} model surfaced`);
    assert(out.tokensUsed === 420, `${fx.label} tokensUsed surfaced`);
    assert(out.costFen > 0, `${fx.label} costFen computed`);

    if (fx.input.niche) {
      const expected = fx.input.niche.trim().slice(0, NICHE_MAX_CHARS);
      assert(out.niche === expected, `${fx.label} niche trimmed/truncated in output`);
    } else {
      assert(out.niche === undefined, `${fx.label} niche absent when input niche missing`);
      assert(
        out.howToAdapt[0].startsWith('假设你的赛道是'),
        `${fx.label} no-niche guidance starts with expected prefix`,
      );
    }
    return true;
  } catch (err) {
    if (fx.shouldPass) {
      assert(false, `${fx.label} should pass but threw ${(err as Error).name}`);
      return false;
    }
    assert(err instanceof TopicAnalysisError, `${fx.label} throws TopicAnalysisError`);
    if (err instanceof TopicAnalysisError) {
      assert(err.code === 'PARSE_FAILED', `${fx.label} fail code = PARSE_FAILED`);
    }
    return true;
  }
}

console.log('--- W4-03-V3 topic-analysis offline tests ---\n');

const overlongNiche = `${'细分教育赛道，聚焦青年求职策略与简历实操。'.repeat(20)}END`;

const fixtures: Fixture[] = [
  { label: 'case 1 / dy with niche', input: mkInput(0, 'AI 工具测评与个人效率提升'), llmRaw: validRaw('A-'), shouldPass: true },
  { label: 'case 2 / ks with niche', input: mkInput(1, '本地生活探店，客单价 50-120 元'), llmRaw: validRaw('B-'), shouldPass: true },
  { label: 'case 3 / xhs with niche', input: mkInput(2, '职场表达与升职沟通'), llmRaw: validRaw('C-'), shouldPass: true },
  { label: 'case 4 / bz with niche', input: mkInput(3, '编程学习路径和项目复盘'), llmRaw: validRaw('D-'), shouldPass: true },
  { label: 'case 5 / dy no niche', input: mkInput(4), llmRaw: validRaw('E-', true), shouldPass: true },
  { label: 'case 6 / ks no niche', input: mkInput(5), llmRaw: validRaw('F-', true), shouldPass: true },
  { label: 'case 7 / xhs overlong niche', input: mkInput(6, overlongNiche), llmRaw: validRaw('G-'), shouldPass: true },
  { label: 'case 8 / bz punctuation', input: mkInput(7, '母婴内容，重点是新手爸妈的低焦虑育儿方法'), llmRaw: validRaw('H-'), shouldPass: true },
  { label: 'case 9 / dy markdown fence', input: mkInput(8, '跨境电商小卖家运营'), llmRaw: `\`\`\`json\n${validRaw('I-')}\n\`\`\``, shouldPass: true },
  { label: 'case 10 / invalid JSON', input: mkInput(9, '知识博主，关注长期主义与方法论'), llmRaw: 'not-json-{', shouldPass: false },
];

async function main(): Promise<void> {
  let fixturePass = 0;
  for (const fx of fixtures) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await runFixture(fx);
    if (ok) fixturePass++;
  }

  console.log(`\nFixture gate: ${fixturePass}/${fixtures.length} fixtures meet expectation`);
  assert(fixturePass >= 9, 'validator gate >= 9/10 fixtures');

  console.log(`\n--- ${pass} pass / ${fail} fail ---`);
  if (fail > 0) {
    console.log('❌ assertions failed');
    process.exit(1);
  }
  console.log('✅ All assertions pass.');
}

void main();
