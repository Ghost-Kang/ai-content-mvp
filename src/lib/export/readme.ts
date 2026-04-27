// W3-04-V3 — User-facing readme.md generator (零中间人解释).
//
// Bundled into the export zip alongside script.txt + project.fcpxml +
// clips/frame-NN.mp4 × N. Tells the user how to import the FCPXML into
// 剪映专业版 / CapCut Pro / Final Cut Pro X.
//
// Pure function — no IO. Tested via test-export-bundle.ts.

import type { ExportInput } from './types';

interface ReadmeContext {
  topic:            string;
  totalDurationSec: number;
  frameCount:       number;
  generatedAt:      Date;
  /** Filename inside the zip — surfaced so users know what to look for. */
  scriptTextName:   string;
  fcpxmlName:       string;
  /** Local filenames the bundle wrote for each clip. */
  clipFilenames:    ReadonlyArray<string>;
  /** Path inside the zip for the W3-03 compliance disclosure SRT. */
  disclosureSrtName: string;
  /** Path inside the zip for per-frame narration SRT (TTS / voiceover blueprint). */
  narrationSrtName:  string;
}

export function buildExportReadme(ctx: ReadmeContext): string {
  const stamp = ctx.generatedAt.toISOString().slice(0, 16).replace('T', ' ');

  const clipList = ctx.clipFilenames.length === 0
    ? '  - （未包含 mp4，剪映需在线加载 — 见「故障排查」）'
    : ctx.clipFilenames.map((n) => `  - \`${n}\``).join('\n');

  return `# AI 短视频导出包 · ${ctx.topic}

> 生成时间：${stamp}
> 帧数：${ctx.frameCount} · 总时长：${Math.round(ctx.totalDurationSec)} 秒
> 由 AI-Content-Marketing-MVP v3.0 生成

---

## ⚠️ 上线前你必须做两件事

1. **加旁白配音**（视频片段 **无音轨**，详见 §三）
2. **导入合规字幕** \`${ctx.disclosureSrtName}\`（详见 §合规）—— 不导入 = 实际不合规

---

## 包内文件

\`\`\`
${ctx.scriptTextName}                    # 脚本（旁白 + 字幕 + 时间码 + AI 水印声明）
${ctx.fcpxmlName}                # Apple FCPXML 1.13 工程文件（剪映 / CapCut Pro / FCPX 通用）
${ctx.disclosureSrtName}        # 合规 AI 声明字幕（必导）★
${ctx.narrationSrtName}         # 逐帧旁白字幕（配音 / TTS 蓝本）
README.md                        # 本文件
clips/                           # 视频片段（H.264，无音轨）
${clipList.split('\n').map((l) => l.replace(/^  - /, '  ')).join('\n')}
\`\`\`

---

## 一、导入剪映专业版

### 1.1 导入工程 + 视频片段

1. 完整解压本 zip 到 **任意非中文路径**（剪映对中文路径偶尔不稳）。
2. 打开 **剪映专业版** → 顶部菜单「文件」→「导入」→「Final Cut Pro XML」。
3. 选择解压目录中的 \`${ctx.fcpxmlName}\`。
4. 剪映自动识别同目录下的 \`clips/\` 视频片段，时间轴出现 ${ctx.frameCount} 段视频。

> 💡 也可以拖拽 \`${ctx.fcpxmlName}\` 文件直接到剪映窗口，效果一致。

### 1.2 导入字幕（重要）

FCPXML 里的 Apple \`.moti\` 字幕模板剪映**不识别**（实测会静默丢弃），
所以字幕单独以 SRT 提供，你需要手动导入：

5. 时间轴空白处 →「文件」→「导入」→「字幕」→ 选 \`${ctx.disclosureSrtName}\`
   → 全片合规字幕一条铺到最上层字幕轨。**这条不能省。**
6. 重复一次 →「文件」→「导入」→「字幕」→ 选 \`${ctx.narrationSrtName}\`
   → 每帧旁白以 ${ctx.frameCount} 条字幕的形式落到时间轴，作为配音 / TTS 的时间码蓝本。

## 二、导入 Final Cut Pro X / CapCut Pro / DaVinci Resolve

操作完全一致：菜单「文件 → 导入 → XML」选 \`${ctx.fcpxmlName}\`。
SRT 字幕在「文件 → 导入 → 字幕 / Captions」单独导入，与剪映流程一致。
FCPXML 1.13 是 Apple 公开标准，支持的剪辑软件还包括：
- Final Cut Pro X
- DaVinci Resolve（File → Import → Timeline → XML）
- Adobe Premiere Pro（受限支持，建议先在 FCPX 中转一道）

## 三、关于声音 — 视频片段无原生音轨

Seedance 当前是 **text-to-video（纯视觉）**，生成的 mp4 不带音轨。
你需要在剪映里给视频配上声音，三种主流做法：

- **A. 剪映自带 TTS 朗读字幕**（最快）：导入 \`${ctx.narrationSrtName}\` 后，
  右键字幕轨 →「文本朗读」→ 选音色 → 自动生成全片 AI 配音。
- **B. 真人录音对时间码**：脚本里已含每帧起止时间，按 \`${ctx.scriptTextName}\` 录完导入即可。
- **C. 找配音同事**：直接把 \`${ctx.scriptTextName}\` 发出去，时间码已对齐 ${ctx.frameCount} 帧。

---

## 故障排查

- **「找不到视频文件」**：剪映用相对路径解析素材，移动 \`${ctx.fcpxmlName}\`
  时必须连同 \`clips/\` 文件夹一起搬。保留整个解压目录结构最稳。
- **「字幕没出现」**：FCPXML 里的字幕轨在剪映被忽略是预期行为，
  必须按 §1.2 单独导入 SRT。
- **「字幕乱码」**：脚本和 SRT 都是 UTF-8，确保打开方式 / 字体支持中文。
- **「导入失败 / 工程为空」**：检查剪映版本（≥ 4.0 才完整支持 FCPXML 导入）。
  老版本只用 \`${ctx.scriptTextName}\` + \`clips/\` 手动拼。

---

## 合规声明

本包内全部视频片段、文案均由 AI 辅助生成。
依据《互联网信息服务深度合成管理规定》第十七条，
你在发布前 **必须** 在视频或文案显著位置标注「AI 生成」字样。

\`${ctx.disclosureSrtName}\` 已自动生成「本视频由 AI 辅助生成」全片字幕条目，
按 §1.2 步骤 5 导入即可一次性满足合规；\`${ctx.scriptTextName}\` 末行同步附推荐措辞。
**不导入 SRT = 没字幕 = 实际不合规**，请勿略过。
`;
}

/**
 * Convenience overload that derives the ReadmeContext from an ExportInput.
 * Used by the bundle builder to keep call sites short.
 */
export function buildExportReadmeFromInput(args: {
  input:              ExportInput;
  generatedAt:        Date;
  scriptTextName:     string;
  fcpxmlName:         string;
  clipFilenames:      ReadonlyArray<string>;
  disclosureSrtName:  string;
  narrationSrtName:   string;
}): string {
  const totalDurationSec = args.input.frames.reduce((s, f) => s + f.durationSec, 0);
  return buildExportReadme({
    topic:             args.input.topic,
    totalDurationSec,
    frameCount:        args.input.frames.length,
    generatedAt:       args.generatedAt,
    scriptTextName:    args.scriptTextName,
    fcpxmlName:        args.fcpxmlName,
    clipFilenames:     args.clipFilenames,
    disclosureSrtName: args.disclosureSrtName,
    narrationSrtName:  args.narrationSrtName,
  });
}
