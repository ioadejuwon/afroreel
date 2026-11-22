import { createHash, createSign, createVerify, randomBytes } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { config, isProduction } from "./config";
import { pool } from "./db";
import { MediaError } from "./cloudflare";
import { coinsForProduct } from "./commerce";

export type StorePlatform = "ios" | "android";
export type MonetizationSettings = {
  monetization_enabled: number;
  ad_unlock_enabled: number;
  daily_ad_unlock_limit: number;
  ad_claim_ttl_seconds: number;
};

type VerifiedPurchase = {
  platform: StorePlatform;
  productId: string;
  providerTransactionId: string;
  providerTokenHash: string;
  rawPayload: unknown;
};

type AppleTransaction = {
  transactionId?: string;
  productId?: string;
  bundleId?: string;
  type?: string;
  revocationDate?: number;
};

type GoogleProductPurchase = {
  orderId?: string;
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  purchaseTimeMillis?: string;
  purchaseType?: number;
  quantity?: number;
};

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const tokenHash = (value: string): string => createHash("sha256").update(value).digest("hex");
const base64url = (value: Buffer | string): string => Buffer.from(value).toString("base64url");

function decodeJwtPayload<T>(value: string): T {
  const part = value.split(".")[1];
  if (!part) throw new MediaError(502, "The store returned an invalid signed transaction.");
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    throw new MediaError(502, "The store returned an invalid signed transaction.");
  }
}

