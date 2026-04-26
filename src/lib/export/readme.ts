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

## 包内文件

\`\`\`
${ctx.scriptTextName}        # 脚本（旁白 + 字幕 + 时间码 + AI 水印声明）
${ctx.fcpxmlName}            # Apple FCPXML 1.13 工程文件（剪映 / CapCut Pro / Final Cut Pro X 通用）
clips/                       # 视频片段
${clipList.split('\n').map((l) => l.replace(/^  - /, '  ')).join('\n')}
README.md                    # 本文件
\`\`\`

---

## 一、导入剪映专业版（推荐）

1. 完整解压本 zip 到 **任意非中文路径**（剪映对中文路径偶尔不稳）。
2. 打开 **剪映专业版** → 顶部菜单「文件」→「导入」→「Final Cut Pro XML」。
3. 选择解压目录中的 \`${ctx.fcpxmlName}\`。
4. 剪映会自动识别同目录下的 \`clips/\` 视频片段，时间轴 + 字幕直接出现。
5. 二剪、配音、调色、导出均在剪映内完成。

> 💡 也可以拖拽 \`${ctx.fcpxmlName}\` 文件直接到剪映窗口，效果一致。

## 二、导入 Final Cut Pro X / CapCut Pro（海外版）

操作完全一致：菜单「文件 → 导入 → XML」选择 \`${ctx.fcpxmlName}\`。
FCPXML 1.13 是 Apple 公开标准，支持的剪辑软件还包括：
- Final Cut Pro X
- DaVinci Resolve（File → Import → Timeline → AAF, EDL, XML）
- Adobe Premiere Pro（受限支持，建议先在 FCPX 中转一道）

## 三、纯文案版本（不进剪映）

直接发送 \`${ctx.scriptTextName}\` 给配音 / 字幕同事。
脚本里已包含：旁白原文、字幕文案、视频片段 URL（你也可以把
\`clips/frame-NN.mp4\` 直接发过去）。

---

## 故障排查

- **「找不到视频文件」**：剪映用相对路径解析素材，移动 \`${ctx.fcpxmlName}\`
  时必须连同 \`clips/\` 文件夹一起搬。保留整个解压目录结构最稳。
- **「字幕样式被替换」**：剪映会用自家字幕模板替换 FCPXML 里的 Apple Basic Title，
  这是预期行为；文字内容不会丢，重新设置字体/大小即可。
- **「字幕乱码」**：脚本是 UTF-8，请确保你的编辑器也用 UTF-8 打开。
- **「导入失败 / 工程为空」**：检查剪映版本（≥ 4.0 才完整支持 FCPXML 导入）。
  老版本走「方案三」用脚本 + clips 手动重组。

---

## 合规声明

本包内全部视频片段、文案均由 AI 辅助生成。
依据《互联网信息服务深度合成管理规定》第十七条，
你在发布前 **必须** 在视频或文案显著位置标注「AI 生成」字样。

工程文件的最上层字幕轨已自动加入「本视频由 AI 辅助生成」全片字幕，
导出后渲染到最终 mp4 上不可缺失；\`${ctx.scriptTextName}\` 末行也附上推荐措辞。
`;
}

/**
 * Convenience overload that derives the ReadmeContext from an ExportInput.
 * Used by the bundle builder to keep call sites short.
 */
export function buildExportReadmeFromInput(args: {
  input:            ExportInput;
  generatedAt:      Date;
  scriptTextName:   string;
  fcpxmlName:       string;
  clipFilenames:    ReadonlyArray<string>;
}): string {
  const totalDurationSec = args.input.frames.reduce((s, f) => s + f.durationSec, 0);
  return buildExportReadme({
    topic:            args.input.topic,
    totalDurationSec,
    frameCount:       args.input.frames.length,
    generatedAt:      args.generatedAt,
    scriptTextName:   args.scriptTextName,
    fcpxmlName:       args.fcpxmlName,
    clipFilenames:    args.clipFilenames,
  });
}
