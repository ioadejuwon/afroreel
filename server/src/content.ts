import { randomBytes } from "node:crypto";
import { type RowDataPacket, type ResultSetHeader } from "mysql2";
import { isStreamVideoUid, MediaError, verifyPosterImage, type StreamVideo } from "./cloudflare";
import { allowLocalMedia } from "./config";
import { pool } from "./db";
import { mediaTransaction, retirePoster, seriesAssets, episodeAssets, queueAssets } from "./media-catalog";
import { ensureStreamPreview } from "./episode-previews";

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
  poster_image_id: string | null;
  status: SeriesStatus;
  default_episode_access: "free" | "locked";
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
  is_free: 0 | 1;
  episode_id: string;
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
  poster_image_id: string | null;
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
  poster_image_id: string | null;
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
  release_date: Date | string | null;
  created_at: Date | string;
  status: EpisodeStatus;
  cloudflare_video_uid: string | null;
  cloudflare_ready: 0 | 1;
  cloudflare_pending_uid: string | null;
  cloudflare_upload_state: "uploading" | "processing" | "failed" | null;
  cloudflare_upload_error: string | null;
  cloudflare_thumbnail_time_ms: number | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  is_unlocked?: 0 | 1;
  progress_seconds?: number | null;
};

export type EpisodeMedia = RowDataPacket & Pick<EpisodeRow,
  "id" | "status" | "cloudflare_video_uid" | "cloudflare_ready" | "cloudflare_pending_uid" |
  "cloudflare_upload_state" | "cloudflare_upload_error"
>;

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

async function executeIgnoringMysqlCodes(sql: string, ignoredCodes: string[]): Promise<void> {
  try {
    await pool.execute(sql);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (!ignoredCodes.includes(code)) {
      throw error;
    }
  }
}

async function getColumnDataType(tableName: string, columnName: string): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DATA_TYPE AS data_type
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName],
  );

  return rows[0]?.data_type ? String(rows[0].data_type).toLowerCase() : null;
}

