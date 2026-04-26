// Drizzle ORM schema — matches SQL migrations 001-007
// All tables have tenant-level RLS via Supabase JWT tenantId claim.

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const regionEnum = pgEnum('region', ['CN', 'INTL']);
export const planEnum = pgEnum('plan', ['solo', 'team']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);
export const formulaEnum = pgEnum('formula', ['provocation', 'insight']); // 挑衅断言型 | 日常现象洞察型
export const lengthModeEnum = pgEnum('length_mode', ['short', 'long']); // 60s | long
export const channelEnum = pgEnum('channel', ['douyin', 'xiaohongshu']);
export const reviewModeEnum = pgEnum('review_mode', ['solo', 'team']);
export const reviewStatusEnum = pgEnum('review_status', [
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'published',
]);
export const contentStatusEnum = pgEnum('content_status', [
  'generating',
  'draft',
  'adapting',
  'reviewing',
  'approved',
  'published',
]);

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  region:    regionEnum('region').notNull(),
  plan:      planEnum('plan').notNull().default('solo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
    clerkUserId: text('clerk_user_id').notNull(),
    email:       text('email').notNull(),
    role:        userRoleEnum('role').notNull().default('member'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_users_tenant').on(t.tenantId),
    uniqueIndex('idx_users_clerk').on(t.clerkUserId),
  ],
);

// ─── Brand Voice Profiles (Migration 007) ─────────────────────────────────────

export const brandVoiceProfiles = pgTable('brand_voice_profiles', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').notNull().unique().references(() => tenants.id),
  toneDescriptors: jsonb('tone_descriptors').notNull().default('[]'),
  voiceExamples:   jsonb('voice_examples').notNull().default('[]'),
  blocklist:       jsonb('blocklist').notNull().default('[]'),
  styleNotes:      text('style_notes'),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:       uuid('updated_by').references(() => users.id),
});

// ─── Suppression List (Migration 001) ─────────────────────────────────────────

export const suppressionList = pgTable('suppression_list', {
  id:          uuid('id').primaryKey().defaultRandom(),
  category:    text('category').notNull(), // 'hollow_opener' | 'symmetric_list' | 'false_claim' | 'uniform_positive'
  pattern:     text('pattern').notNull(),  // string or regex pattern to match
  description: text('description').notNull(),
  isRegex:     boolean('is_regex').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Content Sessions (Migration 001) ─────────────────────────────────────────
// The root entity. One session = one piece of content being created.

export const contentSessions = pgTable(
  'content_sessions',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
    createdBy:      uuid('created_by').notNull().references(() => users.id),
    entryPoint:     text('entry_point').notNull(), // 'quick_create' | 'strategy_first'
    formula:        formulaEnum('formula').notNull(),
    lengthMode:     lengthModeEnum('length_mode').notNull(),
    productName:    text('product_name').notNull(),
    targetAudience: text('target_audience').notNull(),
    coreClaim:      text('core_claim').notNull(),
    status:         contentStatusEnum('status').notNull().default('generating'),
    brandVoiceId:   uuid('brand_voice_id').references(() => brandVoiceProfiles.id),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_sessions_tenant').on(t.tenantId),
    index('idx_sessions_status').on(t.status),
  ],
);

// ─── Content Scripts (Migration 001) ──────────────────────────────────────────
// Generated script output. One per session (regenerated = new row, latest wins).

export const contentScripts = pgTable(
  'content_scripts',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    sessionId:  uuid('session_id').notNull().references(() => contentSessions.id),
    tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
    // frames: [{index, text, visualDirection, durationS}]
    frames:     jsonb('frames').notNull().default('[]'),
    charCount:  integer('char_count').notNull(),
    frameCount: integer('frame_count').notNull(),
    // Raw full script text for backward compat and search
    fullText:   text('full_text').notNull(),
    commentBaitQuestion: text('comment_bait_question'),
    qualityIssue:        text('quality_issue'),
    provider:   text('provider').notNull(),    // which LLM produced this
    model:      text('model').notNull(),
    latencyMs:  integer('latency_ms'),
    retryCount: integer('retry_count').notNull().default(0),
    isCurrent:  boolean('is_current').notNull().default(true),
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scripts_session').on(t.sessionId),
    index('idx_scripts_current').on(t.sessionId, t.isCurrent),
  ],
);

// ─── Content Adaptations (Migration 005) ──────────────────────────────────────

