import { randomBytes } from "node:crypto";
import { type RowDataPacket, type ResultSetHeader } from "mysql2";
import { pool } from "./db";

export type SeriesStatus = "draft" | "live";
export type EpisodeStatus = "draft" | "processing" | "live";

export type SeriesRow = RowDataPacket & {
  id: number;
  series_id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  genres: string | null;
  poster_url: string | null;
  status: SeriesStatus;
  episode_count: number;
  free_episode_count: number;
  latest_episode_at: Date | string | null;
  progress_seconds?: number | null;
};

type SeriesIdentityRow = RowDataPacket & {
  id: number;
  series_id: string | null;
};

type EpisodeIdentityRow = RowDataPacket & {
  id: number;
  episode_id: string | null;
};

type UnlockEpisodeRow = RowDataPacket & {
  coin_cost: number;
  episode_number: number;
  title: string;
  series_title: string;
};

type UnlockUserRow = RowDataPacket & {
  coin_balance: number;
};

type UnlockExistingRow = RowDataPacket & {
  id: number;
};

type WalletTransactionRow = RowDataPacket & {
  id: number;
  transaction_type: "top_up" | "spend" | "reward";
  coin_amount: number;
  description: string;
  episode_id: string | null;
  series_title: string | null;
  episode_number: number | null;
  created_at: Date | string;
};

type ProfileEpisodeRow = RowDataPacket & {
  id: number;
  episode_id: string;
  series_id: string;
  series_database_id: number;
  series_title: string;
  slug: string;
  synopsis: string | null;
  genres: string | null;
  poster_url: string | null;
  episode_count: number | string;
  free_episode_count: number | string;
  latest_episode_at: Date | string | null;
  status: SeriesStatus;
  episode_number: number;
  episode_title: string;
  hook: string | null;
  progress_seconds: number | string | null;
  activity_at: Date | string;
};

type EpisodeReactionType = "like" | "save";

type EpisodeEngagementRow = RowDataPacket & {
  like_count: number | string;
  comment_count: number | string;
  save_count: number | string;
  has_liked: number | string;
  has_saved: number | string;
};

type EpisodeCommentRow = RowDataPacket & {
  id: number;
  user_id: string;
  body: string;
  created_at: Date | string;
  author_name: string | null;
};

export class InsufficientCoinsError extends Error {
  constructor() {
    super("Not enough coins to unlock this episode.");
  }
}

export type UnlockEpisodeResult = {
  coinsDeducted: number;
  newCoinBalance: number;
};

export type WalletTopUpResult = {
  coinsAdded: number;
  newCoinBalance: number;
};

export type WalletTransaction = {
  id: number;
  type: "top_up" | "spend" | "reward";
  coinAmount: number;
  description: string;
  episodeId: string | null;
  seriesTitle: string | null;
  episodeNumber: number | null;
  createdAt: Date | string;
};

export type ProfileSeries = {
  id: number;
  series_id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  genres: string | null;
  poster_url: string | null;
  status: SeriesStatus;
  episode_count: number;
  free_episode_count: number;
  latest_episode_at: Date | string | null;
  progress_seconds: number;
};

export type ProfileEpisode = {
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  hook: string | null;
  progressSeconds: number;
  activityAt: Date | string;
  series: ProfileSeries;
};

export type EpisodeEngagement = {
  likeCount: number;
  commentCount: number;
  saveCount: number;
  hasLiked: boolean;
  hasSaved: boolean;
};

export type EpisodeComment = {
  id: number;
  userId: string;
  authorName: string;
  body: string;
  createdAt: Date | string;
};

export type CreatedSeries = {
  id: number;
  seriesId: string;
};

export type EpisodeRow = RowDataPacket & {
  id: number;
  episode_id: string;
  series_id: number;
  series_title: string;
  episode_number: number;
  title: string;
  hook: string | null;
  is_free: 0 | 1;
  coin_cost: number;
  release_date: string | null;
  status: EpisodeStatus;
  cloudflare_video_uid: string | null;
  cloudflare_ready: 0 | 1;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  is_unlocked?: 0 | 1;
  progress_seconds?: number | null;
};

type DashboardSummaryRow = RowDataPacket & {
  series_total: number | string;
  live_series: number | string;
  draft_series: number | string;
  episodes_total: number | string;
  live_episodes: number | string;
  draft_episodes: number | string;
  processing_episodes: number | string;
  ready_videos: number | string;
  missing_videos: number | string;
  viewers_total: number | string;
  unlocks_total: number | string;
  watch_seconds_total: number | string;
};

type DashboardUnlockMethodRow = RowDataPacket & {
  method: "coins" | "ad" | "free";
  unlock_count: number | string;
};

