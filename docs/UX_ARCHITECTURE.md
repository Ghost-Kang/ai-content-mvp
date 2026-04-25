# AI 内容营销工作室 — UX Architecture & Design Brief

**Version**: 1.0 | **Date**: 2026-04-17 | **Sprint**: 4-week MVP

---

## 1. Information Architecture

### Complete Site Map

```
AI 内容营销工作室
│
├── /dashboard                          # Home — default landing post-login
│
├── /create                             # Content Creation Hub
│   ├── /create/quick                   # Quick Create entry (DEFAULT)
│   │   ├── /create/quick/formula       # Step 1: Formula + Length selection
│   │   ├── /create/quick/input         # Step 2: Formula-specific input
│   │   └── /create/quick/result        # Step 3: Script + Storyboard + Channel adaptation
│   │
│   └── /create/strategy                # Strategy-First entry (OPT-IN)
│       ├── /create/strategy/audience   # Audience definition
│       ├── /create/strategy/positioning # Brand positioning inputs
│       ├── /create/strategy/formula    # Formula + Length selection (same component)
│       ├── /create/strategy/input      # Extended input with strategy context
│       └── /create/strategy/result     # Script result (same component as quick result)
│
├── /content                            # Content Library
│   ├── /content/drafts                 # All drafts
│   ├── /content/review                 # In-review queue
│   ├── /content/approved               # Approved content
│   └── /content/:id                    # Individual content item
│       ├── /content/:id/edit           # Edit mode
│       ├── /content/:id/review         # Review workspace
│       └── /content/:id/export         # Export options
│
├── /brand-voice                        # Brand Voice Configuration
│   ├── /brand-voice/setup              # Initial setup (deferred trigger)
│   ├── /brand-voice/examples           # Example content library
│   └── /brand-voice/profile            # Current voice profile + refinement
│
├── /intelligence                       # Topic Intelligence Module
│   ├── /intelligence/trends            # Trend signals dashboard
│   ├── /intelligence/topics            # Topic recommendations
│   └── /intelligence/analysis/:topic  # Individual topic deep-dive
│
├── /calendar                           # Content Calendar
│   └── /calendar/kanban                # Kanban view (default)
│
├── /review                             # Review Workspace Hub
│   ├── /review/solo/:id                # Solo review mode
│   └── /review/team/:id                # Team review mode
│
└── /settings                           # Settings
    ├── /settings/profile               # User profile
    ├── /settings/team                  # Team members (if team mode enabled)
    └── /settings/integrations          # Export integrations
```

### Primary Navigation Structure

The navigation distinguishes between frequently-used action surfaces (primary) and supporting infrastructure (secondary).

**Primary Navigation (persistent left sidebar, 240px fixed):**

```
[Logo / Product Name]        # Top of sidebar, links to /dashboard

--- PRIMARY ACTIONS ---
[+] 创建内容                  # Quick Create CTA — most prominent element
                              # Opens /create/quick/formula directly

--- MAIN SECTIONS ---
[ ] 工作台 Dashboard          # /dashboard
[ ] 内容库 Content Library    # /content (with Draft/Review/Approved counts as badges)
[ ] 日历 Calendar             # /calendar/kanban
[ ] 选题洞察 Topic Intel       # /intelligence/trends

--- SECONDARY ---
[ ] 品牌音调 Brand Voice      # /brand-voice/profile
                              # Shows setup prompt if not configured

--- BOTTOM ---
[ ] 设置 Settings             # /settings
[ ] 团队模式 Team Mode         # Toggle, only visible if team member exists
[User Avatar + Name]
```

**Secondary Navigation (contextual, appears within section):**

- Within /content: tab strip — 全部 / 草稿 / 审核中 / 已发布
- Within /intelligence: tab strip — 趋势信号 / 选题推荐 / 分析报告
- Within /review: mode switch — 独立审核 / 团队审核

### Entry Point Architecture: Quick Create vs. Strategy-First Coexistence

The two creation modes must not create decision paralysis at the entry point. Resolution:

**Entry Point Logic:**

```
Primary CTA everywhere: "创建内容" → lands on /create/quick/formula
                         (no mode selection required to get started)

Strategy-First access point: one of two ways —
  1. On /create/quick/formula, secondary text link below primary action:
     "需要更系统的创作流程？→ 策略优先模式"
  2. From /dashboard, a secondary card "策略规划" with subtitle
     "定义受众和定位后再生成" links to /create/strategy/audience

Mental model enforced:
  Quick Create = "I have a topic, let's make content"
  Strategy-First = "I need to think before I create"

These are never presented as equivalent options in a binary toggle.
Quick Create is the DEFAULT path. Strategy-First requires a deliberate
navigation choice, communicating its opt-in nature without friction.
```

### Topic Intelligence Placement in IA

Topic Intelligence is a **standalone section** accessible from primary nav, NOT embedded within the Quick Create flow. Rationale: it is a pre-creation research tool used by persona 王磊 on a different cadence than creation itself. However, a bridge action exists.

**Bridge mechanism:** On /intelligence/analysis/:topic, a persistent action button "用这个选题创作" loads the selected topic into /create/quick/input with the topic field pre-populated and a "来自选题洞察" badge visible, preserving the research context.

---

## 2. Core User Flows

### Flow 1: Quick Create → 60-second Douyin Script → Export

This flow is designed to be completable in under 5 minutes for a returning user.

```
Step 1 — [/create/quick/formula]
  User arrives via "创建内容" CTA from any page.
  Screen shows: Formula selection (公式一 vs 公式二) + Length selection (60秒 vs 长篇).
  User selects 公式一 (挑衅断言型) + 60秒模式.
  Action: Click "下一步" button.

Step 2 — [/create/quick/input]
  Screen adapts to 公式一 + 60秒 mode.
  Fields shown:
    - 核心断言 Core Assertion (text input, 50 char limit)
    - 目标受众 Target Audience (text input, 30 char limit)
    - 反直觉角度 Counter-intuitive Angle (text input, 60 char limit, optional)
  Character budget preview panel shows live: 190-210 char total target.
  Input time target: under 2 minutes.
  Action: Click "生成脚本" button.

Step 3 — [/create/quick/result] — Loading state
  Skeleton loaders appear for script segments.
  Reasoning chain streams in first (collapsed by default, expandable):
    "基于公式一结构 → 识别断言强度 → 压制机器感词汇 → 生成..."
  Full generation typically completes in 8-15 seconds.

Step 4 — [/create/quick/result] — Populated state
  Left panel: Douyin script segmented by 5 structural blocks
    (Hook 10s/35chars, Core 12s/45chars, Case 23s/80chars,
     Punchline 8s/30chars, Comment bait 7s/25chars).
  Each block shows character count vs. target count.
  Below script: 15-18 frame storyboard brief (thumbnail placeholder + frame note).
  Right panel: Xiaohongshu adaptation with diff annotations
    (changed phrases highlighted in amber, hover to see "改动原因").
  Action: Primary — "导出"; Secondary — "重新生成" / "调整输入" / "添加到日历".
  If brand voice not yet configured: dismissible banner appears
    "为内容赋予你的品牌音调 →" (triggers Flow 2).

Step 5 — Export Modal
  Options: 纯文本 .txt / Markdown .md / 分镜表格 .xlsx
  Douyin script and Xiaohongshu post export separately or together.
  One-click copy-to-clipboard also available per section.
  Action: Select format → "下载" or "复制".
  Flow ends. User returns to /dashboard or /content.
```

