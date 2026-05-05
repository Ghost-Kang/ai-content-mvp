// ENG-005 / ENG-006 / ENG-007 — Quick Create form, wired to content.create + generateScript

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormulaSelector } from './FormulaSelector';
import { LengthToggle } from './LengthToggle';
import { ScriptResult } from './ScriptResult';
import { ScriptReviewChecklist } from './ScriptReviewChecklist';
import { ExportPanel } from './ExportPanel';
import { trpc } from '@/lib/trpc-client';
import type { Formula, LengthMode } from '@/lib/prompts/script-templates';
import { friendlyFromAny } from '@/lib/error-messages';

type Step = 'form' | 'generating' | 'result' | 'approved';

const WORKFLOW_TOPIC_MAX = 300;

function shouldDispatchRun(status: string): boolean {
  return status === 'pending' || status === 'failed';
}

export function QuickCreateForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [formula, setFormula] = useState<Formula | null>(null);
  const [lengthMode, setLengthMode] = useState<LengthMode>('short');
  const [productName, setProductName] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [coreClaim, setCoreClaim] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<{
    frames: { index: number; text: string; visualDirection: string; durationS: number }[];
    charCount: number;
    frameCount: number;
    commentBaitQuestion: string;
    suppressionFlags: { category: string; matchedText: string; position: number }[];
    provider: string;
    retryCount: number;
    qualityIssue: string | null;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);

  const createSession = trpc.content.create.useMutation();
  const generateScript = trpc.content.generateScript.useMutation();
  const approve = trpc.content.approve.useMutation();
  const createRun = trpc.workflow.create.useMutation();
  const runWorkflow = trpc.workflow.run.useMutation();
  const [startingWorkflow, setStartingWorkflow] = useState(false);

  async function handleApprove() {
    if (!sessionId) return;
    setErrorMessage(null);
    try {
      await approve.mutateAsync({
        sessionId,
        checklist: { voice: true, rhythm: true, suppression: true, facts: true, hook: true },
      });
      setStep('approved');
    } catch (err) {
      console.error(err);
      const f = friendlyFromAny(err);
      setErrorMessage(`${f.title}：${f.detail}`);
    }
  }

  const canSubmit =
    formula !== null &&
    productName.trim().length > 0 &&
    targetAudience.trim().length > 0 &&
    coreClaim.trim().length > 0;

  // Workflow handoff requires the same three fields as 生成脚本 PLUS the
  // formula/lengthMode (so seed_input is fully populated and the workflow
  // doesn't fall back to defaults that diverge from the user's intent).
  const canStartWorkflow = canSubmit && !startingWorkflow;

  async function handleStartWorkflow() {
    if (!canStartWorkflow || !formula) return;
    setStartingWorkflow(true);
    setErrorMessage(null);
    setResumeMessage(null);

    // workflow_runs.topic is NOT NULL and surfaces in /runs as the run
    // label. Compose a human-readable summary; the actual prompt context
    // travels through seedInput so the script node uses the structured
    // values, not this composed string.
    const trimmedProduct  = productName.trim();
    const trimmedAudience = targetAudience.trim();
    const trimmedClaim    = coreClaim.trim();
    const topic = `面向${trimmedAudience}的${trimmedProduct}：${trimmedClaim}`.slice(
      0,
      WORKFLOW_TOPIC_MAX,
    );

    try {
      const { runId, resumed, status } = await createRun.mutateAsync({
        topic,
        seedInput: {
          formula,
          lengthMode,
          productName:    trimmedProduct,
          targetAudience: trimmedAudience,
          coreClaim:      trimmedClaim,
        },
      });
      if (resumed) {
        setResumeMessage('检测到同一组输入的工作流，正在继续上次进度。');
      }
      if (shouldDispatchRun(status)) {
        await runWorkflow.mutateAsync({ runId });
      }
      router.push(`/runs/${runId}`);
    } catch (err) {
      console.error(err);
      const f = friendlyFromAny(err);
      setErrorMessage(`${f.title}：${f.detail}`);
      setStartingWorkflow(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formula || !canSubmit) return;

    setStep('generating');
    setErrorMessage(null);

    try {
      const session = await createSession.mutateAsync({
        entryPoint:     'quick_create',
        formula,
        lengthMode,
        productName:    productName.trim(),
        targetAudience: targetAudience.trim(),
        coreClaim:      coreClaim.trim(),
      });

      setSessionId(session.sessionId);

      const script = await generateScript.mutateAsync({
        sessionId: session.sessionId,
      });

      setResult(script);
      setStep('result');
    } catch (err) {
      console.error(err);
      const f = friendlyFromAny(err);
      setErrorMessage(`${f.title}：${f.detail}`);
      setStep('form');
    }
  }

  async function handleRegenerate() {
    if (!sessionId) return;
    setStep('generating');
    setErrorMessage(null);
    try {
      const script = await generateScript.mutateAsync({
        sessionId,
        regenerate: true,
      });
      setResult(script);
      setStep('result');
    } catch (err) {
      console.error(err);
      const f = friendlyFromAny(err);
      setErrorMessage(`${f.title}：${f.detail}`);
      setStep('result');
    }
  }

  // ─── Generating state ────────────────────────────────────────────────────────

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300" />
        <p className="text-sm text-slate-300">正在生成脚本，请稍候...</p>
        <p className="text-xs text-slate-500">
          {lengthMode === 'short' ? '约15秒' : '约30秒'}
        </p>
      </div>
    );
  }

  // ─── Result state ────────────────────────────────────────────────────────────

  if (step === 'result' && result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">生成的脚本</h2>
          <button
            type="button"
            onClick={() => { setStep('form'); setResult(null); }}
            className="text-sm text-slate-400 hover:text-cyan-200"
          >
            重新开始
          </button>
        </div>
        {result.qualityIssue && (
          <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-medium">质量提示</p>
            <p className="mt-0.5 text-xs text-amber-100/75">
              {result.qualityIssue} — 内容已生成但未完全合规，建议手动调整或重新生成。
            </p>
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        )}
        <ScriptResult
          frames={result.frames}
          charCount={result.charCount}
          frameCount={result.frameCount}
          commentBaitQuestion={result.commentBaitQuestion}
          suppressionFlags={result.suppressionFlags}
          lengthMode={lengthMode}
          onRegenerate={handleRegenerate}
          isRegenerating={generateScript.isPending}
        />
        {result.retryCount > 0 && (
          <p className="mt-3 text-xs text-slate-500 text-right">
            生成重试 {result.retryCount} 次 · {result.provider}
          </p>
        )}
        <div className="mt-6">
          <ScriptReviewChecklist
            onApprove={handleApprove}
            isApproving={approve.isPending}
          />
        </div>
      </div>
    );
  }

  // ─── Approved state ──────────────────────────────────────────────────────────

  if (step === 'approved' && result && sessionId) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-5">
          <p className="text-sm font-medium text-emerald-100">✓ 脚本已通过自审</p>
          <p className="mt-1 text-xs text-emerald-100/75">
            复制到抖音创作工具，或下载 .txt 备份。导出内容自动附加 CAC 合规声明。
          </p>
        </div>
        <div className="mb-6">
          <ExportPanel sessionId={sessionId} />
        </div>
        <details className="mb-6">
          <summary className="cursor-pointer text-sm text-slate-400 hover:text-cyan-200">
            查看脚本详情
          </summary>
          <div className="mt-3">
            <ScriptResult
              frames={result.frames}
              charCount={result.charCount}
              frameCount={result.frameCount}
              commentBaitQuestion={result.commentBaitQuestion}
              suppressionFlags={result.suppressionFlags}
              lengthMode={lengthMode}
              onRegenerate={handleRegenerate}
              isRegenerating={generateScript.isPending}
            />
          </div>
        </details>
        <button
          type="button"
          onClick={() => { setStep('form'); setResult(null); setSessionId(null); }}
          className="w-full rounded-2xl border border-white/10 py-2.5 text-sm text-slate-300 hover:border-cyan-300/40 hover:text-cyan-200"
        >
          创建新脚本
        </button>
      </div>
    );
  }

  // ─── Form state ──────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-medium">生成失败</p>
          <p className="mt-0.5 text-xs text-rose-100/75">{errorMessage}</p>
        </div>
      )}
      {resumeMessage && (
        <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {resumeMessage}
        </div>
      )}
      <LengthToggle value={lengthMode} onChange={setLengthMode} />
      <FormulaSelector value={formula} onChange={setFormula} />

      <div className="space-y-4">
        <div>
          <label htmlFor="productName" className="block text-sm font-medium text-white mb-1">
            产品名称
          </label>
          <input
            id="productName"
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例：某某SaaS内容工具"
            maxLength={100}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none focus:ring-1 focus:ring-cyan-300/40"
          />
        </div>

        <div>
          <label htmlFor="targetAudience" className="block text-sm font-medium text-white mb-1">
            目标受众
          </label>
          <input
            id="targetAudience"
            type="text"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="例：10-100人B2B SaaS公司的市场负责人"
            maxLength={200}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none focus:ring-1 focus:ring-cyan-300/40"
          />
        </div>

        <div>
          <label htmlFor="coreClaim" className="block text-sm font-medium text-white mb-1">
            核心主张
          </label>
          <textarea
            id="coreClaim"
            rows={3}
            value={coreClaim}
            onChange={(e) => setCoreClaim(e.target.value)}
            placeholder="例：AI生成的内容没人看，不是因为AI不好，是因为缺少你自己的品牌声音"
            maxLength={300}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none focus:ring-1 focus:ring-cyan-300/40 resize-none"
          />
          <p className="mt-1 text-right text-xs text-slate-500">{coreClaim.length}/300</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-2xl bg-cyan-300 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-400/20 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
      >
        生成脚本
      </button>

      <div className="relative flex items-center">
        <div className="flex-grow border-t border-white/10" />
        <span className="mx-3 text-xs text-slate-500">或</span>
        <div className="flex-grow border-t border-white/10" />
      </div>

      <button
        type="button"
        onClick={handleStartWorkflow}
        disabled={!canStartWorkflow}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-400/10 py-3 text-sm font-semibold text-emerald-100 transition-colors hover:border-emerald-200/60 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
      >
        {startingWorkflow ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            启动中…
          </>
        ) : (
          '启动完整工作流（生成 .zip 视频包）'
        )}
      </button>
      <p className="-mt-3 text-center text-xs text-slate-500">
        使用相同的产品/受众/主张直接进入 5 节点工作流：选题 → 脚本 → 分镜 → 视频 → 导出 .zip
      </p>
    </form>
  );
}
