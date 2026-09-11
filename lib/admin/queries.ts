import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Read side of the admin portal.
 *
 * Everything here goes through the service-role client because RLS is uniformly
 * "own row" — there is no way for any session to read across users, by design.
 * `server-only` makes an accidental client import a build error rather than a
 * key leak.
 *
 * The aggregates themselves live in Postgres (see
 * supabase/migrations/20260908000000_admin_portal.sql): supabase-js has no
 * GROUP BY / COUNT DISTINCT, and streaming whole tables into Node just to count
 * them would be absurd.
 */

export interface AdminOverview {
  generated_at: string;
  users: {
    total: number;
    onboarded: number;
    new_1d: number;
    new_7d: number;
    new_30d: number;
    android: number;
    web: number;
  };
  active: { dau: number; wau: number; mau: number; engaged_7d: number };
  push: { subscriptions: number; users: number };
  supporters: { count: number; unlinked: number; total_amount: number };
  ai: { messages_today: number; users_today: number; capped_today: number };
  feedback: { unresolved: number; bugs: number };
  sms: { txns_total: number; users: number; txns_7d: number };
  installs: {
    day?: string;
    active_devices?: number | null;
    total_users?: number | null;
    daily_installs?: number | null;
    daily_uninstalls?: number | null;
    synced_at?: string;
  };
  landing: { views_7d: number; play_clicks_7d: number };
}

export interface DailyPoint {
  day: string;
  signups: number;
  active_users: number;
  engaged_users: number;
  ai_messages: number;
  sms_txns: number;
  play_clicks: number;
  installs: number;
  uninstalls: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string;
  is_onboarded: boolean;
  is_supporter: boolean;
  last_app_mode: string | null;
  currency: string;
  created_at: string;
  last_seen_at: string | null;
}

export interface AdminUserDetail {
  profile: Record<string, unknown> | null;
  counts: Record<string, number>;
  ai_usage_7d: Array<{ day: string; count: number }>;
  supporter: Record<string, unknown> | null;
  recent_activity: Array<{
    action_type: string;
    category: string | null;
    title: string;
    description: string | null;
    created_at: string;
  }>;
  feedback: Array<{
    id: string;
    kind: string;
    message: string;
    app_version: string | null;
    platform: string | null;
    created_at: string;
    resolved_at: string | null;
  }>;
}

export interface FeatureUsage {
  sms_users: number;
  sms_categorized: number;
  sms_pending: number;
  merchant_rules: number;
  rule_applications: number;
  templates: number;
  goals: number;
  goals_achieved: number;
  debts: number;
  reports: number;
  push_optin_pct: number;
  by_currency: Record<string, number>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rpc(name: string, args?: Record<string, unknown>) {
  const client = createServiceClient() as any;
  return args ? client.rpc(name, args) : client.rpc(name);
}

export async function getOverview(): Promise<AdminOverview> {
  const { data, error } = await rpc("admin_overview");
  if (error) throw new Error(`admin_overview: ${error.message}`);
  return data as AdminOverview;
}

export async function getDailySeries(days = 30): Promise<DailyPoint[]> {
  const { data, error } = await rpc("admin_daily_series", { p_days: days });
  if (error) throw new Error(`admin_daily_series: ${error.message}`);
  return (data ?? []) as DailyPoint[];
}

/** Columns the admin user table may be ordered by (mirrors the SQL whitelist). */
export const ADMIN_USER_SORTS = [
  "email",
  "full_name",
  "created_at",
  "last_seen_at",
  "last_app_mode",
  "is_supporter",
  "is_onboarded",
  "currency",
] as const;
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];
export type SortDir = "asc" | "desc";

export interface AdminUserPage {
  rows: AdminUserRow[];
  /** Total matching the query, ignoring limit/offset — drives the pager. */
  total: number;
}

