import { createHash } from 'node:crypto';

import { parseRunSeedInput, type ParsedSeedInput } from './parse-seed-input';

export interface WorkflowRunFingerprintInput {
  topic: string;
  seedInput?: unknown;
}

export interface WorkflowRunFingerprint {
  canonical: string;
  hash:      string;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*([，。！？；：、])\s*/g, '$1');
}

function canonicalizeSeed(seed: ParsedSeedInput | undefined, normalizedTopic: string): Record<string, unknown> | null {
  if (!seed) return null;

  if (seed.sourceMeta) {
    const sourceKey = seed.sourceMeta.platform && seed.sourceMeta.opusId
      ? `${seed.sourceMeta.platform}:${seed.sourceMeta.opusId}`
      : normalizedTopic;

    return {
      source: 'trending',
      sourceKey,
      topic: normalizedTopic,
    };
  }

  return {
    formula:        seed.formula ?? null,
    lengthMode:     seed.lengthMode ?? null,
    productName:    seed.productName ? normalizeText(seed.productName) : null,
    targetAudience: seed.targetAudience ? normalizeText(seed.targetAudience) : null,
    coreClaim:      seed.coreClaim ? normalizeText(seed.coreClaim) : null,
  };
}

export function buildWorkflowRunFingerprint(input: WorkflowRunFingerprintInput): WorkflowRunFingerprint {
  const normalizedTopic = normalizeText(input.topic);
  const seed = parseRunSeedInput(input.seedInput);
  const canonical = JSON.stringify({
    version: 1,
    topic: normalizedTopic,
    seed: canonicalizeSeed(seed, normalizedTopic),
  });

  return {
    canonical,
    hash: createHash('sha256').update(canonical).digest('hex'),
  };
}
