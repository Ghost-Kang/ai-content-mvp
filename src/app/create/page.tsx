// Quick Create entry page — ENG-003 through ENG-015

import { QuickCreateForm } from '@/components/create/QuickCreateForm';

export const metadata = {
  title: '快速创作 — AI内容营销工作室',
};

export default function CreatePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">快速创作</h1>
          <p className="mt-2 text-sm text-gray-500">
            三个输入，生成完整的分镜脚本
          </p>
        </div>

        {/* Form */}
        <QuickCreateForm />
      </div>
    </main>
  );
}
