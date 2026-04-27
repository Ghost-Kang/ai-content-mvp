// W3-04 follow-up — SRT subtitle generators.
//
// Why SRT, when FCPXML already has <title> elements?
// 剪映的 FCPXML import 静默丢弃「Apple Basic Title」effect ref（`.moti`
// 模板是 Final Cut Pro 专属、剪映解不了），实测：合规字幕 / 旁白都不会出现
// 在剪映时间轴上。SRT 是剪映「文件 → 导入 → 字幕」原生认的格式，导入即出
// 字幕轨，不依赖任何 effect 模板。
//
// 这里出两份 SRT：
//   - disclosure.srt: 整片单条「本视频由 AI 辅助生成」(W3-03 / 互联网深度合成
//                     管理规定 第十七条 强制要求) — 不出 = 实际不合规
//   - narration.srt:  每帧一条 voiceover，用 storyboard.frames[i].durationSec
//                     累加得起止时间，便于用户把它当 TTS / 配音蓝本
//
// 纯函数，无 IO。

import type { ExportFrame } from './types';

const DEFAULT_DISCLOSURE_TEXT = '本视频由 AI 辅助生成';

/**
 * Format seconds (float) → SRT timestamp `HH:MM:SS,mmm`.
 * SRT 强制 3 位毫秒、逗号分隔（不是 FCPXML 的小数点）。负值 clamp 到 0。
 */
export function srtTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const totalMs = Math.round(s * 1000);
  const hh = Math.floor(totalMs / 3_600_000);
  const mm = Math.floor((totalMs % 3_600_000) / 60_000);
  const ss = Math.floor((totalMs % 60_000) / 1_000);
  const ms = totalMs % 1_000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(ms, 3)}`;
}

interface SrtEntry {
  index: number;
  /** Inclusive start, in seconds (float). */
  start: number;
  /** Exclusive end, in seconds (float). */
  end:   number;
  text:  string;
}

function serializeSrt(entries: ReadonlyArray<SrtEntry>): string {
  // SRT spec: blocks separated by blank line, **CRLF** line endings (剪映 +
  // VLC + DaVinci 都吃 LF，但 Premiere 老版本要 CRLF；用 LF 已足够 MVP-1）。
  // 末尾保留一个空行 — 一些解析器不容忍 EOF 紧贴最后一条。
  return entries
    .map((e) => `${e.index}\n${srtTimestamp(e.start)} --> ${srtTimestamp(e.end)}\n${e.text}`)
    .join('\n\n') + '\n';
}

/**
 * 生成全片合规 disclosure SRT。整段视频显示同一条字幕。
 *
 * @param totalDurationSec  整片总时长（秒）。frames[i].durationSec 之和。
 * @param textOverride      覆盖文本（罕见用例：合规审计调整措辞）。
 *                          空字符串 / 仅空白 → 回退到 DEFAULT_DISCLOSURE_TEXT。
 */
export function buildDisclosureSrt(
  totalDurationSec: number,
  textOverride?:    string,
): string {
  if (!Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
    throw new Error(`buildDisclosureSrt: totalDurationSec must be > 0 (got ${totalDurationSec})`);
  }
  const text = (textOverride ?? '').trim() || DEFAULT_DISCLOSURE_TEXT;
  return serializeSrt([
    { index: 1, start: 0, end: totalDurationSec, text },
  ]);
}

/**
 * 生成逐帧旁白 SRT。frames 顺序就是时间顺序，时间码累加 frame.durationSec
 * 得到。空 voiceover 帧（onScreenText-only）跳过 — 不出空字幕条目。
 */
export function buildNarrationSrt(
  frames: ReadonlyArray<ExportFrame>,
): string {
  if (frames.length === 0) {
    throw new Error('buildNarrationSrt: frames is empty');
  }
  const entries: SrtEntry[] = [];
  let cursor = 0;
  let outIdx = 0;
  for (const f of frames) {
    const start = cursor;
    const end   = cursor + f.durationSec;
    cursor = end;
    const text = (f.voiceover ?? '').trim();
    if (text.length === 0) continue;
    outIdx += 1;
    entries.push({ index: outIdx, start, end, text });
  }
  if (entries.length === 0) {
    // All frames had empty voiceover. SRT files must have ≥ 1 cue or some
    // editors refuse to import; emit a single placeholder so the file is
    // still valid and visible to the user as "intentionally empty".
    return serializeSrt([
      { index: 1, start: 0, end: cursor, text: '（脚本未含旁白文本）' },
    ]);
  }
  return serializeSrt(entries);
}
