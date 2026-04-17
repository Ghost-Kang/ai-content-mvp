// ENG-015 — Script result display: frame-by-frame + char badge

'use client';

import type { FrameSpec } from '@/lib/prompts/script-templates';
import type { SuppressionFlag } from '@/lib/prompts/suppression-scanner';

interface Props {
  frames: FrameSpec[];
  charCount: number;
  frameCount: number;
  commentBaitQuestion: string;
  suppressionFlags: SuppressionFlag[];
  lengthMode: 'short' | 'long';
  onRegenerate: () => void;
  isRegenerating: boolean;
}

const CHAR_LIMITS = {
  short: { min: 190, max: 215 },
  long:  { min: 800, max: 1000 },
};

export function ScriptResult({
  frames,
  charCount,
  frameCount,
  commentBaitQuestion,
  suppressionFlags,
  lengthMode,
  onRegenerate,
  isRegenerating,
}: Props) {
  const limits = CHAR_LIMITS[lengthMode];
  const charRatio = (charCount - limits.min) / (limits.max - limits.min);
  const charStatus =
    charCount < limits.min ? 'under' : charCount > limits.max ? 'over' : 'ok';

  return (
    <div className="space-y-6">
      {/* Header metrics */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={[
              'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium',
              charStatus === 'ok'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800',
            ].join(' ')}
          >
            {charCount}字
          </span>
          <span className="text-sm text-gray-500">{frameCount}帧</span>
          {suppressionFlags.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              {suppressionFlags.length}处提示
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-50"
        >
          {isRegenerating ? '重新生成中...' : '重新生成'}
        </button>
      </div>

      {/* Suppression warnings */}
      {suppressionFlags.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700 mb-1">
            检测到可能降低真实感的表达，建议人工检查：
          </p>
          <ul className="space-y-0.5">
            {suppressionFlags.map((f, i) => (
              <li key={i} className="text-xs text-amber-600">
                · [{f.category}] "{f.matchedText}"
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Frame-by-frame script */}
      <div className="space-y-3">
        {frames.map((frame) => (
          <div
            key={frame.index}
            className="group rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:border-gray-200 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                {frame.index}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-gray-900">{frame.text}</p>
                {frame.visualDirection && (
                  <p className="mt-1.5 text-xs text-gray-400 italic">
                    {frame.visualDirection}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-gray-300 mt-0.5">
                {frame.durationS}s
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Comment bait question */}
      <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-4">
        <p className="text-xs font-medium text-indigo-500 mb-1">评论区引导问题</p>
        <p className="text-sm text-indigo-900 font-medium">{commentBaitQuestion}</p>
      </div>
    </div>
  );
}
