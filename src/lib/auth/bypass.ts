// Seed 内测期临时旁路登录 — 正式上线前移除 BYPASS_AUTH 即可恢复 Clerk 全链路。
//
// 启用方式: 在 .env.local 设置 BYPASS_AUTH=true
//
// 行为:
// - middleware 不再拦截任何路由
// - tRPC context 在没有 Clerk session 时 impersonate SEED_CLERK_USER_ID,
//   所有 seed 用户共享一个自动 provision 的 tenant + workspace
// - 落地页 / 直接 redirect 到 /dashboard
// - 真实 Clerk session 仍然有效, 优先级高于 seed 旁路 (operator 可正常登入)
//
// 安全:
// - admin 守卫 (isAdminUser) 不受影响, seed 用户默认无 admin 权限
// - 关闭旁路: 删除 BYPASS_AUTH 或设为非 'true' 字符串, 不需要改代码

export const SEED_CLERK_USER_ID = 'seed_internal_user';

export function isAuthBypassed(): boolean {
  return process.env.BYPASS_AUTH === 'true';
}