export async function searchUsers(
  q: string,
  opts: { limit?: number; offset?: number; sort?: AdminUserSort; dir?: SortDir } = {},
): Promise<AdminUserPage> {
  const { limit = 30, offset = 0, sort = "created_at", dir = "desc" } = opts;
  const { data, error } = await rpc("admin_user_search", {
    p_q: q,
    p_limit: limit,
    p_offset: offset,
    p_sort: sort,
    p_dir: dir,
  });
  if (error) throw new Error(`admin_user_search: ${error.message}`);
  const payload = (data ?? {}) as { rows?: AdminUserRow[]; total?: number };
  return { rows: payload.rows ?? [], total: Number(payload.total ?? 0) };
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const { data, error } = await rpc("admin_user_detail", { p_user: userId });
  if (error) throw new Error(`admin_user_detail: ${error.message}`);
  return data as AdminUserDetail;
}

export interface PushReach {
  web_subscriptions: number;
  web_users: number;
  fcm_tokens: number;
  fcm_users: number;
}

/** Web-push vs FCM reach. Two transports; neither alone covers everyone. */
export async function getPushReach(): Promise<PushReach> {
  const { data, error } = await rpc("admin_push_reach");
  if (error) throw new Error(`admin_push_reach: ${error.message}`);
  return data as PushReach;
}

export async function getFeatureUsage(): Promise<FeatureUsage> {
  const { data, error } = await rpc("admin_feature_usage");
  if (error) throw new Error(`admin_feature_usage: ${error.message}`);
  return data as FeatureUsage;
}

/* ── Plain table reads (no aggregation needed) ───────────────────────────── */

export interface FeedbackRow {
  id: string;
  user_id: string;
  kind: "bug" | "feature" | "feedback";
  message: string;
  app_version: string | null;
  platform: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function listFeedback(includeResolved = false): Promise<FeedbackRow[]> {
  const client = createServiceClient();
  let q = client
    .from("feedback")
    .select("id, user_id, kind, message, app_version, platform, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!includeResolved) q = q.is("resolved_at", null);
  const { data, error } = await q;
  if (error) throw new Error(`listFeedback: ${error.message}`);
  return (data ?? []) as FeedbackRow[];
}

export interface SupporterRow {
  email: string;
  user_id: string | null;
  first_supported_at: string;
  last_supported_at: string;
  total_amount: number;
  currency: string | null;
  source: string;
}

export async function listSupporters(): Promise<SupporterRow[]> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("supporters")
    .select("email, user_id, first_supported_at, last_supported_at, total_amount, currency, source")
    .order("last_supported_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listSupporters: ${error.message}`);
  return (data ?? []) as SupporterRow[];
}

export interface AppConfigRow {
  min_android_version_code: number;
  update_message: string | null;
  flags: Record<string, unknown>;
}

export async function getAppConfig(): Promise<AppConfigRow> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("app_config")
    .select("min_android_version_code, update_message, flags")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`getAppConfig: ${error.message}`);
  return {
    min_android_version_code: data.min_android_version_code ?? 0,
    update_message: data.update_message ?? null,
    flags: (data.flags ?? {}) as Record<string, unknown>,
  };
}

export interface CampaignRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  segment: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("push_campaigns")
    .select("id, title, body, url, segment, sent_count, failed_count, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`listCampaigns: ${error.message}`);
  return (data ?? []) as CampaignRow[];
}

export interface InstallRow {
  day: string;
  daily_device_installs: number | null;
  daily_device_uninstalls: number | null;
  active_device_installs: number | null;
  total_user_installs: number | null;
  synced_at: string;
}

export async function listInstalls(days = 90): Promise<InstallRow[]> {
  const client = createServiceClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await client
    .from("play_install_stats")
    .select(
      "day, daily_device_installs, daily_device_uninstalls, active_device_installs, total_user_installs, synced_at",
    )
    .gte("day", since)
    .order("day", { ascending: true });
  if (error) throw new Error(`listInstalls: ${error.message}`);
  return (data ?? []) as InstallRow[];
}