### Flow 2: Brand Voice Setup (Post-First-Draft, Deferred Flow)

Triggered from the dismissible banner on the result screen or from /brand-voice/setup directly.

```
Step 1 — Trigger
  User sees banner on result screen: "为这篇内容赋予你的品牌音调"
  Clicks "配置音调" — opens /brand-voice/setup in same tab
  (result content auto-saved as draft before navigation).

Step 2 — [/brand-voice/setup] — Example Input
  Screen header: "粘贴你写得最好的一段内容"
  Subtitle: "不需要解释，AI 会自己分析你的风格"
  Single large textarea (full-width, min-height 200px):
    "粘贴一篇以往的文案、脚本或帖子..."
  Below: optional second textarea "再来一段（可选，帮助 AI 更准确）"
  Character count for each field.
  Action: "分析我的风格" button (disabled until primary field has 100+ chars).

Step 3 — [/brand-voice/setup] — Analysis in progress
  Progress indicator with message: "正在识别你的风格特征..."
  Three analysis dimensions shown as loading:
    语气 Tone | 词汇偏好 Vocabulary | 句式结构 Sentence structure

Step 4 — [/brand-voice/setup] — Analysis Result
  Three dimension cards shown with findings:
    语气: e.g. "直接、有权威感、轻度幽默"
    词汇偏好: e.g. "避免行话、倾向具体案例、数字佐证"
    句式: e.g. "短句为主、段落 2-3 行、强收尾"
  Each card has a "修改" text link for manual override.
  Below analysis: Before/After comparison
    Left: Original AI output snippet (from the draft that triggered this flow)
    Right: Same snippet rewritten with voice profile applied
    Label: "你的风格版本" vs "通用 AI 版本"
  Action: Primary — "保存并应用到当前内容"
           Secondary — "保存（不重新生成）"/ "重新分析"

Step 5 — Confirmation
  Toast: "品牌音调已保存，正在为你的内容重新润色..."
  If "保存并应用": returns to /content/:id/edit with refreshed draft.
  Brand voice profile now active for all future generation.
  /brand-voice/profile shows current profile with option to add more examples.
```

### Flow 3: Topic Intelligence → Select Topic → Generate Content

Designed for 王磊's research-to-creation workflow.

```
Step 1 — [/intelligence/trends]
  User navigates to 选题洞察 from sidebar.
  Screen shows trend signal cards (refreshed weekly or on-demand).
  Filter bar: 行业 Industry selector + 平台 Platform toggle (抖音/小红书/全部).
  Each trend card shows: trend name, signal strength indicator,
    estimated content saturation level (low/medium/high),
    and primary emotion trigger tag (好奇 / 认同 / 焦虑 / 共鸣).
  Action: Click any trend card to see topic recommendations for that trend.
         Or click tab "选题推荐" for curated list.

Step 2 — [/intelligence/topics]
  Topic recommendation list: ranked cards.
  Each card: topic title, estimated engagement angle,
    emotion trigger breakdown (horizontal bar: % 好奇 / % 共鸣 / % 焦虑),
    "相似内容数量" (saturation indicator), suggested formula tag (公式一/公式二).
  User clicks a topic card to expand.

Step 3 — [/intelligence/analysis/:topic]
  Full topic analysis:
    Top section: Topic summary, why this topic is timely.
    Emotion trigger breakdown: stacked bar showing trigger distribution,
      with annotation: "68% 读者因'认同感'停下来看"
    Example angles: 3 suggested content angles for this topic.
    Platform performance estimate: Douyin vs. Xiaohongshu suitability score.
  Action: Primary — "用这个选题创作" CTA button (prominent, bottom of panel).
          Secondary — "保存到选题库" (saves to user's topic bookmarks).

Step 4 — [/create/quick/formula] — Pre-loaded
  Clicking "用这个选题创作" opens /create/quick/formula.
  Topic context badge appears at top: "选题来源：选题洞察 — [topic name]"
  Suggested formula (from step 2 recommendation) is pre-selected but changeable.
  User confirms formula + length and proceeds.

Step 5 — [/create/quick/input] — Pre-populated
  核心断言 or 主题词 field pre-populated with topic name.
  "来自选题洞察" badge on the field.
  User fills remaining fields and generates.
  Flow continues as Flow 1 from Step 3.
```

### Flow 4: Team Review → Approve → Export

Applies when content is in Team mode review state.

```
Step 1 — Content Submitted for Review
  Author action (from /create/quick/result or /content/:id/edit):
    Clicks "提交审核" → modal: select reviewer from team list → confirm.
  Content status transitions: Draft → In Review.
  Reviewer receives in-app notification badge on sidebar.
  (No email notification in MVP — in-app only.)

Step 2 — Reviewer Opens Review Queue
  Reviewer sees badge count on "内容库" nav item.
  Navigates to /content/review — list of items pending their review.
  Card shows: title, author, channel, formula, submitted time, deadline if set.
  Reviewer clicks item.

Step 3 — [/review/team/:id] — Review Workspace
  Layout: full-width review surface, no sidebar (focused mode).
  Top bar: "团队审核模式" label, content title, author name, status pill "审核中".
  Left panel (60% width): full content view
    — script with structural segments labeled,
    — storyboard frame list below,
    — channel adaptation (Douyin + Xiaohongshu) in tab toggle.
  Right panel (40% width): review action panel
    — "审核意见" textarea for comments (required before rejection).
    — Inline annotation: user can highlight text in left panel,
      right panel shows corresponding comment thread.
    — State transition buttons at bottom of right panel.

Step 4 — Review Decision
  Option A — Request Changes:
    Reviewer highlights specific text → adds comment → clicks "请求修改".
    Status transitions to "修改中", author notified.
    Author edits, re-submits (re-enters Step 1).

  Option B — Approve:
    Reviewer clicks "批准" — confirmation modal appears:
      "确认批准此内容？批准后作者可导出发布。"
    Confirms → status transitions to "已批准".
    Author receives notification: "内容已获批准".
    Reviewer returns to /content/review queue.

Step 5 — Export (Author, post-approval)
  Author sees status change in /content (or via notification).
  Opens /content/:id — status shows "已批准" badge.
  "导出" button is now the only prominent CTA (previously grayed out
    or showing "等待审核" in pending state).
  Export modal (same as Flow 1 Step 5) — author selects format and downloads.
  Author optionally marks as "已发布" in /calendar or via kanban card action.
  Status transitions: Approved → Published.
```

---

## 3. Wireframe Specifications

### Screen 1: Dashboard / Home

