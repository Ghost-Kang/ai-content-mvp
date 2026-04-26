// W3-01-V3 / W3-03-V3 (partial) — Plain-text script export with AI watermark.
//
// Output shape (UTF-8 .txt):
//   ┌────────────────────────────────────────────────────────────┐
//   │ 标题：<topic>                                              │
//   │ 总时长：<XX>s · <N> 帧 · <YYYY-MM-DD HH:mm>                │
//   │ ────                                                       │
//   │ 帧 1 (0:00 → 0:05)                                         │
//   │ 旁白：<voiceover>                                          │
//   │ 字幕：<onScreenText>      ← omitted if absent              │
//   │ 视频：<videoUrl>                                            │
//   │ ────                                                       │
//   │ ...                                                        │
//   │ ────                                                       │
//   │ 本内容由 AI 辅助生成（W3-03 CAC 合规）                     │
//   └────────────────────────────────────────────────────────────┘
//
// The trailing watermark line is NON-NEGOTIABLE (D27 / 网信办互联网信息服务
// 深度合成管理规定 § 17 — AI generated content must carry a notice). It can
// be customised via `watermarkOverride` but cannot be empty; we replace empty
// strings with the default to defend the contract.

import type { ExportInput } from './types';

const DEFAULT_WATERMARK = '本内容由 AI 辅助生成（依据《互联网信息服务深度合成管理规定》第十七条标注）';

/**
 * Format seconds into a `M:SS` clock; used inside the per-frame header.
 * Caps at 99:59 — short-form video, no need for hours.
 */
function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Build the human-readable script. Used by ExportNodeRunner; called offline
 * by the test suite. Pure function — no IO, no dates from outside.
 */
export function buildScriptText(input: ExportInput, generatedAt: Date = new Date()): string {
  if (input.frames.length === 0) {
    throw new Error('buildScriptText: input.frames is empty');
  }

  const lines: string[] = [];
  const watermark = (input.watermarkOverride ?? '').trim() || DEFAULT_WATERMARK;

  const totalSec = input.frames.reduce((s, f) => s + f.durationSec, 0);
  const stamp = generatedAt.toISOString().slice(0, 16).replace('T', ' ');

  lines.push(`标题：${input.topic}`);
  lines.push(`总时长：${Math.round(totalSec)}s · ${input.frames.length} 帧 · ${stamp}`);
  lines.push('────');

  let cursor = 0;
  for (const frame of input.frames) {
    const start = cursor;
    const end   = cursor + frame.durationSec;
    cursor = end;

    lines.push(`帧 ${frame.index} (${clock(start)} → ${clock(end)})`);
    lines.push(`旁白：${frame.voiceover}`);
    if (frame.onScreenText && frame.onScreenText.trim().length > 0) {
      lines.push(`字幕：${frame.onScreenText}`);
    }
    lines.push(`视频：${frame.videoUrl}`);
    lines.push('────');
  }

  lines.push(watermark);
  // Trailing newline keeps the file POSIX-friendly (no "no newline at EOF").
  return lines.join('\n') + '\n';
}

/** Exported for tests + downstream auditing. */
export { DEFAULT_WATERMARK };
