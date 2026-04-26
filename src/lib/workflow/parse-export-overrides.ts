// Parse workflow_runs.export_overrides (JSON) into export-node inputs.
// Fails closed: unknown shape → treat as "no overrides".

import type { AiDisclosureLabelOptions } from '@/lib/export/types';

export interface ParsedExportOverrides {
  aiDisclosureLabel?: AiDisclosureLabelOptions;
  watermarkOverride?: string;
}

export function parseRunExportOverrides(raw: unknown): ParsedExportOverrides | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: ParsedExportOverrides = {};
  if (typeof o.watermarkOverride === 'string' && o.watermarkOverride.length > 0) {
    out.watermarkOverride = o.watermarkOverride;
  }
  if (o.aiDisclosureLabel && typeof o.aiDisclosureLabel === 'object' && !Array.isArray(o.aiDisclosureLabel)) {
    const a = o.aiDisclosureLabel as Record<string, unknown>;
    const label: AiDisclosureLabelOptions = {};
    if (a.disabled === true) label.disabled = true;
    if (typeof a.text === 'string') label.text = a.text;
    if (a.position === 'top' || a.position === 'bottom') label.position = a.position;
    if (Object.keys(label).length > 0) out.aiDisclosureLabel = label;
  }
  if (out.watermarkOverride === undefined && out.aiDisclosureLabel === undefined) return undefined;
  return out;
}
