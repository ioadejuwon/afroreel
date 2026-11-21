// Set MEDIA_TEST_SOCKET to a disposable MySQL server with socket access as root.
// The suite creates its own randomly named schema and uses a fake Cloudflare provider.
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "./db";
import { episodePreviewId, importEpisodePreview } from "./cloudflare";
import { applyStreamVideoStatus, beginEpisodeStreamUpload, createEpisode, createSeries, deleteEpisode,
  deleteSeries, duplicateSeries, getEpisodeMedia, setSeriesPoster } from "./content";
import { cleanMedia, auditMedia } from "./media-cleanup";
import { mediaTransaction, queueAssets } from "./media-catalog";

const settings = vi.hoisted(() => ({
  socketPath: process.env.MEDIA_TEST_SOCKET,
  schema: "afroreel_cleanup_test_" + Math.random().toString(16).slice(2),
}));
vi.mock("./config", () => ({ allowLocalMedia: false, config: {
  db: { user: "root", password: "", socketPath: settings.socketPath, database: settings.schema },
  cloudflare: { accountId: "test", customerCode: "example", imagesDeliveryHash: "hash", apiToken: "test", imagesApiToken: "test" },
} }));
vi.mock("./cloudflare", async original => ({
  ...await original<typeof import("./cloudflare")>(),
  verifyCleanupCatalog: vi.fn(async () => {}),
  importEpisodePreview: vi.fn(async (uid: string, time: number) => `https://imagedelivery.net/hash/${episodePreviewId(uid, time)}/public`),
}));

const posterUrl = (id: string, variant: string) => `https://imagedelivery.net/hash/${id}/${variant}`;
const create = (title: string, posterImageId: string | null = null, legacy: string | null = null) =>
  createSeries({ title, posterImageId, genres: "Drama", synopsis: "", posterUrl: legacy, status: "draft" });
const episode = (seriesId: number, episodeNumber: number) =>
  createEpisode({ seriesId, episodeNumber, title: "Test", hook: "", isFree: true, coinCost: 0, releaseDate: null, status: "draft" });
const ready = (uid: string) => applyStreamVideoStatus({ uid, state: "ready", durationSeconds: 10, thumbnailTimeMs: 1000, error: null });
const video = () => randomBytes(16).toString("hex");

