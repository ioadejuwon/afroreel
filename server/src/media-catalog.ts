import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { episodePreviewId, isStreamVideoUid, MediaError } from "./cloudflare";
import { config } from "./config";
import { pool } from "./db";

export type Asset = { service: "Stream" | "Images"; id: string };
type MediaRow = {
  poster_image_id?: string | null;
  poster_url?: string | null;
  thumbnail_url?: string | null;
  cloudflare_video_uid?: string | null;
  cloudflare_pending_uid?: string | null;
  cloudflare_ready?: number;
  frame_time_ms?: number;
};

// Serialize reference changes with the worker's final check and provider DELETE.
// Playback and other ordinary catalog reads do not acquire this row lock.
export async function mediaTransaction<T>(action: (db: PoolConnection) => Promise<T>): Promise<T> {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [lock] = await db.query<RowDataPacket[]>("SELECT id FROM media_catalog_lock WHERE id = 1 FOR UPDATE");
    if (!lock.length) throw new Error("Missing media catalog lock. Check database migrations.");
    const result = await action(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export function deliveryAsset(value?: string | null, includeSigned = false): Asset | undefined {
  if (!value) return;
  const url = URL.parse(value);
  if (!url || !["https:", "http:"].includes(url.protocol)) return;
  const cf = config.cloudflare;
  const parts = url.pathname.split("/");
  const customImages = parts[1] === "cdn-cgi" && parts[2] === "imagedelivery";
  const trustedCustomHost = customImages && url.hostname === URL.parse(config.publicBaseUrl ?? "")?.hostname;
  if (url.hostname === "imagedelivery.net" || trustedCustomHost || (includeSigned && customImages)) {
    const offset = customImages ? 3 : 1;
    const image = parts[offset + 1];
    if (cf.imagesDeliveryHash && parts[offset] === cf.imagesDeliveryHash && image && /^[a-z0-9-]{1,190}$/i.test(image)) {
      return { service: "Images", id: image };
    }
  }
  const customer = cf.customerCode?.match(/^(?:https?:\/\/)?(?:customer-)?([a-z0-9]+)(?:\.cloudflarestream\.com\/?)?$/i)?.[1];
  const streamHosts = ["videodelivery.net", "iframe.videodelivery.net", "watch.videodelivery.net",
    "cloudflarestream.com", "iframe.cloudflarestream.com", "watch.cloudflarestream.com"];
  if (customer) streamHosts.push(`customer-${customer.toLowerCase()}.cloudflarestream.com`);
  if (!streamHosts.includes(url.hostname)) return;
  const identifier = parts[1];
  if (isStreamVideoUid(identifier)) return { service: "Stream", id: identifier };
  // A legacy signed link can protect a video, but unverified claims never nominate it for deletion.
  if (includeSigned && identifier?.split(".").length === 3) {
    try {
      const { sub } = JSON.parse(Buffer.from(identifier.split(".")[1], "base64url").toString());
      if (isStreamVideoUid(sub)) return { service: "Stream", id: sub };
    } catch { /* Unrecognized delivery URL. */ }
  }
}

export function rowAssets(row: MediaRow, includeSigned = false): Asset[] {
  const assets: Asset[] = [];
  if (row.poster_image_id && /^[a-z0-9-]{1,190}$/i.test(row.poster_image_id)) {
    assets.push({ service: "Images", id: row.poster_image_id });
  }
  for (const value of [row.poster_url, row.thumbnail_url, row.cloudflare_video_uid]) {
    const asset = deliveryAsset(value, includeSigned);
    if (asset) assets.push(asset);
  }
  for (const id of [row.cloudflare_video_uid, row.cloudflare_pending_uid]) {
    if (isStreamVideoUid(id)) assets.push({ service: "Stream", id });
  }
  if (row.cloudflare_ready && isStreamVideoUid(row.cloudflare_video_uid) && row.frame_time_ms != null) {
    assets.push({ service: "Images", id: episodePreviewId(row.cloudflare_video_uid, row.frame_time_ms) });
  }
  return assets;
}

// Preserve local or external fallback artwork. A replaced Cloudflare fallback is itself retired.
export async function retirePoster(db: PoolConnection, seriesId: number, nextId: string): Promise<void> {
  const [rows] = await db.execute<(MediaRow & RowDataPacket)[]>("SELECT poster_image_id, poster_url FROM series WHERE id = ?", [seriesId]);
  if (!rows[0]) return;
  if (deliveryAsset(rows[0].poster_url)) {
    await db.execute("UPDATE series SET poster_url = NULL WHERE id = ?", [seriesId]);
  }
  await queueAssets(db, rowAssets(rows[0]).filter(asset => asset.service !== "Images" || asset.id !== nextId));
}

export async function seriesAssets(db: PoolConnection, id?: number): Promise<Asset[]> {
  const [rows] = await db.execute<(MediaRow & RowDataPacket)[]>(
    "SELECT poster_image_id, poster_url FROM series" + (id === undefined ? "" : " WHERE id = ?"), id === undefined ? [] : [id],
  );
  return rows.flatMap(row => rowAssets(row, id === undefined));
}

export async function episodeAssets(db: PoolConnection, where = "", args: (string | number)[] = []): Promise<Asset[]> {
  const [rows] = await db.execute<(MediaRow & RowDataPacket)[]>(`SELECT cloudflare_pending_uid, cloudflare_video_uid, cloudflare_ready,
    COALESCE(cloudflare_thumbnail_time_ms, duration_seconds * 100, 0) AS frame_time_ms, thumbnail_url FROM episodes ${where}`, args);
  return rows.flatMap(row => rowAssets(row, !where));
}

export function assetKey(asset: Asset): string {
  return asset.service + "/" + asset.id;
}

export async function catalogReferences(db: PoolConnection) {
  return new Set([...await seriesAssets(db), ...await episodeAssets(db)].map(assetKey));
}

export async function queueAssets(db: PoolConnection, assets: Asset[]): Promise<void> {
  if (!assets.length) return;
  if (!config.cloudflare.accountId) throw new MediaError(503, "Configure the Cloudflare account before removing hosted media.");
  const unique = new Map(assets.map(asset => [assetKey(asset), asset]));
  const rows = [...unique.values()].map(asset => [config.cloudflare.accountId, asset.service, asset.id]);
  await db.query("INSERT INTO media_cleanup (account_id, service, asset_id) VALUES ? ON DUPLICATE KEY UPDATE asset_id = VALUES(asset_id)", [rows]);
}