**Route**: `/dashboard`

**Layout**: Left sidebar 240px fixed + main content area flex (remaining width) + no right panel. Main content uses 12-column grid at 1280px, 8-column at 768px.

**UI Elements (top to bottom, left to right):**

```
[Persistent Left Sidebar — 240px]
  Logo/product name — top, 20px padding
  "创建内容" CTA button — full sidebar width, high contrast, below logo
  Nav items (as specified in IA section)

[Main Content Area — flex remaining]

  [Top Bar — 48px height, full width]
    Left: Page title "工作台"
    Right: Notification bell icon (with badge count), user avatar

  [Row 1 — Metric Strip — 80px height, 4 equal columns]
    Card 1: "本周创建" — count number (large) + "篇内容" label
    Card 2: "审核中" — count number + "待处理" label (amber accent if > 0)
    Card 3: "本月已发布" — count number + label
    Card 4: "品牌音调" — "已配置" (green) or "未配置" (amber, links to setup)
    Each card: white background, 1px border, 12px border-radius, 16px padding

  [Row 2 — Two columns, 8fr + 4fr gap]

    [Left column — 8fr]
      Section header: "最近内容" + text link "查看全部 →"
      Content list: 5 most recent items, each row:
        — Status pill (Draft/审核中/已批准/已发布) — leftmost
        — Content title (truncated to 1 line) — flex-grow
        — Channel tag (抖音/小红书) — right
        — Formula tag (公式一/公式二) — right
        — Relative timestamp ("2小时前") — rightmost
        — Row is clickable, hovers to show subtle bg shift
      Empty state: Illustrated placeholder, text "还没有内容", 
        prominent "创建第一篇" button

    [Right column — 4fr]
      Section: "日历预览" — this week in compact form
        Days of week header (Mon–Sun)
        Each day cell: up to 2 content item chips (title truncated)
        "查看完整日历 →" link at bottom
      Section: "选题洞察提示" (below calendar preview)
        Single highlighted topic recommendation card:
        Topic title, emotion trigger tag, "查看分析 →" link

  [Row 3 — Full width, if any items in review]
    Banner: "你有 N 项内容等待审核" — amber background, link "前往审核"
    (Hidden if no items in review)
```

**Primary action**: "创建内容" button in sidebar — always visible.

**Secondary actions**: View all content, view full calendar, check review queue.

**Empty state**: On first login, Row 2 left shows empty state with "创建第一篇" CTA. Row 2 right shows a demo/placeholder calendar. Metric strip shows all zeros.

**Error/Loading state**: Metric strip cards show skeleton loaders on data fetch. If data fails, cards show "--" with retry icon.

**Mobile considerations**: Desktop-primary screen. On mobile (< 768px), sidebar collapses to bottom tab bar (5 icons). Metric strip becomes 2x2 grid. Left/right columns stack vertically. This screen is not mobile-critical but must be functional.

---

### Screen 2: Quick Create — Formula + Length Selection

**Route**: `/create/quick/formula`

**Layout**: Full-width centered content, max-width 720px, vertically centered in viewport. No sidebar visible (creation mode hides sidebar — full focus mode). Top bar only shows "← 退出创建" and progress indicator.

**UI Elements:**

```
[Top Bar — 48px]
  Left: "← 退出" text link (returns to /dashboard)
  Center: Step indicator — "1 / 3" with horizontal progress bar (33% filled)
  Right: [empty in Quick Create — no distractions]

[Content Area — centered, max-width 720px, 48px top padding]

  [Header Block]
    Small label: "快速创建" (uppercase, muted, 12px)
    H1: "选择内容公式和时长"
    Subtitle: "不同公式适合不同的表达目的" (muted text, 16px)

  [Formula Selection — two cards, side by side on desktop, stacked on mobile]
    Card A — 公式一 挑衅断言型
      Top: Formula name (18px bold) + "公式一" label tag
      Body: 2-sentence description of the formula's rhetorical approach
        e.g. "先抛出一个违反常识的判断，再用逻辑和案例证明它。
               适合建立权威感和话题性。"
      Bottom: Example hook phrase (italicized, 14px, muted):
        e.g. '"你以为 SEO 还有用？恰恰相反..."'
      Selection state: bordered card, 2px solid, brand primary color on select
      Card dimensions: equal width, min-height 160px, 20px padding

    Card B — 公式二 日常现象洞察型
      Same structure as Card A.
      Description: "从一个大家都熟悉的日常场景切入，
               引出一个意想不到的商业洞察。
               适合建立亲近感和共鸣。"
      Example hook: '"你有没有发现，最近打开朋友圈..."'

  [Length Selection — appears after formula selected, or shown simultaneously]
    Two toggle-style option buttons, horizontal layout:
      Button A: "60 秒短视频"
        Sub-label: "190-210 字 · 15-18 帧分镜"
      Button B: "长篇视频"
        Sub-label: "深度内容 · 完整叙事"
    Toggle uses pill/tab style, not cards (less visual weight than formula).

  [Context note — below selections, 14px muted text]
    "选择后可在输入页调整。不确定？从公式一开始。"

  [Action Bar — bottom of content area]
    Primary: "下一步：填写内容 →" button (full-width on mobile, 280px on desktop)
    Disabled state with tooltip until both formula AND length are selected.

  [Strategy-First Escape Hatch — below action bar]
    Small text: "需要先规划受众和定位？" + link "切换到策略优先模式"
    This should be visually subordinate — 12px, muted color, no button treatment.
```

**Primary action**: Select formula + length, advance to input.

**Secondary actions**: Switch to Strategy-First mode.

**Empty state**: Page always has content (no data dependency). Both cards start unselected.

**Error/Loading state**: None — static selection screen. No async calls.

**Mobile considerations**: Mobile-critical (users may create on mobile). Cards stack vertically. Full-width buttons. Formula cards become more compact (reduce example text to 1 line). This screen must be fully functional on mobile.

---

### Screen 3: Quick Create — Input (Formula-Specific)

**Route**: `/create/quick/input`

**Layout**: Full-width centered content, max-width 680px, focus mode (no sidebar). Same top bar pattern as Screen 2 (step 2/3).

This specification covers the 公式一 + 60秒 variant as primary. Other variants adjust field labels and hints only.

**UI Elements:**

