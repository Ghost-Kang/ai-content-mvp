// W3-08 — Per-frame structured editor for script + storyboard outputs.
// W3-09 — Added drag-and-drop reorder via @dnd-kit + onBlur soft-validation.
//
// Replaces the raw JSON textarea (still available as a fallback in
// EditNodeDialog) with a card-per-frame form. Built for non-technical
// internal users who got "wtf is JSON" feedback in the W2 user research.
//
// Design notes (W3-08 origin):
//   • Add inserts ABOVE the current frame, matching how editors think
//     ("I want a new frame here"). A separate +1 button at the bottom adds
//     to the end.
//   • Reindex on every mutation — frames always render with contiguous
//     `1…N` labels. The Zod schema accepts non-contiguous indices, but
//     downstream prompts assume sequential.
//   • Char count is shown inline for script frames (8-15 char target per
//     v2 prompt). Visual nudge, not enforcement — server-side has the
//     real validation.
//
// W3-09 changes:
//   • Drag-and-drop reorder via @dnd-kit/{core,sortable}. Uses a dedicated
//     grip handle (not the whole card) so form fields keep their normal
//     focus / text-selection behavior. The ↑↓ chevrons stay as a keyboard
//     a11y fallback (and dnd-kit also exposes its own keyboard sensor).
//   • onBlur soft-validation: red border for hard errors (empty required
//     field, dur ≤ 0), amber for warnings (line length out of target).
//     State only shows AFTER the user blurs the field — no "scary red on
//     load" UX. Saving is NEVER blocked here; server-side Zod is the
//     real gate. JSON parse + server errors still surface in the dialog.

'use client';

import { useId, useMemo, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CAMERA_LANGUAGE_VOCAB } from '@/lib/prompts/storyboard-prompt';
import {
  type FieldIssue,
  type ScriptFrameIssues,
  type ScriptFrameShape,
  type StoryboardFrameIssues,
  type StoryboardFrameShape,
  countNonWhitespace,
  deleteFrameAt,
  insertFrameAt,
  makeEmptyScriptFrame,
  makeEmptyStoryboardFrame,
  moveFrame,
  moveFrameTo,
  patchFrame,
  validateScriptFrame,
  validateStoryboardFrame,
} from './frame-editor-logic';

// ─── Field-issue → input-class helper (shared by both editors) ───────────────

const BASE_INPUT_CLASS =
  'mt-0.5 w-full rounded-xl border px-2.5 py-1.5 text-sm text-white bg-slate-950/70 ' +
  'placeholder:text-slate-500 focus:outline-none focus:ring-1 disabled:bg-slate-900/60 disabled:opacity-60';

function inputBorderClass(issue: FieldIssue | undefined, blurred: boolean): string {
  if (!blurred || !issue) {
    return 'border-white/10 focus:border-cyan-300/60 focus:ring-cyan-300/40';
  }
  if (issue.level === 'error') {
    return 'border-rose-400/60 bg-rose-400/10 focus:border-rose-400 focus:ring-rose-400/40';
  }
  return 'border-amber-400/60 bg-amber-400/10 focus:border-amber-400 focus:ring-amber-400/40';
}

interface IssueHintProps {
  issue:    FieldIssue | undefined;
  blurred:  boolean;
}

function IssueHint({ issue, blurred }: IssueHintProps) {
  if (!blurred || !issue) return null;
  const color = issue.level === 'error' ? 'text-rose-300' : 'text-amber-200';
  return <p className={`mt-0.5 text-[10px] ${color}`}>{issue.msg}</p>;
}

// ─── Drag-handle reuse helper ────────────────────────────────────────────────
//
// `useSortable` returns the JSX-friendly props we splat onto the wrapper +
// the handle. The handle gets the `listeners` (drag-init) and `attributes`
// (a11y), but not the transform — transform applies to the entire card.

interface SortableShellProps {
  id:       number;
  disabled: boolean;
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners:  ReturnType<typeof useSortable>['listeners'];
    isDragging: boolean;
    setActivatorNodeRef: ReturnType<typeof useSortable>['setActivatorNodeRef'];
  }) => React.ReactNode;
}

function SortableShell({ id, disabled, children }: SortableShellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:  isDragging ? 0.5 : undefined,
    // Lift the dragged card above siblings so its shadow + focus rings
    // aren't clipped by the next card's overflow.
    zIndex:   isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'shadow-lg' : ''}>
      {children({ attributes, listeners, isDragging, setActivatorNodeRef })}
    </div>
  );
}