type DashboardQueueRow = RowDataPacket & {
  id: number;
  series_title: string;
  episode_number: number;
  title: string;
  status: EpisodeStatus;
  release_date: Date | string | null;
  cloudflare_video_uid: string | null;
  cloudflare_ready: 0 | 1;
};

type UserSummaryRow = RowDataPacket & {
  total_users: number | string;
  active_users: number | string;
  new_signups: number | string;
  paying_users: number | string;
  ad_earners: number | string;
};

type AdminUserRow = RowDataPacket & {
  id: number;
  user_id: string;
  name: string;
  email: string;
  coin_balance: number;
  is_active: 0 | 1;
  last_login_at: Date | string | null;
  created_at: Date | string;
  unlock_count: number | string;
  ad_unlock_count: number | string;
  last_watched_title: string | null;
  last_watched_at: Date | string | null;
};

export type DashboardData = {
  metrics: Array<{
    label: string;
    value: string;
    note: string;
    featured?: boolean;
  }>;
  releaseFocus: {
    title: string;
    note: string;
    actionLabel: string;
  };
  priorityQueue: Array<{
    title: string;
    statusLabel: string;
    statusClass: string;
    dueLabel: string;
  }>;
  unlockSummary: Array<{
    label: string;
    value: string;
  }>;
};

export type UsersData = {
  metrics: Array<{
    label: string;
    value: string;
    note: string;
  }>;
  rows: Array<{
    name: string;
    email: string;
    coinBalance: number;
    lastWatched: string;
    unlockNote: string;
    statusLabel: string;
    statusClass: string;
  }>;
};

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `series-${Date.now()}`;
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  let next = base;
  let suffix = 2;

  while (true) {
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM series WHERE slug = ? LIMIT 1", [next]);
    if (rows.length === 0) {
      return next;
    }

    next = `${base}-${suffix}`;
    suffix += 1;
  }
}

async function uniqueSeriesId(): Promise<string> {
  while (true) {
    const next = `ser_${randomBytes(8).toString("hex")}`;
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM series WHERE series_id = ? LIMIT 1", [next]);
    if (rows.length === 0) {
      return next;
    }
  }
}

async function uniqueEpisodeId(): Promise<string> {
  while (true) {
    const next = `ep_${randomBytes(8).toString("hex")}`;
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM episodes WHERE episode_id = ? LIMIT 1", [next]);
    if (rows.length === 0) {
      return next;
    }
  }
}

