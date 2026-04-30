// W3-06 — Edit node output dialog.
// W3-08 — Upgraded to default to a per-frame structured editor; raw JSON
//          remains as an escape hatch for power-users / debugging.
//
// Editing model for non-technical users (≤5 internal testers in MVP-1):
//   • Default mode: PerFrameEditor — card-per-frame form with text/dur fields,
//     up/down move, insert, delete. Char-count nudges, no validation gates.
//   • Escape hatch: raw JSON textarea — same as W3-06, retained for cases
//     where the structured form is missing a field or shape diverges.
//   • Server-side validation (workflow.editStep → Zod) is the source of
//     truth either way. Both modes serialize to the same `output` payload.
//
// On save we always rebuild script.{charCount, frameCount, fullText} and
// storyboard.totalDurationSec from the edited frames so downstream nodes
// see consistent counts. Other passthrough fields (provider, model,
// suppressionFlags, qualityIssue, …) are preserved verbatim.
//
// Accessibility:
//   • Esc closes the dialog
//   • aria-modal + role=dialog on the panel
//   • Form fields have associated <label htmlFor>
//   • Tab order flows top-to-bottom through the cards

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { friendlyFromAny } from '@/lib/error-messages';
import { NODE_LABELS, type NodeType } from '@/lib/workflow/ui-helpers';
import { ScriptFrameEditor, StoryboardFrameEditor } from './PerFrameEditor';
import {
  type ScriptFrameShape,
  type ScriptOutputShape,
  type StoryboardFrameShape,
  type StoryboardOutputShape,
  coerceScriptFrames,
  coerceStoryboardFrames,
  rebuildScriptOutput,
  rebuildStoryboardOutput,
} from './frame-editor-logic';

type EditableNodeType = Extract<NodeType, 'script' | 'storyboard'>;
type EditMode = 'frames' | 'json';

interface EditNodeDialogProps {
  open:      boolean;
  onClose:   () => void;
  runId:     string;
  /** Only `script` and `storyboard` are supported in MVP-1. */
  nodeType:  EditableNodeType;
  /** The current output_jsonb to seed the editor with. */
  initialOutput: unknown;
  /** Called after a successful save (parent should invalidate canvas query). */
  onSaved:   () => void;
}