interface DragHandleProps {
  attributes:           ReturnType<typeof useSortable>['attributes'];
  listeners:            ReturnType<typeof useSortable>['listeners'];
  setActivatorNodeRef:  ReturnType<typeof useSortable>['setActivatorNodeRef'];
  disabled:             boolean;
}

function DragHandle({ attributes, listeners, setActivatorNodeRef, disabled }: DragHandleProps) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...(disabled ? {} : listeners)}
      disabled={disabled}
      title="拖动以重新排序"
      aria-label="拖动以重新排序"
      className={
        'mr-1 cursor-grab touch-none rounded p-1 text-slate-500 ' +
        'hover:bg-white/[0.06] hover:text-cyan-200 active:cursor-grabbing ' +
        'focus:outline-none focus:ring-2 focus:ring-cyan-300/40 ' +
        'disabled:cursor-not-allowed disabled:opacity-30'
      }
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="9"  cy="6"  r="1.5" />
        <circle cx="15" cy="6"  r="1.5" />
        <circle cx="9"  cy="12" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="9"  cy="18" r="1.5" />
        <circle cx="15" cy="18" r="1.5" />
      </svg>
    </button>
  );
}

// ─── Script editor ────────────────────────────────────────────────────────────

interface ScriptFrameEditorProps {
  frames:   ReadonlyArray<ScriptFrameShape>;
  onChange: (next: ScriptFrameShape[]) => void;
  disabled?: boolean;
}