```
[Top Bar]
  Left: "← 返回选择" text link
  Center: Step indicator "2 / 3" (66% filled)
  Right: Formula + Length chips as reminder: [公式一] [60秒]
    (Clicking chips allows changing selection)

[Content Area — max-width 680px, centered]

  [Header Block]
    Label: "快速创建 · 公式一挑衅断言型 · 60秒"
    H1: "告诉 AI 你的核心观点"
    Subtitle: "填写越具体，内容越接近你的真实想法" (muted, 16px)

  [Field 1 — 核心断言 Core Assertion]
    Label: "核心断言" (14px, medium weight)
    Hint: "你想颠覆的认知，或你要证明的反直觉判断"
    Input: Single-line text, 50 char limit
    Character counter: live, "12/50"
    Placeholder: "例：做内容不需要创意，只需要公式"
    Error: if submitted empty — "请输入核心断言"

  [Field 2 — 目标受众 Target Audience]
    Label: "目标受众"
    Hint: "谁会因为这个断言停下来？"
    Input: Single-line text, 40 char limit
    Placeholder: "例：B2B SaaS 创始人 / 做副业的上班族"
    Optional tag: "可选" shown inline right of label

  [Field 3 — 反直觉角度 Counter-intuitive angle]
    Label: "反直觉切角（可选）"
    Hint: "如果你有一个独特的论证角度，写在这里"
    Input: Single-line text, 60 char limit
    Placeholder: "例：不是能力问题，是分发逻辑问题"
    Optional, clearly marked.

  [Character Budget Preview — below fields]
    Panel: light background, 12px border-radius, 16px padding
    Title: "60秒脚本预算" (14px, muted)
    Five rows showing structure + char allocation:
      Hook (钩子)         10秒  35字   [██░░░░] 预留
      核心论点            12秒  45字   [████░░] 预留
      单案例证明          23秒  80字   [████████░░] 预留
      金句结尾            8秒   30字   [███░░░] 预留
      评论引导            7秒   25字   [██░░░] 预留
    Total: 190-210字 (shown prominently)
    This panel is read-only, informational. Collapsed by default on mobile.
    Toggle: "了解脚本结构 ▾" on mobile.

  [Brand Voice Status — below budget panel]
    If configured: subtle badge "将使用品牌音调: [profile name]"
    If not configured: dismissible note "AI 将使用通用风格 · 
      完成后可配置品牌音调" (no action required here)

  [Action Bar]
    Primary: "生成脚本" button — full-width on mobile, centered 280px on desktop
    Secondary: "← 修改选择" text link

  [Estimated time note — below action bar]
    "生成约需 10-20 秒" (12px muted)
```

**Primary action**: "生成脚本" — the entire screen leads to this.

**Secondary actions**: Modify formula/length selection.

**Empty state**: Fields start blank. Budget preview panel always visible as guidance.

**Error/Loading state**: Field validation on submit — highlight empty required fields. After click, transition to Screen 4 loading state (handled in Screen 4 spec).

**Mobile considerations**: Mobile-critical. Character budget preview collapses behind a toggle to save vertical space. Fields are full-width. Soft keyboard should not cover the action button — ensure sticky bottom action bar with padding on iOS.

---

### Screen 4: Script Generation Result + Storyboard Brief

**Route**: `/create/quick/result`

**Layout**: Split-pane on desktop — left panel 58% width, right panel 42% width. Both panels scroll independently. Top bar persists. On mobile, panels stack with tabs.

**UI Elements:**

```
[Top Bar — 56px]
  Left: Content title (auto-generated, editable inline — click to rename)
  Center: Status pill "草稿" (muted)
  Right: "添加到日历" icon-button | "重新生成" text button | "导出" primary button

[Loading State — shown during generation, ~8-15 seconds]
  Both panels show skeleton loaders.
  Thin progress strip at top of page (indeterminate).
  Reasoning chain panel appears first, above left panel content:
    Collapsed section: "AI 思考过程 ▾" (expandable)
    Inside: streaming text of reasoning chain, monospace 13px, muted bg
    Default: collapsed. User can expand to review.
  Message below skeleton: "正在基于公式一生成脚本..." (14px, centered)

[LEFT PANEL — 58%]

  [Panel Header]
    "抖音脚本" label (16px semibold) + platform icon
    Action icons: "复制全文" icon | "编辑" icon (opens edit overlay)

  [Script Segments — segmented display]
    Each of 5 structural blocks is a distinct card:

    Block structure:
      Top-left: Segment label (e.g. "Hook · 钩子")
      Top-right: Time allocation (10秒) + Char count vs target (32/35字)
                 — green if within range, amber if over
      Body: Script text (16px, line-height 1.6)
      Bottom: Edit icon (pencil, appears on hover)

    Block 1 — Hook 钩子 (10秒 · 35字 target)
    Block 2 — 核心论点 (12秒 · 45字 target)
    Block 3 — 单案例证明 (23秒 · 80字 target)
    Block 4 — 金句结尾 (8秒 · 30字 target)
    Block 5 — 评论引导 (7秒 · 25字 target)

    Footer: Total character count badge: "207/190-210字 ✓"
            (amber warning if outside range)

  [Storyboard Brief — below script segments]
    Section header: "分镜概要" + "15帧" badge
    15-18 frame rows, each row:
      Left: Frame number + time range ("帧01 · 0-2秒")
      Center: Frame description (auto-generated, 1-2 lines)
      Right: Visual direction note (e.g. "中景 · 对话机位")
    Compact table-style layout, 12px text, alternating row background.

  [Brand Voice Notice — if not configured]
    Amber dismissible banner inside left panel:
      "这是通用风格输出。配置品牌音调后可重新生成更像你的内容。"
      CTA: "配置品牌音调 →" (triggers Flow 2)

[RIGHT PANEL — 42%]

  [Panel Header]
    Platform tabs: [抖音脚本] [小红书图文]
    "切换频道适配" label

  [Diff Annotation View — default: 小红书 tab]
    Header note: "基于抖音脚本自动适配" (12px muted)

    Content displayed with diff annotations:
      Changed phrases highlighted in amber underline.
      Hover/click on amber text: tooltip shows:
        "改动原因: [reason text]"
        e.g. "小红书读者偏好书面感，'你以为'改为'很多人认为'"
      Deleted content shown with strikethrough (only on desktop).
      Added content shown with muted green background.

    Annotation summary at bottom:
      "本次适配共 N 处改动" with toggle to show/hide all diff reasons.

  [Right Panel Action]
    "复制小红书版本" button (secondary style, full panel width)

[Bottom Action Bar — sticky, full width]
  Left: "← 修改输入" text link
  Right: "提交审核" text button + "导出" primary button
```

**Primary action**: Export (or submit for review in team context).

**Secondary actions**: Edit script inline, regenerate, copy individual sections, toggle diff view.

**Empty state**: N/A — screen only appears after generation.

**Error/Loading state**: If generation fails — error state replaces skeleton with: "生成失败，请重试" + "重新生成" button + "修改输入" link. Do not lose input data on failure.

**Mobile considerations**: Panels stack vertically. Tab toggle between "抖音脚本" and "小红书图文" and "分镜". Diff annotations collapse to a "查看改动说明" toggle to avoid overwhelming mobile view. Export button is sticky at bottom.

---

### Screen 5: Brand Voice Setup (Deferred Flow)

**Route**: `/brand-voice/setup`

**Layout**: Centered content, max-width 760px, no sidebar (focus mode). This is a setup wizard — single column, vertically progressing. Full-page.

**UI Elements:**

