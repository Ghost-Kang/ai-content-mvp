# AI 内容营销工作室 MVP

为小型 B2B SaaS 团队生成 60 秒抖音脚本。公式驱动 + 降权词抑制 + 人工复审闸门。

- 线上：https://ai-content-26fum2vfc-ai-content-mvp.vercel.app
- 目标上线：2026-05-15
- 顶层文档：`/RUNBOOK.md`（故障处置）· `/LAUNCH_CHECKLIST.md`（发布自审）· `/STRATEGY_PACKAGE_V2_SOLO.md`（产品策略）

## 技术栈

- Next.js 14 App Router + TypeScript
- tRPC v11 · Drizzle ORM · Supabase (Postgres)
- Clerk (auth) · PostHog (analytics)
- Kimi（主）+ OpenAI / Anthropic / Qwen / Ernie 回退链

## 本地开发

### 前置

- Node.js ≥ 20（推荐 20 LTS）
- pnpm ≥ 9
- Supabase 项目 + Clerk 项目 + Kimi (Moonshot AI) API key

### 启动步骤

1. **安装依赖**
   ```bash
   cd app
   pnpm install
   ```

2. **配置环境变量**
   ```bash
   cp .env.local.template .env.local
   # 填入 Clerk / Supabase / Kimi 的 key（最低套件）
   ```
   最少需要这些 key 本地能跑：
   - `DATABASE_URL` · `SUPABASE_URL` · `SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` · `CLERK_SECRET_KEY`
   - `KIMI_API_KEY`

3. **跑数据库迁移**（Supabase 首次 / 新加表时）
   ```bash
   pnpm tsx --env-file=.env.local scripts/migrate-add-llm-spend.ts
   # 其他 scripts/migrate-*.ts 按需跑
   ```

4. **启动开发服务器**
   ```bash
   pnpm dev
   ```
   打开 http://localhost:3000，注册账号后能进 `/create` 生成第一条脚本。

### 常用命令

| 目的 | 命令 |
|---|---|
| 类型检查 | `pnpm tsc --noEmit` |
| 20 样本审计 | `pnpm tsx --env-file=.env.local scripts/audit-20-samples.ts` |
| 跨租户探针 | `pnpm tsx --env-file=.env.local scripts/probe-tenant-isolation.ts` |
| 抑制词回归测试 | `pnpm tsx scripts/test-suppression-scanner.ts` |
| 发布前 env 对齐检查 | `comm -23 <(grep -E '^[A-Z_]+=' .env.local \| cut -d= -f1 \| sort -u) <(grep -E '^[A-Z_]+=' .env.local.template \| cut -d= -f1 \| sort -u)` |

## 目录结构（重点）

```
src/
  app/                   # Next.js App Router pages
  components/            # React UI 组件
  server/
    routers/             # tRPC 路由（所有 query/mutation 带 tenantId 过滤）
    context.ts           # Clerk → tenant/user 解析 + auto-provision
  lib/
    llm/                 # Provider 抽象（router / fallback / circuit-breaker / spend-tracker）
    prompts/             # 所有 system + user prompt 集中在这里（硬规矩）
    error-messages.ts    # 友好错误映射
  db/
    schema.ts            # Drizzle schema（所有表 tenantId 字段）
scripts/                 # 一次性 / 定期脚本（迁移 / 审计 / 测试）
```

## 安全模型

- **隔离**：每个 tRPC 路由 WHERE 过 `eq(X.tenantId, ctx.tenantId)`。Supabase RLS policies 存在但未强制（Drizzle 连的是 postgres 超级用户）—— 详见 `src/server/context.ts` 注释。
- **验证**：`scripts/probe-tenant-isolation.ts` 自动化测试跨租户访问。
- **配额**：W4-01 daily cap 在 `src/lib/llm/fallback.ts` 拦截，避免单租户刷爆全站预算。

## 部署

Vercel 自动部署 main 分支。部署前 checklist 见 `/LAUNCH_CHECKLIST.md`。

## 故障处置

三个场景（配额爆满 / Kimi RATE_LIMITED / DB 异常）见 `/RUNBOOK.md`。凌晨 3 点也能 15 分钟内定位 + 处置。
