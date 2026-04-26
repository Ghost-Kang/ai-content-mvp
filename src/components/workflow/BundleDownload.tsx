// W3-05 — Download button for the export bundle (W3-04 output).
//
// Renders the signed-URL CTA, the byte size, expiry hint, and a warning
// when only a partial bundle is available (some clips failed to fetch).

'use client';

interface BundleDownloadProps {
  bundle: {
    signedUrl:     string;
    expiresAt:     string;
    filename:      string;
    bytes:         number;
    missingFrames: ReadonlyArray<number>;
  } | null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

function expiryHint(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0)              return '已过期 — 请重跑导出节点';
  if (ms < 3_600_000)       return `${Math.floor(ms / 60_000)} 分钟后过期`;
  if (ms < 86_400_000)      return `${Math.floor(ms / 3_600_000)} 小时后过期`;
  return `${Math.floor(ms / 86_400_000)} 天后过期`;
}

export function BundleDownload({ bundle }: BundleDownloadProps) {
  if (!bundle) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        本次导出未生成压缩包（Storage 未配置 / 已跳过）。脚本与剪映 JSON 仍保留在 <code>output_jsonb</code> 中。
      </div>
    );
  }

  const partial = bundle.missingFrames.length > 0;
  const expired = new Date(bundle.expiresAt).getTime() <= Date.now();

  return (
    <div className="space-y-2">
      <a
        href={bundle.signedUrl}
        download={bundle.filename}
        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-inset transition-colors ${
          expired
            ? 'cursor-not-allowed bg-gray-100 text-gray-400 ring-gray-200'
            : 'bg-indigo-600 text-white ring-indigo-700 hover:bg-indigo-700'
        }`}
        aria-disabled={expired}
        onClick={(e) => {
          if (expired) e.preventDefault();
        }}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
          />
        </svg>
        下载 .zip ({formatBytes(bundle.bytes)})
      </a>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="truncate font-mono">{bundle.filename}</span>
        <span className="shrink-0">· {expiryHint(bundle.expiresAt)}</span>
      </div>

      {partial && (
        <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          ⚠ 部分导出：缺失帧 {bundle.missingFrames.join(', ')}（共 {bundle.missingFrames.length} 帧）。建议重跑导出节点重新拉取。
        </div>
      )}
    </div>
  );
}