export function ScriptFrameEditor({ frames, onChange, disabled }: ScriptFrameEditorProps) {
  const total = countNonWhitespace(frames.map((f) => f.text).join(' '));
  const inTarget = total >= 200 && total <= 215;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Stable item ids = positions. dnd-kit recomputes positions per render,
  // so passing [0..N-1] both before and after a reorder works correctly.
  const itemIds = useMemo(() => frames.map((_, i) => i), [frames]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromPos = Number(active.id);
    const toPos   = Number(over.id);
    if (Number.isNaN(fromPos) || Number.isNaN(toPos)) return;
    onChange(moveFrameTo(frames, fromPos, toPos));
  }

  return (
    <div className="space-y-3">
      {/* Top summary — total char count vs the v2 prompt's 200-215 target */}
      <div
        className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-xs ${
          inTarget
            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
            : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
        }`}
      >
        <span>
          共 <strong>{frames.length}</strong> 帧 · 总字数（去空白）<strong>{total}</strong>
        </span>
        <span className="text-[11px]">
          {inTarget ? '✓ 字数在 200-215 目标区间' : '建议 200-215 字（v2 脚本规范）'}
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {frames.map((frame, idx) => (
              <SortableShell key={`${frame.index}-${idx}`} id={idx} disabled={disabled ?? false}>
                {(handle) => (
                  <ScriptFrameCard
                    frame={frame}
                    position={idx}
                    total={frames.length}
                    disabled={disabled}
                    handle={handle}
                    onPatch={(patch) => onChange(patchFrame(frames, idx, patch))}
                    onMoveUp={() => onChange(moveFrame(frames, idx, -1))}
                    onMoveDown={() => onChange(moveFrame(frames, idx, 1))}
                    onDelete={() => onChange(deleteFrameAt(frames, idx))}
                    onInsertAbove={() => onChange(insertFrameAt(frames, idx, makeEmptyScriptFrame(0)))}
                  />
                )}
              </SortableShell>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(insertFrameAt(frames, frames.length, makeEmptyScriptFrame(0)))}
        className="flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-2 text-xs text-slate-400 transition hover:border-cyan-300/40 hover:bg-cyan-300/5 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + 添加新帧到末尾
      </button>
    </div>
  );
}

interface SortableHandle {
  attributes:           ReturnType<typeof useSortable>['attributes'];
  listeners:            ReturnType<typeof useSortable>['listeners'];
  setActivatorNodeRef:  ReturnType<typeof useSortable>['setActivatorNodeRef'];
  isDragging:           boolean;
}

interface ScriptFrameCardProps {
  frame:    ScriptFrameShape;
  position: number;
  total:    number;
  disabled?: boolean;
  handle:   SortableHandle;
  onPatch:        (patch: Partial<ScriptFrameShape>) => void;
  onMoveUp:       () => void;
  onMoveDown:     () => void;
  onDelete:       () => void;
  onInsertAbove:  () => void;
}

function ScriptFrameCard({
  frame, position, total, disabled, handle,
  onPatch, onMoveUp, onMoveDown, onDelete, onInsertAbove,
}: ScriptFrameCardProps) {
  const id = useId();
  const charCount = countNonWhitespace(frame.text);

  const issues: ScriptFrameIssues = useMemo(() => validateScriptFrame(frame), [frame]);
  const [blurred, setBlurred] = useState<Set<keyof ScriptFrameShape>>(new Set());
  const markBlurred = (key: keyof ScriptFrameShape) =>
    setBlurred((prev) => (prev.has(key) ? prev : new Set([...prev, key])));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 shadow-lg shadow-cyan-950/20 backdrop-blur-xl">
      <FrameCardHeader
        label={`第 ${frame.index} 帧`}
        position={position}
        total={total}
        disabled={disabled}
        handle={handle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDelete={onDelete}
        onInsertAbove={onInsertAbove}
      />

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-text`} className="block text-[11px] font-medium text-slate-300">
            口播文案 <span className="text-slate-500">({charCount} 字 · 建议 8-15)</span>
          </label>
          <textarea
            id={`${id}-text`}
            value={frame.text}
            disabled={disabled}
            rows={2}
            onChange={(e) => onPatch({ text: e.target.value })}
            onBlur={() => markBlurred('text')}
            aria-invalid={blurred.has('text') && issues.text?.level === 'error' ? true : undefined}
            className={`${BASE_INPUT_CLASS} resize-none ${inputBorderClass(issues.text, blurred.has('text'))}`}
          />
          <IssueHint issue={issues.text} blurred={blurred.has('text')} />
        </div>
        <div>
          <label htmlFor={`${id}-dur`} className="block text-[11px] font-medium text-slate-300">
            时长 (秒)
          </label>
          <input
            id={`${id}-dur`}
            type="number"
            value={frame.durationS}
            min={0}
            step={0.5}
            disabled={disabled}
            onChange={(e) => onPatch({ durationS: parseFloat(e.target.value) || 0 })}
            onBlur={() => markBlurred('durationS')}
            aria-invalid={blurred.has('durationS') && issues.durationS?.level === 'error' ? true : undefined}
            className={`${BASE_INPUT_CLASS} ${inputBorderClass(issues.durationS, blurred.has('durationS'))}`}
          />
          <IssueHint issue={issues.durationS} blurred={blurred.has('durationS')} />
        </div>
      </div>

      <div className="mt-2">
        <label htmlFor={`${id}-vd`} className="block text-[11px] font-medium text-slate-300">
          画面提示（可选 · 给分镜节点参考）
        </label>
        <input
          id={`${id}-vd`}
          type="text"
          value={frame.visualDirection}
          disabled={disabled}
          onChange={(e) => onPatch({ visualDirection: e.target.value })}
          className={`${BASE_INPUT_CLASS} ${inputBorderClass(undefined, false)}`}
        />
      </div>
    </div>
  );
}

// ─── Storyboard editor ───────────────────────────────────────────────────────

interface StoryboardFrameEditorProps {
  frames:   ReadonlyArray<StoryboardFrameShape>;
  onChange: (next: StoryboardFrameShape[]) => void;
  disabled?: boolean;
}

