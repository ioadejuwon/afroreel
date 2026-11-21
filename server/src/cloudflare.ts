import { createHash, createHmac, createPrivateKey, sign, timingSafeEqual, type KeyObject } from "node:crypto";
import { z } from "zod";
import { config } from "./config";

export class MediaError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const STREAM_PLAYBACK_TTL_SECONDS = 60 * 60;
export const STREAM_MAX_DURATION_SECONDS = 30 * 60;

const POSTER_VARIANTS = ["postercard", "posterdetail", "adminpreview"] as const;
type PosterVariant = typeof POSTER_VARIANTS[number];

const uidSchema = z.string().regex(/^[0-9a-z]{32}$/i);
const imageIdSchema = z.string().regex(/^[0-9a-z-]{1,190}$/i);
const streamVideoSchema = z.object({
  uid: uidSchema,
  requireSignedURLs: z.boolean().optional(),
  readyToStream: z.boolean().optional(),
  duration: z.number().min(-1).max(1_000_000).nullish(),
  thumbnailTimestampPct: z.number().min(0).max(1).nullish(),
  status: z.object({ state: z.string(), errorReasonText: z.string().nullish() }).nullish(),
});

export type StreamVideo = {
  uid: string;
  state: "uploading" | "processing" | "ready" | "failed";
  durationSeconds: number | null;
  thumbnailTimeMs: number | null;
  error: string | null;
};

async function cloudflareRequest(
  service: "Stream" | "Images",
  path: string,
  action: string,
  options: RequestInit = {},
): Promise<Response> {
  const { accountId, apiToken, imagesApiToken } = config.cloudflare;
  const token = service === "Stream" ? apiToken : imagesApiToken;
  if (!accountId || !token) {
    throw new MediaError(503, `Cloudflare ${service} credentials are missing on the server.`);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}`;
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MediaError(502, `Cloudflare ${service} could not ${action}. Try again.`);
  }
  if (response.status === 404 && options.method === "DELETE") return response;
  if (!response.ok) {
    if (service === "Stream" && response.status === 413) {
      const payload = await response.json().catch(() => null) as { errors?: Array<{ code?: number }> } | null;
      if (payload?.errors?.some(({ code }) => code === 10011)) {
        throw new MediaError(503, "Cloudflare Stream has no storage available for this upload. Check the account's video storage minutes.");
      }
    }
    const denied = response.status === 401 || response.status === 403;
    throw new MediaError(denied ? 503 : 502, denied
      ? `Cloudflare ${service} denied access. Check the account and token permissions.`
      : `Cloudflare ${service} could not ${action} (HTTP ${response.status}).`);
  }
  return response;
}

async function cloudflareResult<T>(response: Response, message: string): Promise<T> {
  const payload = await response.json().catch(() => null) as { success?: boolean; result?: T } | null;
  if (!payload?.success || !payload.result) throw new MediaError(502, message);
  return payload.result;
}

function uploadLocation(value: string | null | undefined): string {
  const url = URL.parse(value ?? "");
  if (!url || url.protocol !== "https:" || url.username || url.password) {
    throw new MediaError(502, "Cloudflare did not return an HTTPS upload URL.");
  }
  return url.href;
}

type StreamVideoUid = string & { readonly streamVideoUid: unique symbol };

export function isStreamVideoUid(value: unknown): value is StreamVideoUid {
  return uidSchema.safeParse(value).success;
}

export async function createTusUpload(input: {
  uploadLength: number;
  name: string;
  maxDurationSeconds: number;
}): Promise<{ uploadUrl: string; uid: string; expiresAt: number }> {
  streamHost();
  streamSigningKey();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const values = {
    name: input.name,
    maxDurationSeconds: input.maxDurationSeconds,
    expiry: new Date(expiresAt).toISOString(),
    thumbnailtimestamppct: 0.1,
  };
  const metadata = Object.entries(values)
    .map(([key, value]) => `${key} ${Buffer.from(String(value)).toString("base64")}`);
  metadata.push("requiresignedurls");

  const response = await cloudflareRequest("Stream", "/stream?direct_user=true", "reserve a video upload", {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(input.uploadLength),
      "Upload-Metadata": metadata.join(","),
    },
  });

  const uid = response.headers.get("stream-media-id");
  if (!isStreamVideoUid(uid)) throw new MediaError(502, "Cloudflare did not return a Stream video ID.");
  return { uploadUrl: uploadLocation(response.headers.get("Location")), uid, expiresAt };
}

export async function createImageDirectUpload(): Promise<{ id: string; uploadUrl: string }> {
  if (!config.cloudflare.imagesDeliveryHash) {
    throw new MediaError(503, "Set CLOUDFLARE_IMAGES_DELIVERY_HASH to enable Cloudflare poster uploads.");
  }
  const body = new FormData();
  body.set("requireSignedURLs", "false");
  body.set("metadata", JSON.stringify({ kind: "afroreel-poster" }));
  const response = await cloudflareRequest("Images", "/images/v2/direct_upload", "reserve a poster upload", {
    method: "POST",
    body,
  });
  const result = await cloudflareResult<{ id?: string; uploadURL?: string }>(
    response, "Cloudflare did not reserve a poster upload.",
  );
  if (!result.id || !imageIdSchema.safeParse(result.id).success) {
    throw new MediaError(502, "Cloudflare did not return an image ID.");
  }
  return { id: result.id, uploadUrl: uploadLocation(result.uploadURL) };
}

export function imageDeliveryUrl(imageId: string, variant: PosterVariant | "public"): string | null {
  const hash = config.cloudflare.imagesDeliveryHash;
  if (!hash || !imageIdSchema.safeParse(imageId).success) return null;
  return `https://imagedelivery.net/${encodeURIComponent(hash)}/${encodeURIComponent(imageId)}/${variant}`;
}

