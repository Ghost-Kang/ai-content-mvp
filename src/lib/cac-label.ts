// W3-03 / W3-04 — CAC (Cyberspace Administration of China) AI disclosure label.
//
// Regulatory baseline: 《互联网信息服务深度合成管理规定》§17 — AI-generated
// content must carry a clear notice. Platform layer (抖音/视频号) ALSO has its
// own AI tag mechanism, but we defend at the artifact layer too: every export
// (script .txt + FCPXML project + bundle readme) carries the label by default,
// and it can only be disabled via an explicit per-input override (audited).
//
// W3-03 split:
//   - script .txt        ← `DEFAULT_WATERMARK` in script-text.ts (full法规引用)
//   - bundle readme.md   ← hard-coded sentence in readme.ts
//   - FCPXML project     ← `CAC_AI_DISCLOSURE_LABEL` rendered as a full-duration
//                          title on lane 2 above every clip so the editor sees
//                          it AND the rendered MP4 carries it after export

export const CAC_LABEL_TEXT = '本内容由 AI 辅助生成';

export const CAC_LABEL_VARIANTS = {
  short:    '本内容由 AI 辅助生成',
  video:    '声明：本视频内容由 AI 辅助生成，已经过人工审核',
  caption:  '【AI 辅助生成】',
} as const;

export type CacLabelVariant = keyof typeof CAC_LABEL_VARIANTS;

export function buildCacLabel(variant: CacLabelVariant = 'short'): string {
  return CAC_LABEL_VARIANTS[variant];
}

/**
 * The exact string we render as a full-duration disclosure title inside every
 * FCPXML project. Kept short — long enough to be unambiguous, short enough
 * to fit one line at 9:16 vertical without wrapping. DO NOT change without
 * consulting DECISIONS_LOG (D27) — the current value is what was negotiated
 * with the seed users (永航 preferred caption-style, 苗苗 preferred
 * parenthetical) as a compromise.
 */
export const CAC_AI_DISCLOSURE_LABEL = '本视频由 AI 辅助生成';
