import { createHmac, generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createImageDirectUpload,
  createPlaybackUrl,
  createThumbnailUrl,
  createTusUpload,
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
vi.mock("./config", () => ({ config: { cloudflare } }));

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
    expect(parseStreamVideo({ ...video, requireSignedURLs: false, status: { state: "ready" } })?.state).toBe("failed");
    expect(parseStreamVideo({ uid, duration: -1, status: { state: "error" } })?.state).toBe("failed");
  });
});

describe("Cloudflare Images", () => {
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