```
[Top Bar — 48px]
  Left: "← 返回内容" (returns to the draft that triggered this)
  Center: "品牌音调配置" title
  Right: "跳过（暂不配置）" text link

[Content Area — max-width 760px, centered]

  [STATE A — Example Input]

    [Header]
      H1: "粘贴一段你自己写的内容"
      Subtitle: "AI 将通过分析你的真实内容来学习你的风格，
                  而不是让你填写风格问卷"
      Design note: This framing matters — it must feel like the AI is
                   learning from you, not the other way around.

    [Primary Example Textarea]
      Label: "你写过最好的一段文案或脚本"
      Textarea: full-width, min-height 200px, 16px font, generous padding
      Placeholder: "把你认为最能代表你风格的内容粘贴到这里...
                    可以是抖音脚本、小红书帖子、公众号段落或任何你写的内容"
      Character counter: live, "0字 · 建议100字以上"
      Min threshold indicator: at 100 chars, counter turns green.

    [Secondary Example Textarea — optional]
      Label: "再来一段（可选）"
      Expand toggle: "＋ 添加第二段内容" (collapsed by default)
      When expanded: same textarea component, smaller height (120px min)

    [Helper Note]
      14px muted text: "你的内容不会被用于训练模型。仅用于本次风格分析。"

    [Action]
      Primary: "分析我的风格" — disabled until 100+ chars in primary field
      Character threshold nudge: below 100 chars, button shows
        "再输入 N 字即可分析"

  [STATE B — Analysis in Progress]
    Animated indicator (3 rotating dots or subtle pulsing bar)
    Three dimension rows appearing sequentially with animation:
      [语气 Tone]         → 分析中...
      [词汇偏好 Vocabulary] → 分析中...
      [句式结构 Structure]  → 分析中...
    Estimated time: "约需 5 秒"

  [STATE C — Analysis Result + Before/After]

    [Voice Profile Cards — 3 cards, horizontal row on desktop, stacked on mobile]
      Card: 语气
        Result: "直接、略带挑衅、有主张"
        Tag chips: one per identified trait
        "修改" text link (opens inline edit: replace with free-text override)

      Card: 词汇偏好
        Result: "具体案例优先、避免缩写和黑话、数字佐证"
        Tag chips, "修改" link

      Card: 句式结构
        Result: "短句主导、段落不超过3行、结尾收力"
        Tag chips, "修改" link

    [Before/After Comparison — below cards]
      Section header: "应用前后对比"
      Sub-label: "同一段 AI 初稿，加入你的风格后的变化"
      Two-column layout:
        Left column header: "通用 AI 输出" (muted badge)
        Right column header: "你的风格版本" (brand accent badge)
        Both columns: same content block, right column shows styled version.
        Changed phrases in right column: highlighted in subtle brand color
        (not amber — amber is reserved for diff annotations in Screen 4)

    [Action Bar]
      Primary: "保存并应用到当前内容"
      Secondary: "仅保存（不重新生成当前内容）"
      Tertiary text link: "重新分析（上传新样本）"

    [Footer note]
      "你可以随时在「品牌音调」设置中更新或添加样本。"
```

**Primary action**: Save voice profile and apply to current draft.

**Secondary actions**: Save without applying, re-analyze, skip.

**Empty state**: State A is always shown initially.

**Error/Loading state**: If analysis fails — "分析失败，请检查输入内容后重试" with retry button. Preserve textarea content.

**Mobile considerations**: Mobile-important (founders may configure this after creating content on mobile). Textarea must work well on mobile with soft keyboard. Before/After comparison stacks vertically on mobile with labels clearly distinguishing the two versions.

---

### Screen 6: Review Workspace — Solo Mode

**Route**: `/review/solo/:id`

**Layout**: Full-screen focus mode. Left content panel 64% width, right review action panel 36% width. Both scroll independently. No sidebar. Minimal top bar.

**UI Elements:**

```
[Top Bar — 56px, full width, subtle border-bottom]
  Left: Content title (read-only) + "独立审核模式" pill
  Center: Author name + submitted timestamp
  Right: "退出审核" text link

[LEFT PANEL — 64%]

  [Panel Header]
    "内容预览" label
    Platform tabs: [抖音脚本] [小红书图文] [分镜概要]

  [Script View — read-only, same segmented layout as Screen 4 left panel]
    All 5 structural blocks visible with labels, char counts.
    Text is selectable (for annotation/copy).
    No edit controls visible — this is a review surface, not edit.
    Inline annotation markers: if reviewer highlights text, 
      a comment icon appears (for future team mode — in solo mode,
      highlights are for personal reference, not shared).

  [Channel Adaptation View — visible in 小红书 tab]
    Same diff annotation view as Screen 4 right panel.
    Read-only, shows what changed and why.

[RIGHT PANEL — 36%]

  [COGNITIVE CHECKLIST — top section of right panel]
    This is the critical Solo Mode differentiator.
    Section header: "发布前自检" (16px semibold)
    Subtitle: "确认每一项后方可批准" (14px muted)

    Checklist items (5-7 items, checkboxes):
      □ 钩子在前3秒能否让人停下来？
      □ 核心断言是否清晰、不模糊？
      □ 案例是否具体、有说服力？
      □ 金句是否值得被截图转发？
      □ 评论引导问题是否自然、不像广告？
      □ 整体语气是否符合品牌定位？
      □ 小红书适配版本是否读起来自然？

    Checklist item behavior:
      Each checkbox must be explicitly checked.
      Cannot partially check — must check all to enable approve action.
      Unchecked items: normal state. Checked: light green fill.
      If user tries to approve without completing: 
        Checklist section shakes/highlights, tooltip: "请完成所有自检项"

  [REVIEW NOTES — below checklist]
    Label: "个人备注（可选）"
    Textarea: compact, 80px height
    Placeholder: "记录你的修改思路或留存反馈..."
    Saved locally to this content item.

  [ACTION SECTION — bottom of right panel, sticky on scroll]
    Divider line above actions.

    "批准发布" button:
      — Disabled state: grayed, "完成自检后可批准" tooltip, until checklist complete
      — Enabled state: solid, brand primary color, full panel width
      — Click: confirmation modal — "确认批准此内容并标记为「已批准」？"
        Confirm → status transitions, return to /content or /dashboard

    "需要修改" text button:
      — Below the approve button, secondary styling
      — Click: opens edit mode /content/:id/edit
      — Does not require checklist completion

    "暂存（稍后继续）" text link:
      — Saves review progress (checklist state) and returns to content list

[EMPTY/INITIAL STATE]
  Right panel shows checklist with all items unchecked.
  Left panel shows content fully loaded.
  No action is possible until checklist is engaged.
```

**Primary action**: Complete checklist + approve (distinct two-step gesture by design).

**Secondary actions**: Edit content, save progress, exit review.

**Empty state**: N/A — screen requires content to exist.

**Error/Loading state**: Content load failure shows: "内容加载失败" with retry. Approval failure (API error): toast "批准操作失败，请重试".

**Mobile considerations**: Desktop-primary. On mobile, panels stack: checklist first (above fold), content below. The two-step gesture (complete checklist then tap approve) must still be enforced. Checklist may be in an expandable drawer on mobile.

