// ENG-019 — Post-generation suppression scanner
// Soft check: flags matches but does not block output.
// Hard enforcement is at the prompt level (suppression.ts).

import { SUPPRESSION_RULES } from './suppression';

export interface SuppressionFlag {
  category: string;
  matchedText: string;
  position: number;
}

export function buildSuppressionScanner(text: string): SuppressionFlag[] {
  const flags: SuppressionFlag[] = [];

  for (const rule of SUPPRESSION_RULES) {
    for (const example of rule.examples) {
      const idx = text.indexOf(example);
      if (idx !== -1) {
        flags.push({
          category: rule.category,
          matchedText: example,
          position: idx,
        });
      }
    }
  }

  // Check for symmetric list pattern (3+ items of equal length within ±2 chars)
  const listItemPattern = /[1-9]\.\s*(.{2,20})\s*/g;
  const matches = [...text.matchAll(listItemPattern)];
  if (matches.length >= 3) {
    const lengths = matches.map((m) => m[1].trim().length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const isSymmetric = lengths.every((l) => Math.abs(l - avg) <= 2);
    if (isSymmetric && matches.length >= 3) {
      flags.push({
        category: 'symmetric_list',
        matchedText: `${matches.length}个等长列表项`,
        position: matches[0].index ?? 0,
      });
    }
  }

  return flags;
}
