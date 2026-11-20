import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyStreamVideoStatus } from "./content";
import { ensureStreamPreview } from "./episode-previews";

const { execute, importPreview } = vi.hoisted(() => ({
  execute: vi.fn(), importPreview: vi.fn(),
}));
vi.mock("./db", () => ({ pool: { execute } }));
vi.mock("./config", () => ({ config: { cloudflare: { imagesDeliveryHash: "hash" } }, allowLocalMedia: false }));
vi.mock("./cloudflare", async (original) => ({
  ...await original<typeof import("./cloudflare")>(), importEpisodePreview: importPreview,
}));

const uid = "a".repeat(32);
const ready = { uid, state: "ready" as const, durationSeconds: 50, thumbnailTimeMs: 5000, error: null };
const source = { id: 12, cloudflare_video_uid: uid, frame_time_ms: 5000, thumbnail_url: null };
beforeEach(() => vi.resetAllMocks());

describe("episode preview lifecycle", () => {
  it("promotes the ready replacement and saves its still only if that video and frame are current", async () => {
    const url = "https://imagedelivery.net/hash/preview/public";
    execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[source]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    importPreview.mockResolvedValue(url);
    await applyStreamVideoStatus(ready);
    expect(execute.mock.calls[0][0]).toContain("thumbnail_url = NULL");
    expect(execute.mock.calls[1][1]).toEqual([uid]);
    expect(importPreview).toHaveBeenCalledWith(uid, 5000);
    const [update, params] = execute.mock.calls[2];
    expect(update).toContain("WHERE id = ? AND cloudflare_video_uid = ? AND cloudflare_ready = 1");
    expect(update).toContain("COALESCE(cloudflare_thumbnail_time_ms, duration_seconds * 100, 0) = ?");
    expect(params).toEqual([url, 12, uid, 5000]);
  });

  it("ignores a late ready event for a replaced video", async () => {
    execute.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    await applyStreamVideoStatus(ready);
    expect(importPreview).not.toHaveBeenCalled();
  });

  it("skips a completed image and leaves an interrupted import retryable", async () => {
    const { episodePreviewId } = await import("./cloudflare");
    execute.mockResolvedValueOnce([[{ ...source, thumbnail_url: `https://imagedelivery.net/hash/${episodePreviewId(uid, 5000)}/public` }]]);
    await ensureStreamPreview(uid);
    expect(importPreview).not.toHaveBeenCalled();
    execute.mockResolvedValueOnce([[source]]);
    importPreview.mockRejectedValueOnce(new Error("Image service unavailable"));
    await expect(ensureStreamPreview(uid)).rejects.toThrow("Image service unavailable");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
