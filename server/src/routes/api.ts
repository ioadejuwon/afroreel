import { Router, type Request } from "express";
import { attemptMobileLogin, createMobileUser, requireMobileUser } from "../auth";
import { config } from "../config";
import {
  addEpisodeComment,
  getEpisodeEngagement,
  getEpisodeForPlayback,
  InsufficientCoinsError,
  listEpisodeComments,
  listEpisodesForSeries,
  listSeries,
  listWalletTransactions,
  saveProgress,
  setEpisodeReaction,
  topUpMobileUserWallet,
  unlockEpisode,
} from "../content";
import { createPlaybackUrl } from "../cloudflare";

export const apiRouter = Router();
const walletTopUpCoins = new Set([100, 300, 1000]);

apiRouter.post("/auth/signup", async (req, res, next) => {
  try {
    const email = stringBody(req.body?.email).toLowerCase();
    const password = passwordBody(req.body?.password);

    if (!isValidEmail(email) || password.length < 8) {
      res.status(400).json({ error: "Enter a valid email and a password with at least 8 characters." });
      return;
    }

    const result = await createMobileUser(email, password);
    res.status(201).json({ token: result.token, user: mobileUserResponse(result.user) });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    next(error);
  }
});

apiRouter.post("/auth/signin", async (req, res, next) => {
  try {
    const email = stringBody(req.body?.email).toLowerCase();
    const password = passwordBody(req.body?.password);
    const result = await attemptMobileLogin(email, password);

    if (!result) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    res.json({ token: result.token, user: mobileUserResponse(result.user) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/auth/me", requireMobileUser, (req, res) => {
  res.json({ user: mobileUserResponse(req.mobileUser) });
});

apiRouter.use(requireMobileUser);

apiRouter.get("/series", async (req, res, next) => {
  try {
    const series = await listSeries(false, mobileUserId(req));
    res.json({
      series: series.map((item) => ({
        id: item.series_id,
        databaseId: item.id,
        title: item.title,
        slug: item.slug,
        synopsis: item.synopsis,
        genres: splitGenres(item.genres),
        posterUrl: absolutize(req, item.poster_url),
        episodeCount: Number(item.episode_count ?? 0),
        freeEpisodeCount: Number(item.free_episode_count ?? 0),
        latestEpisodeAt: item.latest_episode_at,
        progressSeconds: Number(item.progress_seconds ?? 0),
        status: item.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/series/:seriesId/episodes", async (req, res, next) => {
  try {
    const seriesId = req.params.seriesId;
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

apiRouter.post("/wallet/topup", async (req, res, next) => {
  try {
    const coins = Number.parseInt(String(req.body?.coins ?? "0"), 10);

    if (!walletTopUpCoins.has(coins)) {
      res.status(400).json({ error: "Choose a valid coin pack." });
      return;
    }

    const result = await topUpMobileUserWallet(mobileUserId(req), coins);
    if (!result) {
      res.status(404).json({ error: "Could not update this wallet." });
      return;
    }

    req.mobileUser = {
      ...req.mobileUser!,
      coinBalance: result.newCoinBalance,
    };

    res.json({
      success: true,
      ...result,
      user: mobileUserResponse(req.mobileUser),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/wallet/transactions", async (req, res, next) => {
  try {
    const transactions = await listWalletTransactions(mobileUserId(req));
    res.json({
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        coinAmount: transaction.coinAmount,
        description: transaction.description,
        episodeId: transaction.episodeId,
        seriesTitle: transaction.seriesTitle,
        episodeNumber: transaction.episodeNumber,
        createdAt: transaction.createdAt,
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
    const unlockResult = await unlockEpisode(episodeId, userId, method);
    req.mobileUser = {
      ...req.mobileUser!,
      coinBalance: unlockResult.newCoinBalance,
    };
    res.json({
      success: true,
      episodeId,
      ...unlockResult,
      user: mobileUserResponse(req.mobileUser),
    });
  } catch (error) {
    if (error instanceof InsufficientCoinsError) {
      res.status(402).json({ error: error.message });
      return;
    }

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

    const playbackUrl = episode.cloudflare_video_uid.startsWith("local:")
      ? absolutize(req, episode.cloudflare_video_uid.replace(/^local:/, ""))
      : await createPlaybackUrl(episode.cloudflare_video_uid);

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

apiRouter.get("/episodes/:episodeId/engagement", async (req, res, next) => {
  try {
    const episodeId = Number.parseInt(req.params.episodeId, 10);
    res.json({ engagement: await getEpisodeEngagement(episodeId, mobileUserId(req)) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/reactions", async (req, res, next) => {
  try {
    const episodeId = Number.parseInt(req.params.episodeId, 10);
    const type = req.body?.type === "save" ? "save" : "like";
    const isActive = Boolean(req.body?.isActive);

    res.json({
      success: true,
      engagement: await setEpisodeReaction(episodeId, mobileUserId(req), type, isActive),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/episodes/:episodeId/comments", async (req, res, next) => {
  try {
    const episodeId = Number.parseInt(req.params.episodeId, 10);
    res.json({
      comments: (await listEpisodeComments(episodeId)).map(commentResponse),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/comments", async (req, res, next) => {
  try {
    const episodeId = Number.parseInt(req.params.episodeId, 10);
    const body = stringBody(req.body?.body);
    const comment = await addEpisodeComment(episodeId, mobileUserId(req), body);
    const engagement = await getEpisodeEngagement(episodeId, mobileUserId(req));

    res.status(201).json({
      success: true,
      comment: commentResponse(comment),
      engagement,
    });
  } catch (error) {
    next(error);
  }
});

function mobileUserId(req: Request): string {
  if (req.mobileUser) {
    return req.mobileUser.userId;
  }

  return "";
}

function splitGenres(value: string | null): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function absolutize(req: Request, value: string | null): string | null {
  if (!value || value.startsWith("http")) {
    return value;
  }

  const baseUrl = config.publicBaseUrl || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

function stringBody(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function passwordBody(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDuplicateEmailError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && String(error.code) === "ER_DUP_ENTRY";
}

function commentResponse(comment: {
  id: number;
  userId: string;
  authorName: string;
  body: string;
  createdAt: Date | string;
}) {
  return {
    id: comment.id,
    userId: comment.userId,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}

function mobileUserResponse(user: Request["mobileUser"]): { id: string; email: string; name: string; coinBalance: number } | null {
  if (!user) {
    return null;
  }

  return {
    id: user.userId,
    email: user.email,
    name: user.name,
    coinBalance: user.coinBalance,
  };
}
