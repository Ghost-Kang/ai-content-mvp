// W3-04 — CAC (Cyberspace Administration of China) AI disclosure label
// Regulatory baseline: must identify AI-assisted content in published output.
// Conservative default — all exports carry this label unless explicitly stripped.

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
