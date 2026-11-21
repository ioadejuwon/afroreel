import { describe, expect, it, vi } from "vitest";
import type { EpisodeRow, SeriesRow } from "./content";
import { buildDashboardCatalog, viewerTrend } from "./dashboard";

vi.mock("./config", () => ({ allowLocalMedia: false, config: { cloudflare: {} } }));
vi.mock("./db", () => ({ pool: {} }));

const series = [
  { id: 1, series_id: "series-one", status: "live" },
  { id: 2, series_id: "series-two", status: "draft" },
] as SeriesRow[];

function episode(id: number, fields: Partial<EpisodeRow> = {}) {
  return {
    id, series_id: 1, title: "Pilot", episode_number: 1, status: "live",
    created_at: "2026-02-01", release_date: null,
    cloudflare_video_uid: "a".repeat(32), cloudflare_ready: 1,
    cloudflare_pending_uid: null, cloudflare_upload_state: null, ...fields,
  } as EpisodeRow;
}

describe("dashboard catalog", () => {
  it("renders an empty queue and zero health totals for an empty catalog", () => {
    expect(buildDashboardCatalog([], [])).toMatchObject({
      uploads: [], queue: [], recentlyLive: [], missing: 0, failed: 0, ready: 0, inProgress: 0,
    });
  });

  it("separates first uploads, playable replacements, and failures using uploader state", () => {
    const pendingUid = "b".repeat(32);
    const firstUpload = { cloudflare_video_uid: null, cloudflare_ready: 0 as const };
    const result = buildDashboardCatalog(series, [
      episode(1), episode(2, { ...firstUpload, cloudflare_pending_uid: pendingUid, cloudflare_upload_state: "processing" }),
      episode(3, { cloudflare_pending_uid: pendingUid, cloudflare_upload_state: "processing" }),
      episode(4, { ...firstUpload, cloudflare_upload_state: "failed" }),
      episode(5, firstUpload), episode(6, { cloudflare_pending_uid: pendingUid, cloudflare_upload_state: "failed" }),
      episode(7, { ...firstUpload, cloudflare_video_uid: "local:/uploads/legacy" }),
    ]);
    expect(result).toMatchObject({ ready: 3, missing: 2, failed: 1, inProgress: 1 });
    expect(result.queue.map(item => [item.episode.id, item.issue])).toEqual([
      [5, "Needs video"], [7, "Needs video"], [4, "Upload failed"], [6, "Upload failed"],
    ]);
    expect(result.uploads.slice(0, 4)).toEqual(result.queue);
  });

  it("returns the three most recent playable releases in published series, including creation-date fallback", () => {
    const result = buildDashboardCatalog(series, [
      episode(1), episode(2, { created_at: "2026-02-04" }), episode(3, { release_date: "2026-02-02" }),
      episode(4, { release_date: "2026-02-05" }), episode(5, { series_id: 2, release_date: "2026-02-06" }),
      episode(6, { cloudflare_ready: 0 }), episode(7, { status: "draft" }),
    ]);
    expect(result.recentlyLive.map(item => [item.seriesPublicId, item.episode.id])).toEqual([
      ["series-one", 4], ["series-one", 2], ["series-one", 3],
    ]);
  });
});

describe("daily viewer chart", () => {
  const today = new Date("2026-03-01T00:00:01Z");
  it("requires two distinct active days inside the 14-day UTC window", () => {
    const trend = viewerTrend([{ day: "2026-02-15", viewers: 9 }, { day: "2026-03-01", viewers: 12 }], today);
    expect(trend.showChart).toBe(false);
    expect(trend.days).toHaveLength(14);
    expect(trend.days[0]).toMatchObject({ day: "2026-02-16", viewers: 0 });
  });

  it("plots actual counts across a month boundary and fills quiet days", () => {
    const trend = viewerTrend([{ day: "2026-02-16", viewers: 2 }, { day: "2026-03-01", viewers: 1 }], today);
    expect(trend.showChart).toBe(true);
    expect(trend.peak).toBe(2);
    expect(trend.days.map(day => day.viewers)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
});
