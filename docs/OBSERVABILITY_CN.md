# 持续稳定与观测（大陆可达 / 去海外单点）

**维护**：与 `RUNBOOK.md` 同级 · **目的**：把「国内用户能打开、依赖不集中挂在海外不可达域名」变成可检查清单；并为沪/京/穗一类 **POP 探测 + SLA + 告警** 提供落地模板。

---

## 6) 第三方依赖「去海外单点」

思路：**逐项列出浏览器首屏与运行时真的会请求的域名**，区分「服务端-only」与「用户终端必经」，前者可走出海专线或机房网络，后者才是大陆体验的瓶颈。

### 6.1 字体 — 本地托管（当前状态）

| 项 | 现状 |
|----|------|
| 实现 | `src/app/layout.tsx` 使用 `next/font/local`，字形文件在 `src/app/fonts/*.woff` |
| 风险 | **无** Google Fonts / `fonts.googleapis.com` 外链 |

后续约束：**新增字体只允许走 local + 仓库内静态文件**，不要在 CSS 里写外域 `@import`。

### 6.2 分析脚本 — 降级 / 延迟加载

| 项 | 现状 |
|----|------|
| 浏览器 bundle | 当前 **未** 挂载 `posthog-js` / `PostHogProvider`（`providers.tsx` 仅 tRPC + React Query）。分析主要在 **服务端** `posthog-node`（`src/lib/analytics/server.ts`）。 |
| 合规 | CN 区域事件要求 `POSTHOG_HOST` 落在文档中的 **境内域名后缀白名单**，否则抛错；可选用 `ANALYTICS_DISABLED=1` 静默关掉捕获。 |
| 若将来加「前端埋点」 | ① **按需 dynamic import**，在 `requestIdleCallback` 或首屏后再 init；② host 仍须境内或可合规 Relay；③ `healthz` 里对 PostHog 的检查仅是「配置了 key」，**不代表浏览器一定能连上境外**。 |

### 6.3 直接请求海外域名的 SDK / 脚本

| 依赖 | 路径 | 大陆用户侧影响 | 缓解 |
|------|------|----------------|------|
| **Clerk** | 登录页 HTML 之后会加载 Clerk 前端脚本（实例域名常为 `*.clerk.accounts.dev` 或自定义 Frontend API） | 首次登录页可能慢或失败（DNS/跨境） | Production 使用 **自定义域名 / Satellite**（你们已在 herwin.top 体系配置）；监控 `/sign-in` 的 TTFB + 业务告警。 |
| **PostHog** | 服务端出站至 `POSTHOG_HOST` | 不影响终端用户首屏；影响事件入库 | 境内自建 PostHog 或可合规的反代；CN 租户勿指到 `app.posthog.com`。 |
| **LLM / 视频 / 新榜等** | 均在 **服务端**（Vercel Function）出站 | 不走用户家庭宽带 | 由机房出口策略与 key 可用性负责；与「大陆首屏」解耦。 |

**排查命令（研发本地）**：Chrome DevTools → Network → 筛选 Doc / JS / Font，打开 `/`、`/sign-in`、`/dashboard`，看是否有意外的外域。

---

## 7) 建立「国内可达」监控

### 7.1 探测点与频率（建议）

| 探测源地域 | 间隔 | URL | 期望 |
|------------|------|-----|------|
| 上海 / 北京 / 广州（或阿里云「全球探测」里的境内 POP） | **1 min** | `GET /api/healthz` | HTTP **200**，JSON `status === "ok"`，且各 `checks.* === "ok"` |
| 同上 | 1 min | `GET /sign-in` | HTTP **200** |
| 同上 | 1 min | `GET /runs`（未登录） | HTTP **307/302**（重定向到 `/sign-in`）亦可视为路由存活；若变成 **5xx** 或长时间无响应 → 告警 |

说明：**不要用 GitHub Actions 默认 runner 冒充「大陆 POP」**（地理多在境外）。境内 POP 需要：

- **阿里云 云监控 / ARMS 合成探测**、**腾讯云 拨测**、**华为云 AOM** 等云厂商「境内探测点」；或  
- 一台 **境内轻量应用服务器 + cron** 跑本仓库脚本（见下）。

### 7.2 SLA 指标（定义清楚才好告警）

| 指标 | 合成探测可近似 | 真实首屏需 RUM |
|------|----------------|----------------|
| **可用率** | 例如在窗口 \(W\) 内，\(成功次数 / 总次数\)（成功定义见上表） | 同上，或对登录成功率单独统计 |
| **TTFB** | 收到响应头耗时（脚本打印 `ttfbMs`） | 浏览器 Navigation Timing / Web Vitals |
| **首屏时间（FCP/LCP）** | HTTP 探针 **无法** 代替 | PostHog Web Vitals、或阿里云/RUM SDK、或 Playwright 在境内机器跑 |

建议在运维面板同时保留：**合成可用率 + TTFB P95**，首屏用 **采样 RUM**（可选下一阶段）。

### 7.3 连续失败自动告警（飞书 / 钉钉）

通用模式：

1. 探测任务每分钟执行；内部维护 **连续失败计数器**（按 POP × URL 维度）。
2. 规则示例：**同一 POP 对 `/api/healthz` 连续 ≥ 3 次失败**（约 3 分钟）→ 发送告警；恢复后发送恢复通知。
3. Webhook：
   - **飞书**：自定义机器人 Webhook URL，`POST` JSON（文本或卡片）。
   - **钉钉**：自定义机器人 + `sign` 密钥（加签），`POST` 文档格式。

不要把 webhook URL 写进仓库；用平台「密钥 / 环境变量」注入。

**cron 示例（跑在境内 VPS）**：

```bash
# /etc/crontab — 每分钟
* * * * * probe RUNNER=bj PROBE_BASE_URL=https://ai-create-content.herwin.top /home/deploy/run-probe-with-alert.sh
```

`run-probe-with-alert.sh`：调用 `pnpm probe:public`（或 `tsx scripts/probe-public-urls.ts`），若 exit code ≠ 0 则递增计数文件并判断是否触发 webhook；成功则清零计数。

### 7.4 仓库内工具：`pnpm probe:public`

对单个观测站（当前 shell 所在网络）顺序请求：

- `/api/healthz`（严格要求 `status: ok`）
- `/sign-in`（200）
- `/runs`（2xx 或 3xx 视为可达）

```bash
cd app
PROBE_BASE_URL=https://ai-create-content.herwin.top pnpm probe:public
# 机器可读：
PROBE_BASE_URL=https://ai-create-content.herwin.top pnpm exec tsx scripts/probe-public-urls.ts --json
```

退出码：**0** 全部成功，**1** 任一失败，**2** 未设置 `PROBE_BASE_URL`。

---

## 与其它文档的关系

- **值守 playbook**：`RUNBOOK.md`（故障处置）。
- **合规与分析**：`src/lib/analytics/server.ts` 头部注释 + `LAUNCH_CHECKLIST.md` / `LAUNCH_VALIDATION_SOP.md`。
- **上线时 health**：`/api/healthz` 实现见 `src/app/api/healthz/route.ts`。