describe.skipIf(!settings.socketPath)("MySQL media cleanup lifecycle", () => {
  const deleted = new Set<string>();
  const request = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const id = url.pathname.split("/").pop()!;
    if (init.method === "DELETE") {
      if (deleted.has(id)) return new Response(null, { status: 404 });
      deleted.add(id);
      return Response.json({ success: true });
    }
    if (url.pathname.endsWith("/stream")) return Response.json({ success: true, total: 0, result: [] });
    if (url.pathname.endsWith("/images/v2")) return Response.json({ success: true, result: { images: [{ id: "historical" }] } });
    if (deleted.has(id)) return new Response(null, { status: 404 });
    return Response.json({ success: true, result: {
      id, draft: false, requireSignedURLs: false,
      variants: ["postercard", "posterdetail", "adminpreview"].map(v => posterUrl(id, v)),
    } });
  });
  let root: mysql.Connection;
  beforeAll(async () => {
    vi.stubGlobal("fetch", request);
    root = await mysql.createConnection({ user: "root", socketPath: settings.socketPath });
    await root.query("CREATE DATABASE " + settings.schema);
    for (const name of (await readdir("database/migrations")).filter(name => name.endsWith(".sql")).sort()) {
      const sql = await readFile("database/migrations/" + name, "utf8");
      for (const stmt of sql.split(/^-- migrate:split\s*$/m)) if (stmt.trim()) await pool.query(stmt);
    }
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await pool.end();
    if (root) {
      await root.query("DROP DATABASE " + settings.schema);
      await root.end();
    }
  });

  it("preserves working media on failed replacement and releases retired media after promotion", async () => {
    const series = await create("Replacements");
    const id = await episode(series.id, 1);
    const [old, failed, next] = [video(), video(), video()];
    await beginEpisodeStreamUpload(id, old, null);
    await ready(old);
    await beginEpisodeStreamUpload(id, failed, null);
    await applyStreamVideoStatus({ uid: failed, state: "failed", durationSeconds: null, thumbnailTimeMs: null, error: "failed" });
    await cleanMedia();
    expect((await getEpisodeMedia(id))?.cloudflare_video_uid).toBe(old);
    expect(deleted.has(old)).toBe(false);
    await beginEpisodeStreamUpload(id, next, failed);
    await Promise.all([ready(next), ready(next)]);
    await cleanMedia();
    expect([old, failed, episodePreviewId(old, 1000)].every(item => deleted.has(item))).toBe(true);
    expect(deleted.has(next)).toBe(false);
    expect(deleted.has(episodePreviewId(next, 1000))).toBe(false);
    const pending = video();
    await beginEpisodeStreamUpload(id, pending, null);
    await deleteEpisode(id);
    await cleanMedia();
    expect([pending, next, episodePreviewId(next, 1000)].every(item => deleted.has(item))).toBe(true);
  });

  it("rolls back failed series deletion and honors shared and legacy poster references", async () => {
    const source = await create("Original", "shared");
    await duplicateSeries(source.id);
    const [copies] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM series WHERE title = 'Copy of Original'");
    const legacy = await create("Legacy", null, posterUrl("shared", "public"));
    const pending = [video(), video()];
    for (const [i, uid] of pending.entries()) await beginEpisodeStreamUpload(await episode(source.id, i + 1), uid, null);
    await expect(deleteSeries(source.id, 1)).rejects.toThrow("series changed");
    await cleanMedia();
    expect(pending.some(id => deleted.has(id))).toBe(false);
    await deleteSeries(source.id, 2);
    await cleanMedia();
    expect(pending.every(id => deleted.has(id))).toBe(true);
    expect(deleted.has("shared")).toBe(false);
    await deleteSeries(copies[0].id, 0);
    await cleanMedia();
    expect(deleted.has("shared")).toBe(false);
    await setSeriesPoster(legacy.id, "new-poster");
    await cleanMedia();
    expect(deleted.has("shared")).toBe(true);
    expect(deleted.has("new-poster")).toBe(false);
    await deleteSeries(legacy.id, 0);
    await cleanMedia();
    expect(deleted.has("new-poster")).toBe(true);
  });

  it("retries an interrupted delete and prevents reattachment while a delete is in flight", async () => {
    const series = await create("Concurrent");
    const asset = { service: "Images" as const, id: "retired" };
    await expect(mediaTransaction(async db => {
      await queueAssets(db, [asset]);
      throw new Error("aborted");
    })).rejects.toThrow("aborted");
    await cleanMedia();
    expect(deleted.has(asset.id)).toBe(false);
    await mediaTransaction(db => queueAssets(db, [asset]));
    request.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(cleanMedia()).rejects.toThrow("scheduled for retry");
    const [jobs] = await pool.query<mysql.RowDataPacket[]>("SELECT attempts, next_attempt > NOW() AS retry_pending FROM media_cleanup WHERE asset_id = ?", [asset.id]);
    expect(jobs[0]).toMatchObject({ attempts: 1, retry_pending: 1 });
    await pool.execute("UPDATE media_cleanup SET next_attempt = NOW() WHERE asset_id = ?", [asset.id]);
    let started!: () => void;
    let finish!: () => void;
    const deleting = new Promise<void>(resolve => { started = resolve; });
    const resume = new Promise<void>(resolve => { finish = resolve; });
    request.mockImplementationOnce(async () => {
      started();
      await resume;
      deleted.add(asset.id);
      return new Response(null, { status: 404 });
    });
    const cleanup = cleanMedia();
    await deleting;
    const edit = setSeriesPoster(series.id, asset.id);
    finish();
    await Promise.all([cleanup, expect(edit).rejects.toThrow("verify the poster")]);
    const [remaining] = await pool.query<mysql.RowDataPacket[]>("SELECT asset_id FROM media_cleanup");
    expect(remaining).toHaveLength(0);
  });

  it("releases a preview if an episode is deleted during its import", async () => {
    const series = await create("Preview race");
    const id = await episode(series.id, 1);
    const uid = video();
    await beginEpisodeStreamUpload(id, uid, null);
    let started!: () => void;
    let finish!: () => void;
    const importing = new Promise<void>(resolve => { started = resolve; });
    const resume = new Promise<void>(resolve => { finish = resolve; });
    vi.mocked(importEpisodePreview).mockImplementationOnce(async () => {
      started();
      await resume;
      return posterUrl(episodePreviewId(uid, 1000), "public");
    });
    const promotion = ready(uid);
    await importing;
    const deletion = deleteEpisode(id);
    finish();
    await Promise.all([promotion, deletion]);
    await cleanMedia();
    expect(deleted.has(uid)).toBe(true);
    expect(deleted.has(episodePreviewId(uid, 1000))).toBe(true);
  });

  it("recovers a durable job if the worker loses its transaction after the remote deletion", async () => {
    const asset = { service: "Images" as const, id: "interrupted" };
    await mediaTransaction(db => queueAssets(db, [asset]));
    await pool.query(`CREATE TRIGGER simulate_cleanup_interruption BEFORE DELETE ON media_cleanup
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'interrupted after remote delete'`);
    try {
      await expect(cleanMedia()).rejects.toThrow("interrupted after remote delete");
      expect(deleted.has(asset.id)).toBe(true);
    } finally {
      await pool.query("DROP TRIGGER simulate_cleanup_interruption");
    }
    await cleanMedia();
    const [remaining] = await pool.query<mysql.RowDataPacket[]>("SELECT asset_id FROM media_cleanup");
    expect(remaining).toHaveLength(0);
  });

  it("reports historical candidates using read-only provider requests", async () => {
    request.mockClear();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await auditMedia();
      expect(log.mock.calls.flat().join(" ")).toContain('"id":"historical","ownership":"uncertain"');
      expect(request.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(true);
    } finally { log.mockRestore(); }
  });
});
