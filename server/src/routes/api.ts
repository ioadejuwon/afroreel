import { Router } from "express";
import { config } from "../config";
import {
  getEpisodeForPlayback,
  listEpisodesForSeries,
  listSeries,
  saveProgress,
  unlockEpisode,
} from "../content";
import { createPlaybackUrl } from "../cloudflare";

export const apiRouter = Router();

apiRouter.get("/series", async (_req, res, next) => {
  try {
    const series = await listSeries(false);
    res.json({
      series: series.map((item) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        synopsis: item.synopsis,
        genres: splitGenres(item.genres),
        posterUrl: absolutize(item.poster_url),
        episodeCount: item.episode_count,
        status: item.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/series/:seriesId/episodes", async (req, res, next) => {
  try {
    const seriesId = Number.parseInt(req.params.seriesId, 10);
    const userId = mobileUserId(req);
    const episodes = await listEpisodesForSeries(seriesId, false, userId);

    res.json({
      episodes: episodes.map((episode) => ({
        id: episode.id,
        seriesId: episode.series_id,
        seriesTitle: episode.series_title,
        episodeNumber: episode.episode_number,
        title: episode.title,
        hook: episode.hook,
        thumbnailUrl: episode.thumbnail_url,
        durationSeconds: episode.duration_seconds,
        isFree: Boolean(episode.is_free),
        coinCost: episode.coin_cost,
        isUnlocked: Boolean(episode.is_unlocked),
        isLocked: !episode.is_free && !episode.is_unlocked,
        progressSeconds: episode.progress_seconds ?? 0,
        releaseDate: episode.release_date,
      })),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/unlock", async (req, res, next) => {
  try {
    const episodeId = Number.parseInt(req.params.episodeId, 10);
    const userId = mobileUserId(req);
    const method = req.body?.method === "ad" ? "ad" : "coins";
    await unlockEpisode(episodeId, userId, method);
    res.json({ success: true, episodeId, coinsDeducted: method === "coins" ? 5 : 0, newCoinBalance: 250 });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/playback", async (req, res, next) => {
  try {
    const episodeId = Number.parseInt(req.params.episodeId, 10);
    const userId = mobileUserId(req);
    const episode = await getEpisodeForPlayback(episodeId, userId);

    if (!episode) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }

    const canPlay = Boolean(episode.is_free || episode.is_unlocked);
    if (!canPlay) {
      res.status(403).json({ error: "Episode is locked." });
      return;
    }

    if (!episode.cloudflare_video_uid || !episode.cloudflare_ready) {
      res.status(409).json({ error: "Episode video is not ready." });
      return;
    }

    const playbackUrl = await createPlaybackUrl(episode.cloudflare_video_uid);
    res.json({
      episodeId,
      playbackUrl,
      progressSeconds: episode.progress_seconds ?? 0,
      expiresInSeconds: 3600,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/progress", async (req, res, next) => {
  try {
    const episodeId = Number.parseInt(req.params.episodeId, 10);
    const progressSeconds = Number.parseInt(String(req.body?.progressSeconds ?? "0"), 10);
    await saveProgress(episodeId, mobileUserId(req), Number.isNaN(progressSeconds) ? 0 : progressSeconds);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

function mobileUserId(req: { header(name: string): string | undefined }): string {
  return req.header("x-afroreel-user-id") || config.mobileStubUserId;
}

function splitGenres(value: string | null): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function absolutize(value: string | null): string | null {
  if (!value || value.startsWith("http")) {
    return value;
  }

  return config.publicBaseUrl ? `${config.publicBaseUrl}${value}` : value;
}
