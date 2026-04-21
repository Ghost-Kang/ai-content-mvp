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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">导出脚本</h3>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setFormat('storyboard')}
            className={`rounded-md px-2.5 py-1 ${
              format === 'storyboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            分镜版
          </button>
          <button
            type="button"
            onClick={() => setFormat('plain')}
            className={`rounded-md px-2.5 py-1 ${
              format === 'plain' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            纯文本
          </button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-gray-400">生成导出内容...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
          <pre className="mb-3 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono">
            {data.content}
          </pre>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                copyState === 'copied'
                  ? 'bg-green-100 text-green-800'
                  : copyState === 'error'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {copyState === 'copied' ? '✓ 已复制' : copyState === 'error' ? '复制失败' : '复制到剪贴板'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:border-gray-300"
            >
              下载 .txt
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-400">
            文件名：{data.filename} · 含 CAC 合规声明
          </p>
        </>
      )}
    </div>
  );
}
