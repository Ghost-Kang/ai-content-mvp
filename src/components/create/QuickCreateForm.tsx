// ENG-005 / ENG-006 / ENG-007 — Quick Create form, wired to content.create + generateScript

'use client';

import { useState } from 'react';
import { FormulaSelector } from './FormulaSelector';
import { LengthToggle } from './LengthToggle';
import { ScriptResult } from './ScriptResult';
import { ScriptReviewChecklist } from './ScriptReviewChecklist';
import { trpc } from '@/lib/trpc-client';
import type { Formula, LengthMode } from '@/lib/prompts/script-templates';

type Step = 'form' | 'generating' | 'result' | 'approved';

export function QuickCreateForm() {
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

  const createSession = trpc.content.create.useMutation();
  const generateScript = trpc.content.generateScript.useMutation();
  const approve = trpc.content.approve.useMutation();

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
      setErrorMessage(err instanceof Error ? err.message : '通过失败');
    }
  }

  const canSubmit =
    formula !== null &&
    productName.trim().length > 0 &&
    targetAudience.trim().length > 0 &&
    coreClaim.trim().length > 0;

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
      setErrorMessage(err instanceof Error ? err.message : '生成失败，请稍后重试');
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
      setErrorMessage(err instanceof Error ? err.message : '重新生成失败');
      setStep('result');
    }
  }

  // ─── Generating state ────────────────────────────────────────────────────────

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm text-gray-500">正在生成脚本，请稍候...</p>
        <p className="text-xs text-gray-400">
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
          <h2 className="text-lg font-semibold text-gray-900">生成的脚本</h2>
          <button
            type="button"
            onClick={() => { setStep('form'); setResult(null); }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            重新开始
          </button>
        </div>
        {result.qualityIssue && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">质量提示</p>
            <p className="mt-0.5 text-xs text-amber-700">
              {result.qualityIssue} — 内容已生成但未完全合规，建议手动调整或重新生成。
            </p>
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
          <p className="mt-3 text-xs text-gray-400 text-right">
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

  if (step === 'approved' && result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-medium text-green-900">✓ 脚本已通过自审</p>
          <p className="mt-1 text-xs text-green-700">
            下一步：复制脚本到抖音创作工具或导出 .txt（导出功能 W3-03 开发中）
          </p>
        </div>
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
        <button
          type="button"
          onClick={() => { setStep('form'); setResult(null); setSessionId(null); }}
          className="mt-6 w-full rounded-lg border border-gray-200 py-2.5 text-sm text-gray-600 hover:border-gray-300"
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">生成失败</p>
          <p className="mt-0.5 text-xs text-red-600">{errorMessage}</p>
        </div>
      )}
      <LengthToggle value={lengthMode} onChange={setLengthMode} />
      <FormulaSelector value={formula} onChange={setFormula} />

      <div className="space-y-4">
        <div>
          <label htmlFor="productName" className="block text-sm font-medium text-gray-700 mb-1">
            产品名称
          </label>
          <input
            id="productName"
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例：某某SaaS内容工具"
            maxLength={100}
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="targetAudience" className="block text-sm font-medium text-gray-700 mb-1">
            目标受众
          </label>
          <input
            id="targetAudience"
            type="text"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="例：10-100人B2B SaaS公司的市场负责人"
            maxLength={200}
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="coreClaim" className="block text-sm font-medium text-gray-700 mb-1">
            核心主张
          </label>
          <textarea
            id="coreClaim"
            rows={3}
            value={coreClaim}
            onChange={(e) => setCoreClaim(e.target.value)}
            placeholder="例：AI生成的内容没人看，不是因为AI不好，是因为缺少你自己的品牌声音"
            maxLength={300}
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
          <p className="mt-1 text-right text-xs text-gray-400">{coreClaim.length}/300</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        生成脚本
      </button>
    </form>
  );
}
