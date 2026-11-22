import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { MediaError } from "./cloudflare";

export type EpisodeDefaults = { free_opening_episodes: number; locked_coin_price: number };

export async function episodeDefaults(): Promise<EpisodeDefaults> {
  const [rows] = await pool.execute<(EpisodeDefaults & RowDataPacket)[]>(
    "SELECT free_opening_episodes, locked_coin_price FROM episode_defaults WHERE id = 1",
  );
  if (!rows[0]) throw new Error("Episode defaults are missing. Check database migrations.");
  return rows[0];
}

function wholeNumber(value: unknown, label: string) {
  if (!/^\d+$/.test(String(value ?? "")) || Number(value) > 4294967295) {
    throw new MediaError(400, `Enter a nonnegative whole number for ${label}.`);
  }
  return Number(value);
}

export async function saveEpisodeDefaults(free: unknown, price: unknown) {
  await pool.execute("UPDATE episode_defaults SET free_opening_episodes = ?, locked_coin_price = ? WHERE id = 1",
    [wholeNumber(free, "free opening episodes"), wholeNumber(price, "coin price")]);
}

export async function seriesEpisodeAccess(seriesId: number, episodeNumber: number, body: Record<string, unknown>) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT default_episode_access FROM series WHERE id = ?", [seriesId],
  );
  if (!rows[0]) throw new MediaError(400, "Choose an existing series.");
  const access = body.access === "default" || !body.access
    ? (body.isFree === "on" ? "free" : rows[0].default_episode_access)
    : body.access;
  return episodeAccess(await episodeDefaults(), episodeNumber, { ...body, access });
}

export function episodeAccess(defaults: EpisodeDefaults, number: number, body: Record<string, unknown>) {
  const choice = body.access ?? (body.isFree === "on" ? "free" : "default");
  if (!["free", "locked", "default"].includes(String(choice))) throw new MediaError(400, "Choose a valid access rule.");
  const isFree = choice === "default" ? number <= defaults.free_opening_episodes : choice === "free";
  const price = body.coinCost === "" || body.coinCost == null ? defaults.locked_coin_price : body.coinCost;
  return { isFree, coinCost: isFree ? 0 : wholeNumber(price, "coin price") };
}