async function migrateEpisodeReferenceColumn(input: {
  tableName: string;
  nullable: boolean;
  foreignKeyName: string;
  indexesToDrop: string[];
  indexesToCreate: string[];
}): Promise<void> {
  const dataType = await getColumnDataType(input.tableName, "episode_id");
  if (!dataType || dataType === "varchar") {
    return;
  }

  await executeIgnoringMysqlCodes(
    `ALTER TABLE ${input.tableName} ADD COLUMN episode_public_id VARCHAR(32) NULL AFTER episode_id`,
    ["ER_DUP_FIELDNAME"],
  );
  await pool.execute(
    `UPDATE ${input.tableName} item
       LEFT JOIN episodes e ON e.id = item.episode_id
        SET item.episode_public_id = e.episode_id
      WHERE item.episode_id IS NOT NULL`,
  );
  await executeIgnoringMysqlCodes(
    `ALTER TABLE ${input.tableName} DROP FOREIGN KEY ${input.foreignKeyName}`,
    ["ER_CANT_DROP_FIELD_OR_KEY", "ER_FK_CANNOT_DROP_PARENT"],
  );
  for (const indexName of input.indexesToDrop) {
    await executeIgnoringMysqlCodes(`ALTER TABLE ${input.tableName} DROP INDEX ${indexName}`, ["ER_CANT_DROP_FIELD_OR_KEY"]);
  }
  await pool.execute(`ALTER TABLE ${input.tableName} DROP COLUMN episode_id`);
  await pool.execute(
    `ALTER TABLE ${input.tableName} CHANGE episode_public_id episode_id VARCHAR(32) ${input.nullable ? "NULL" : "NOT NULL"}`,
  );
  for (const createIndexSql of input.indexesToCreate) {
    await executeIgnoringMysqlCodes(createIndexSql, ["ER_DUP_KEYNAME"]);
  }
  await executeIgnoringMysqlCodes(
    `ALTER TABLE ${input.tableName}
       ADD CONSTRAINT ${input.foreignKeyName}
       FOREIGN KEY (episode_id) REFERENCES episodes(episode_id)
       ON DELETE ${input.nullable ? "SET NULL" : "CASCADE"}`,
    ["ER_FK_DUP_NAME"],
  );
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
    CREATE TABLE IF NOT EXISTS episode_unlocks (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      episode_id VARCHAR(32) NOT NULL,
      method ENUM('coins', 'ad', 'free') NOT NULL DEFAULT 'coins',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_episode_unlock (user_id, episode_id),
      CONSTRAINT fk_unlocks_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(episode_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      transaction_type ENUM('top_up', 'spend', 'reward') NOT NULL,
      coin_amount INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      episode_id VARCHAR(32) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_wallet_transactions_user_created (user_id, created_at),
      CONSTRAINT fk_wallet_transactions_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(episode_id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS watch_progress (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      episode_id VARCHAR(32) NOT NULL,
      progress_seconds INT UNSIGNED NOT NULL DEFAULT 0,
      watched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_episode_progress (user_id, episode_id),
      CONSTRAINT fk_progress_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(episode_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS episode_reactions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      episode_id VARCHAR(32) NOT NULL,
      reaction_type ENUM('like', 'save') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_episode_reaction (user_id, episode_id, reaction_type),
      INDEX idx_episode_reactions_episode_type (episode_id, reaction_type),
      CONSTRAINT fk_episode_reactions_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(episode_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS episode_comments (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      episode_id VARCHAR(32) NOT NULL,
      body VARCHAR(500) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_episode_comments_episode_created (episode_id, created_at),
      CONSTRAINT fk_episode_comments_episode
        FOREIGN KEY (episode_id) REFERENCES episodes(episode_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await migrateEpisodeReferenceColumn({
    tableName: "episode_unlocks",
    nullable: false,
    foreignKeyName: "fk_unlocks_episode",
    indexesToDrop: ["unique_user_episode_unlock"],
    indexesToCreate: [
      "ALTER TABLE episode_unlocks ADD UNIQUE KEY unique_user_episode_unlock (user_id, episode_id)",
    ],
  });
  await migrateEpisodeReferenceColumn({
    tableName: "wallet_transactions",
    nullable: true,
    foreignKeyName: "fk_wallet_transactions_episode",
    indexesToDrop: [],
    indexesToCreate: [],
  });
  await migrateEpisodeReferenceColumn({
    tableName: "watch_progress",
    nullable: false,
    foreignKeyName: "fk_progress_episode",
    indexesToDrop: ["unique_user_episode_progress"],
    indexesToCreate: [
      "ALTER TABLE watch_progress ADD UNIQUE KEY unique_user_episode_progress (user_id, episode_id)",
    ],
  });
  await migrateEpisodeReferenceColumn({
    tableName: "episode_reactions",
    nullable: false,
    foreignKeyName: "fk_episode_reactions_episode",
    indexesToDrop: ["unique_user_episode_reaction", "idx_episode_reactions_episode_type"],
    indexesToCreate: [
      "ALTER TABLE episode_reactions ADD UNIQUE KEY unique_user_episode_reaction (user_id, episode_id, reaction_type)",
      "ALTER TABLE episode_reactions ADD INDEX idx_episode_reactions_episode_type (episode_id, reaction_type)",
    ],
  });
  await migrateEpisodeReferenceColumn({
    tableName: "episode_comments",
    nullable: false,
    foreignKeyName: "fk_episode_comments_episode",
    indexesToDrop: ["idx_episode_comments_episode_created"],
    indexesToCreate: [
      "ALTER TABLE episode_comments ADD INDEX idx_episode_comments_episode_created (episode_id, created_at)",
    ],
  });
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listSeries(includeDrafts = true, userId?: string): Promise<SeriesRow[]> {
  const where = includeDrafts ? "" : "WHERE s.status = 'live'";
  const episodeJoin = includeDrafts
    ? "LEFT JOIN episodes e ON e.series_id = s.id"
    : "LEFT JOIN episodes e ON e.series_id = s.id AND e.status = 'live'";
  const progressJoin = userId
    ? "LEFT JOIN watch_progress p ON p.episode_id = e.episode_id AND p.user_id = ?"
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

type SeriesDetails = {
  defaultEpisodeAccess?: "free" | "locked";
  status?: SeriesStatus;
  title: string;
  synopsis: string;
  genres: string;
  posterImageId: string | null;
};

export async function createSeries(input: SeriesDetails & {
  posterUrl: string | null;
  status: SeriesStatus;
}): Promise<CreatedSeries> {
  const slug = await uniqueSlug(input.title);
  const seriesId = await uniqueSeriesId();
  return mediaTransaction(async db => {
    if (input.posterImageId) await verifyPosterImage(input.posterImageId);
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO series (series_id, title, slug, synopsis, genres, poster_url, poster_image_id, status, default_episode_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [seriesId, input.title, slug, input.synopsis || null, input.genres || null, input.posterUrl, input.posterImageId, input.status, input.defaultEpisodeAccess ?? "free"],
    );

    return {
      id: result.insertId,
      seriesId,
    };
  });
}

export async function editSeries(seriesId: number, details: SeriesDetails): Promise<void> {
  await mediaTransaction(async db => {
    if (details.posterImageId) {
      await verifyPosterImage(details.posterImageId);
      await retirePoster(db, seriesId, details.posterImageId);
    }
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE series SET title = ?, synopsis = ?, genres = ?, default_episode_access = COALESCE(?, default_episode_access), status = COALESCE(?, status), poster_image_id = COALESCE(?, poster_image_id)
        WHERE id = ?`,
      [details.title, details.synopsis || null, details.genres || null, details.defaultEpisodeAccess ?? null, details.status ?? null, details.posterImageId, seriesId],
    );
    if (!result.affectedRows) throw new MediaError(404, "Series not found.");
  });
}

export async function duplicateSeries(sourceId: number): Promise<void> {
  const publicId = await uniqueSeriesId();
  await mediaTransaction(async db => {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO series (series_id, title, slug, synopsis, genres, poster_url, poster_image_id, status, default_episode_access)
       SELECT ?, LEFT(CONCAT('Copy of ', title), 190), CONCAT('copy-', ?), synopsis, genres, poster_url, poster_image_id, 'draft', default_episode_access
         FROM series WHERE id = ?`,
      [publicId, publicId, sourceId],
    );
    if (!result.affectedRows) throw new MediaError(404, "Series not found.");
  });
}

export async function deleteSeries(seriesId: number, expectedEpisodes: number, confirmationTitle: string): Promise<void> {
  await mediaTransaction(async db => {
    const assets = [...await seriesAssets(db, seriesId), ...await episodeAssets(db, "WHERE series_id = ?", [seriesId])];
    const [result] = await db.execute<ResultSetHeader>(
      "DELETE FROM series WHERE id = ? AND BINARY title = BINARY ? AND (SELECT COUNT(*) FROM episodes WHERE series_id = ?) = ?",
      [seriesId, confirmationTitle, seriesId, expectedEpisodes],
    );
    if (!result.affectedRows) throw new MediaError(409, "The series changed. Refresh the library and review it before deleting.");
    await queueAssets(db, assets);
  });
}

export async function setSeriesPoster(seriesId: number, imageId: string): Promise<boolean> {
  return mediaTransaction(async db => {
    await verifyPosterImage(imageId);
    await retirePoster(db, seriesId, imageId);
    const [result] = await db.execute<ResultSetHeader>(
      "UPDATE series SET poster_image_id = ? WHERE id = ?",
      [imageId, seriesId],
    );
    return result.affectedRows > 0;
  });
}

export async function listEpisodes(includeDrafts = true, userId?: string): Promise<EpisodeRow[]> {
  const where = includeDrafts ? "" : "WHERE s.status = 'live' AND e.status = 'live'";
  const unlockJoin = userId
    ? "LEFT JOIN episode_unlocks u ON u.episode_id = e.episode_id AND u.user_id = ?"
    : "";
  const progressJoin = userId
    ? "LEFT JOIN watch_progress p ON p.episode_id = e.episode_id AND p.user_id = ?"
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
    ? "LEFT JOIN episode_unlocks u ON u.episode_id = e.episode_id AND u.user_id = ?"
    : "";
  const progressJoin = userId
    ? "LEFT JOIN watch_progress p ON p.episode_id = e.episode_id AND p.user_id = ?"
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
  publishWhenReady?: boolean;
}): Promise<number> {
  const episodeId = await uniqueEpisodeId();
  return mediaTransaction(async db => {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO episodes
         (episode_id, series_id, episode_number, title, hook, is_free, coin_cost, release_date, status, publish_when_ready)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.publishWhenReady ?? false,
      ],
    );

    return result.insertId;
  });
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

export async function getEpisodePublicId(episodeIdentifier: string | number): Promise<string | null> {
  const numericEpisodeId = Number.parseInt(String(episodeIdentifier), 10);
  const fallbackEpisodeId = Number.isNaN(numericEpisodeId) ? 0 : numericEpisodeId;
  const [rows] = await pool.execute<EpisodeIdentityRow[]>(
    "SELECT id, episode_id FROM episodes WHERE episode_id = ? OR id = ? LIMIT 1",
    [String(episodeIdentifier), fallbackEpisodeId],
  );

  return rows[0]?.episode_id ?? null;
}

export async function getEpisodeMedia(episodeId: number): Promise<EpisodeMedia | null> {
  const [rows] = await pool.execute<EpisodeMedia[]>(
    `SELECT id, status, cloudflare_video_uid, cloudflare_ready, cloudflare_pending_uid,
            cloudflare_upload_state, cloudflare_upload_error
       FROM episodes WHERE id = ?`,
    [episodeId],
  );
  return rows[0] ?? null;
}

export async function beginEpisodeStreamUpload(episodeId: number, uid: string, replacedUid: string | null): Promise<boolean> {
  return mediaTransaction(async db => {
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE episodes
          SET cloudflare_pending_uid = ?, cloudflare_upload_state = 'uploading', cloudflare_upload_error = NULL
        WHERE id = ? AND cloudflare_pending_uid <=> ?`,
      [uid, episodeId, replacedUid],
    );
    const displaced = result.affectedRows ? replacedUid : uid;
    if (isStreamVideoUid(displaced) && (!result.affectedRows || displaced !== uid)) {
      await queueAssets(db, [{ service: "Stream", id: displaced }]);
    }
    return result.affectedRows > 0;
  });
}

export async function markEpisodeUploadComplete(episodeId: number, uid: string): Promise<void> {
  await pool.execute(
    `UPDATE episodes SET cloudflare_upload_state = 'processing'
      WHERE id = ? AND cloudflare_pending_uid = ? AND cloudflare_upload_state = 'uploading'`,
    [episodeId, uid],
  );
}

export async function attachLocalVideo(episodeId: number, videoUrl: string): Promise<void> {
  await mediaTransaction(async db => {
    const assets = await episodeAssets(db, "WHERE id = ?", [episodeId]);
    await db.execute(
      `UPDATE episodes
          SET cloudflare_video_uid = ?, cloudflare_ready = 1,
              cloudflare_pending_uid = NULL, cloudflare_upload_state = NULL, cloudflare_upload_error = NULL,
              cloudflare_thumbnail_time_ms = NULL, thumbnail_url = NULL, duration_seconds = NULL,
              status = IF(publish_when_ready, 'live', IF(status = 'processing', 'draft', status)), publish_when_ready = FALSE
        WHERE id = ?`,
      [`local:${videoUrl}`, episodeId],
    );
    await queueAssets(db, assets);
  });
}

export async function setSeriesStatus(seriesId: number, status: SeriesStatus): Promise<void> {
  const [result] = await pool.execute<ResultSetHeader>("UPDATE series SET status = ? WHERE id = ?", [status, seriesId]);
  if (!result.affectedRows) throw new MediaError(404, "Series not found.");
}

export async function setEpisodeStatus(episodeId: number, status: EpisodeStatus): Promise<void> {
  if (status === "live") {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE episodes SET status = 'live', publish_when_ready = FALSE
        WHERE id = ? AND cloudflare_ready = 1 AND cloudflare_video_uid IS NOT NULL
          AND (? OR cloudflare_video_uid NOT LIKE 'local:%')`,
      [episodeId, allowLocalMedia],
    );
    if (!result.affectedRows) {
      throw new MediaError(409, "The video must finish processing before this episode can be published.");
    }
    return;
  }
  await pool.execute("UPDATE episodes SET status = ?, publish_when_ready = FALSE WHERE id = ?", [status, episodeId]);
}

export async function deleteEpisode(episodeId: number): Promise<void> {
  await mediaTransaction(async db => {
    const assets = await episodeAssets(db, "WHERE id = ?", [episodeId]);
    await db.execute("DELETE FROM episodes WHERE id = ?", [episodeId]);
    await queueAssets(db, assets);
  });
}

export async function applyStreamVideoStatus(video: StreamVideo): Promise<void> {
  if (video.state === "uploading") return;

  if (video.state === "processing") {
    await pool.execute(
      `UPDATE episodes SET cloudflare_upload_state = 'processing'
        WHERE cloudflare_pending_uid = ? AND cloudflare_upload_state = 'uploading'`,
      [video.uid],
    );
    return;
  }

  // The second match covers pre-migration records that were still processing.
  const currentUpload = `(
    (cloudflare_pending_uid = ? AND cloudflare_upload_state IN ('uploading', 'processing'))
    OR (cloudflare_pending_uid IS NULL AND cloudflare_upload_state IS NULL
        AND cloudflare_video_uid = ? AND cloudflare_ready = 0)
  )`;
  if (video.state === "failed") {
    await pool.execute(
      `UPDATE episodes
          SET cloudflare_upload_state = 'failed', cloudflare_upload_error = ?
        WHERE ${currentUpload}`,
      [video.error, video.uid, video.uid],
    );
    return;
  }

  await mediaTransaction(async db => {
    const assets = await episodeAssets(db, `WHERE ${currentUpload}`, [video.uid, video.uid]);
    await db.execute(
      `UPDATE episodes
          SET cloudflare_video_uid = ?, cloudflare_ready = 1, duration_seconds = ?,
              thumbnail_url = NULL, cloudflare_thumbnail_time_ms = ?,
              status = IF(publish_when_ready, 'live', IF(status = 'processing', 'draft', status)), publish_when_ready = FALSE,
              cloudflare_pending_uid = NULL, cloudflare_upload_state = NULL, cloudflare_upload_error = NULL
        WHERE ${currentUpload}`,
      [video.uid, video.durationSeconds, video.thumbnailTimeMs, video.uid, video.uid],
    );
    await queueAssets(db, assets.filter(asset => asset.service !== "Stream" || asset.id !== video.uid));
  });
  await ensureStreamPreview(video.uid);
}

export async function getEpisodeForPlayback(episodeIdentifier: string | number, userId: string): Promise<EpisodeRow | null> {
  const numericEpisodeId = Number.parseInt(String(episodeIdentifier), 10);
  const fallbackEpisodeId = Number.isNaN(numericEpisodeId) ? 0 : numericEpisodeId;
  const [rows] = await pool.execute<EpisodeRow[]>(
    `SELECT e.*, s.title AS series_title, IF(u.id IS NULL, 0, 1) AS is_unlocked, p.progress_seconds
       FROM episodes e
       INNER JOIN series s ON s.id = e.series_id
       LEFT JOIN episode_unlocks u ON u.episode_id = e.episode_id AND u.user_id = ?
       LEFT JOIN watch_progress p ON p.episode_id = e.episode_id AND p.user_id = ?
      WHERE (e.episode_id = ? OR e.id = ?) AND e.status = 'live' AND s.status = 'live'
      LIMIT 1`,
    [userId, userId, String(episodeIdentifier), fallbackEpisodeId],
  );

  return rows[0] ?? null;
}

export async function unlockEpisode(
  episodeIdentifier: string | number,
  userId: string,
  method: "coins" | "ad" | "free",
): Promise<UnlockEpisodeResult> {
  const numericEpisodeId = Number.parseInt(String(episodeIdentifier), 10);
  const fallbackEpisodeId = Number.isNaN(numericEpisodeId) ? 0 : numericEpisodeId;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [episodeRows] = await connection.execute<UnlockEpisodeRow[]>(
      `SELECT e.episode_id, e.is_free, e.coin_cost, e.episode_number, e.title, s.title AS series_title
         FROM episodes e
         INNER JOIN series s ON s.id = e.series_id
        WHERE e.episode_id = ? OR e.id = ?
        LIMIT 1
        FOR UPDATE`,
      [String(episodeIdentifier), fallbackEpisodeId],
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
      [userId, episode.episode_id],
    );
    const alreadyUnlocked = existingRows.length > 0;
    const coinCost = Number(episode.coin_cost ?? 0);
    const unlockMethod = episode.is_free ? "free" : method;
    const coinsDeducted = unlockMethod === "coins" && !alreadyUnlocked ? coinCost : 0;
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
          episode.episode_id,
        ],
      );
    }

    await connection.execute(
      `INSERT INTO episode_unlocks (user_id, episode_id, method)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE method = method`,
      [userId, episode.episode_id, unlockMethod],
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
       LEFT JOIN episodes e ON e.episode_id = t.episode_id
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
      poster_image_id: row.poster_image_id,
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
        s.poster_image_id,
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
       INNER JOIN episodes e ON e.episode_id = p.episode_id
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
        s.poster_image_id,
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
       INNER JOIN episodes e ON e.episode_id = r.episode_id
       INNER JOIN series s ON s.id = e.series_id
       LEFT JOIN watch_progress p ON p.episode_id = e.episode_id AND p.user_id = r.user_id
      WHERE r.user_id = ? AND r.reaction_type = 'like' AND e.status = 'live' AND s.status = 'live'
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 50`,
    [userId],
  );

  return rows.map(mapProfileEpisode);
}

export async function saveProgress(episodeId: string, userId: string, progressSeconds: number): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO watch_progress (user_id, episode_id, progress_seconds)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE progress_seconds = VALUES(progress_seconds)`,
      [userId, episodeId, progressSeconds],
    );
    if (progressSeconds > 0) {
      await connection.execute(
        `INSERT INTO daily_viewers (view_date, user_id) VALUES (UTC_DATE(), ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [userId],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getEpisodeEngagement(episodeId: string, userId: string): Promise<EpisodeEngagement> {
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
  episodeId: string,
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

export async function listEpisodeComments(episodeId: string, viewerUserId?: string): Promise<EpisodeComment[]> {
  const [rows] = await pool.execute<EpisodeCommentRow[]>(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS author_name
       FROM episode_comments c
       LEFT JOIN mobile_users u ON u.user_id = c.user_id
      WHERE c.episode_id = ?
        AND (? = '' OR NOT EXISTS (
          SELECT 1 FROM user_blocks b
           WHERE b.blocker_user_id = ? AND b.blocked_user_id = c.user_id
        ))
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 50`,
    [episodeId, viewerUserId ?? "", viewerUserId ?? ""],
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name || "AfroReel Viewer",
    body: row.body,
    createdAt: row.created_at,
  }));
}

export async function reportComment(commentId: number, reporterUserId: string, reason: string, details: string): Promise<void> {
  await pool.execute(
    `INSERT INTO comment_reports (comment_id, reporter_user_id, reason, details)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), details = VALUES(details), status = 'open'`,
    [commentId, reporterUserId, reason.slice(0, 80), details.slice(0, 500) || null],
  );
}

export async function blockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
  if (!blockedUserId || blockerUserId === blockedUserId) throw new Error("Invalid user to block.");
  await pool.execute(
    `INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE blocked_user_id = blocked_user_id`,
    [blockerUserId, blockedUserId],
  );
}

export async function deleteOwnComment(commentId: number, userId: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>("DELETE FROM episode_comments WHERE id = ? AND user_id = ?", [commentId, userId]);
  return result.affectedRows > 0;
}

export async function addEpisodeComment(episodeId: string, userId: string, body: string): Promise<EpisodeComment> {
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
