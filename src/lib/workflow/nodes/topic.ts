// W4-05-V3 — Topic Node Runner.
//
// Thin pass-through that turns the run's raw `ctx.topic` into a structured
// step output. Zero LLM, zero external IO — its job is to (a) trim/validate
// the topic string, (b) expose `source: 'manual' | 'trending'` to the UI,
// and (c) reserve a stable extension point for future LLM topic analysis
// (W4-03 will add `analysis` to TopicOutput without touching downstream
// nodes).
//
// Why a separate node at all if it's a pass-through?
//   - UI: gives users an explicit "选题" card in the 5-node canvas.
//   - Resume: edit/skip/retry semantics work uniformly across 5 nodes.
//   - Forward compat: lets W4-03 (LLM analysis) land as an `execute()`
//     extension instead of a new node + new schema.
//
// Downstream contract: ScriptNodeRunner reads `ctx.upstreamOutputs.topic`
// when present, falling back to `ctx.topic` for orchestrators that don't
// include this node (older probes, tests).

import { NodeRunner } from '../node-runner';
import {
  NodeError,
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
} from '../types';

export type TopicSource = 'manual' | 'trending';

/**
 * Provenance metadata for a trending-sourced topic. All fields optional —
 * `manual` topics carry no metadata. We deliberately do NOT persist this
 * to `workflow_runs` in MVP-1 (zero schema migration); UI passes it via
 * tRPC at create time and it lives only in `workflow_steps.output_json`.
 */
export interface TopicSourceMeta {
  platform?:       'dy' | 'ks' | 'xhs' | 'bz';
  /** 新榜 opaque per-platform content ID. */
  opusId?:         string;
  /** 1-based daily rank position when the user picked this topic. */
  rank?:           number;
  /** Permalink to the original item on the source platform. */
  url?:            string;
  authorNickname?: string;
}

export interface TopicInput {
  topic:       string;
  source?:     TopicSource;
  sourceMeta?: TopicSourceMeta;
}

export interface TopicOutput {
  topic:       string;
  source:      TopicSource;
  sourceMeta?: TopicSourceMeta;
}

const TOPIC_MIN_CHARS = 2;
const TOPIC_MAX_CHARS = 300;

export class TopicNodeRunner extends NodeRunner<TopicInput, TopicOutput> {
  readonly descriptor: NodeDescriptor = {
    nodeType:         'topic',
    stepIndex:        0,
    maxRetries:       0,
    upstreamRequired: [],
  };

  protected buildInput(ctx: NodeContext): TopicInput {
    // MVP-1: workflow_runs has no source/sourceMeta column, so the only
    // signal we get is `ctx.topic`. UI/tRPC paths that want to record
    // a trending source can subclass this runner or extend NodeContext
    // in a follow-up. For now, every topic that hits the runtime is
    // labeled `manual` — sourceMeta enrichment is a known follow-up
    // (see PROGRESS.md W4 § sourceMeta).
    return { topic: ctx.topic, source: 'manual' };
  }

  protected async execute(input: TopicInput): Promise<NodeResult<TopicOutput>> {
    const trimmed = (input.topic ?? '').trim();
    if (trimmed.length < TOPIC_MIN_CHARS) {
      throw new NodeError(
        'INVALID_INPUT',
        `Topic must be at least ${TOPIC_MIN_CHARS} characters (got ${trimmed.length})`,
        false,
      );
    }
    if (trimmed.length > TOPIC_MAX_CHARS) {
      throw new NodeError(
        'INVALID_INPUT',
        `Topic must be at most ${TOPIC_MAX_CHARS} characters (got ${trimmed.length})`,
        false,
      );
    }

    const output: TopicOutput = {
      topic:  trimmed,
      source: input.source ?? 'manual',
    };
    if (input.sourceMeta) output.sourceMeta = input.sourceMeta;

    return {
      output,
      costFen:    0,
      videoCount: 0,
    };
  }
}
