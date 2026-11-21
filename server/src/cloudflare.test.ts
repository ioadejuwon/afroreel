import { createHmac, generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createImageDirectUpload,
  deleteCloudflareAsset,
  verifyCleanupCatalog,
  listCloudflareAssets,
  createPlaybackUrl,
  createThumbnailUrl,
  createTusUpload,
  episodePreviewId,
  importEpisodePreview,
  parseStreamVideo,
  verifyPosterImage,
  verifyStreamWebhook,
} from "./cloudflare";

const { cloudflare } = vi.hoisted(() => ({
  cloudflare: {
    accountId: "test-account",
    apiToken: "stream-test-token",
    imagesApiToken: "images-test-token",
    imagesDeliveryHash: "test-hash",
    customerCode: "customer-test123.cloudflarestream.com",
    streamWebhookSecret: "test-webhook-secret",
    streamKeyId: "test-signing-key",
    streamPrivateKey: "",
  },
}));
vi.mock("./config", () => ({ config: { cloudflare, publicBaseUrl: "https://afroreel.example/app", basePath: "/app" } }));

const uid = "a".repeat(32);
let publicKey: KeyObject;

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  publicKey = pair.publicKey;
  cloudflare.streamPrivateKey = Buffer.from(pair.privateKey.export({ format: "pem", type: "pkcs1" })).toString("base64");
});

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare Stream", () => {
  it("uses the provider video ID header and an opaque TUS URL for a private upload", async () => {
    const uploadUrl = "https://upload.videodelivery.net/tus/opaque-upload-capability";
    const request = vi.fn(async (_url: string, _options: RequestInit) => new Response(null, {
      status: 201,
      headers: { Location: uploadUrl, "Stream-Media-ID": uid },
    }));
    vi.stubGlobal("fetch", request);

    await expect(createTusUpload({ name: "test.mp4", uploadLength: 5000, maxDurationSeconds: 90 }))
      .resolves.toMatchObject({ uid, uploadUrl });
    const [url, options] = request.mock.calls[0];
    expect(url).toContain("/stream?direct_user=true");
    const headers = new Headers(options.headers);
    expect(headers.get("Upload-Length")).toBe("5000");
    expect(headers.get("Upload-Metadata")?.split(",")).toContain("requiresignedurls");
    expect(headers.get("Upload-Metadata")).toContain("thumbnailtimestamppct MC4x");
  });

  it("signs a video-specific HLS session and a short-lived thumbnail locally", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const playback = new URL(createPlaybackUrl(uid));
    const thumbnail = new URL(createThumbnailUrl(uid, 1325));
    expect(playback.host).toBe("customer-test123.cloudflarestream.com");
    expect(playback.pathname).toMatch(/\/manifest\/video\.m3u8$/);
    expect(thumbnail.pathname).toMatch(/\/thumbnails\/thumbnail\.jpg$/);
    expect(Object.fromEntries(thumbnail.searchParams)).toEqual({
      time: "1.325s", width: "480", height: "600", fit: "crop",
    });
    for (const [url, ttl] of [[playback, 3600], [thumbnail, 900]] as const) {
      const [header, claims, signature] = url.pathname.split("/")[1].split(".");
      expect(verify(
        "RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"),
      )).toBe(true);
      expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({ kid: cloudflare.streamKeyId });
      const body = JSON.parse(Buffer.from(claims, "base64url").toString());
      expect(body).toMatchObject({ sub: uid, downloadable: false });
      expect(body.exp - Math.floor(Date.now() / 1000)).toBeCloseTo(ttl, -1);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("reports exhausted Stream storage separately from a video size error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      errors: [{ code: 10011 }],
    }, { status: 413 })));
    await expect(createTusUpload({ name: "test.mp4", uploadLength: 5000, maxDurationSeconds: 90 }))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("storage minutes") });
  });

  it("checks the exact webhook bytes and rejects malformed or stale timestamps", () => {
    const body = Buffer.from('{"title":"Café","uid":"test"}');
    const header = (time: string, bytes = body) => {
      const signature = createHmac("sha256", cloudflare.streamWebhookSecret)
        .update(`${time}.`).update(bytes).digest("hex");
      return `time=${time},sig1=${signature}`;
    };
    const now = Math.floor(Date.now() / 1000);
    expect(verifyStreamWebhook(body, header(String(now)))).toBe(true);
    expect(verifyStreamWebhook(Buffer.concat([body, Buffer.from("\n")]), header(String(now)))).toBe(false);
    expect(verifyStreamWebhook(body, header(String(now - 301)))).toBe(false);
    expect(verifyStreamWebhook(body, header("NaN"))).toBe(false);
  });

  it("requires ready private media and keeps the 10% frame precise", () => {
    const video = { uid, readyToStream: true, requireSignedURLs: true, duration: 13.25 };
    expect(parseStreamVideo({ ...video, status: { state: "inprogress" } })?.state).toBe("processing");
    expect(parseStreamVideo({ ...video, status: { state: "ready" } })).toMatchObject({
      state: "ready", durationSeconds: 13, thumbnailTimeMs: 1325,
    });
    expect(parseStreamVideo({ ...video, thumbnailTimestampPct: 0.5, status: { state: "ready" } })?.thumbnailTimeMs).toBe(6625);
    expect(parseStreamVideo({ ...video, requireSignedURLs: false, status: { state: "ready" } })?.state).toBe("failed");
    expect(parseStreamVideo({ uid, duration: -1, status: { state: "error" } })?.state).toBe("failed");
  });
});

