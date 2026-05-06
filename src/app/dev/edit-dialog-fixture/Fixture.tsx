'use client';

// Mounts EditNodeDialog with 17-frame storyboard fixture data inside a
// container that has `backdrop-blur-xl` — same CSS containing-block trap
// the real NodeCard creates. Without this wrapper, the Portal fix would
// be untested (vanilla mounting works either way; the Portal only matters
// when an ancestor has `backdrop-filter`/`transform`/etc.).
//
// The fixture intentionally does NOT exercise tRPC save mutations — those
// require a real authenticated session and a real run row. We test
// rendering + interaction only (Portal coverage, collapse/expand, jump,
// Esc, dnd handle hit area). Save flow stays covered by manual QA.

import { useState } from 'react';
import { EditNodeDialog } from '@/components/workflow/EditNodeDialog';
import { CAMERA_LANGUAGE_VOCAB } from '@/lib/prompts/storyboard-prompt';

const FIXTURE_FRAMES = Array.from({ length: 17 }, (_, i) => ({
  index:          i + 1,
  voiceover:      `第 ${i + 1} 帧的口播测试文本`,
  durationSec:    3,
  cameraLanguage: CAMERA_LANGUAGE_VOCAB[i % CAMERA_LANGUAGE_VOCAB.length],
  scene:          `第 ${i + 1} 帧的中文场景描述（环境/人物/动作）`,
  imagePrompt:    `frame ${i + 1} prompt: subject in scene, lighting, composition, style`,
  onScreenText:   i % 3 === 0 ? `第${i + 1}帧字幕` : '',
}));

const FIXTURE_OUTPUT = {
  frames:           FIXTURE_FRAMES,
  totalDurationSec: FIXTURE_FRAMES.reduce((s, f) => s + f.durationSec, 0),
  promptVersion:   'v2-fixture',
  generatedAt:     '2026-05-06T00:00:00.000Z',
  llmModel:        'fixture-mock',
};

export function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white">
      <h1 className="text-xl font-bold">EditNodeDialog 手测 Fixture</h1>
      <p className="mt-2 text-sm text-slate-400">
        17 帧 storyboard 数据 · dev only · 用于 Playwright 测 Portal / 折叠 / 跳转 / Esc / dnd
      </p>

      {/* This wrapper REPLICATES the real NodeCard's `backdrop-blur-xl` —
          if Portal fix regresses, the dialog will be trapped here, not
          covering the viewport. */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
        <p className="text-sm text-slate-300">
          ↓ 此父容器有 <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">backdrop-blur-xl</code>，
          模拟真实 NodeCard 的 containing-block 陷阱
        </p>
        <button
          data-testid="open-dialog"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:saturate-110"
        >
          打开 EditNodeDialog（storyboard / 17 帧）
        </button>
      </div>

      <EditNodeDialog
        open={open}
        onClose={() => setOpen(false)}
        runId="fixture-run-id"
        nodeType="storyboard"
        initialOutput={FIXTURE_OUTPUT}
        onSaved={() => setOpen(false)}
      />
    </div>
  );
}
