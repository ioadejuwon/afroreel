import { afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "./db";
import { editEpisode } from "./content";

afterEach(() => vi.restoreAllMocks());

describe("episode metadata edits", () => {
  const input = { episodeNumber: 3, title: "The Photograph", hook: "A new clue", isFree: false,
    coinCost: 5, releaseDate: "2026-11-23" };

  it("updates metadata in the chosen series without changing publication or video fields", async () => {
    const execute = vi.spyOn(pool, "execute").mockResolvedValueOnce([{ affectedRows: 1 }] as never);
    await editEpisode(7, 4, input);
    expect(execute).toHaveBeenCalledOnce();
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("WHERE id = ? AND series_id = ?");
    expect(sql).not.toMatch(/\b(?:status|cloudflare_video_uid|episode_id)\s*=/);
    expect(params).toEqual([3, "The Photograph", "A new clue", 0, 5, "2026-11-23", 7, 4]);
  });

  it("returns 404 when the episode is not in the requested series", async () => {
    vi.spyOn(pool, "execute")
      .mockResolvedValueOnce([{ affectedRows: 0 }] as never)
      .mockResolvedValueOnce([[]] as never);
    await expect(editEpisode(7, 9, input)).rejects.toMatchObject({ status: 404 });
  });
});
