// W3-05 — Export panel: copy to clipboard + download .txt

'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';

interface Props {
  sessionId: string;
}

type Format = 'storyboard' | 'plain';

export function ExportPanel({ sessionId }: Props) {
  const [format, setFormat] = useState<Format>('storyboard');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const { data, isLoading, error, refetch } = trpc.content.export.useQuery(
    { sessionId, format },
    { staleTime: 0 },
  );
  const trackExport = trpc.content.trackExport.useMutation();

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
      trackExport.mutate({ sessionId, format, action: 'copy', charCount: data.charCount });
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  function handleDownload() {
    if (!data) return;
    const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackExport.mutate({ sessionId, format, action: 'download', charCount: data.charCount });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">导出脚本</h3>
        <div className="flex gap-1 rounded-xl bg-white/10 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setFormat('storyboard')}
            className={`rounded-md px-2.5 py-1 ${
              format === 'storyboard' ? 'bg-cyan-300 text-slate-950 shadow-sm' : 'text-slate-400'
            }`}
          >
            分镜版
          </button>
          <button
            type="button"
            onClick={() => setFormat('plain')}
            className={`rounded-md px-2.5 py-1 ${
              format === 'plain' ? 'bg-cyan-300 text-slate-950 shadow-sm' : 'text-slate-400'
            }`}
          >
            纯文本
          </button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-slate-500">生成导出内容...</p>}

      {error && (
        <div className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
          {error.message}
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-2 underline"
          >
            重试
          </button>
        </div>
      )}

      {data && (
        <>
          <pre className="mb-3 max-h-64 overflow-auto rounded-xl bg-slate-950/70 p-3 text-xs text-slate-200 whitespace-pre-wrap font-mono">
            {data.content}
          </pre>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                copyState === 'copied'
                  ? 'bg-emerald-300/20 text-emerald-100'
                  : copyState === 'error'
                    ? 'bg-rose-300/20 text-rose-100'
                    : 'bg-cyan-300 text-slate-950 hover:bg-cyan-200'
              }`}
            >
              {copyState === 'copied' ? '✓ 已复制' : copyState === 'error' ? '复制失败' : '复制到剪贴板'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-slate-300 hover:border-cyan-300/40 hover:text-cyan-200"
            >
              下载 .txt
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            文件名：{data.filename} · 含 CAC 合规声明
          </p>
        </>
      )}
    </div>
  );
}