function appleAuthToken(): string {
  const apple = config.commerce.apple;
  if (!apple.issuerId || !apple.keyId || !apple.privateKey) {
    throw new MediaError(503, "Apple purchase verification is not configured.");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: apple.keyId, typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: apple.issuerId,
    iat: now,
    exp: now + 300,
    aud: "appstoreconnect-v1",
    bid: apple.bundleId,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  const signature = signer.sign({ key: apple.privateKey, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${base64url(signature)}`;
}

async function appleTransaction(transactionId: string): Promise<AppleTransaction> {
  if (!/^\d{6,30}$/.test(transactionId)) throw new MediaError(400, "Invalid Apple transaction identifier.");
  const token = appleAuthToken();
  const hosts = ["https://api.storekit.itunes.apple.com", "https://api.storekit-sandbox.itunes.apple.com"];
  for (const host of hosts) {
    const response = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) continue;
    if (!response.ok) throw new MediaError(502, `Apple could not verify this purchase (${response.status}).`);
    const body = await response.json() as { signedTransactionInfo?: string };
    if (!body.signedTransactionInfo) throw new MediaError(502, "Apple did not return transaction details.");
    return decodeJwtPayload<AppleTransaction>(body.signedTransactionInfo);
  }
  throw new MediaError(422, "Apple could not find this transaction.");
}

let googleAccessToken: { token: string; expiresAt: number } | null = null;
async function googleToken(): Promise<string> {
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now() + 60_000) return googleAccessToken.token;
  const google = config.commerce.google;
  if (!google.serviceAccountEmail || !google.privateKey) {
    throw new MediaError(503, "Google Play purchase verification is not configured.");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: google.serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${base64url(signer.sign(google.privateKey))}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new MediaError(502, `Google authorization failed (${response.status}).`);
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new MediaError(502, "Google did not return an access token.");
  googleAccessToken = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000 };
  return googleAccessToken.token;
}

async function googlePurchase(productId: string, purchaseToken: string): Promise<GoogleProductPurchase> {
  const accessToken = await googleToken();
  const { packageName } = config.commerce.google;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`
    + `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) throw new MediaError(422, "Google Play could not find this purchase.");
  if (!response.ok) throw new MediaError(502, `Google Play could not verify this purchase (${response.status}).`);
  return response.json() as Promise<GoogleProductPurchase>;
}

export async function verifyStorePurchase(input: {
  platform: unknown;
  productId: unknown;
  transactionId: unknown;
  purchaseToken: unknown;
}): Promise<VerifiedPurchase> {
  const platform = text(input.platform) as StorePlatform;
  const productId = text(input.productId);
  const transactionId = text(input.transactionId);
  const purchaseToken = text(input.purchaseToken);
  if ((platform !== "ios" && platform !== "android") || !coinsForProduct(productId)) {
    throw new MediaError(400, "Choose a valid store product.");
  }
  if (platform === "ios") {
    const transaction = await appleTransaction(transactionId);
    if (transaction.bundleId !== config.commerce.apple.bundleId || transaction.productId !== productId
      || transaction.transactionId !== transactionId || transaction.type !== "Consumable" || transaction.revocationDate) {
      throw new MediaError(422, "Apple reported that this purchase is not valid for AfroReel.");
    }
    return { platform, productId, providerTransactionId: transactionId, providerTokenHash: tokenHash(transactionId), rawPayload: transaction };
  }
  if (!purchaseToken) throw new MediaError(400, "The Google Play purchase token is missing.");
  const purchase = await googlePurchase(productId, purchaseToken);
  if (purchase.purchaseState !== 0 || purchase.quantity && purchase.quantity !== 1) {
    throw new MediaError(422, "Google Play reported that this purchase is not complete.");
  }
  return {
    platform,
    productId,
    providerTransactionId: purchase.orderId || tokenHash(purchaseToken),
    providerTokenHash: tokenHash(purchaseToken),
    rawPayload: purchase,
  };
}

export async function creditVerifiedPurchase(userId: string, purchase: VerifiedPurchase) {
  const coins = coinsForProduct(purchase.productId);
  if (!coins) throw new MediaError(400, "Choose a valid store product.");
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [existing] = await db.execute<RowDataPacket[]>(
      `SELECT user_id, product_id, coin_amount, status FROM purchase_transactions
        WHERE platform = ? AND (provider_transaction_id = ? OR provider_token_hash = ?) LIMIT 1 FOR UPDATE`,
      [purchase.platform, purchase.providerTransactionId, purchase.providerTokenHash],
    );
    if (existing[0]) {
      if (existing[0].user_id !== userId || existing[0].product_id !== purchase.productId) {
        throw new MediaError(409, "This store transaction is already linked to another purchase.");
      }
      const balance = await lockedBalance(db, userId);
      await db.commit();
      return { coinsAdded: 0, newCoinBalance: balance, alreadyProcessed: true };
    }
    await db.execute(
      `INSERT INTO purchase_transactions
        (user_id, platform, provider_transaction_id, provider_token_hash, product_id, coin_amount, status, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, 'verified', ?)`,
      [userId, purchase.platform, purchase.providerTransactionId, purchase.providerTokenHash, purchase.productId, coins, JSON.stringify(purchase.rawPayload)],
    );
    await db.execute("UPDATE mobile_users SET coin_balance = coin_balance + ? WHERE user_id = ? AND is_active = 1", [coins, userId]);
    await db.execute(
      `INSERT INTO wallet_transactions (user_id, transaction_type, coin_amount, description)
       VALUES (?, 'top_up', ?, ?)`,
      [userId, coins, `Purchased ${coins.toLocaleString("en")} coins`],
    );
    const balance = await lockedBalance(db, userId);
    await db.commit();
    return { coinsAdded: coins, newCoinBalance: balance, alreadyProcessed: false };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

async function lockedBalance(db: PoolConnection, userId: string): Promise<number> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT coin_balance FROM mobile_users WHERE user_id = ? AND is_active = 1 LIMIT 1 FOR UPDATE", [userId],
  );
  if (!rows[0]) throw new MediaError(404, "Could not update this wallet.");
  return Number(rows[0].coin_balance);
}

export async function reversePurchase(input: { platform: StorePlatform; providerTransactionId?: string; providerTokenHash?: string; status: "refunded" | "revoked" }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const field = input.providerTransactionId ? "provider_transaction_id" : "provider_token_hash";
    const value = input.providerTransactionId ?? input.providerTokenHash;
    if (!value) throw new MediaError(400, "A store transaction reference is required.");
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, user_id, coin_amount, status FROM purchase_transactions WHERE platform = ? AND ${field} = ? LIMIT 1 FOR UPDATE`,
      [input.platform, value],
    );
    const purchase = rows[0];
    if (!purchase || purchase.status !== "verified") {
      await db.commit();
      return false;
    }
    const coins = Number(purchase.coin_amount);
    await db.execute("UPDATE purchase_transactions SET status = ?, reversed_at = NOW() WHERE id = ?", [input.status, purchase.id]);
    await db.execute("UPDATE mobile_users SET coin_balance = coin_balance - ? WHERE user_id = ?", [coins, purchase.user_id]);
    await db.execute(
      `INSERT INTO wallet_transactions (user_id, transaction_type, coin_amount, description)
       VALUES (?, 'top_up', ?, ?)`,
      [purchase.user_id, -coins, `${input.status === "refunded" ? "Refunded" : "Revoked"} store purchase`],
    );
    await db.commit();
    return true;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export async function monetizationSettings(): Promise<MonetizationSettings> {
  const [rows] = await pool.execute<(MonetizationSettings & RowDataPacket)[]>(
    `SELECT monetization_enabled, ad_unlock_enabled, daily_ad_unlock_limit, ad_claim_ttl_seconds
       FROM monetization_settings WHERE id = 1`,
  );
  if (!rows[0]) throw new Error("Monetization settings are missing. Run database migrations.");
  return rows[0];
}

export async function adUnlockAllowance(userId: string) {
  const settings = await monetizationSettings();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ad_reward_claims
      WHERE user_id = ? AND status = 'verified' AND verified_at > NOW() - INTERVAL 24 HOUR`, [userId],
  );
  const used = Number(rows[0]?.total ?? 0);
  return {
    enabled: Boolean(settings.monetization_enabled && settings.ad_unlock_enabled),
    limit: Number(settings.daily_ad_unlock_limit),
    remaining: Math.max(0, Number(settings.daily_ad_unlock_limit) - used),
  };
}

function wholeNumber(value: unknown, label: string, maximum: number): number {
  if (!/^\d+$/.test(String(value ?? "")) || Number(value) > maximum) {
    throw new MediaError(400, `Enter a valid ${label}.`);
  }
  return Number(value);
}

export async function saveMonetizationSettings(input: Record<string, unknown>) {
  const dailyLimit = wholeNumber(input.dailyAdUnlockLimit, "daily ad unlock limit", 100);
  await pool.execute(
    `UPDATE monetization_settings
        SET monetization_enabled = ?, ad_unlock_enabled = ?, daily_ad_unlock_limit = ?
      WHERE id = 1`,
    [input.monetizationEnabled === "on" ? 1 : 0, input.adUnlockEnabled === "on" ? 1 : 0, dailyLimit],
  );
}

export async function createAdRewardClaim(userId: string, episodeId: string) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [settingsRows] = await db.execute<(MonetizationSettings & RowDataPacket)[]>(
      "SELECT * FROM monetization_settings WHERE id = 1 FOR UPDATE",
    );
    const settings = settingsRows[0];
    if (!settings?.monetization_enabled || !settings.ad_unlock_enabled) throw new MediaError(403, "Ad unlocks are temporarily unavailable.");
    const [episodes] = await db.execute<RowDataPacket[]>(
      `SELECT e.episode_id, e.is_free
         FROM episodes e JOIN series s ON s.id = e.series_id
        WHERE (e.episode_id = ? OR e.id = ?) AND e.status = 'live' AND s.status = 'live' LIMIT 1`,
      [episodeId, Number.parseInt(episodeId, 10) || 0],
    );
    const episode = episodes[0];
    if (!episode) throw new MediaError(404, "Episode is not available.");
    if (episode.is_free) throw new MediaError(409, "This episode is already free.");
    const [unlocks] = await db.execute<RowDataPacket[]>(
      "SELECT id FROM episode_unlocks WHERE user_id = ? AND episode_id = ? LIMIT 1", [userId, episode.episode_id],
    );
    if (unlocks[0]) throw new MediaError(409, "This episode is already unlocked.");
    const [counts] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM ad_reward_claims
        WHERE user_id = ? AND status = 'verified' AND verified_at > NOW() - INTERVAL 24 HOUR`, [userId],
    );
    const used = Number(counts[0]?.total ?? 0);
    if (used >= Number(settings.daily_ad_unlock_limit)) throw new MediaError(429, "You have used today’s free ad unlocks. Use coins to keep watching.");
    const nonce = randomBytes(32).toString("hex");
    const ttl = Math.max(60, Math.min(3600, Number(settings.ad_claim_ttl_seconds)));
    await db.execute(
      `INSERT INTO ad_reward_claims (nonce, user_id, episode_id, status, expires_at)
       VALUES (?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [nonce, userId, episode.episode_id, ttl],
    );
    await db.commit();
    return { nonce, episodeId: episode.episode_id as string, expiresInSeconds: ttl, remaining: Number(settings.daily_ad_unlock_limit) - used };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export async function adRewardClaim(userId: string, nonce: string) {
  if (!/^[a-f0-9]{64}$/.test(nonce)) throw new MediaError(404, "Ad reward claim not found.");
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT nonce, episode_id, status, rejection_reason, expires_at, verified_at
       FROM ad_reward_claims WHERE nonce = ? AND user_id = ? LIMIT 1`, [nonce, userId],
  );
  if (!rows[0]) throw new MediaError(404, "Ad reward claim not found.");
  const row = rows[0];
  if (row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.execute("UPDATE ad_reward_claims SET status = 'expired' WHERE nonce = ? AND status = 'pending'", [nonce]);
    row.status = "expired";
  }
  return { nonce: row.nonce, episodeId: row.episode_id, status: row.status, reason: row.rejection_reason ?? null };
}

let admobKeys: { expiresAt: number; keys: Map<string, string> } | null = null;
async function admobVerifierKey(keyId: string): Promise<string> {
  if (!admobKeys || admobKeys.expiresAt < Date.now()) {
    const response = await fetch("https://www.gstatic.com/admob/reward/verifier-keys.json", { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new MediaError(502, "Could not load AdMob verification keys.");
    const body = await response.json() as { keys?: Array<{ keyId?: string | number; pem?: string }> };
    admobKeys = {
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      keys: new Map((body.keys ?? []).filter((item) => item.keyId != null && item.pem).map((item) => [String(item.keyId), item.pem!])),
    };
  }
  const key = admobKeys.keys.get(keyId);
  if (!key) throw new MediaError(401, "Unknown AdMob verification key.");
  return key;
}

export async function verifyAdMobCallback(rawQuery: string) {
  const signatureMarker = "&signature=";
  const signatureIndex = rawQuery.indexOf(signatureMarker);
  if (signatureIndex < 0) throw new MediaError(401, "Missing AdMob signature.");
  const signedContent = rawQuery.slice(0, signatureIndex);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get("signature") ?? "";
  const keyId = params.get("key_id") ?? "";
  const key = await admobVerifierKey(keyId);
  const verifier = createVerify("SHA256");
  verifier.update(signedContent);
  if (!verifier.verify(key, Buffer.from(signature, "base64url"))) throw new MediaError(401, "Invalid AdMob signature.");
  const nonce = params.get("custom_data") ?? "";
  const userId = params.get("user_id") ?? "";
  const transactionId = params.get("transaction_id") ?? "";
  const adUnitId = params.get("ad_unit") ?? "";
  const allowedUnits = [config.commerce.admob.iosRewardedAdUnitId, config.commerce.admob.androidRewardedAdUnitId].filter(Boolean);
  if (isProduction && allowedUnits.length !== 2) throw new MediaError(503, "AdMob rewarded units are not configured.");
  if (!/^[a-f0-9]{64}$/.test(nonce) || !userId || !transactionId || (allowedUnits.length && !allowedUnits.includes(adUnitId))) {
    throw new MediaError(422, "Invalid AdMob reward details.");
  }
  return { nonce, userId, transactionId, adUnitId };
}

export async function grantAdReward(input: { nonce: string; userId: string; transactionId: string; adUnitId: string }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute<RowDataPacket[]>("SELECT * FROM ad_reward_claims WHERE nonce = ? LIMIT 1 FOR UPDATE", [input.nonce]);
    const claim = rows[0];
    if (!claim || claim.user_id !== input.userId) throw new MediaError(422, "Ad reward claim does not match this user.");
    if (claim.status === "verified") {
      await db.commit();
      return { alreadyProcessed: true, episodeId: claim.episode_id as string };
    }
    if (claim.status !== "pending" || new Date(claim.expires_at).getTime() <= Date.now()) {
      await db.execute("UPDATE ad_reward_claims SET status = 'expired', rejection_reason = 'Claim expired' WHERE id = ? AND status = 'pending'", [claim.id]);
      await db.commit();
      throw new MediaError(410, "Ad reward claim expired.");
    }
    const [duplicates] = await db.execute<RowDataPacket[]>("SELECT id FROM ad_reward_claims WHERE provider_event_id = ? LIMIT 1", [input.transactionId]);
    if (duplicates[0]) throw new MediaError(409, "Ad reward was already processed.");
    const [settingsRows] = await db.execute<(MonetizationSettings & RowDataPacket)[]>("SELECT * FROM monetization_settings WHERE id = 1 FOR UPDATE");
    const settings = settingsRows[0];
    const [counts] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM ad_reward_claims
        WHERE user_id = ? AND status = 'verified' AND verified_at > NOW() - INTERVAL 24 HOUR`, [input.userId],
    );
    if (!settings?.monetization_enabled || !settings.ad_unlock_enabled || Number(counts[0]?.total ?? 0) >= Number(settings.daily_ad_unlock_limit)) {
      await db.execute("UPDATE ad_reward_claims SET status = 'rejected', rejection_reason = 'Daily limit reached' WHERE id = ?", [claim.id]);
      await db.commit();
      throw new MediaError(429, "Daily ad unlock limit reached.");
    }
    await db.execute(
      `INSERT INTO episode_unlocks (user_id, episode_id, method) VALUES (?, ?, 'ad')
       ON DUPLICATE KEY UPDATE method = method`, [input.userId, claim.episode_id],
    );
    await db.execute(
      `UPDATE ad_reward_claims SET status = 'verified', provider_event_id = ?, ad_unit_id = ?, verified_at = NOW()
        WHERE id = ?`, [input.transactionId, input.adUnitId, claim.id],
    );
    await db.commit();
    return { alreadyProcessed: false, episodeId: claim.episode_id as string };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export async function processAppleNotification(signedPayload: string) {
  const outer = decodeJwtPayload<{ notificationUUID?: string; data?: { signedTransactionInfo?: string } }>(signedPayload);
  const signedTransaction = outer.data?.signedTransactionInfo;
  if (!signedTransaction) return false;
  const notice = decodeJwtPayload<AppleTransaction>(signedTransaction);
  if (!notice.transactionId) return false;
  const verified = await appleTransaction(notice.transactionId);
  if (verified.bundleId !== config.commerce.apple.bundleId || !verified.revocationDate) return false;
  return reversePurchase({ platform: "ios", providerTransactionId: notice.transactionId, status: "refunded" });
}

export async function processGoogleNotification(payload: unknown) {
  const wrapper = payload as { message?: { data?: string } };
  if (!wrapper.message?.data) throw new MediaError(400, "Invalid Google Play notification.");
  const event = JSON.parse(Buffer.from(wrapper.message.data, "base64").toString("utf8")) as {
    packageName?: string;
    oneTimeProductNotification?: { purchaseToken?: string; sku?: string; notificationType?: number };
  };
  const notice = event.oneTimeProductNotification;
  if (event.packageName !== config.commerce.google.packageName || !notice?.purchaseToken || !notice.sku) return false;
  const purchase = await googlePurchase(notice.sku, notice.purchaseToken);
  if (notice.notificationType !== 2 && purchase.purchaseState === 0) return false;
  return reversePurchase({ platform: "android", providerTokenHash: tokenHash(notice.purchaseToken), status: "refunded" });
}

export function googleWebhookAuthorized(token: string): boolean {
  const expected = config.commerce.google.webhookToken;
  return !isProduction && !expected ? true : Boolean(expected) && token === expected;
}