export async function ensureContentSchema(): Promise<void> {
  try {
    await pool.execute("ALTER TABLE series ADD COLUMN series_id VARCHAR(32) NULL UNIQUE AFTER id");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  const [rows] = await pool.execute<SeriesIdentityRow[]>("SELECT id, series_id FROM series WHERE series_id IS NULL OR series_id = ''");
  for (const row of rows) {
    await pool.execute("UPDATE series SET series_id = ? WHERE id = ?", [await uniqueSeriesId(), row.id]);
  }

  try {
    await pool.execute("ALTER TABLE episodes ADD COLUMN episode_id VARCHAR(32) NULL UNIQUE AFTER id");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  const [episodeRows] = await pool.execute<EpisodeIdentityRow[]>("SELECT id, episode_id FROM episodes WHERE episode_id IS NULL OR episode_id = ''");
  for (const row of episodeRows) {
    await pool.execute("UPDATE episodes SET episode_id = ? WHERE id = ?", [await uniqueEpisodeId(), row.id]);
  }

  try {
    await pool.execute("ALTER TABLE episodes MODIFY episode_id VARCHAR(32) NOT NULL");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "ER_BAD_NULL_ERROR" && code !== "ER_INVALID_USE_OF_NULL") {
      throw error;
    }
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      transaction_type ENUM('top_up', 'spend', 'reward') NOT NULL,
      coin_amount INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      episode_id INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_wallet_transactions_user_created (user_id, created_at),
      CONSTRAINT fk_wallet_transactions_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS episode_reactions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      episode_id INT UNSIGNED NOT NULL,
      reaction_type ENUM('like', 'save') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_episode_reaction (user_id, episode_id, reaction_type),
      INDEX idx_episode_reactions_episode_type (episode_id, reaction_type),
      CONSTRAINT fk_episode_reactions_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS episode_comments (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      episode_id INT UNSIGNED NOT NULL,
      body VARCHAR(500) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_episode_comments_episode_created (episode_id, created_at),
      CONSTRAINT fk_episode_comments_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function dueLabel(value: Date | string | null): string {
  if (!value) {
    return "Unscheduled";
  }

  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }
  if (diffDays === -1) {
    return "Yesterday";
  }
  if (diffDays < 0) {
    return `${Math.abs(diffDays)}d overdue`;
  }

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function episodeStatusDisplay(row: DashboardQueueRow): { label: string; className: string } {
  if (row.status === "processing") {
    return { label: "Processing", className: "review" };
  }
  if (!row.cloudflare_video_uid) {
    return { label: "Needs video", className: "blocked" };
  }
  if (row.cloudflare_ready) {
    return { label: row.status === "live" ? "Live" : "Ready", className: "live" };
  }

  return { label: "Review", className: "review" };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [summaryRows] = await pool.execute<DashboardSummaryRow[]>(
    `SELECT
        (SELECT COUNT(*) FROM series) AS series_total,
        (SELECT COUNT(*) FROM series WHERE status = 'live') AS live_series,
        (SELECT COUNT(*) FROM series WHERE status = 'draft') AS draft_series,
        (SELECT COUNT(*) FROM episodes) AS episodes_total,
        (SELECT COUNT(*) FROM episodes WHERE status = 'live') AS live_episodes,
        (SELECT COUNT(*) FROM episodes WHERE status = 'draft') AS draft_episodes,
        (SELECT COUNT(*) FROM episodes WHERE status = 'processing') AS processing_episodes,
        (SELECT COUNT(*) FROM episodes WHERE cloudflare_ready = 1) AS ready_videos,
        (SELECT COUNT(*) FROM episodes WHERE cloudflare_video_uid IS NULL) AS missing_videos,
        (SELECT COUNT(DISTINCT user_id) FROM watch_progress) AS viewers_total,
        (SELECT COUNT(*) FROM episode_unlocks) AS unlocks_total,
        (SELECT COALESCE(SUM(progress_seconds), 0) FROM watch_progress) AS watch_seconds_total`,
  );

  const [unlockRows] = await pool.execute<DashboardUnlockMethodRow[]>(
    `SELECT method, COUNT(*) AS unlock_count
       FROM episode_unlocks
      GROUP BY method`,
  );

  const [queueRows] = await pool.execute<DashboardQueueRow[]>(
    `SELECT e.id, s.title AS series_title, e.episode_number, e.title, e.status,
            e.release_date, e.cloudflare_video_uid, e.cloudflare_ready
       FROM episodes e
       INNER JOIN series s ON s.id = e.series_id
      ORDER BY
        CASE
          WHEN e.status = 'processing' THEN 0
          WHEN e.cloudflare_video_uid IS NULL THEN 1
          WHEN e.status = 'draft' THEN 2
          ELSE 3
        END,
        COALESCE(e.release_date, '9999-12-31') ASC,
        e.updated_at DESC
      LIMIT 5`,
  );

  const summary = summaryRows[0];
  const seriesTotal = numberValue(summary?.series_total);
  const liveSeries = numberValue(summary?.live_series);
  const draftSeries = numberValue(summary?.draft_series);
  const episodesTotal = numberValue(summary?.episodes_total);
  const liveEpisodes = numberValue(summary?.live_episodes);
  const draftEpisodes = numberValue(summary?.draft_episodes);
  const processingEpisodes = numberValue(summary?.processing_episodes);
  const readyVideos = numberValue(summary?.ready_videos);
  const missingVideos = numberValue(summary?.missing_videos);
  const viewersTotal = numberValue(summary?.viewers_total);
  const unlocksTotal = numberValue(summary?.unlocks_total);
  const watchMinutesTotal = Math.round(numberValue(summary?.watch_seconds_total) / 60);

  const unlocksByMethod = new Map(unlockRows.map((row) => [row.method, numberValue(row.unlock_count)]));
  const priorityQueue = queueRows.map((row) => {
    const status = episodeStatusDisplay(row);
    return {
      title: `${row.series_title} Ep ${row.episode_number}: ${row.title}`,
      statusLabel: status.label,
      statusClass: status.className,
      dueLabel: dueLabel(row.release_date),
    };
  });

  const focusRow = queueRows[0];
  const focusStatus = focusRow ? episodeStatusDisplay(focusRow) : null;

  return {
    metrics: [
      {
        label: "Total Viewers",
        value: compactNumber(viewersTotal),
        note: `${compactNumber(watchMinutesTotal)} watch minutes tracked`,
        featured: true,
      },
      {
        label: "Series",
        value: compactNumber(seriesTotal),
        note: `${compactNumber(liveSeries)} live / ${compactNumber(draftSeries)} draft`,
      },
      {
        label: "Episodes",
        value: compactNumber(episodesTotal),
        note: `${compactNumber(liveEpisodes)} live / ${compactNumber(processingEpisodes + draftEpisodes)} pending`,
      },
      {
        label: "Unlocks",
        value: compactNumber(unlocksTotal),
        note: `${compactNumber(readyVideos)} ready videos / ${compactNumber(missingVideos)} missing`,
      },
    ],
    releaseFocus: focusRow
      ? {
          title: focusRow.series_title,
          note: `Ep ${focusRow.episode_number}: ${focusRow.title} · ${focusStatus?.label ?? focusRow.status}`,
          actionLabel: "Open Queue",
        }
      : {
          title: "No releases yet",
          note: "Create a series and add the first episode.",
          actionLabel: "Create Episode",
        },
    priorityQueue,
    unlockSummary: [
      { label: "Coin unlocks", value: compactNumber(unlocksByMethod.get("coins") ?? 0) },
      { label: "Ad rewards", value: compactNumber(unlocksByMethod.get("ad") ?? 0) },
      { label: "Free unlocks", value: compactNumber(unlocksByMethod.get("free") ?? 0) },
    ],
  };
}

export async function getUsersData(): Promise<UsersData> {
  const [summaryRows] = await pool.execute<UserSummaryRow[]>(
    `SELECT
        (SELECT COUNT(*) FROM mobile_users) AS total_users,
        (SELECT COUNT(*) FROM mobile_users WHERE is_active = 1) AS active_users,
        (SELECT COUNT(*) FROM mobile_users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS new_signups,
        (SELECT COUNT(DISTINCT user_id) FROM episode_unlocks WHERE method = 'coins') AS paying_users,
        (SELECT COUNT(DISTINCT user_id) FROM episode_unlocks WHERE method = 'ad') AS ad_earners`,
  );

  const [rows] = await pool.execute<AdminUserRow[]>(
    `SELECT
        u.id,
        u.user_id,
        u.name,
        u.email,
        u.coin_balance,
        u.is_active,
        u.last_login_at,
        u.created_at,
        COALESCE(unlocks.unlock_count, 0) AS unlock_count,
        COALESCE(unlocks.ad_unlock_count, 0) AS ad_unlock_count,
        (
          SELECT s.title
            FROM watch_progress p
            INNER JOIN episodes e ON e.id = p.episode_id
            INNER JOIN series s ON s.id = e.series_id
           WHERE p.user_id = u.user_id
           ORDER BY p.watched_at DESC
           LIMIT 1
        ) AS last_watched_title,
        (
          SELECT p.watched_at
            FROM watch_progress p
           WHERE p.user_id = u.user_id
           ORDER BY p.watched_at DESC
           LIMIT 1
        ) AS last_watched_at
       FROM mobile_users u
       LEFT JOIN (
         SELECT
            user_id,
            COUNT(*) AS unlock_count,
            SUM(method = 'ad') AS ad_unlock_count
          FROM episode_unlocks
         GROUP BY user_id
       ) unlocks ON unlocks.user_id = u.user_id
      ORDER BY COALESCE(last_watched_at, u.last_login_at, u.created_at) DESC
      LIMIT 50`,
  );

  const summary = summaryRows[0];
  const totalUsers = numberValue(summary?.total_users);
  const activeUsers = numberValue(summary?.active_users);
  const newSignups = numberValue(summary?.new_signups);
  const payingUsers = numberValue(summary?.paying_users);
  const adEarners = numberValue(summary?.ad_earners);

  return {
    metrics: [
      { label: "New signups", value: compactNumber(newSignups), note: "Past 7 days" },
      { label: "Active users", value: compactNumber(activeUsers), note: `${compactNumber(totalUsers)} total accounts` },
      { label: "Coin unlockers", value: compactNumber(payingUsers), note: "Users who unlocked with coins" },
      { label: "Ad earners", value: compactNumber(adEarners), note: "Rewarded video users" },
    ],
    rows: rows.map((row) => {
      const coinBalance = numberValue(row.coin_balance);
      const isActive = Boolean(row.is_active);
      const unlockCount = numberValue(row.unlock_count);
      const adUnlockCount = numberValue(row.ad_unlock_count);
      const statusLabel = !isActive ? "Inactive" : coinBalance < 10 ? "Low balance" : "Active";
      const statusClass = !isActive ? "blocked" : coinBalance < 10 ? "review" : "live";
      const unlockNote = unlockCount > 0
        ? `${compactNumber(unlockCount)} unlock${unlockCount === 1 ? "" : "s"}`
        : "No unlocks";

      return {
        name: row.name || row.user_id,
        email: row.email,
        coinBalance,
        lastWatched: row.last_watched_title ?? "No watch history",
        statusLabel,
        statusClass,
        unlockNote: adUnlockCount > 0 ? `${unlockNote} / ${compactNumber(adUnlockCount)} ad` : unlockNote,
      };
    }),
  };
}

export async function listSeries(includeDrafts = true, userId?: string): Promise<SeriesRow[]> {
  const where = includeDrafts ? "" : "WHERE s.status = 'live'";
  const episodeJoin = includeDrafts
    ? "LEFT JOIN episodes e ON e.series_id = s.id"
    : "LEFT JOIN episodes e ON e.series_id = s.id AND e.status = 'live'";
  const progressJoin = userId
    ? "LEFT JOIN watch_progress p ON p.episode_id = e.id AND p.user_id = ?"
    : "";
  const params = userId ? [userId] : [];
  const [rows] = await pool.execute<SeriesRow[]>(
    `SELECT s.*, COUNT(e.id) AS episode_count,
            COALESCE(SUM(CASE WHEN e.is_free = 1 THEN 1 ELSE 0 END), 0) AS free_episode_count,
            MAX(COALESCE(e.release_date, DATE(e.created_at))) AS latest_episode_at,
            ${userId ? "COALESCE(MAX(p.progress_seconds), 0)" : "0"} AS progress_seconds
       FROM series s
       ${episodeJoin}
       ${progressJoin}
       ${where}
      GROUP BY s.id
      ORDER BY s.updated_at DESC`,
    params,
  );

  return rows;
}

export async function createSeries(input: {
  title: string;
  synopsis: string;
  genres: string;
  posterUrl: string | null;
  status: SeriesStatus;
}): Promise<CreatedSeries> {
  const slug = await uniqueSlug(input.title);
  const seriesId = await uniqueSeriesId();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO series (series_id, title, slug, synopsis, genres, poster_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [seriesId, input.title, slug, input.synopsis || null, input.genres || null, input.posterUrl, input.status],
  );

  return {
    id: result.insertId,
    seriesId,
  };
}

export async function listEpisodes(includeDrafts = true, userId?: string): Promise<EpisodeRow[]> {
  const where = includeDrafts ? "" : "WHERE s.status = 'live' AND e.status = 'live'";
  const unlockJoin = userId
    ? "LEFT JOIN episode_unlocks u ON u.episode_id = e.id AND u.user_id = ?"
    : "";
  const progressJoin = userId
    ? "LEFT JOIN watch_progress p ON p.episode_id = e.id AND p.user_id = ?"
    : "";
  const params = userId ? [userId, userId] : [];
  const [rows] = await pool.execute<EpisodeRow[]>(
    `SELECT e.*, s.title AS series_title,
            ${userId ? "IF(u.id IS NULL, 0, 1)" : "0"} AS is_unlocked,
            ${userId ? "p.progress_seconds" : "0"} AS progress_seconds
       FROM episodes e
       INNER JOIN series s ON s.id = e.series_id
       ${unlockJoin}
       ${progressJoin}
       ${where}
      ORDER BY s.title ASC, e.episode_number ASC`,
    params,
  );

  return rows;
}

export async function listEpisodesForSeries(seriesIdentifier: string | number, includeDrafts = true, userId?: string): Promise<EpisodeRow[]> {
  const where = includeDrafts
    ? "WHERE (s.series_id = ? OR e.series_id = ?)"
    : "WHERE (s.series_id = ? OR e.series_id = ?) AND s.status = 'live' AND e.status = 'live'";
  const unlockJoin = userId
    ? "LEFT JOIN episode_unlocks u ON u.episode_id = e.id AND u.user_id = ?"
    : "";
  const progressJoin = userId
    ? "LEFT JOIN watch_progress p ON p.episode_id = e.id AND p.user_id = ?"
    : "";
  const numericSeriesId = Number.parseInt(String(seriesIdentifier), 10);
  const fallbackSeriesId = Number.isNaN(numericSeriesId) ? 0 : numericSeriesId;
  const params = userId ? [userId, userId, String(seriesIdentifier), fallbackSeriesId] : [String(seriesIdentifier), fallbackSeriesId];
  const [rows] = await pool.execute<EpisodeRow[]>(
    `SELECT e.*, s.title AS series_title,
            ${userId ? "IF(u.id IS NULL, 0, 1)" : "0"} AS is_unlocked,
            ${userId ? "p.progress_seconds" : "0"} AS progress_seconds
       FROM episodes e
       INNER JOIN series s ON s.id = e.series_id
       ${unlockJoin}
       ${progressJoin}
       ${where}
      ORDER BY e.episode_number ASC`,
    params,
  );

  return rows;
}

export async function createEpisode(input: {
  seriesId: number;
  episodeNumber: number;
  title: string;
  hook: string;
  isFree: boolean;
  coinCost: number;
  releaseDate: string | null;
  status: EpisodeStatus;
}): Promise<number> {
  const episodeId = await uniqueEpisodeId();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO episodes
       (episode_id, series_id, episode_number, title, hook, is_free, coin_cost, release_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      episodeId,
      input.seriesId,
      input.episodeNumber,
      input.title,
      input.hook || null,
      input.isFree ? 1 : 0,
      input.coinCost,
      input.releaseDate,
      input.status,
    ],
  );

  return result.insertId;
}

export async function getEpisodeDatabaseId(episodeIdentifier: string | number): Promise<number | null> {
  const numericEpisodeId = Number.parseInt(String(episodeIdentifier), 10);
  const fallbackEpisodeId = Number.isNaN(numericEpisodeId) ? 0 : numericEpisodeId;
  const [rows] = await pool.execute<EpisodeIdentityRow[]>(
    "SELECT id, episode_id FROM episodes WHERE episode_id = ? OR id = ? LIMIT 1",
    [String(episodeIdentifier), fallbackEpisodeId],
  );

  return rows[0]?.id ?? null;
}

export async function attachCloudflareVideo(episodeId: number, uid: string): Promise<void> {
  await pool.execute(
    `UPDATE episodes
        SET cloudflare_video_uid = ?, status = 'processing', cloudflare_ready = 0
      WHERE id = ?`,
    [uid, episodeId],
  );
}

export async function attachLocalVideo(episodeId: number, videoUrl: string): Promise<void> {
  await pool.execute(
    `UPDATE episodes
        SET cloudflare_video_uid = ?, cloudflare_ready = 1
      WHERE id = ?`,
    [`local:${videoUrl}`, episodeId],
  );
}

export async function setSeriesStatus(seriesId: number, status: SeriesStatus): Promise<void> {
  await pool.execute("UPDATE series SET status = ? WHERE id = ?", [status, seriesId]);
}

export async function setEpisodeStatus(episodeId: number, status: EpisodeStatus): Promise<void> {
  await pool.execute("UPDATE episodes SET status = ? WHERE id = ?", [status, episodeId]);
}

export async function deleteEpisode(episodeId: number): Promise<void> {
  await pool.execute("DELETE FROM episodes WHERE id = ?", [episodeId]);
}

export async function markEpisodeReady(episodeId: number, input: {
  ready: boolean;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
}): Promise<void> {
  await pool.execute(
    `UPDATE episodes
        SET cloudflare_ready = ?, duration_seconds = COALESCE(?, duration_seconds),
            thumbnail_url = COALESCE(?, thumbnail_url),
            status = IF(? = 1 AND status = 'processing', 'draft', status)
      WHERE id = ?`,
    [input.ready ? 1 : 0, input.durationSeconds ?? null, input.thumbnailUrl ?? null, input.ready ? 1 : 0, episodeId],
  );
}

export async function getEpisodeForPlayback(episodeId: number, userId: string): Promise<EpisodeRow | null> {
  const [rows] = await pool.execute<EpisodeRow[]>(
    `SELECT e.*, s.title AS series_title, IF(u.id IS NULL, 0, 1) AS is_unlocked, p.progress_seconds
       FROM episodes e
       INNER JOIN series s ON s.id = e.series_id
       LEFT JOIN episode_unlocks u ON u.episode_id = e.id AND u.user_id = ?
       LEFT JOIN watch_progress p ON p.episode_id = e.id AND p.user_id = ?
      WHERE e.id = ? AND e.status = 'live' AND s.status = 'live'
      LIMIT 1`,
    [userId, userId, episodeId],
  );

  return rows[0] ?? null;
}

export async function unlockEpisode(
  episodeId: number,
  userId: string,
  method: "coins" | "ad" | "free",
): Promise<UnlockEpisodeResult> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [episodeRows] = await connection.execute<UnlockEpisodeRow[]>(
      `SELECT e.coin_cost, e.episode_number, e.title, s.title AS series_title
         FROM episodes e
         INNER JOIN series s ON s.id = e.series_id
        WHERE e.id = ?
        LIMIT 1
        FOR UPDATE`,
      [episodeId],
    );
    const episode = episodeRows[0];
    if (!episode) {
      throw new Error("Episode is not available.");
    }

    const [userRows] = await connection.execute<UnlockUserRow[]>(
      `SELECT coin_balance
         FROM mobile_users
        WHERE user_id = ? AND is_active = 1
        LIMIT 1
        FOR UPDATE`,
      [userId],
    );
    const user = userRows[0];
    if (!user) {
      throw new Error("Sign in to continue.");
    }

    const [existingRows] = await connection.execute<UnlockExistingRow[]>(
      "SELECT id FROM episode_unlocks WHERE user_id = ? AND episode_id = ? LIMIT 1",
      [userId, episodeId],
    );
    const alreadyUnlocked = existingRows.length > 0;
    const coinCost = Number(episode.coin_cost ?? 0);
    const coinsDeducted = method === "coins" && !alreadyUnlocked ? coinCost : 0;
    const currentBalance = Number(user.coin_balance ?? 0);

    if (coinsDeducted > currentBalance) {
      throw new InsufficientCoinsError();
    }

    if (coinsDeducted > 0) {
      await connection.execute(
        "UPDATE mobile_users SET coin_balance = coin_balance - ? WHERE user_id = ?",
        [coinsDeducted, userId],
      );
      await connection.execute(
        `INSERT INTO wallet_transactions (user_id, transaction_type, coin_amount, description, episode_id)
         VALUES (?, 'spend', ?, ?, ?)`,
        [
          userId,
          -coinsDeducted,
          `Unlocked ${episode.series_title} Episode ${episode.episode_number}: ${episode.title}`,
          episodeId,
        ],
      );
    }

    await connection.execute(
      `INSERT INTO episode_unlocks (user_id, episode_id, method)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE method = method`,
      [userId, episodeId, method],
    );

    await connection.commit();

    return {
      coinsDeducted,
      newCoinBalance: currentBalance - coinsDeducted,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function topUpMobileUserWallet(userId: string, coins: number): Promise<WalletTopUpResult | null> {
  if (!userId || !Number.isInteger(coins) || coins <= 0) {
    return null;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE mobile_users SET coin_balance = coin_balance + ? WHERE user_id = ? AND is_active = 1",
      [coins, userId],
    );
    await connection.execute(
      `INSERT INTO wallet_transactions (user_id, transaction_type, coin_amount, description)
       VALUES (?, 'top_up', ?, ?)`,
      [userId, coins, `Added ${coins.toLocaleString("en")} coins`],
    );

    const [rows] = await connection.execute<UnlockUserRow[]>(
      "SELECT coin_balance FROM mobile_users WHERE user_id = ? AND is_active = 1 LIMIT 1",
      [userId],
    );
    const user = rows[0];

    if (!user) {
      await connection.rollback();
      return null;
    }

    await connection.commit();

    return {
      coinsAdded: coins,
      newCoinBalance: Number(user.coin_balance ?? 0),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listWalletTransactions(userId: string): Promise<WalletTransaction[]> {
  const [rows] = await pool.execute<WalletTransactionRow[]>(
    `SELECT
        t.id,
        t.transaction_type,
        t.coin_amount,
        t.description,
        e.episode_id,
        s.title AS series_title,
        e.episode_number,
        t.created_at
       FROM wallet_transactions t
       LEFT JOIN episodes e ON e.id = t.episode_id
       LEFT JOIN series s ON s.id = e.series_id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 25`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.transaction_type,
    coinAmount: Number(row.coin_amount ?? 0),
    description: row.description,
    episodeId: row.episode_id,
    seriesTitle: row.series_title,
    episodeNumber: row.episode_number,
    createdAt: row.created_at,
  }));
}

function mapProfileEpisode(row: ProfileEpisodeRow): ProfileEpisode {
  return {
    episodeId: row.episode_id,
    episodeNumber: row.episode_number,
    episodeTitle: row.episode_title,
    hook: row.hook,
    progressSeconds: numberValue(row.progress_seconds),
    activityAt: row.activity_at,
    series: {
      id: row.series_database_id,
      series_id: row.series_id,
      title: row.series_title,
      slug: row.slug,
      synopsis: row.synopsis,
      genres: row.genres,
      poster_url: row.poster_url,
      status: row.status,
      episode_count: numberValue(row.episode_count),
      free_episode_count: numberValue(row.free_episode_count),
      latest_episode_at: row.latest_episode_at,
      progress_seconds: numberValue(row.progress_seconds),
    },
  };
}

export async function listWatchHistory(userId: string): Promise<ProfileEpisode[]> {
  const [rows] = await pool.execute<ProfileEpisodeRow[]>(
    `SELECT
        e.id,
        e.episode_id,
        s.series_id,
        s.id AS series_database_id,
        s.title AS series_title,
        s.slug,
        s.synopsis,
        s.genres,
        s.poster_url,
        s.status,
        e.episode_number,
        e.title AS episode_title,
        e.hook,
        p.progress_seconds,
        p.watched_at AS activity_at,
        (
          SELECT COUNT(*)
            FROM episodes count_e
           WHERE count_e.series_id = s.id AND count_e.status = 'live'
        ) AS episode_count,
        (
          SELECT COUNT(*)
            FROM episodes free_e
           WHERE free_e.series_id = s.id AND free_e.status = 'live' AND free_e.is_free = 1
        ) AS free_episode_count,
        (
          SELECT MAX(COALESCE(latest_e.release_date, DATE(latest_e.created_at)))
            FROM episodes latest_e
           WHERE latest_e.series_id = s.id AND latest_e.status = 'live'
        ) AS latest_episode_at
       FROM watch_progress p
       INNER JOIN episodes e ON e.id = p.episode_id
       INNER JOIN series s ON s.id = e.series_id
      WHERE p.user_id = ? AND e.status = 'live' AND s.status = 'live'
      ORDER BY p.watched_at DESC, p.id DESC
      LIMIT 50`,
    [userId],
  );

  return rows.map(mapProfileEpisode);
}

export async function listLikedEpisodes(userId: string): Promise<ProfileEpisode[]> {
  const [rows] = await pool.execute<ProfileEpisodeRow[]>(
    `SELECT
        e.id,
        e.episode_id,
        s.series_id,
        s.id AS series_database_id,
        s.title AS series_title,
        s.slug,
        s.synopsis,
        s.genres,
        s.poster_url,
        s.status,
        e.episode_number,
        e.title AS episode_title,
        e.hook,
        p.progress_seconds,
        r.created_at AS activity_at,
        (
          SELECT COUNT(*)
            FROM episodes count_e
           WHERE count_e.series_id = s.id AND count_e.status = 'live'
        ) AS episode_count,
        (
          SELECT COUNT(*)
            FROM episodes free_e
           WHERE free_e.series_id = s.id AND free_e.status = 'live' AND free_e.is_free = 1
        ) AS free_episode_count,
        (
          SELECT MAX(COALESCE(latest_e.release_date, DATE(latest_e.created_at)))
            FROM episodes latest_e
           WHERE latest_e.series_id = s.id AND latest_e.status = 'live'
        ) AS latest_episode_at
       FROM episode_reactions r
       INNER JOIN episodes e ON e.id = r.episode_id
       INNER JOIN series s ON s.id = e.series_id
       LEFT JOIN watch_progress p ON p.episode_id = e.id AND p.user_id = r.user_id
      WHERE r.user_id = ? AND r.reaction_type = 'like' AND e.status = 'live' AND s.status = 'live'
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 50`,
    [userId],
  );

  return rows.map(mapProfileEpisode);
}

export async function saveProgress(episodeId: number, userId: string, progressSeconds: number): Promise<void> {
  await pool.execute(
    `INSERT INTO watch_progress (user_id, episode_id, progress_seconds)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE progress_seconds = VALUES(progress_seconds)`,
    [userId, episodeId, progressSeconds],
  );
}

export async function getEpisodeEngagement(episodeId: number, userId: string): Promise<EpisodeEngagement> {
  const [rows] = await pool.execute<EpisodeEngagementRow[]>(
    `SELECT
        (SELECT COUNT(*) FROM episode_reactions WHERE episode_id = ? AND reaction_type = 'like') AS like_count,
        (SELECT COUNT(*) FROM episode_comments WHERE episode_id = ?) AS comment_count,
        (SELECT COUNT(*) FROM episode_reactions WHERE episode_id = ? AND reaction_type = 'save') AS save_count,
        (SELECT COUNT(*) FROM episode_reactions WHERE user_id = ? AND episode_id = ? AND reaction_type = 'like') AS has_liked,
        (SELECT COUNT(*) FROM episode_reactions WHERE user_id = ? AND episode_id = ? AND reaction_type = 'save') AS has_saved`,
    [episodeId, episodeId, episodeId, userId, episodeId, userId, episodeId],
  );
  const row = rows[0];

  return {
    likeCount: numberValue(row?.like_count),
    commentCount: numberValue(row?.comment_count),
    saveCount: numberValue(row?.save_count),
    hasLiked: numberValue(row?.has_liked) > 0,
    hasSaved: numberValue(row?.has_saved) > 0,
  };
}

export async function setEpisodeReaction(
  episodeId: number,
  userId: string,
  reactionType: EpisodeReactionType,
  isActive: boolean,
): Promise<EpisodeEngagement> {
  if (isActive) {
    await pool.execute(
      `INSERT INTO episode_reactions (user_id, episode_id, reaction_type)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE reaction_type = reaction_type`,
      [userId, episodeId, reactionType],
    );
  } else {
    await pool.execute(
      "DELETE FROM episode_reactions WHERE user_id = ? AND episode_id = ? AND reaction_type = ?",
      [userId, episodeId, reactionType],
    );
  }

  return getEpisodeEngagement(episodeId, userId);
}

export async function listEpisodeComments(episodeId: number): Promise<EpisodeComment[]> {
  const [rows] = await pool.execute<EpisodeCommentRow[]>(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS author_name
       FROM episode_comments c
       LEFT JOIN mobile_users u ON u.user_id = c.user_id
      WHERE c.episode_id = ?
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 50`,
    [episodeId],
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name || "AfroReel Viewer",
    body: row.body,
    createdAt: row.created_at,
  }));
}

export async function addEpisodeComment(episodeId: number, userId: string, body: string): Promise<EpisodeComment> {
  const cleanBody = body.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!cleanBody) {
    throw new Error("Comment cannot be empty.");
  }

  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO episode_comments (user_id, episode_id, body) VALUES (?, ?, ?)",
    [userId, episodeId, cleanBody],
  );
  const [rows] = await pool.execute<EpisodeCommentRow[]>(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS author_name
       FROM episode_comments c
       LEFT JOIN mobile_users u ON u.user_id = c.user_id
      WHERE c.id = ?
      LIMIT 1`,
    [result.insertId],
  );
  const row = rows[0];

  return {
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name || "AfroReel Viewer",
    body: row.body,
    createdAt: row.created_at,
  };
}
