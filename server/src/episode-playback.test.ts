import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { apiRouter } from "./routes/api";
import { episodePreviewId } from "./cloudflare";

const { list, lookup, playback } = vi.hoisted(() => ({
  list: vi.fn(), lookup: vi.fn(), playback: vi.fn(() => "https://video.example/session.m3u8"),
}));
vi.mock("./db", () => ({ pool: {} }));
vi.mock("./auth", () => ({
  requireMobileUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./content", async (original) => ({
  ...await original<typeof import("./content")>(), listEpisodesForSeries: list,
  getEpisodeForPlayback: lookup, getEpisodeDatabaseId: async () => 1,
}));
vi.mock("./config", () => ({
  config: { cloudflare: { imagesDeliveryHash: "test" } }, allowLocalMedia: false, isProduction: true,
}));
vi.mock("./cloudflare", async (original) => ({
  ...await original<typeof import("./cloudflare")>(), createPlaybackUrl: playback,
}));
const app = express().use("/api", apiRouter);

describe("episode artwork and playback", () => {
  it("shows the locked episode still, then permits playback after unlock", async () => {
    const uid = "a".repeat(32);
    const thumbnail = `https://imagedelivery.net/test/${episodePreviewId(uid, 1000)}/public`;
    const episode = { episode_id: "ep1", is_free: 0, is_unlocked: 0, coin_cost: 5, cloudflare_ready: 1,
      cloudflare_video_uid: uid, cloudflare_thumbnail_time_ms: 1000, thumbnail_url: thumbnail };
    list.mockResolvedValue([episode]);
    const catalog = await request(app).get("/api/series/1/episodes").expect(200);
    expect(list).toHaveBeenCalledWith("1", false, "");
    expect(catalog.body.episodes[0]).toMatchObject({ id: "ep1", isLocked: true, coinCost: 5, thumbnailUrl: thumbnail });
    lookup.mockResolvedValueOnce(episode);
    await request(app).post("/api/episodes/ep1/playback").expect(403);
    expect(playback).not.toHaveBeenCalled();
    list.mockResolvedValue([{ ...episode, thumbnail_url: null }]);
    const missing = await request(app).get("/api/series/1/episodes").expect(200);
    expect(missing.body.episodes[0].thumbnailUrl).toBeNull();
    const unlocked = { ...episode, is_unlocked: 1 };
    list.mockResolvedValue([unlocked]);
    lookup.mockResolvedValue(unlocked);
    const updated = await request(app).get("/api/series/1/episodes").expect(200);
    expect(updated.body.episodes[0]).toMatchObject({ isLocked: false, isUnlocked: true, thumbnailUrl: thumbnail });
    const session = await request(app).post("/api/episodes/ep1/playback").expect(200);
    expect(session.body).toMatchObject({ episodeId: "ep1", playbackUrl: "https://video.example/session.m3u8" });
  });
});
