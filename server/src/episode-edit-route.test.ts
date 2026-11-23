import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRole } from "./types";

const fixture = vi.hoisted(() => {
  const series = { id: 4, series_id: "ser_4", title: "A show", status: "live", default_episode_access: "free" };
  const episode = { id: 7, episode_id: "ep_7", series_id: 4, episode_number: 2, title: "Old title",
    hook: "Old hook", is_free: 0, coin_cost: 5, release_date: "2026-11-23", status: "live",
    cloudflare_video_uid: null, cloudflare_pending_uid: null, cloudflare_ready: 0, created_at: "2026-11-22" };
  return { series, episode, edit: vi.fn(), listForSeries: vi.fn() };
});

vi.mock("./content", () => ({
  listSeries: vi.fn(async () => [fixture.series]),
  listEpisodes: vi.fn(async () => [fixture.episode]),
  listEpisodesForSeries: fixture.listForSeries,
  editEpisode: fixture.edit,
}));
vi.mock("./admin-settings", () => ({
  episodeDefaults: vi.fn(async () => ({ free_opening_episodes: 1, locked_coin_price: 5 })),
  seriesEpisodeAccess: vi.fn(async (_id: number, _number: number, body: Record<string, string>) =>
    body.access === "locked" ? { isFree: false, coinCost: Number(body.coinCost || 5) } : { isFree: true, coinCost: 0 }),
}));

import { adminRouter } from "./routes/admin";

function studio(role: AdminRole) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.admin = { id: 1, name: "Member", email: "member@example.test", role, session_version: 1 };
    req.csrfToken = () => "test";
    res.render = ((_view: string, locals: Record<string, unknown>) => res.json({
      error: locals.episodeFormError, values: locals.episodeEditValues,
      selectedEpisode: locals.selectedEpisode && (locals.selectedEpisode as { episode_id: string }).episode_id,
    })) as typeof res.render;
    next();
  });
  app.use("/admin", adminRouter);
  return app;
}

const path = "/admin/series/ser_4/episodes/ep_7/edit";
const valid = { episodeNumber: "3", title: "New title", hook: "A clue", access: "locked",
  coinCost: "8", releaseDate: "2026-11-24" };

beforeEach(() => {
  fixture.edit.mockReset().mockResolvedValue(undefined);
  fixture.listForSeries.mockReset().mockResolvedValue([fixture.episode]);
});

describe("episode edit routes", () => {
  it.each(["owner", "admin", "editor"] as const)("allows %s to open and save episode details", async role => {
    const app = studio(role);
    await request(app).get(path).expect(200).expect(({ body }) => {
      expect(body.selectedEpisode).toBe("ep_7");
    });
    const response = await request(app).post(path).type("form").send(valid).expect(302);
    expect(response.headers.location).toBe("/admin/series/ser_4?savedEpisode=7#episode-7");
    expect(fixture.edit).toHaveBeenCalledWith(7, 4, {
      episodeNumber: 3, title: "New title", hook: "A clue", isFree: false,
      coinCost: 8, releaseDate: "2026-11-24",
    });
  });

  it("denies Analyst page and save requests", async () => {
    const app = studio("analyst");
    await request(app).get(path).expect(403);
    await request(app).post(path).type("form").send(valid).expect(403);
    expect(fixture.edit).not.toHaveBeenCalled();
  });

  it("rejects wrong series or episode identifiers", async () => {
    const app = studio("editor");
    await request(app).get("/admin/series/ser_missing/episodes/ep_7/edit").expect(404);
    await request(app).get("/admin/series/ser_4/episodes/ep_missing/edit").expect(404);
    await request(app).post("/admin/series/ser_4/episodes/ep_missing/edit").type("form").send(valid).expect(404);
  });

  it.each([
    [{ ...valid, episodeNumber: "2.5" }, "positive whole"],
    [{ ...valid, title: "" }, "episode title"],
    [{ ...valid, releaseDate: "2026-02-30" }, "valid release date"],
    [{ ...valid, access: "invalid" }, "valid access"],
  ])("retains entered values after validation fails", async (body, message) => {
    const response = await request(studio("editor")).post(path).type("form").send(body).expect(400);
    expect(response.body.error).toContain(message);
    expect(response.body.values).toMatchObject(body);
    expect(fixture.edit).not.toHaveBeenCalled();
  });

  it("explains a duplicate episode number", async () => {
    fixture.edit.mockRejectedValue({ code: "ER_DUP_ENTRY" });
    const response = await request(studio("editor")).post(path).type("form").send(valid).expect(400);
    expect(response.body.error).toContain("already exists");
    expect(response.body.values.title).toBe("New title");
  });
});
