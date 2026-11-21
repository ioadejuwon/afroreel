import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { episodePreviewId, imageDeliveryUrl, importEpisodePreview } from "./cloudflare";
import { mediaTransaction, queueAssets, rowAssets } from "./media-catalog";
import { pool } from "./db";

type PreviewSource = RowDataPacket & {
  id: number;
  cloudflare_video_uid: string;
  frame_time_ms: number;
  thumbnail_url: string | null;
};

const previewColumns = "id, cloudflare_video_uid, COALESCE(cloudflare_thumbnail_time_ms, duration_seconds * 100, 0) AS frame_time_ms, thumbnail_url";

async function savePreview(episode: PreviewSource): Promise<boolean> {
  const { cloudflare_video_uid: uid, frame_time_ms: time } = episode;
  const target = imageDeliveryUrl(episodePreviewId(uid, time), "public");
  if (target && episode.thumbnail_url === target) return false;
  return mediaTransaction(async db => {
    const [current] = await db.execute<PreviewSource[]>(
      `SELECT ${previewColumns} FROM episodes WHERE id = ? AND cloudflare_video_uid = ? AND cloudflare_ready = 1`,
      [episode.id, uid],
    );
    const source = current[0];
    if (!source || source.frame_time_ms !== time || (target && source.thumbnail_url === target)) return false;
    const url = await importEpisodePreview(uid, time);
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE episodes SET thumbnail_url = ?
        WHERE id = ? AND cloudflare_video_uid = ? AND cloudflare_ready = 1
          AND COALESCE(cloudflare_thumbnail_time_ms, duration_seconds * 100, 0) = ?`,
      [url, episode.id, uid, time],
    );
    if (!result.affectedRows) await queueAssets(db, [{ service: "Images", id: episodePreviewId(uid, time) }]);
    else if (source.thumbnail_url) await queueAssets(db, rowAssets({ thumbnail_url: source.thumbnail_url }));
    return result.affectedRows > 0;
  });
}

export async function ensureStreamPreview(uid: string): Promise<void> {
  const [episodes] = await pool.execute<PreviewSource[]>(
    `SELECT ${previewColumns} FROM episodes WHERE cloudflare_video_uid = ? AND cloudflare_ready = 1`, [uid],
  );
  for (const episode of episodes) await savePreview(episode);
}

export async function backfillEpisodePreviews(): Promise<void> {
  let afterId = 0;
  let saved = 0;
  let failed = 0;
  let scanned = 0;
  for (;;) {
    const [episodes] = await pool.execute<PreviewSource[]>(
      `SELECT ${previewColumns} FROM episodes
        WHERE id > ? AND cloudflare_ready = 1 AND cloudflare_video_uid REGEXP '^[a-zA-Z0-9]{32}$'
        ORDER BY id LIMIT 100`, [afterId],
    );
    if (!episodes.length) break;
    for (const episode of episodes) {
      try {
        if (await savePreview(episode)) saved++;
      } catch (error) {
        failed++;
        console.error(`Episode ${episode.id}: ${error instanceof Error ? error.message : "Preview import failed."}`);
      }
      scanned++;
      afterId = episode.id;
    }
  }
  console.log(`Checked ${scanned} Stream episodes. Saved ${saved} previews.`);
  if (failed) throw new Error(`${failed} episode previews need another backfill attempt.`);
}
