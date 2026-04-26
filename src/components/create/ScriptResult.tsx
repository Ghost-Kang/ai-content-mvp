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
  short: { min: 190, max: 215, ideal: 208 },
  long:  { min: 800, max: 1000, ideal: 900 },
};

// 每帧字数硬线（来自 prompt SHORT_VIDEO_SYSTEM）
const FRAME_CHAR = { min: 8, max: 15 };

// 找最长 / 最短的帧 —— 引导用户"哪一帧该动刀"
function findExtremes(frames: FrameSpec[]): {
  longestIdx: number | null;
  shortestIdx: number | null;
} {
  if (frames.length === 0) return { longestIdx: null, shortestIdx: null };
  let longest = frames[0];
  let shortest = frames[0];
  for (const f of frames) {
    const len = f.text.replace(/\s/g, '').length;
    if (len > longest.text.replace(/\s/g, '').length) longest = f;
    if (len < shortest.text.replace(/\s/g, '').length) shortest = f;
  }
  return { longestIdx: longest.index, shortestIdx: shortest.index };
}

// W4-04: 字数漂移引导 —— 告诉用户"差多少 + 动哪一段"
function driftGuidance(
  charCount: number,
  lengthMode: 'short' | 'long',
): { distance: number; direction: 'under' | 'over'; advice: string } | null {
  const { min, max, ideal } = CHAR_LIMITS[lengthMode];
  if (charCount >= min && charCount <= max) return null;
  const direction: 'under' | 'over' = charCount < min ? 'under' : 'over';
  const distance = direction === 'under' ? ideal - charCount : charCount - ideal;

  if (lengthMode === 'short') {
    if (direction === 'under') {
      return {
        distance, direction,
        advice:
          '案例证据段（第 8–13 帧）通常最稀薄。给每帧补一个具体数字 / 人名 / 时间 / 品牌名，避免"客户、几个月、效果好"这类抽象词。',
      };
    }
    return {
      distance, direction,
      advice:
        '从钩子（1–3 帧）或金句（14–17 帧）里删 1–2 字最啰嗦的修饰词。案例段不要动 —— 数字 / 人名 / 时间是信息密度。',
    };
  }
  return {
    distance, direction,
    advice:
      direction === 'under'
        ? '展开现象分析段或案例段，每段补 1–2 个具体事例。'
        : '压缩开场和行动号召段，核心论点保持原样。',
  };
}

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
  const charStatus =
    charCount < limits.min ? 'under' : charCount > limits.max ? 'over' : 'ok';
  const drift = driftGuidance(charCount, lengthMode);
  const { longestIdx, shortestIdx } = findExtremes(frames);

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

      {/* W4-04 字数漂移引导 */}
      {drift && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-700 mb-1">
            {drift.direction === 'under'
              ? `距离理想字数 ↓ ${drift.distance} 字`
              : `超出理想字数 ↑ ${drift.distance} 字`}
            {longestIdx !== null && shortestIdx !== null && (
              <span className="ml-2 text-blue-500 font-normal">
                · 最长：第 {longestIdx} 帧 · 最短：第 {shortestIdx} 帧
              </span>
            )}
          </p>
          <p className="text-xs text-blue-600 leading-relaxed">{drift.advice}</p>
        </div>
      )}

      {/* Suppression warnings */}
      {suppressionFlags.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700 mb-1">
            检测到可能降低真实感的表达，建议人工检查：
          </p>
          <ul className="space-y-0.5">
            {suppressionFlags.map((f, i) => (
              <li key={i} className="text-xs text-amber-600">
                · [{f.category}] &quot;{f.matchedText}&quot;
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Frame-by-frame script */}
      <div className="space-y-3">
        {frames.map((frame) => {
          const frameChars = frame.text.replace(/\s/g, '').length;
          const isExtreme =
            lengthMode === 'short' &&
            drift !== null &&
            (frame.index === longestIdx || frame.index === shortestIdx);
          const isOverLimit =
            lengthMode === 'short' && frameChars > FRAME_CHAR.max;
          const isUnderLimit =
            lengthMode === 'short' && frameChars < FRAME_CHAR.min;
          return (
            <div
              key={frame.index}
              className={[
                'group rounded-xl border p-4 shadow-sm transition-colors',
                isExtreme
                  ? 'border-blue-300 bg-blue-50/40'
                  : 'border-gray-100 bg-white hover:border-gray-200',
              ].join(' ')}
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
                <div className="shrink-0 flex flex-col items-end gap-0.5 mt-0.5">
                  <span
                    className={[
                      'text-xs tabular-nums',
                      isOverLimit
                        ? 'text-red-500 font-medium'
                        : isUnderLimit
                          ? 'text-amber-500 font-medium'
                          : 'text-gray-300',
                    ].join(' ')}
                    title={
                      isOverLimit
                        ? `超出每帧上限（${FRAME_CHAR.max}字）`
                        : isUnderLimit
                          ? `低于每帧下限（${FRAME_CHAR.min}字）`
                          : undefined
                    }
                  >
                    {frameChars}字
                  </span>
                  <span className="text-xs text-gray-300">{frame.durationS}s</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comment bait question */}
      <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-4">
        <p className="text-xs font-medium text-indigo-500 mb-1">评论区引导问题</p>
        <p className="text-sm text-indigo-900 font-medium">{commentBaitQuestion}</p>
      </div>
    </div>
  );
}