export const contentAdaptations = pgTable(
  'content_adaptations',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    sessionId:   uuid('session_id').notNull().references(() => contentSessions.id),
    scriptId:    uuid('script_id').notNull().references(() => contentScripts.id),
    tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
    channel:     channelEnum('channel').notNull(),
    content:     text('content').notNull(),
    title:       text('title'),             // Xiaohongshu only
    // diff: [{field, original, adapted, reason}]
    diff:        jsonb('diff').notNull().default('[]'),
    aiLabel:     text('ai_label'),          // CAC-compliant AI disclosure text
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_adaptations_session').on(t.sessionId),
  ],
);

// ─── Content Reviews (Migration 004) ──────────────────────────────────────────

export const contentReviews = pgTable(
  'content_reviews',
  {
    id:                  uuid('id').primaryKey().defaultRandom(),
    sessionId:           uuid('session_id').notNull().references(() => contentSessions.id),
    tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
    reviewMode:          reviewModeEnum('review_mode').notNull(),
    status:              reviewStatusEnum('review_status').notNull().default('draft'),
    assigneeId:          uuid('assignee_id').references(() => users.id),
    // Solo: checklist completion flags. Team: comment thread.
    checklistCompleted:  boolean('checklist_completed').notNull().default(false),
    reviewerComment:     text('reviewer_comment'),
    dueAt:               timestamp('due_at', { withTimezone: true }),
    approvedAt:          timestamp('approved_at', { withTimezone: true }),
    approvedBy:          uuid('approved_by').references(() => users.id),
    createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_reviews_session').on(t.sessionId),
    index('idx_reviews_assignee').on(t.assigneeId),
  ],
);

// ─── Topic Analyses (Migration 005) ───────────────────────────────────────────

export const topicAnalyses = pgTable(
  'topic_analyses',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
    industry:       text('industry').notNull(),
    targetAudience: text('target_audience').notNull(),
    contentGoal:    text('content_goal').notNull(),
    // suggestions: [{title, hook, primaryEmotion, emotionRationale, trendSignals, formulaAffinity}]
    suggestions:    jsonb('suggestions').notNull().default('[]'),
    provider:       text('provider').notNull(),
    expiresAt:      timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_topic_tenant').on(t.tenantId),
  ],
);

// ─── Performance Logs (Migration 006) ─────────────────────────────────────────

