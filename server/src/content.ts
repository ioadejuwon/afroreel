import { type RowDataPacket, type ResultSetHeader } from "mysql2";
import { pool } from "./db";

export type SeriesStatus = "draft" | "live";
export type EpisodeStatus = "draft" | "processing" | "live";

export type SeriesRow = RowDataPacket & {
  id: number;
  title: string;
  slug: string;
  synopsis: string | null;
  genres: string | null;
  poster_url: string | null;
  status: SeriesStatus;
  episode_count: number;
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

export async function listSeries(includeDrafts = true): Promise<SeriesRow[]> {
  const where = includeDrafts ? "" : "WHERE s.status = 'live'";
  const episodeJoin = includeDrafts
    ? "LEFT JOIN episodes e ON e.series_id = s.id"
    : "LEFT JOIN episodes e ON e.series_id = s.id AND e.status = 'live'";
  const [rows] = await pool.execute<SeriesRow[]>(
    `SELECT s.*, COUNT(e.id) AS episode_count
       FROM series s
       ${episodeJoin}
       ${where}
      GROUP BY s.id
      ORDER BY s.updated_at DESC`,
  );

  return rows;
}

export async function createSeries(input: {
  title: string;
  synopsis: string;
  genres: string;
  posterUrl: string | null;
  status: SeriesStatus;
}): Promise<number> {
  const slug = await uniqueSlug(input.title);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO series (title, slug, synopsis, genres, poster_url, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.title, slug, input.synopsis || null, input.genres || null, input.posterUrl, input.status],
  );

  return result.insertId;
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

export async function listEpisodesForSeries(seriesId: number, includeDrafts = true, userId?: string): Promise<EpisodeRow[]> {
  const where = includeDrafts
    ? "WHERE e.series_id = ?"
    : "WHERE e.series_id = ? AND s.status = 'live' AND e.status = 'live'";
  const unlockJoin = userId
    ? "LEFT JOIN episode_unlocks u ON u.episode_id = e.id AND u.user_id = ?"
    : "";
  const progressJoin = userId
    ? "LEFT JOIN watch_progress p ON p.episode_id = e.id AND p.user_id = ?"
    : "";
  const params = userId ? [userId, userId, seriesId] : [seriesId];
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

export async function setSeriesStatus(seriesId: number, status: SeriesStatus): Promise<void> {
  await pool.execute("UPDATE series SET status = ? WHERE id = ?", [status, seriesId]);
}

export async function setEpisodeStatus(episodeId: number, status: EpisodeStatus): Promise<void> {
  await pool.execute("UPDATE episodes SET status = ? WHERE id = ?", [status, episodeId]);
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