---

### Screen 7: Topic Intelligence

**Route**: `/intelligence/trends` (default), `/intelligence/topics`, `/intelligence/analysis/:topic`

**Layout**: Left sidebar 240px (standard persistent nav) + main content area flex. Within main content: full-width sections, no secondary right panel on list views. Analysis view (/analysis/:topic) opens as a right-side drawer (400px) over the topic list.

**UI Elements:**

```
[Persistent left sidebar — standard]

[Main Content Area]

  [Top Section — 56px]
    H1: "选题洞察"
    Right: "上次更新: 今天 09:30" (data freshness indicator) + 
           "刷新数据" icon-button (with cooldown: refresh max once per hour)

  [Filter Bar — horizontal, below header]
    Left: Industry filter dropdown — "全部行业 ▾"
            Options: B2B SaaS / 个人IP / 教育 / 电商 / 其他
    Center: Platform toggle — [全平台] [抖音] [小红书]
    Right: Sort — "按热度排序 ▾" / "按饱和度排序"

  [Tab Navigation]
    [趋势信号] [选题推荐] [我的选题库]

  [TAB: 趋势信号]

    Trend signal cards in a 3-column grid (desktop), 1-column (mobile):
      Each card:
        Top: Trend name (16px semibold, 2-line max)
        Trend signal strength: horizontal bar, 3 levels (弱/中/强)
        Saturation: pill badge — "低竞争" (green) / "中等" (amber) / "高饱和" (red)
        Primary emotion trigger: single tag — 好奇 / 认同 / 焦虑 / 共鸣
        Bottom: "N 个相关选题 →" text link
        Card click: expands to topic recommendation list within this trend

  [TAB: 选题推荐]

    Ranked list of topic cards, full width:
      Each card row:
        Left: Rank number (large, muted, 32px)
        Center:
          Topic title (16px semibold)
          Emotion trigger bar: horizontal stacked bar showing %
            [■■■□□] 好奇 45% | [■■□□□] 共鸣 30% | [■□□□□] 焦虑 25%
          Suggested formula tag (公式一 or 公式二) + reasoning (14px muted)
          "相似内容量" indicator (saturation)
        Right:
          "查看分析" text link
          "用这个选题创作 →" CTA button (secondary style)

  [ANALYSIS DRAWER — /intelligence/analysis/:topic]
    Opens as right-side panel (400px), slides in over topic list.
    Main list dims but stays visible.

    Drawer content (top to bottom):
      Close button "×" top-right
      Topic title (H2)
      "为什么现在是好时机" summary paragraph (AI-generated, 3-4 sentences)

      Emotion trigger breakdown:
        Section header: "受众情绪触发分析"
        Three trigger rows with bar visualization:
          好奇 [████████░░] 68%  "因反常识判断停留"
          认同 [█████░░░░░] 42%  "因日常经历共鸣"
          焦虑 [███░░░░░░░] 28%  "因落差感产生行动"
        Annotation below each: explains why this emotion is triggered.

      Content angles:
        Section header: "建议创作角度"
        3 angle cards (compact):
          Angle name + 1-sentence description
          Formula match tag

      Platform suitability:
        Two metric cells side by side:
          抖音: score + "高话题传播性"
          小红书: score + "中等种草转化"

      [Action bar — sticky bottom of drawer]
        Primary: "用这个选题创作" (full drawer width, prominent)
        Secondary: "保存到选题库" text link
```

**Primary action**: "用这个选题创作" — from drawer to creation flow.

**Secondary actions**: Save topic, filter by industry/platform, refresh data.

**Empty state (选题推荐 tab)**: "暂无推荐选题，请稍后刷新或切换行业筛选" with refresh button.

**Error/Loading state**: Skeleton cards during initial load. If data fetch fails: "数据加载失败" with retry. Data staleness warning if > 24 hours since last refresh.

**Mobile considerations**: Desktop-preferred but mobile-functional. Analysis drawer becomes full-screen overlay on mobile. Emotion trigger bars remain as primary visual element — do not reduce to text-only on mobile.

---

### Screen 8: Content Calendar

**Route**: `/calendar/kanban`

**Layout**: Left sidebar 240px (standard persistent nav) + main content area flex. Full-width kanban board within main content. No secondary panel.

**UI Elements:**

```
[Top Bar — 56px]
  Left: H1 "内容日历"
  Right: View toggle [看板] [列表] (MVP: kanban only, list greyed as "即将推出")
         "创建内容" button (primary CTA, always visible)

[Kanban Board — full width, horizontal scroll on overflow]

  4 Columns, equal width (flex: 1 1 0, min-width: 240px):

    Column 1: "草稿 Draft"
      Column header: "草稿" + count badge
      Background: neutral (no status color on column — status is on cards)
      "＋ 新建" button below header (shortcut to Quick Create)

    Column 2: "审核中 In Review"
      Column header: "审核中" + count badge (amber if > 0)
      Background: no special background (clean)

    Column 3: "已批准 Approved"
      Column header: "已批准" + count badge

    Column 4: "已发布 Published"
      Column header: "已发布" + count badge (muted — historical)

  [Content Cards — within columns]
    Card dimensions: full column width, min-height 100px, 12px padding
    Card design:
      Top row: Status dot (matches column, small) + Channel tag (抖音/小红书)
      Title: 2-line max, 14px semibold
      Formula tag: 公式一 / 公式二 (small pill, muted)
      Due date / publish date: "计划: 4月20日" — amber if past due, green if today
      Bottom row: Author avatar + "→ 查看" icon link

    Card hover: subtle elevation increase, "查看" link appears.
    Card click: navigate to /content/:id

    Card drag-and-drop: cards can be dragged between columns.
      Drag state: card shows drag cursor, slight opacity reduction.
      Drop zone: column highlights with dashed border when card is dragged over.
      State machine: drag from 草稿 → 审核中 triggers review workflow prompt.
                     Drag from 审核中 → 草稿 shows confirmation: "确认退回草稿？"

  [Date Context — above kanban or as column sub-section]
    MVP simplification: no date lanes within columns.
    Due date is visible on cards. Full date-lane kanban is P2.

[Empty State — per column]
  草稿 column empty: "还没有草稿 · 点击「＋ 新建」开始创作"
  审核中 empty: "暂无内容待审核" (neutral, no action)
  已批准 empty: "暂无已批准内容" (neutral)
  已发布 empty: "暂无已发布内容" (neutral, historical)

[Empty State — full board (new user)]
  All columns empty, centered message in board area:
  "从这里掌控你的内容节奏" + "创建第一篇内容 →" CTA
```

**Primary action**: View and manage content status progression.

**Secondary actions**: Create new content, drag cards between stages, open individual content items.

**Empty state**: Per-column and full-board states specified above.

**Error/Loading state**: Column cards use skeleton loaders on initial fetch. Drag-and-drop failure: card snaps back to original position, toast: "状态更新失败，请重试".