export const performanceLogs = pgTable('performance_logs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   uuid('session_id').notNull().references(() => contentSessions.id),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  channel:     channelEnum('channel').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  metricName:  text('metric_name').notNull(),  // e.g. 'views', 'likes', 'comments'
  metricValue: integer('metric_value').notNull(),
  loggedAt:    timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Survey Responses (Migration 006) ─────────────────────────────────────────

export const surveyResponses = pgTable('survey_responses', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   uuid('session_id').notNull().references(() => contentSessions.id),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  surveyType:  text('survey_type').notNull(), // 'post_export_efficiency' | 'quality_rating'
  // responses: {[questionKey]: value}
  responses:   jsonb('responses').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── LLM Spend Daily (W4-01) ──────────────────────────────────────────────────
// One row per (tenant, day, provider). tenantId NULL = system-level calls
// (e.g. audit scripts). Costs stored in cents (fen) to avoid FP drift.

export const llmSpendDaily = pgTable(
  'llm_spend_daily',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    tenantId:      uuid('tenant_id').references(() => tenants.id),
    spendDate:     text('spend_date').notNull(), // YYYY-MM-DD (UTC)
    provider:      text('provider').notNull(),   // kimi/openai/...
    totalTokens:   integer('total_tokens').notNull().default(0),
    costFen:       integer('cost_fen').notNull().default(0), // 分 = 0.01 元
    callCount:     integer('call_count').notNull().default(0),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Upsert target key. tenantId can be NULL so we key on COALESCE via SQL.
    byDayProvider: index('idx_llm_spend_day_provider').on(t.spendDate, t.provider),
    byTenantDay:   index('idx_llm_spend_tenant_day').on(t.tenantId, t.spendDate),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// v3.0 Workflow Engine (Migration 002 — W1-01-V3)
// ═══════════════════════════════════════════════════════════════════════════════

export const nodeTypeEnum = pgEnum('node_type', [
  'topic',
  'script',
  'storyboard',
  'video',
  'export',
]);

export const workflowStatusEnum = pgEnum('workflow_status', [
  'pending',
  'running',
  'done',
  'failed',
  'cancelled',
]);

export const stepStatusEnum = pgEnum('step_status', [
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
  'dirty', // upstream node edited; this step needs rerun (W3-06 cascade)
]);

// ─── Workflow Runs ────────────────────────────────────────────────────────────

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    tenantId:         uuid('tenant_id').notNull().references(() => tenants.id),
    createdBy:        uuid('created_by').notNull().references(() => users.id),
    topic:            text('topic').notNull(),
    status:           workflowStatusEnum('status').notNull().default('pending'),
    totalCostFen:     integer('total_cost_fen').notNull().default(0),
    totalVideoCount:  integer('total_video_count').notNull().default(0),
    errorMsg:         text('error_msg'),
    startedAt:        timestamp('started_at', { withTimezone: true }),
    completedAt:      timestamp('completed_at', { withTimezone: true }),
    /**
     * Optional per-run export tuning (W4-07). Set only from backend/ops — not
     * in v3 UI. Example: {"aiDisclosureLabel":{"disabled":true}}.
     */
    exportOverrides:  jsonb('export_overrides').$type<Record<string, unknown> | null>(),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_runs_tenant').on(t.tenantId),
    index('idx_runs_status').on(t.status),
    index('idx_runs_created_by').on(t.createdBy),
  ],
);

// ─── Workflow Steps ───────────────────────────────────────────────────────────
// One row per (run, node_type). Re-runs increment retry_count; never insert new.

export const workflowSteps = pgTable(
  'workflow_steps',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    runId:        uuid('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
    tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
    nodeType:     nodeTypeEnum('node_type').notNull(),
    stepIndex:    integer('step_index').notNull(),
    status:       stepStatusEnum('status').notNull().default('pending'),
    inputJson:    jsonb('input_json').notNull().default({}),
    outputJson:   jsonb('output_json').notNull().default({}),
    errorMsg:     text('error_msg'),
    retryCount:   integer('retry_count').notNull().default(0),
    costFen:      integer('cost_fen').notNull().default(0),
    startedAt:    timestamp('started_at', { withTimezone: true }),
    completedAt:  timestamp('completed_at', { withTimezone: true }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_steps_run').on(t.runId),
    index('idx_steps_run_index').on(t.runId, t.stepIndex),
    index('idx_steps_node_status').on(t.nodeType, t.status),
    uniqueIndex('uq_steps_run_node').on(t.runId, t.nodeType),
  ],
);

// ─── Topic Pushes ─────────────────────────────────────────────────────────────
// One row per (user, push_date). Daily trending bundle.

export const topicPushes = pgTable(
  'topic_pushes',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    tenantId:           uuid('tenant_id').notNull().references(() => tenants.id),
    userId:             uuid('user_id').notNull().references(() => users.id),
    pushDate:           text('push_date').notNull(), // YYYY-MM-DD CST
    source:             text('source').notNull(),    // 'feigua' | 'newrank' | ...
    // [{rank, title, video_url, plays, hotness, category, llm_analysis}]
    topicsJson:         jsonb('topics_json').notNull().default([]),
    openedAt:           timestamp('opened_at', { withTimezone: true }),
    clickedTopicIndex:  integer('clicked_topic_index'),
    usedInRunId:        uuid('used_in_run_id').references(() => workflowRuns.id),
    createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_topic_pushes_tenant').on(t.tenantId),
    index('idx_topic_pushes_user_date').on(t.userId, t.pushDate),
    uniqueIndex('uq_topic_pushes_user_date').on(t.userId, t.pushDate),
  ],
);

// ─── Monthly Usage ────────────────────────────────────────────────────────────
// Per-user monthly aggregate. One row per (user, month_key).
// Used for D23 cap (60 video clips / month) + unit economics.

export const monthlyUsage = pgTable(
  'monthly_usage',
  {
    id:                uuid('id').primaryKey().defaultRandom(),
    tenantId:          uuid('tenant_id').notNull().references(() => tenants.id),
    userId:            uuid('user_id').notNull().references(() => users.id),
    monthKey:          text('month_key').notNull(),       // YYYY-MM CST
    videoCount:        integer('video_count').notNull().default(0),
    workflowRunCount:  integer('workflow_run_count').notNull().default(0),
    totalCostFen:      integer('total_cost_fen').notNull().default(0),
    lastUpdatedAt:     timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_monthly_usage_tenant_month').on(t.tenantId, t.monthKey),
    uniqueIndex('uq_monthly_usage_user_month').on(t.userId, t.monthKey),
  ],
);

// ─── Compliance audit (W4-07) — append-only; /admin/dashboard reads (service role)

export const complianceAuditLogs = pgTable(
  'compliance_audit_logs',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    tenantId:  uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    runId:     uuid('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    action:    text('action').notNull(),
    detail:    jsonb('detail').notNull().default({}).$type<Record<string, unknown>>(),
  },
  (t) => [
    index('idx_compliance_tenant_time').on(t.tenantId, t.createdAt),
    index('idx_compliance_run').on(t.runId),
  ],
);
