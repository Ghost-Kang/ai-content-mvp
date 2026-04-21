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