export function StoryboardFrameEditor({ frames, onChange, disabled }: StoryboardFrameEditorProps) {
  const totalDur = frames.reduce((acc, f) => acc + (f.durationSec || 0), 0);
  const cameraVariety = new Set(frames.map((f) => f.cameraLanguage)).size;
  const cameraOK = cameraVariety >= 5; // v2 prompt requires ≥5 distinct camera moves

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemIds = useMemo(() => frames.map((_, i) => i), [frames]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromPos = Number(active.id);
    const toPos   = Number(over.id);
    if (Number.isNaN(fromPos) || Number.isNaN(toPos)) return;
    onChange(moveFrameTo(frames, fromPos, toPos));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
        <span>
          共 <strong>{frames.length}</strong> 帧 · 总时长 <strong>{totalDur.toFixed(1)}s</strong>
        </span>
        <span className={cameraOK ? 'text-emerald-200' : 'text-amber-200'}>
          {cameraOK ? `✓ 镜头语言 ${cameraVariety} 种` : `镜头语言仅 ${cameraVariety} 种 (建议 ≥5)`}
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {frames.map((frame, idx) => (
              <SortableShell key={`${frame.index}-${idx}`} id={idx} disabled={disabled ?? false}>
                {(handle) => (
                  <StoryboardFrameCard
                    frame={frame}
                    position={idx}
                    total={frames.length}
                    disabled={disabled}
                    handle={handle}
                    onPatch={(patch) => onChange(patchFrame(frames, idx, patch))}
                    onMoveUp={() => onChange(moveFrame(frames, idx, -1))}
                    onMoveDown={() => onChange(moveFrame(frames, idx, 1))}
                    onDelete={() => onChange(deleteFrameAt(frames, idx))}
                    onInsertAbove={() => onChange(insertFrameAt(frames, idx, makeEmptyStoryboardFrame(0)))}
                  />
                )}
              </SortableShell>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(insertFrameAt(frames, frames.length, makeEmptyStoryboardFrame(0)))}
        className="flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-2 text-xs text-slate-400 transition hover:border-cyan-300/40 hover:bg-cyan-300/5 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + 添加新帧到末尾
      </button>
    </div>
  );
}

interface StoryboardFrameCardProps {
  frame:    StoryboardFrameShape;
  position: number;
  total:    number;
  disabled?: boolean;
  handle:   SortableHandle;
  onPatch:        (patch: Partial<StoryboardFrameShape>) => void;
  onMoveUp:       () => void;
  onMoveDown:     () => void;
  onDelete:       () => void;
  onInsertAbove:  () => void;
}

function StoryboardFrameCard({
  frame, position, total, disabled, handle,
  onPatch, onMoveUp, onMoveDown, onDelete, onInsertAbove,
}: StoryboardFrameCardProps) {
  const id = useId();
  const promptLen = frame.imagePrompt.length;

  const issues: StoryboardFrameIssues = useMemo(() => validateStoryboardFrame(frame), [frame]);
  const [blurred, setBlurred] = useState<Set<keyof StoryboardFrameShape>>(new Set());
  const markBlurred = (key: keyof StoryboardFrameShape) =>
    setBlurred((prev) => (prev.has(key) ? prev : new Set([...prev, key])));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 shadow-lg shadow-cyan-950/20 backdrop-blur-xl">
      <FrameCardHeader
        label={`第 ${frame.index} 帧`}
        position={position}
        total={total}
        disabled={disabled}
        handle={handle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDelete={onDelete}
        onInsertAbove={onInsertAbove}
      />

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-vo`} className="block text-[11px] font-medium text-slate-300">
            口播 (voiceover)
          </label>
          <input
            id={`${id}-vo`}
            type="text"
            value={frame.voiceover}
            disabled={disabled}
            onChange={(e) => onPatch({ voiceover: e.target.value })}
            onBlur={() => markBlurred('voiceover')}
            aria-invalid={blurred.has('voiceover') && issues.voiceover?.level === 'error' ? true : undefined}
            className={`${BASE_INPUT_CLASS} ${inputBorderClass(issues.voiceover, blurred.has('voiceover'))}`}
          />
          <IssueHint issue={issues.voiceover} blurred={blurred.has('voiceover')} />
        </div>
        <div>
          <label htmlFor={`${id}-dur`} className="block text-[11px] font-medium text-slate-300">
            时长 (秒)
          </label>
          <input
            id={`${id}-dur`}
            type="number"
            value={frame.durationSec}
            min={0}
            step={0.5}
            disabled={disabled}
            onChange={(e) => onPatch({ durationSec: parseFloat(e.target.value) || 0 })}
            onBlur={() => markBlurred('durationSec')}
            aria-invalid={blurred.has('durationSec') && issues.durationSec?.level === 'error' ? true : undefined}
            className={`${BASE_INPUT_CLASS} ${inputBorderClass(issues.durationSec, blurred.has('durationSec'))}`}
          />
          <IssueHint issue={issues.durationSec} blurred={blurred.has('durationSec')} />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-cam`} className="block text-[11px] font-medium text-slate-300">
            镜头语言
          </label>
          <select
            id={`${id}-cam`}
            value={frame.cameraLanguage}
            disabled={disabled}
            onChange={(e) => onPatch({ cameraLanguage: e.target.value as StoryboardFrameShape['cameraLanguage'] })}
            className={`${BASE_INPUT_CLASS} ${inputBorderClass(undefined, false)}`}
          >
            {CAMERA_LANGUAGE_VOCAB.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-scene`} className="block text-[11px] font-medium text-slate-300">
            场景描述（中文 · 给人看）
          </label>
          <input
            id={`${id}-scene`}
            type="text"
            value={frame.scene}
            disabled={disabled}
            onChange={(e) => onPatch({ scene: e.target.value })}
            onBlur={() => markBlurred('scene')}
            aria-invalid={blurred.has('scene') && issues.scene?.level === 'error' ? true : undefined}
            className={`${BASE_INPUT_CLASS} ${inputBorderClass(issues.scene, blurred.has('scene'))}`}
          />
          <IssueHint issue={issues.scene} blurred={blurred.has('scene')} />
        </div>
      </div>

      <div className="mt-2">
        <label htmlFor={`${id}-img`} className="block text-[11px] font-medium text-slate-300">
          Image prompt <span className="text-slate-500">({promptLen} 字 · 目标 50-75，硬上限 80)</span>
        </label>
        <textarea
          id={`${id}-img`}
          value={frame.imagePrompt}
          rows={2}
          disabled={disabled}
          onChange={(e) => onPatch({ imagePrompt: e.target.value })}
          onBlur={() => markBlurred('imagePrompt')}
          aria-invalid={blurred.has('imagePrompt') && issues.imagePrompt?.level === 'error' ? true : undefined}
          className={`${BASE_INPUT_CLASS} resize-none ${inputBorderClass(issues.imagePrompt, blurred.has('imagePrompt'))}`}
        />
        <IssueHint issue={issues.imagePrompt} blurred={blurred.has('imagePrompt')} />
      </div>

      <div className="mt-2">
        <label htmlFor={`${id}-ost`} className="block text-[11px] font-medium text-slate-300">
          屏幕字幕 (可选 · ≤12 字)
        </label>
        <input
          id={`${id}-ost`}
          type="text"
          value={frame.onScreenText ?? ''}
          disabled={disabled}
          onChange={(e) => onPatch({ onScreenText: e.target.value })}
          onBlur={() => markBlurred('onScreenText')}
          className={`${BASE_INPUT_CLASS} ${inputBorderClass(issues.onScreenText, blurred.has('onScreenText'))}`}
        />
        <IssueHint issue={issues.onScreenText} blurred={blurred.has('onScreenText')} />
      </div>
    </div>
  );
}

// ─── Shared header (drag handle + move/delete/insert chevrons) ───────────────

interface FrameCardHeaderProps {
  label:    string;
  position: number;
  total:    number;
  disabled?: boolean;
  handle:   SortableHandle;
  onMoveUp:       () => void;
  onMoveDown:     () => void;
  onDelete:       () => void;
  onInsertAbove:  () => void;
}

function FrameCardHeader({
  label, position, total, disabled, handle,
  onMoveUp, onMoveDown, onDelete, onInsertAbove,
}: FrameCardHeaderProps) {
  const isFirst = position === 0;
  const isLast  = position === total - 1;
  const onlyOne = total <= 1;

  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
      <div className="flex items-center">
        <DragHandle
          attributes={handle.attributes}
          listeners={handle.listeners}
          setActivatorNodeRef={handle.setActivatorNodeRef}
          disabled={disabled ?? false}
        />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <IconButton title="在此帧上方插入新帧" onClick={onInsertAbove} disabled={disabled}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </IconButton>
        <IconButton title="上移一帧 (键盘可用)" onClick={onMoveUp} disabled={disabled || isFirst}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </IconButton>
        <IconButton title="下移一帧 (键盘可用)" onClick={onMoveDown} disabled={disabled || isLast}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </IconButton>
        <IconButton title={onlyOne ? '至少保留 1 帧' : '删除此帧'} onClick={onDelete} disabled={disabled || onlyOne} variant="danger">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}

interface IconButtonProps {
  title:   string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  children: React.ReactNode;
}

function IconButton({ title, onClick, disabled, variant = 'default', children }: IconButtonProps) {
  const colors = variant === 'danger'
    ? 'text-rose-300 hover:bg-rose-400/10 hover:text-rose-200'
    : 'text-slate-400 hover:bg-white/[0.06] hover:text-cyan-200';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1 ${colors} disabled:cursor-not-allowed disabled:opacity-30`}
    >
      {children}
    </button>
  );
}