**Mobile considerations**: Desktop-primary (kanban is inherently wide). On mobile: columns become horizontal scroll tabs (tap to switch column), or vertical stack with collapsible column headers. Drag-and-drop is replaced with a "移动到..." action menu on card tap-hold. This screen is mobile-accessible but not mobile-optimized.

---

## 4. Navigation & State Design

### Always-Visible Persistent Elements

```
1. Left sidebar (240px fixed):
   — Primary "创建内容" CTA button
   — All main nav items with live badge counts
   — User avatar and name at bottom
   — Team mode toggle (if team exists)

2. Top bar within each page (48-56px):
   — Page-specific breadcrumb or title
   — Notification bell with unread count
   — Primary action for current context

3. Status badges on nav items:
   — "内容库" shows count of items needing attention
     (pending review, recently approved)
   — Badge clears when user views relevant section
```

The sidebar collapses in three full-focus contexts: Script Generation Result, Review Workspace, Brand Voice Setup. In these contexts, an "← 退出" top-left link replaces sidebar navigation to preserve the user's context.

### Content State Surfacing Across Product

Content state (草稿 / 审核中 / 已批准 / 已发布) is exposed consistently via a four-part system:

```
1. Status Pills:
   On every content card in /content, /calendar, and /dashboard.
   Design: rounded pill, 12px text.
   Color coding:
     草稿      — neutral gray background, dark text
     审核中     — amber background, dark text (draws attention)
     已批准     — light green background, green text
     已发布     — muted blue background, blue text
   These four colors are the ONLY semantic color uses in the product —
   not used for anything else, making status instantly readable.

2. Sidebar Badge:
   "内容库" nav item shows count of items in "审核中" state.
   Clears when user visits /content/review.

3. In-Context Banners:
   On /content/:id, a banner at top of page shows current status
   and available actions for that state:
     草稿: "草稿中 · 上次保存 2 分钟前 · [提交审核]"
     审核中: "等待审核 · 提交于 今天 14:32 · [查看审核意见]"
     已批准: "已批准 · [导出] [标记为已发布]"
     已发布: "已发布 · 发布于 4月15日 · [查看表现数据]"

4. Calendar Kanban:
   Cards' column position IS their status display.
   Status pill on card provides redundant confirmation.
```

### Quick Create to Strategy-First Transition

The transition is not a setting or account upgrade — it is a navigation choice available at any time. The design principle: Quick Create users who are ready for Strategy-First should discover it naturally, not be pushed toward it.

```
Exposure points for Strategy-First (in order of discoverability):

1. On /create/quick/formula (Screen 2):
   Subordinate text link: "需要先规划受众和定位？→ 策略优先模式"
   Visible but not competing with Quick Create.

2. On /dashboard:
   Secondary card in a "深度创作" section (below recent content):
   "策略优先创作 — 定义受众后再生成" with description.
   Only appears after user has created at least 3 pieces of content
   (conditional display: users who just started don't need this yet).

3. In /settings/profile:
   "默认创作模式" preference: Quick Create (default) or Strategy-First.
   After user manually switches to Strategy-First once, 
   this setting can be changed so /create always starts at Strategy-First.

4. No automatic graduation:
   The product never auto-switches users to Strategy-First.
   It is always the user's explicit choice.
```

### Notification Model

Notifications in MVP are in-app only (no email, no push). The trigger criteria are narrow to avoid notification fatigue, which is especially important for solo users who are the primary persona.

```
Triggers IN-APP notification (badge + notification panel):

1. Review status changes:
   - "你的内容《[title]》已获批准" (for author)
   - "《[title]》有新的审核请求" (for reviewer, team mode only)
   - "《[title]》需要你修改" (for author, when reviewer requests changes)

2. Export ready (if async):
   - "你的导出文件已准备好" (edge case — most exports are synchronous)

3. Topic Intelligence refresh (weekly, if user has saved topics):
   - "你关注的选题有新趋势数据" — single weekly digest notification,
     not per-topic. User can dismiss permanently.

Does NOT trigger notification:
   - AI generation completing (user is watching it happen)
   - Auto-save events
   - Brand voice analysis completing (user is watching)
   - Calendar due dates approaching (P2)
   - Any marketing or feature announcement

Notification panel (bell icon in top bar):
   — Opens as a dropdown, max 20 items
   — Each item: icon + message + relative time + link
   — "全部标记已读" action at top of panel
   — No persistent red dot after user opens panel
```

---

## 5. Component Inventory

**15 components required for MVP:**

---

**1. FormulaCard**
Variants: Unselected / Selected / Hover
Appears: Screen 2 (Quick Create formula selection)
Unusual interaction: Cards become non-interactive (locked appearance) after the formula is selected and user advances — prevents backtracking confusion mid-flow.

---

**2. ScriptSegmentBlock**
Variants: View mode / Edit mode / Overflow warning (amber)
Appears: Screen 4 (result), Screen 6 (review), /content/:id/edit
Unusual interaction: Character counter changes color in real-time; block border turns amber when char count exceeds target. Blocks can be reordered via drag handle in edit mode.

---

**3. DiffAnnotation**
Variants: Highlighted phrase / Tooltip on hover (desktop) / Inline reason (mobile)
Appears: Screen 4 right panel, Screen 6 left panel
Unusual interaction: On mobile, diff reasons expand inline below the annotated phrase rather than in a tooltip (hover not available). All diffs can be revealed simultaneously via "显示所有改动原因" toggle.

---

**4. CognitiveChecklist**
Variants: Unchecked / Partially complete / All complete (unlocks approve)
Appears: Screen 6 (Solo review only)
Unusual interaction: The entire right panel action button is disabled until all checklist items are checked. Attempting to approve with incomplete checklist triggers a visual shake animation on the checklist section — not a modal, to keep it in context.

---

**5. StatusPill**
Variants: 草稿 / 审核中 / 已批准 / 已发布
Appears: Content cards, content detail page banners, review workspace header
Unusual interaction: Clicking a status pill on /content list opens a filter (shows only items in that status). Double-click on card status pill in kanban view opens "移动到..." action menu.

---

**6. ThemeToggle**
Variants: Light / Dark / System
Appears: Settings panel, accessible from user avatar bottom of sidebar
Unusual interaction: Theme transitions use a 300ms ease — not instant. Preference stored in localStorage and respected on next session. Default is System.

---

**7. EmotionTriggerBar**
Variants: Full breakdown (3 triggers) / Compact single-tag
Appears: Screen 7 (Topic Intelligence) — full variant on analysis drawer, compact on topic list cards
Unusual interaction: Hovering a segment on the stacked bar highlights the corresponding annotation text below the bar, creating a visual connection between metric and explanation.

---

**8. StoryboardFrameList**
Variants: Preview (collapsed, shows first 3 frames) / Expanded (all 15-18 frames)
Appears: Screen 4 (result, below script)
Unusual interaction: Frame rows have a "复制" icon that copies the single frame description. "复制全部分镜" at section header copies all frames as formatted text for production handoff.

---

