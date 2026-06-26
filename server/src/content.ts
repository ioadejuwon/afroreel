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

export type CreatedSeries = {
  id: number;
  seriesId: string;
};

export type EpisodeRow = RowDataPacket & {
  id: number;
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
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO episodes
       (series_id, episode_number, title, hook, is_free, coin_cost, release_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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

export async function unlockEpisode(episodeId: number, userId: string, method: "coins" | "ad" | "free"): Promise<void> {
  await pool.execute(
    `INSERT INTO episode_unlocks (user_id, episode_id, method)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE method = method`,
    [userId, episodeId, method],
  );
}

export async function saveProgress(episodeId: number, userId: string, progressSeconds: number): Promise<void> {
  await pool.execute(
    `INSERT INTO watch_progress (user_id, episode_id, progress_seconds)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE progress_seconds = VALUES(progress_seconds)`,
    [userId, episodeId, progressSeconds],
  );
}
