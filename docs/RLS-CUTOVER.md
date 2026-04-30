# RLS 真启用 · Cutover 手册

**审计来源**：`docs/AUDIT-2026-04-30.md` #1
**风险**：单租户 WHERE 子句漏写 = 跨租户数据泄露
**目标**：把 `DATABASE_URL` 从 superuser `postgres` 切到非 superuser `app_user`，让 RLS 真生效

⚠️ **必须在 staging 上完整跑过一次再上 prod**。一切 RLS 路径上线前都要过 `pnpm db:probe`。

---

## 1. 前置检查

- [ ] Supabase 项目可访问，有 Service-role 凭证
- [ ] 本地 `.env.local.staging` 已就位（独立 staging 项目）
- [ ] 已 commit `drizzle/0004_rls_app_role.sql`
- [ ] 已 commit `src/db/index.ts` 的 `withTenant` helper

---

## 2. Staging 切换序列

### 2.1 准备 `app_user` 角色（在 staging Supabase）

1. 控制台 → SQL Editor，新建 query
2. 设置一个会话变量再粘 SQL（密码用强随机，至少 32 字符）

```sql
SET app_user_password = '<paste-strong-password-here>';
\i drizzle/0004_rls_app_role.sql
```

或在 psql 命令行：

```bash
psql "$STAGING_DATABASE_URL" \
  -v app_user_password='<paste>' \
  -f drizzle/0004_rls_app_role.sql
```

3. 验证：

```sql
SELECT rolname, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname = 'app_user';
-- 期望: app_user | f | t
```

### 2.2 构造 `DATABASE_URL_APP`

Supabase 默认是 `postgres://postgres:...` 走 5432。改 `app_user` 时建议同时换 pgbouncer：

```
postgres://app_user:<password>@<project>.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```

（端口 6543 是 transaction-mode pooler；事务级 SET LOCAL 与之兼容）

### 2.3 把 staging 应用切到新连接串

```bash
# .env.local.staging
DATABASE_URL=postgres://app_user:...@...:6543/postgres?sslmode=require
DB_POOL_MAX=1   # serverless + pgbouncer
```

部署 staging。

### 2.4 跑跨租户探针

```bash
pnpm db:probe        # 旧：probe-cross-tenant.ts
pnpm db:probe:v3     # 新：probe-cross-tenant-v3.ts
```

**预期表现**：
- 用未授权 tenantId 查询 → 0 行（之前是返回数据）
- 应用代码（带 WHERE 子句）→ 仍正常拿数据

如果应用代码也拿不到数据：说明某条路径**没有走 `withTenant`** 包裹。grep 出未包裹的查询，按需补包装。

### 2.5 渐进式包裹现有路径

按风险排序：
1. `src/server/routers/workflow.ts` 全部 procedure（含 `loadRunAndStep`）
2. `src/server/routers/topic.ts`
3. `src/server/routers/content.ts`
4. `src/app/api/workflow/[runId]/events/route.ts` 的 `loadSnapshot`
5. `src/lib/admin/*` 用的查询 —— **保留 superuser 连接** `DATABASE_URL_ADMIN`，admin dashboard 用它绕过 RLS

每个路径替换示例：

```ts
// before
const [run] = await db
  .select().from(workflowRuns)
  .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.tenantId, ctx.tenantId)))
  .limit(1);

// after
const [run] = await withTenant(ctx.tenantId, (tx) =>
  tx.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1)
);
```

注意：包裹后 WHERE 子句里的 `tenantId` 可以删（RLS policy 替你过滤），但建议**保留 30 天**做对比，确认无回归后再删。

### 2.6 Admin / 系统操作路径

`src/lib/admin/queries.ts` 和 worker 的 monthly_usage bump 等需要跨租户聚合 —— **保留 superuser 连接**：

```ts
// 新增 src/db/admin-db.ts
export const adminDb = drizzle(postgres(requireEnv('DATABASE_URL_ADMIN'), { ... }));
```

env：

```
DATABASE_URL=postgres://app_user:...        # 应用读写
DATABASE_URL_ADMIN=postgres://postgres:...  # 跨租户聚合 + 迁移
```

### 2.7 跑 smoke + soak 24h

- `pnpm wf:test:cascade` 全绿
- 跑两条真实 workflow run 端到端
- 24 小时观察 Supabase logs 有无 `permission denied for table xxx`

---

## 3. 生产切换

只有 staging 全绿 + 24h soak 无异常才能进生产。

1. Supabase Production 项目重复 2.1（用不同密码）
2. Vercel 环境变量更新 `DATABASE_URL` + 加 `DATABASE_URL_ADMIN`
3. 触发部署
4. 立即跑 `pnpm db:probe`（用一个 prod test tenant）
5. 监控 30 分钟错误率 + Supabase logs

回滚：把 `DATABASE_URL` 改回 superuser 连接串，重新部署。`withTenant` 的 SET LOCAL 在 superuser 下是 no-op，应用还能跑。

---

## 4. 完成标准

- [ ] staging 上 `pnpm db:probe` 用未授权 tenantId 返回 0 行
- [ ] prod 切换后 24h 无 `permission denied` 日志
- [ ] 所有 tenant-scoped 路径用 `withTenant` 包裹（grep 检查）
- [ ] WHERE 子句中的 `tenantId` 保留至 2026-06-01，之后清理

---

## 5. 后续

- 把 admin 跨租户查询的 `adminDb` 单独放进 `src/db/admin-db.ts`
- ESLint 规则：禁止在 routers/ 下直接用 `db.select` —— 必须 `withTenant`
- 审计日志：记录每次 admin 查询的调用者 + 涉及的 tenantId 列表
