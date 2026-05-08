# T-7 → T-0 倒计时（2026-05-09 → 2026-05-15）

> 每天 22:00 之前完成，跑完打勾。延期就推 launch。
> 状态：所有自动闸门已关，剩 5 日聚合（perf）+ 1 次完整手测 + 用户跟进。

---

## D-7 · 周六 2026-05-09

**早（午饭前）**
- [ ] `git push origin main`（如网络通）
- [ ] `vercel env add DEEPSEEK_API_KEY production` → `sk-fdf02019ca54463da8c36826da476e42`
- [ ] `vercel env add LLM_PROVIDER_TIMEOUT_MS production` → `90000`
- [ ] `vercel env add CRON_SECRET production` → `421bc928958a7df2c9f64d28eaf34d2a27df506e7a60ec32d87b533703345ba1`
- [ ] `vercel deploy --prod`（激活新 env）
- [ ] `curl https://ai-content-mvp.vercel.app/api/healthz` 看 200
- [ ] `curl -H "Authorization: Bearer <CRON_SECRET>" https://ai-content-mvp.vercel.app/api/admin/watchdog` 看 200 + JSON

**午**
- [ ] **微信主动联系 tenant `1985b6c6`**（昨天 LLM 失败的那位 seed user）。说明问题已修复 + 邀请重试，记录回应到 `LAUNCH_DAILY_NOTES.md`。
- [ ] 跑一次 `pnpm tsx --env-file=.env.local scripts/probe-fb5632a7-video.ts` 看 0-videos 异常的 output_json，写假说选定到 `DECISIONS_LOG.md`

**晚 22:00**
- [ ] `pnpm cap:watch`（看支出）
- [ ] `pnpm prod:today`（看今日 done/failed）
- [ ] `pnpm perf:snapshot`（自动追加 P50/P95 到 `LAUNCH_DAILY_NOTES.md`）

---

## D-6 · 周日 2026-05-10

- [ ] **UI 浏览器手测 cascade 修复**（关键，本周唯一窗口）
  - 真实 run 跑到 video 出 17 个 URL → 记 1 个 URL
  - 编辑 storyboard 1 帧 → 触发 video 重跑
  - 验证：拿到的 URL 与之前不同（cascade 修复生效）
  - 顺便：EditNodeDialog 折叠 / 跳转工具栏 / Esc 关闭都工作
  - 失败立刻报，不延后
- [ ] 22:00 三件套：cap:watch / prod:today / perf:snapshot

---

## D-5 · 周一 2026-05-11

- [ ] 主动 ping 4 个 seed user 各 1 句「这周用得怎么样？」
- [ ] 收集到任何 P0 bug → 立即修 + push（不等 launch）
- [ ] 22:00 三件套
- [ ] 看 `docs/perf-snapshots.csv` 已经有 4 行了，看趋势是不是稳

---

## D-4 · 周二 2026-05-12

- [ ] 浏览今日 4 个 seed user 的 done run 产物（视频质量 / 字幕 / 时长）
  - 不只看完成时间，看「能不能直接发到抖音」的实用度
- [ ] **如果 perf P95 仍 > 10 min**：评估 deepseek 提到 draft chain 头位（见下方 #4 设计）
- [ ] 22:00 三件套

---

## D-3 · 周三 2026-05-13 · 数据 cutoff

- [ ] **Happy path 5 日聚合定结**：
  ```bash
  awk -F, 'NR>1' docs/perf-snapshots.csv | tail -5
  ```
  - 5 行的 P50 / P95 取中位
  - 中位 P50 < 7min AND P95 < 10min → ✅ 闸门关
  - 任一超 → 看 `## 降级 / 推迟发布的硬线`
- [ ] 把结果手动签字到 `LAUNCH_CHECKLIST.md` Happy path 那一项
- [ ] 22:00 三件套

---

## D-2 · 周四 2026-05-14 · 发布前 24 小时

- [ ] 走完 LAUNCH_CHECKLIST「发布前 24 小时 checklist」每一项
- [ ] `vercel deploy --prod`（确保 main = 部署版）
- [ ] `pnpm prod:watchdog --apply`（清任何残留 zombie）
- [ ] 浏览器手测 1 次完整 happy path（即使 perf 通过，端到端实测一次保险）
- [ ] 22:00 三件套

---

## D-1 · 周五 2026-05-15 · LAUNCH

**08:00**
- [ ] 起床先跑 `pnpm cap:watch`
- [ ] `curl https://ai-content-mvp.vercel.app/api/healthz` 看 200
- [ ] 微信群发出 launch 公告

**全天**
- [ ] 每 2 小时 `pnpm prod:today` 看新增 run
- [ ] 任何 ALERT / failed run → 立即按 `RUNBOOK.md` 处置
- [ ] Vercel logs `--follow` 在第二个屏开着

**22:00**
- [ ] 三件套（cap:watch / prod:today / perf:snapshot）
- [ ] 写 launch 当天复盘到 `LAUNCH_DAILY_NOTES.md`

---

## 阻塞 launch 的硬开关

任一为真就推迟（最迟 5/14 周四晚拍板）：

1. 5 日 P95 中位 > 12 min（重定红线 +20% 容忍）
2. 期间出现 watchdog 没自动恢复的 zombie run 持续 > 1 小时
3. 任一种子用户跑 3 次有 ≥ 1 次 LLM_FATAL 不归 deepseek fallback
4. 跨租户探针真的让 B 看到 A 的数据
5. CAC / PIPL 合规真的违规（不是文档没勾）