describe("Cloudflare Images", () => {
  it.each([false, true])("imports the signed still as a separate public image, including retries (%s)", async (alreadyImported) => {
    const id = episodePreviewId(uid, 1325);
    const preview = `https://imagedelivery.net/test-hash/${id}/public`;
    const request = vi.fn(async (_url: string, _options: RequestInit) => Response.json({
      success: true, result: { id, requireSignedURLs: false, variants: [preview] },
    }));
    if (alreadyImported) request.mockResolvedValueOnce(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", request);
    await expect(importEpisodePreview(uid, 1325)).resolves.toBe(preview);
    const [url, options] = request.mock.calls[0];
    expect(url).toContain("/images/v1");
    const form = options.body as FormData;
    expect(form.get("id")).toBe(id);
    expect(form.get("requireSignedURLs")).toBe("false");
    const source = new URL(String(form.get("url")));
    expect(source.pathname).toMatch(/\/thumbnails\/thumbnail\.jpg$/);
    expect(source.searchParams.get("time")).toBe("1.325s");
    expect(request).toHaveBeenCalledTimes(alreadyImported ? 2 : 1);
    if (alreadyImported) expect(request.mock.calls[1][0]).toMatch(new RegExp(id + "$"));
  });

  it("uses the Images token and verifies a confirmed upload with the configured variants", async () => {
    const id = "test-image";
    const request = vi.fn(async (_url: string, _options: RequestInit) => Response.json({
      success: true, result: { id, uploadURL: "https://upload.imagedelivery.net/test" },
    }));
    vi.stubGlobal("fetch", request);
    await expect(createImageDirectUpload()).resolves.toMatchObject({ id });
    expect(new Headers(request.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer images-test-token");

    request.mockResolvedValueOnce(Response.json({
      success: true, result: { id, draft: true, requireSignedURLs: false },
    }));
    await expect(verifyPosterImage(id)).rejects.toMatchObject({ status: 422 });

    const variants = ["postercard", "posterdetail", "adminpreview"].map(
      (variant) => `https://imagedelivery.net/test-hash/${id}/${variant}`,
    );
    request.mockResolvedValueOnce(Response.json({
      success: true, result: { id, requireSignedURLs: false, variants },
    }));
    await expect(verifyPosterImage(id)).resolves.toBeUndefined();
  });
});

describe("Cloudflare cleanup and inventory", () => {
  it("requires the configured account webhook to point at this catalog before cleanup", async () => {
    const webhook = (host: string) => Response.json({
      success: true, result: { notificationUrl: `https://${host}/app/webhooks/cloudflare/stream` },
    });
    const request = vi.fn().mockResolvedValueOnce(webhook("other.example")).mockResolvedValueOnce(webhook("afroreel.example"));
    vi.stubGlobal("fetch", request);
    await expect(verifyCleanupCatalog()).rejects.toThrow("different catalog");
    await expect(verifyCleanupCatalog()).resolves.toBeUndefined();
    expect(request.mock.calls.every(([url, init]) => url.endsWith("/stream/webhook") && !init.method)).toBe(true);
  });

  it("sends account-scoped DELETEs with the matching token and accepts an absent asset", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", request);
    await deleteCloudflareAsset("Stream", uid);
    await deleteCloudflareAsset("Images", "old-poster");
    for (const [i, path, token] of [[0, "/stream/" + uid, cloudflare.apiToken], [1, "/images/v1/old-poster", cloudflare.imagesApiToken]] as const) {
      const [url, options] = request.mock.calls[i];
      expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/test-account" + path);
      expect(options.method).toBe("DELETE");
      expect(options.headers.get("Authorization")).toBe("Bearer " + token);
    }
  });

  it("follows image inventory cursors using GET and rejects repeated cursors", async () => {
    const page = () => Response.json({ success: true, result: {
      continuation_token: "next", images: [{ id: "old", meta: { kind: "afroreel-poster" } }],
    } });
    const request = vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(page());
    vi.stubGlobal("fetch", request);
    const scan = listCloudflareAssets("Images");
    expect((await scan.next()).value).toMatchObject({ id: "old", ownership: "AfroReel poster metadata" });
    await scan.next();
    await expect(scan.next()).rejects.toThrow("repeated a cursor");
    expect(request.mock.calls[1][0]).toContain("continuation_token=next");
    expect(request.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(true);
  });

  it("reads the counted Stream response returned by the production API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, result: {
      videos: [{ uid, created: "2026-11-19T22:03:24.365926Z" }], total: 1, range: 1,
    } })));
    const scan = listCloudflareAssets("Stream");
    expect((await scan.next()).value).toMatchObject({ id: uid });
    expect((await scan.next()).done).toBe(true);
  });

  it("marks truncated Stream inventory incomplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, total: 2, result: [
      { uid, created: "2026-01-01T00:00:00Z" },
    ] })));
    const scan = listCloudflareAssets("Stream");
    expect((await scan.next()).value).toMatchObject({ id: uid, ownership: "uncertain" });
    await expect(scan.next()).rejects.toThrow("1 of 2");
  });
});
