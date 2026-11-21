import type { RowDataPacket } from "mysql2";
import { deleteCloudflareAsset, listCloudflareAssets, verifyCleanupCatalog } from "./cloudflare";
import { config } from "./config";
import { pool } from "./db";
import { assetKey, catalogReferences, mediaTransaction, type Asset } from "./media-catalog";

type Job = Asset & RowDataPacket & { attempts: number };

function requireMediaConfiguration() {
  const { accountId, customerCode, imagesDeliveryHash } = config.cloudflare;
  if (!accountId || !customerCode || !imagesDeliveryHash) {
    throw new Error("The account ID, Stream customer code and Images delivery hash are required to check catalog references.");
  }
}

export async function cleanMedia(): Promise<void> {
  const account = config.cloudflare.accountId;
  requireMediaConfiguration();
  let catalogCheck: Promise<void> | undefined;
  let failures = 0;
  for (;;) {
    const handled = await mediaTransaction(async db => {
      const [jobs] = await db.execute<Job[]>(`SELECT service, asset_id AS id, attempts FROM media_cleanup
        WHERE account_id = ? AND next_attempt <= NOW() ORDER BY next_attempt LIMIT 1 FOR UPDATE`, [account]);
      const job = jobs[0];
      if (!job) return false;
      const key = [account, job.service, job.id];
      const references = await catalogReferences(db);
      if (!references.has(assetKey(job))) {
        try {
          catalogCheck ??= verifyCleanupCatalog();
          await catalogCheck;
          await deleteCloudflareAsset(job.service, job.id);
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 500) : "Deletion failed";
          const delay = Math.min(86400, 300 * 2 ** Math.min(job.attempts, 9));
          await db.execute(`UPDATE media_cleanup SET attempts = attempts + 1,
            next_attempt = TIMESTAMPADD(SECOND, ?, NOW()), last_error = ?
            WHERE account_id = ? AND service = ? AND asset_id = ?`, [delay, message, ...key]);
          console.error(`Cleanup ${assetKey(job)} attempt ${job.attempts + 1} failed: ${message}`);
          failures++;
          return true;
        }
        console.log(`Removed ${assetKey(job)}`);
      }
      await db.execute("DELETE FROM media_cleanup WHERE account_id = ? AND service = ? AND asset_id = ?", key);
      return true;
    });
    if (!handled) break;
  }
  if (failures) throw new Error(`${failures} cleanup jobs scheduled for retry.`);
}

export async function auditMedia(): Promise<void> {
  requireMediaConfiguration();
  const db = await pool.getConnection();
  let refs: Set<string>;
  try {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await db.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    refs = await catalogReferences(db);
  } finally {
    try { await db.rollback(); } finally { db.release(); }
  }
  let incomplete = false;
  for (const service of ["Stream", "Images"] as const) {
    let scanned = 0;
    let candidates = 0;
    try {
      for await (const item of listCloudflareAssets(service)) {
        scanned++;
        if (refs.has(assetKey({ service, id: item.id }))) continue;
        candidates++;
        console.log(JSON.stringify({ candidate: true, service, ...item }));
      }
      console.log(JSON.stringify({ service, complete: true, scanned, candidates }));
    } catch (error) {
      incomplete = true;
      console.error(JSON.stringify({ service, complete: false, scanned, candidates, error: String(error) }));
    }
  }
  if (incomplete) throw new Error("Historical media audit incomplete.");
}