export function EditNodeDialog({
  open,
  onClose,
  runId,
  nodeType,
  initialOutput,
  onSaved,
}: EditNodeDialogProps) {
  const labels = NODE_LABELS[nodeType];

  // ─── Mode state — default `frames`, falls back to `json` if the seed
  //     payload doesn't have a `frames` array we can coerce. ─────────────────
  const initialFrames = useMemo(() => {
    if (!initialOutput || typeof initialOutput !== 'object') return [];
    const raw = (initialOutput as { frames?: unknown }).frames;
    return nodeType === 'script'
      ? (coerceScriptFrames(raw) as ScriptFrameShape[] | StoryboardFrameShape[])
      : (coerceStoryboardFrames(raw) as ScriptFrameShape[] | StoryboardFrameShape[]);
  }, [initialOutput, nodeType]);

  const initialJson = useMemo(() => {
    try {
      return JSON.stringify(initialOutput ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }, [initialOutput]);

  const [mode, setMode] = useState<EditMode>(initialFrames.length > 0 ? 'frames' : 'json');
  const [scriptFrames,     setScriptFrames]     = useState<ScriptFrameShape[]>(
    nodeType === 'script' ? (initialFrames as ScriptFrameShape[]) : [],
  );
  const [storyboardFrames, setStoryboardFrames] = useState<StoryboardFrameShape[]>(
    nodeType === 'storyboard' ? (initialFrames as StoryboardFrameShape[]) : [],
  );
  const [json,        setJson]        = useState(initialJson);
  const [parseError,  setParseError]  = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset state every time the dialog opens (new step, fresh JSON).
  useEffect(() => {
    if (!open) return;
    if (nodeType === 'script') {
      setScriptFrames(initialFrames as ScriptFrameShape[]);
    } else {
      setStoryboardFrames(initialFrames as StoryboardFrameShape[]);
    }
    setJson(initialJson);
    setMode(initialFrames.length > 0 ? 'frames' : 'json');
    setParseError(null);
    setServerError(null);
    setTimeout(() => dialogRef.current?.focus(), 0);
  }, [open, nodeType, initialFrames, initialJson]);

  // Esc-to-close. Bound globally so it works regardless of focus location.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const utils = trpc.useUtils();
  const editStep = trpc.workflow.editStep.useMutation({
    onSuccess: async () => {
      await utils.workflow.get.invalidate({ runId });
      onSaved();
    },
  });

  if (!open) return null;

  function buildPayloadFromFrames(): unknown {
    // Recompute derived fields (charCount/frameCount/fullText for script;
    // totalDurationSec for storyboard) so downstream nodes see consistent
    // counts. Passthrough fields (provider, model, …) survive via spread.
    const original = (initialOutput && typeof initialOutput === 'object')
      ? (initialOutput as Record<string, unknown>)
      : {};

    if (nodeType === 'script') {
      return rebuildScriptOutput(original as ScriptOutputShape, scriptFrames);
    }
    return rebuildStoryboardOutput(original as StoryboardOutputShape, storyboardFrames);
  }

  function handleSave() {
    setServerError(null);

    let payload: unknown;
    if (mode === 'frames') {
      payload = buildPayloadFromFrames();
    } else {
      try {
        payload = JSON.parse(json);
      } catch (e) {
        setParseError(`JSON 解析错误：${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      if (!payload || typeof payload !== 'object') {
        setParseError('JSON 必须是一个对象');
        return;
      }
      setParseError(null);
    }

    editStep.mutate(
      { runId, nodeType, output: payload },
      {
        onError: (err) => {
          const f = friendlyFromAny(err);
          setServerError(`${f.title}：${f.detail}`);
        },
      },
    );
  }

  /**
   * Switching from frames → json should serialize the current edits so the
   * power user can fine-tune; switching json → frames should re-coerce the
   * pasted JSON back into structured shape (or warn if frames are missing).
   */
  function switchMode(next: EditMode) {
    if (next === mode) return;
    if (next === 'json') {
      const payload = buildPayloadFromFrames();
      setJson(JSON.stringify(payload, null, 2));
      setParseError(null);
      setMode('json');
      return;
    }
    // json → frames: try parse, then coerce.
    try {
      const parsed = JSON.parse(json) as { frames?: unknown };
      if (nodeType === 'script') {
        setScriptFrames(coerceScriptFrames(parsed?.frames));
      } else {
        setStoryboardFrames(coerceStoryboardFrames(parsed?.frames));
      }
      setParseError(null);
      setMode('frames');
    } catch (e) {
      setParseError(`JSON 解析错误，无法切换到表单视图：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const submitting = editStep.isPending;
  const noFrames = mode === 'frames' && (
    (nodeType === 'script' && scriptFrames.length === 0)
    || (nodeType === 'storyboard' && storyboardFrames.length === 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-node-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 id="edit-node-title" className="text-base font-bold text-white">
              编辑「{labels.zh}」节点输出
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              保存后将自动重跑下游节点（保留上游已完成结果，节省时间和成本）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {/* Mode tabs */}
        <div className="border-b border-white/10 bg-white/[0.04] px-5 py-2">
          <div className="inline-flex rounded-xl ring-1 ring-white/15">
            <ModeTab active={mode === 'frames'} onClick={() => switchMode('frames')}>
              可视化编辑
            </ModeTab>
            <ModeTab active={mode === 'json'} onClick={() => switchMode('json')}>
              原始 JSON
            </ModeTab>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {mode === 'frames'
              ? '逐帧改文案、调时长、增删/重排，下游节点会基于这些字段重新生成。'
              : '直接编辑 JSON。仅在表单视图字段不够用时使用 — 服务端会做严格校验。'}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-auto px-5 py-4">
          {mode === 'frames' && noFrames && (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              当前节点输出没有 <code className="font-mono">frames</code> 数组，无法用表单编辑。
              请切换到「原始 JSON」视图。
            </div>
          )}

          {mode === 'frames' && nodeType === 'script' && scriptFrames.length > 0 && (
            <ScriptFrameEditor
              frames={scriptFrames}
              onChange={setScriptFrames}
              disabled={submitting}
            />
          )}

          {mode === 'frames' && nodeType === 'storyboard' && storyboardFrames.length > 0 && (
            <StoryboardFrameEditor
              frames={storyboardFrames}
              onChange={setStoryboardFrames}
              disabled={submitting}
            />
          )}

          {mode === 'json' && (
            <>
              <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                <strong>提示：</strong>原始 JSON 视图会绕过表单校验。请保持
                <code className="mx-1 rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">frames</code>
                数组结构完整。下游节点会基于这里的字段重新生成内容。
              </div>
              <textarea
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  if (parseError) setParseError(null);
                }}
                spellCheck={false}
                className="block h-80 w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100 shadow-inner focus:border-cyan-300/60 focus:outline-none focus:ring-1 focus:ring-cyan-300/40"
                disabled={submitting}
              />
            </>
          )}

          {parseError && (
            <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
              {parseError}
            </p>
          )}
          {serverError && (
            <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
              {serverError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting || !!parseError || noFrames}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-emerald-200 px-4 py-1.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:saturate-110 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none"
          >
            {submitting ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                保存中…
              </>
            ) : (
              '保存并重跑下游'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mode tabs ────────────────────────────────────────────────────────────────

interface ModeTabProps {
  active:   boolean;
  onClick:  () => void;
  children: React.ReactNode;
}

function ModeTab({ active, onClick, children }: ModeTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
        active
          ? 'bg-gradient-to-r from-cyan-300 to-emerald-200 text-slate-950'
          : 'text-slate-300 hover:bg-white/[0.04]'
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