**9. KanbanCard**
Variants: Default / Drag active / Overdue (amber date accent) / Today (green date accent)
Appears: Screen 8 (Content Calendar)
Unusual interaction: Dragging a card out of "审核中" back to "草稿" triggers a confirmation dialog — this state regression is intentional friction. Dragging forward (草稿 → 审核中) triggers a reviewer selection modal before state commits.

---

**10. BrandVoiceProfileCard**
Variants: Unconfigured (setup prompt) / Configured (shows trait chips) / Active (shows "应用中" badge)
Appears: Screen 5 (setup), /brand-voice/profile, sidebar bottom (as compact indicator)
Unusual interaction: Trait chips can be individually edited via inline text edit on hover — no modal required for minor corrections.

---

**11. ReasoningChainAccordion**
Variants: Collapsed (default) / Expanded / Streaming (during generation)
Appears: Screen 4 loading state, accessible post-generation
Unusual interaction: During generation, text streams into the accordion in real-time. After generation, it shows the complete chain as a static log. The accordion remembers its open/closed state per session.

---

**12. CharacterBudgetPanel**
Variants: All segments preview / Segment-level real-time counter (in edit mode)
Appears: Screen 3 (input, informational) / Screen 4 (result, on each block)
Unusual interaction: In edit mode on Screen 4, each segment's counter updates as user types, with immediate visual feedback (green = within range, amber = approaching limit, red = over limit).

---

**13. NotificationPanel**
Variants: Empty / With items / Unread items
Appears: Top bar (bell icon), all pages where top bar is present
Unusual interaction: Notification panel closes on click-outside AND on scroll of the underlying page. Unread notifications are grouped by type if multiple exist (e.g., "3 项内容已获批准").

---

**14. ContentCreationEntryCard**
Variants: Quick Create (default, prominent) / Strategy-First (secondary)
Appears: /dashboard (as card widget), potentially as empty state
Unusual interaction: This component must never be presented as a binary choice — Quick Create is always visually primary. Strategy-First is always a secondary, smaller element within the same component.

---

**15. ExportModal**
Variants: Script only / Script + storyboard / Full package (script + storyboard + Xiaohongshu)
Appears: Screen 4 (result), /content/:id (post-approval)
Unusual interaction: Export modal is blocked (greyed with "等待审核批准") when content is in 审核中 state and team mode is active. In solo mode, export is available at any time including from draft state.

---

**16. InlineAnnotationThread (Team Mode)**
Variants: Empty / With comments / Resolved thread
Appears: Screen 7 review workspace (team mode) — not present in Solo mode
Unusual interaction: Highlighting text in left panel auto-focuses the comment textarea in right panel. Thread comments are tied to specific text spans — if the text is edited, the thread shows a "原文已修改" warning but the comment remains.

---

**17. TopicCard**
Variants: List view (compact) / Trend signal view (card grid) / Saved (bookmarked)
Appears: Screen 7 in multiple tab contexts
Unusual interaction: "用这个选题创作" button within the card (not the drawer) uses secondary button styling to avoid competing with the primary drawer CTA. Clicking the card body opens the analysis drawer; clicking the CTA button bypasses the drawer entirely and navigates directly to /create/quick/formula with topic pre-loaded.

---

## 6. Design Principles for This Product

### Principle 1: The Checklist Before the Button

Solo users (李明 persona) need to feel that the product enforces quality, not just speeds up output. The cognitive checklist on the Solo Review screen is not optional or decorative — it is architecturally required before the approve action becomes available. This enforces the product's core positioning as a "quality control layer." The principle: **gates must be real gates, or they teach users that quality checks are theater.**

Implementation constraint: Do not allow the approve button to be enabled via any workaround (auto-checking, "check all" shortcut). Each item must be individually confirmed. This is intentional friction.

---

### Principle 2: Quick Create Is a Promise, Not a Downgrade

The product defaults to Quick Create for all entry points. This must never feel like a simplified or "lite" version — it is the primary experience. Quick Create must produce output that is complete and exportable without ever visiting Strategy-First. The two modes should be understood as parallel philosophies for different creative moments, not a beginner/advanced hierarchy.

Implementation constraint: Quick Create result screen (Screen 4) must have identical export capabilities to Strategy-First result. No "upgrade to Strategy-First" prompts on the result screen — the output is the proof.

---

### Principle 3: Diff Annotations Are a Trust Mechanism

The multi-channel adaptation (Douyin script → Xiaohongshu post) could easily feel like AI magic that users accept blindly. Instead, the diff annotations with visible reasoning ("改动原因") make every change auditable. This is core to the brand positioning: a tool that shows its work earns the editorial trust of quality-conscious creators.

Implementation constraint: Diff annotations must always ship with reasons — not just visual highlights. "改动" without "原因" is not acceptable in any export or display context. This is a quality floor, not a premium feature.

---

### Principle 4: Brand Voice Is Learned, Not Configured

The brand voice setup flow rejects the industry-standard "select your tone from a dropdown" approach. The example-first input model (paste your best content, AI analyzes) positions the product as learning from the user, which aligns with 张薇's expectation that the output sounds like her, not like generic AI. This principle extends to the copy throughout the flow: the product's language frames the AI as a student of the user's voice, not a tool the user must configure.

Implementation constraint: The brand voice setup must never contain multiple-choice style questions or generic tone descriptors as inputs (e.g., "Professional / Casual / Playful"). All characterization comes from AI analysis of user-provided examples. Manual overrides are fine — mandatory selections are not.

---

### Principle 5: State Is Never Ambiguous

At any moment, a user should be able to answer: "where is this piece of content right now, and what can I do with it?" The four-state system (草稿 / 审核中 / 已批准 / 已发布) uses distinct visual treatment and the same semantic colors product-wide. These four colors are reserved exclusively for status — they must not be repurposed for any other UI element (alerts, branding, highlights). The goal: a user who has been away from the product for a week can return to any screen and immediately understand the state of their content without reading a word.

Implementation constraint: The four status colors must be defined as CSS design tokens and documented in a constraint that prevents their reuse for non-status UI elements. Any new feature that requires a new state must go through an explicit architecture review rather than borrowing existing state colors.

---

**End of Design Brief**

**Handoff notes for Frontend Developer**: Implement CSS design tokens before any component work. The four status colors, the reasoning-chain accordion, and the cognitive checklist gate are the three most technically distinctive elements in the product — start with them to establish patterns. All screens are desktop-primary with mobile accessibility except Screens 2, 3, and 5 which are mobile-critical.

**Handoff notes for UI Designer**: The visual language should read as editorial and trustworthy — closer to a professional editorial tool (think Notion or Linear) than a consumer app. Avoid playful illustration, rounded cartoon elements, or gradient-heavy hero sections. The product earns trust through clarity, not through aesthetics.agentId: abd5b69bf6d05d4ba (use SendMessage with to: 'abd5b69bf6d05d4ba' to continue this agent)
<usage>total_tokens: 30819
tool_uses: 0
duration_ms: 324223</usage>