export async function verifyPosterImage(imageId: string): Promise<void> {
  if (!imageIdSchema.safeParse(imageId).success) {
    throw new MediaError(400, "Choose a valid poster image.");
  }
  const response = await cloudflareRequest("Images", `/images/v1/${encodeURIComponent(imageId)}`, "verify the poster");
  const image = await cloudflareResult<{
    id?: string;
    draft?: boolean;
    requireSignedURLs?: boolean;
    variants?: string[];
  }>(response, "Cloudflare did not confirm the poster upload.");
  if (image.id !== imageId || image.draft === true || image.requireSignedURLs !== false) {
    throw new MediaError(422, "The poster must finish uploading before it can be saved.");
  }
  if (POSTER_VARIANTS.some((variant) => {
    const url = imageDeliveryUrl(imageId, variant);
    return !url || !image.variants?.includes(url);
  })) {
    throw new MediaError(503, "Set up the postercard, posterdetail, and adminpreview variants in Cloudflare Images.");
  }
}

export function verifyStreamWebhook(rawBody: Buffer, signatureHeader: string): boolean {
  const secret = config.cloudflare.streamWebhookSecret;
  if (!secret || !signatureHeader) return false;
  const entries = Object.fromEntries(signatureHeader.split(",").map((entry) => entry.trim().split("=", 2)));
  const { time, sig1 } = entries;
  if (!time || !/^\d{1,12}$/.test(time) || !sig1 || !/^[0-9a-f]{64}$/i.test(sig1)) return false;
  if (Math.abs(Date.now() / 1000 - Number(time)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${time}.`).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(sig1, "hex"), expected);
}

export function parseStreamVideo(value: unknown): StreamVideo | null {
  const parsed = streamVideoSchema.safeParse(value);
  if (!parsed.success) return null;
  const video = parsed.data;
  const state = video.status?.state;
  let uploadState: StreamVideo["state"] = "processing";
  let error: string | null = null;
  if (state === "error") {
    uploadState = "failed";
    error = video.status?.errorReasonText?.trim().slice(0, 255) || "Cloudflare could not process this video.";
  } else if (state === "ready" && video.readyToStream) {
    uploadState = video.requireSignedURLs === true ? "ready" : "failed";
    if (uploadState === "failed") error = "This video needs signed playback enabled in Cloudflare.";
  } else if (!state || state === "pendingupload" || state === "uploading") {
    uploadState = "uploading";
  }

  const duration = video.duration !== null && video.duration !== undefined && video.duration >= 0
    ? video.duration
    : null;
  return {
    uid: video.uid,
    state: uploadState,
    durationSeconds: duration === null ? null : Math.round(duration),
    thumbnailTimeMs: duration === null ? null : Math.round(duration * (video.thumbnailTimestampPct ?? 0.1) * 1000),
    error,
  };
}

export async function getStreamVideo(uid: string): Promise<StreamVideo> {
  if (!isStreamVideoUid(uid)) throw new MediaError(400, "Invalid Stream video ID.");
  const response = await cloudflareRequest("Stream", `/stream/${uid}`, "check the video status");
  const result = await cloudflareResult<unknown>(response, "Cloudflare did not return a video status.");
  const video = parseStreamVideo(result);
  if (!video || video.uid !== uid) throw new MediaError(502, "Cloudflare returned an invalid video status.");
  return video;
}

let privateKey: KeyObject | undefined;

function streamSigningKey(): KeyObject {
  if (privateKey) return privateKey;
  const { streamKeyId, streamPrivateKey } = config.cloudflare;
  if (!streamKeyId || !streamPrivateKey) {
    throw new MediaError(503, "Configure a Cloudflare Stream signing key on the server.");
  }
  try {
    const key = createPrivateKey(Buffer.from(streamPrivateKey, "base64"));
    if (key.asymmetricKeyType !== "rsa") throw new Error("Expected an RSA key.");
    privateKey = key;
    return key;
  } catch {
    throw new MediaError(503, "The Cloudflare Stream signing key is invalid.");
  }
}

function streamHost(): string {
  const customer = config.cloudflare.customerCode.trim().match(
    /^(?:https:\/\/)?(?:customer-)?([a-z0-9]+)(?:\.cloudflarestream\.com\/?)?$/i,
  );
  if (!customer) {
    throw new MediaError(503, "Configure the Cloudflare Stream customer code on the server.");
  }
  return `https://customer-${customer[1]}.cloudflarestream.com`;
}

function signedStreamUrl(uid: string, ttlSeconds: number, path: string): string {
  if (!isStreamVideoUid(uid)) throw new MediaError(400, "Invalid Stream video ID.");
  const host = streamHost();
  const kid = config.cloudflare.streamKeyId;
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    sub: uid,
    kid,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    downloadable: false,
  })).toString("base64url");
  const unsigned = `${header}.${claims}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), streamSigningKey()).toString("base64url");
  return `${host}/${unsigned}.${signature}/${path}`;
}

export function createPlaybackUrl(uid: string): string {
  return signedStreamUrl(uid, STREAM_PLAYBACK_TTL_SECONDS, "manifest/video.m3u8");
}

export function createThumbnailUrl(uid: string, thumbnailTimeMs: number): string {
  const time = `${thumbnailTimeMs / 1000}s`;
  return signedStreamUrl(uid, 15 * 60, `thumbnails/thumbnail.jpg?time=${time}&width=480&height=600&fit=crop`);
}

export function episodePreviewId(uid: string, frameTimeMs: number): string {
  return "episode-" + createHash("sha256").update(`${uid}:${frameTimeMs}`).digest("hex");
}

export async function importEpisodePreview(uid: string, frameTimeMs: number): Promise<string> {
  const id = episodePreviewId(uid, frameTimeMs);
  const url = imageDeliveryUrl(id, "public");
  if (!url) throw new MediaError(503, "Configure Cloudflare Images delivery for episode previews.");
  const body = new FormData();
  body.set("id", id);
  body.set("url", createThumbnailUrl(uid, frameTimeMs));
  body.set("requireSignedURLs", "false");
  let response: Response;
  try {
    response = await cloudflareRequest("Images", "/images/v1", "import the episode preview", { method: "POST", body });
  } catch (error) {
    if (!(error instanceof MediaError) || error.status !== 502) throw error;
    // Concurrent ready events or a retry after an interrupted DB write can find the image already imported.
    response = await cloudflareRequest("Images", `/images/v1/${id}`, "find the imported episode preview").catch(() => { throw error; });
  }
  const image = await cloudflareResult<{ id: string; variants?: string[]; requireSignedURLs: boolean }>(
    response, "Cloudflare did not confirm the episode preview.",
  );
  if (image.id !== id || image.requireSignedURLs !== false || !image.variants?.includes(url)) {
    throw new MediaError(502, "Cloudflare did not return the public episode preview.");
  }
  return url;
}

// Development checkouts can have working production Cloudflare tokens and a different catalog.
export async function verifyCleanupCatalog(): Promise<void> {
  const origin = URL.parse(config.publicBaseUrl);
  if (!origin || origin.protocol !== "https:") {
    throw new Error("Set the catalog's HTTPS PUBLIC_BASE_URL before running Cloudflare cleanup.");
  }
  const expected = new URL((config.basePath || "") + "/webhooks/cloudflare/stream", origin).href;
  const response = await cloudflareRequest("Stream", "/stream/webhook", "verify the catalog webhook");
  const webhook = await cloudflareResult<{ notificationUrl?: string }>(response, "Missing Stream webhook.");
  if (webhook.notificationUrl !== expected) {
    throw new Error("The Cloudflare account webhook belongs to a different catalog. Check the environment configuration.");
  }
}

export async function deleteCloudflareAsset(service: "Images" | "Stream", id: string): Promise<void> {
  const valid = service === "Stream" ? isStreamVideoUid(id) : imageIdSchema.safeParse(id).success;
  if (!valid) throw new Error(`Invalid ${service} asset ID`);
  const path = service === "Stream" ? "/stream/" : "/images/v1/";
  const response = await cloudflareRequest(service, path + encodeURIComponent(id), "delete the asset", { method: "DELETE" });
  if (service === "Images" && response.status !== 404 && response.status !== 204) {
    const payload = await response.json();
    if (payload?.success !== true) throw new MediaError(502, "Cloudflare Images did not confirm deletion.");
  }
}

type InventoryAsset = { id: string; ownership: "AfroReel poster metadata" | "uncertain" };

export async function* listCloudflareAssets(service: "Stream" | "Images"): AsyncGenerator<InventoryAsset> {
  if (service === "Images") {
    let cursor = "";
    const cursors = new Set<string>();
    do {
      const query = new URLSearchParams({ per_page: "1000" });
      if (cursor) query.set("continuation_token", cursor);
      const response = await cloudflareRequest(service, "/images/v2?" + query, "list images");
      const page = z.object({
        images: z.array(z.object({ id: z.string().min(1), meta: z.record(z.string(), z.unknown()).nullish() })),
        continuation_token: z.string().nullish(),
      }).parse(await cloudflareResult(response, "Invalid Images inventory response."));
      for (const image of page.images) {
        yield { id: image.id, ownership: image.meta?.kind === "afroreel-poster" ? "AfroReel poster metadata" : "uncertain" };
      }
      cursor = page.continuation_token ?? "";
      if (cursor && cursors.has(cursor)) throw new Error("Images inventory repeated a cursor.");
      cursors.add(cursor);
    } while (cursor);
    return;
  }

  const query = new URLSearchParams({ limit: "1000", asc: "false", include_counts: "true" });
  const videos = z.array(z.object({ uid: uidSchema, created: z.string().min(1) }));
  const total = z.number().int().nonnegative();
  const inventory = z.union([
    z.object({ success: z.literal(true), result: z.object({ videos, total }) }).transform(page => page.result),
    z.object({ success: z.literal(true), result: videos, total }).transform(page => ({ videos: page.result, total: page.total })),
  ]);
  const seen = new Set<string>();
  let expected: number | undefined;
  for (;;) {
    const response = await cloudflareRequest(service, "/stream?" + query, "list videos");
    const page = inventory.parse(await response.json());
    expected ??= page.total;
    for (const video of page.videos) {
      if (seen.has(video.uid)) continue;
      seen.add(video.uid);
      yield { id: video.uid, ownership: "uncertain" };
    }
    if (seen.size === expected) return;
    const end = page.videos.at(-1)?.created;
    if (page.videos.length < 1000 || !end || end === query.get("end")) {
      throw new Error(`Stream inventory returned ${seen.size} of ${expected} videos.`);
    }
    query.set("end", end);
  }
}
