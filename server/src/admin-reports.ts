import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { MediaError } from "./cloudflare";

type Query = Record<string, unknown>;
type SqlValue = string | number;
const pageSize = 25;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function rows(sql: string, values: SqlValue[] = []) {
  const [result] = await pool.execute<RowDataPacket[]>(sql, values);
  return result;
}

async function pageOf(select: string, from: string, order: string, values: SqlValue[], pageValue: unknown) {
  const [count] = await rows("SELECT COUNT(*) AS total " + from, values);
  const total = Number(count.total);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number(pageValue);
  const page = Number.isSafeInteger(requested) ? Math.min(pages, Math.max(1, requested)) : 1;
  const items = await rows(`SELECT ${select} ${from} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, values);
  return { items, page, pages, total };
}

const accountColumns = `u.user_id, u.name, u.username, u.email, u.coin_balance, u.is_active,
  UNIX_TIMESTAMP(u.created_at) AS joined, UNIX_TIMESTAMP(u.last_login_at) AS last_login`;
const episodeColumns = "e.id AS episode_db_id, e.title AS episode_title, e.episode_number, s.series_id, s.title AS series_title";
const episodeJoins = " LEFT JOIN episodes e ON e.episode_id = t.episode_id LEFT JOIN series s ON s.id = e.series_id";

export async function userDirectory(query: Query) {
  const search = text(query.search).slice(0, 190);
  const status = ["active", "suspended"].includes(text(query.status)) ? text(query.status) : "";
  const terms: string[] = [];
  const values: SqlValue[] = [];
  if (search) {
    terms.push("(LOCATE(?,u.name) > 0 OR LOCATE(?,u.username) > 0 OR LOCATE(?,u.email) > 0)");
    values.push(search, search, search);
  }
  if (status) { terms.push("u.is_active = ?"); values.push(status === "active" ? 1 : 0); }
  const from = "FROM mobile_users u" + (terms.length ? " WHERE " + terms.join(" AND ") : "");
  const [directory, [summary]] = await Promise.all([
    pageOf(accountColumns + `, (SELECT COUNT(*) FROM episode_unlocks x WHERE x.user_id = u.user_id) AS unlock_count,
      (SELECT s.title FROM watch_progress p JOIN episodes e ON p.episode_id = e.episode_id
       JOIN series s ON s.id = e.series_id WHERE p.user_id = u.user_id ORDER BY p.watched_at DESC, p.id DESC LIMIT 1) AS last_watched`,
      from, "u.created_at DESC, u.id DESC", values, query.page),
    rows(`SELECT COUNT(*) AS total, COUNT(IF(is_active = 1,1,NULL)) AS active,
      COUNT(IF(created_at >= NOW() - INTERVAL 7 DAY,1,NULL)) AS signups,
      (SELECT COUNT(DISTINCT user_id) FROM episode_unlocks WHERE method='coins') AS coin_users,
      (SELECT COUNT(DISTINCT user_id) FROM episode_unlocks WHERE method='ad') AS ad_users FROM mobile_users`),
  ]);
  return { ...directory, search, status, summary };
}

export async function userProfile(userId: string, query: Query) {
  const [user] = await rows(`SELECT ${accountColumns} FROM mobile_users u WHERE u.user_id = ?`, [userId]);
  if (!user) throw new MediaError(404, "User not found.");
  const tab = query.tab === "wallet" || query.tab === "unlocks" ? query.tab : "watch";
  if (tab === "watch") {
    const history = await pageOf(`${episodeColumns}, t.progress_seconds, UNIX_TIMESTAMP(t.watched_at) AS recorded`,
      "FROM watch_progress t" + episodeJoins + " WHERE t.user_id = ?", "t.watched_at DESC, t.id DESC", [userId], query.page);
    return { user, tab, ...history };
  }
  return { user, tab, ...await listRecords(tab, { page: query.page }, userId) };
}

export async function setAccountAccess(userId: string, status: unknown, confirmation: unknown) {
  if (status !== "active" && status !== "suspended") throw new MediaError(400, "Choose an account status.");
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [accounts] = await db.execute<RowDataPacket[]>("SELECT name FROM mobile_users WHERE user_id = ? FOR UPDATE", [userId]);
    const user = accounts[0];
    if (!user) throw new MediaError(404, "User not found.");
    if (status === "suspended" && text(confirmation) !== String(user.name || userId).trim()) {
      throw new MediaError(400, "Enter the account name to confirm suspension.");
    }
    await db.execute("UPDATE mobile_users SET is_active = ? WHERE user_id = ?", [status === "active" ? 1 : 0, userId]);
    if (status === "suspended") {
      await db.execute("UPDATE mobile_refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
    }
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}

export const ledgers = {
  wallet: { title: "Wallet activity", table: "wallet_transactions", field: "transaction_type", types: ["top_up", "spend", "reward"],
    columns: "t.coin_amount, t.description" },
  purchases: { title: "Store purchases", table: "purchase_transactions", field: "status", types: ["verified", "revoked", "refunded"],
    columns: "t.coin_amount, t.product_id, t.platform, t.provider_transaction_id" },
  unlocks: { title: "Episode unlocks", table: "episode_unlocks", field: "method", types: ["coins", "ad", "free"],
    columns: "t.episode_id" },
  claims: { title: "Ad reward claims", table: "ad_reward_claims", field: "status", types: ["pending", "verified", "expired", "rejected"],
    columns: "t.episode_id, t.provider_event_id, t.ad_unit_id, t.rejection_reason" },
};
export type Ledger = keyof typeof ledgers;

export function ledgerName(value: unknown): Ledger {
  if (value === undefined || value === "") return "wallet";
  if (typeof value !== "string" || !Object.hasOwn(ledgers, value)) throw new MediaError(404, "Report not found.");
  return value as Ledger;
}

function recordQuery(kind: Ledger) {
  const def = ledgers[kind];
  const select = `CAST(t.id AS CHAR) AS record_id, t.user_id, u.user_id AS account_id, u.name, u.email,
    t.${def.field} AS category, UNIX_TIMESTAMP(t.created_at) AS recorded, ${def.columns}`;
  const from = `FROM ${def.table} t LEFT JOIN mobile_users u ON u.user_id = t.user_id`;
  return kind === "purchases" ? { select, from } : { select: select + ", " + episodeColumns, from: from + episodeJoins };
}

function dateFilter(value: unknown) {
  const date = text(value);
  if (!date) return "";
  const time = Date.parse(date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) {
    throw new MediaError(400, "Enter a valid calendar date.");
  }
  return date;
}

export async function listRecords(kind: Ledger, query: Query, userId?: string) {
  const { select, from } = recordQuery(kind);
  const type = text(query.type);
  const start = dateFilter(query.from);
  const end = dateFilter(query.to);
  if (start && end && end < start) throw new MediaError(400, "The end date must be on or after the start date.");
  const terms: string[] = [];
  const values: SqlValue[] = [];
  if (type) {
    if (!ledgers[kind].types.includes(type)) throw new MediaError(400, "Choose a valid report filter.");
    terms.push(`t.${ledgers[kind].field} = ?`); values.push(type);
  }
  if (start) { terms.push("t.created_at >= FROM_UNIXTIME(?)"); values.push(Date.parse(start) / 1000); }
  if (end) { terms.push("t.created_at < FROM_UNIXTIME(?)"); values.push(Date.parse(end) / 1000 + 86400); }
  if (userId) { terms.push("t.user_id = ?"); values.push(userId); }
  const result = await pageOf(select, from + (terms.length ? " WHERE " + terms.join(" AND ") : ""),
    "t.created_at DESC, t.id DESC", values, query.page);
  return { ...result, kind, type, start, end };
}

export async function recordDetail(kind: Ledger, id: string) {
  if (!/^\d{1,20}$/.test(id)) throw new MediaError(404, "Record not found.");
  const { select, from } = recordQuery(kind);
  const [record] = await rows(`SELECT ${select} ${from} WHERE t.id = CAST(? AS UNSIGNED)`, [id]);
  if (!record || record.record_id !== id) throw new MediaError(404, "Record not found.");
  return { kind, record };
}

// TIMESTAMP values follow the MySQL session timezone. Group their epoch seconds into UTC days.
const utcDay = (column: string) => `DATE_FORMAT(TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(${column}), '1970-01-01'), '%Y-%m-%d')`;

export async function analyticsReport(range: unknown, today = new Date()) {
  const days = [7, 14, 30].includes(Number(range)) ? Number(range) : 14;
  const end = Date.parse(today.toISOString().slice(0, 10)) / 1000 + 86400;
  const start = end - days * 86400;
  const isoDay = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
  const dates = [isoDay(start), isoDay(end)];
  const window = "created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)";
  const [viewers, signups, unlocks, episodes, [tracking], [unique]] = await Promise.all([
    rows("SELECT DATE_FORMAT(view_date,'%Y-%m-%d') AS day, COUNT(*) AS n FROM daily_viewers WHERE view_date >= ? AND view_date < ? GROUP BY view_date", dates),
    rows(`SELECT ${utcDay("created_at")} AS day, COUNT(*) AS n FROM mobile_users WHERE ${window} GROUP BY day`, [start, end]),
    rows(`SELECT ${utcDay("created_at")} AS day, method, COUNT(*) AS n FROM episode_unlocks WHERE ${window} GROUP BY day, method`, [start, end]),
    rows(`SELECT ${episodeColumns}, COUNT(*) AS n FROM episode_unlocks t JOIN episodes e ON e.episode_id = t.episode_id
      JOIN series s ON s.id = e.series_id WHERE t.created_at >= FROM_UNIXTIME(?) AND t.created_at < FROM_UNIXTIME(?)
      GROUP BY e.id, e.title, e.episode_number, s.series_id, s.title ORDER BY n DESC, e.id LIMIT 10`, [start,end]),
    rows(`SELECT MIN(day) AS started FROM (
       SELECT ${utcDay("applied_at")} AS day FROM schema_migrations WHERE name='005_daily_viewers.sql'
       UNION ALL SELECT DATE_FORMAT(MIN(view_date),'%Y-%m-%d') FROM daily_viewers) history`),
    rows("SELECT COUNT(DISTINCT user_id) AS n FROM daily_viewers WHERE view_date >= ? AND view_date < ?", dates),
  ]);
  const daily = Array.from({length: days}, (_, i) => {
    const day = isoDay(start + i * 86400);
    const tracked = Boolean(tracking.started && day >= tracking.started);
    const methods = new Map(unlocks.filter(r => r.day === day).map(r => [r.method, Number(r.n)]));
    return { day, viewers: tracked ? Number(viewers.find(r => r.day === day)?.n ?? 0) : null,
      signups: Number(signups.find(r => r.day === day)?.n ?? 0), coins: methods.get("coins") ?? 0,
      ad: methods.get("ad") ?? 0, free: methods.get("free") ?? 0 };
  });
  return { days, daily, episodes, trackingStart: tracking.started, unique: Number(unique.n),
    signups: signups.reduce((n, r) => n + Number(r.n), 0), unlocks: unlocks.reduce((n, r) => n + Number(r.n), 0) };
}
