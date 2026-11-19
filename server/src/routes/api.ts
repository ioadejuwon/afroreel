import { Router, type Request } from "express";
import {
  attemptMobileLogin,
  changeMobilePassword,
  createMobileUser,
  revokeMobileRefreshToken,
  rotateMobileRefreshToken,
  requireMobileUser,
  updateMobileUserProfile,
} from "../auth";
import { allowLocalMedia, config, isProduction } from "../config";
import {
  addEpisodeComment,
  blockUser,
  deleteOwnComment,
  getEpisodeDatabaseId,
  getEpisodeEngagement,
  getEpisodeForPlayback,
  getEpisodePublicId,
  InsufficientCoinsError,
  listLikedEpisodes,
  listEpisodeComments,
  listEpisodesForSeries,
  listSeries,
  listWalletTransactions,
  listWatchHistory,
  saveProgress,
  reportComment,
  setEpisodeReaction,
  topUpMobileUserWallet,
  unlockEpisode,
  type EpisodeRow,
} from "../content";
import { createPlaybackUrl, createThumbnailUrl, isStreamVideoUid, MediaError, STREAM_PLAYBACK_TTL_SECONDS } from "../cloudflare";
import { coinProducts } from "../commerce";
import { legacyMediaUrl, posterUrl } from "../media";

export const apiRouter = Router();
const walletTopUpCoins = new Set([100, 300, 1000]);

apiRouter.post("/auth/signup", async (req, res, next) => {
  try {
    const email = stringBody(req.body?.email).toLowerCase();
    const name = stringBody(req.body?.name);
    const username = stringBody(req.body?.username).toLowerCase();
    const password = passwordBody(req.body?.password);

    if (!name || !isValidEmail(email) || !isValidUsername(username) || password.length < 8) {
      res.status(400).json({ error: "Enter your name, a valid email, a username, and a password with at least 8 characters." });
      return;
    }

    const result = await createMobileUser({ email, password, name, username });
    res.status(201).json({ token: result.token, refreshToken: result.refreshToken, user: mobileUserResponse(result.user) });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      res.status(409).json({ error: "That email or username is already taken." });
      return;
    }

    next(error);
  }
});

apiRouter.post("/auth/signin", async (req, res, next) => {
  try {
    const identifier = stringBody(req.body?.identifier ?? req.body?.email).toLowerCase();
    const password = passwordBody(req.body?.password);
    const result = await attemptMobileLogin(identifier, password);

    if (!result) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    res.json({ token: result.token, refreshToken: result.refreshToken, user: mobileUserResponse(result.user) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/auth/me", requireMobileUser, (req, res) => {
  res.json({ user: mobileUserResponse(req.mobileUser) });
});

apiRouter.post("/auth/refresh", async (req, res, next) => {
  try {
    const result = await rotateMobileRefreshToken(stringBody(req.body?.refreshToken));
    if (!result) {
      res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Sign in again to continue." } });
      return;
    }
    res.json({ token: result.token, refreshToken: result.refreshToken, user: mobileUserResponse(result.user) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/auth/logout", async (req, res, next) => {
  try {
    await revokeMobileRefreshToken(stringBody(req.body?.refreshToken));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/store/products", (_req, res) => {
  res.json({ products: coinProducts });
});

apiRouter.use(requireMobileUser);

apiRouter.patch("/account/profile", async (req, res, next) => {
  try {
    const name = stringBody(req.body?.name);
    const email = stringBody(req.body?.email).toLowerCase();
    const username = stringBody(req.body?.username).toLowerCase();

    if (!name || !isValidEmail(email) || !isValidUsername(username)) {
      res.status(400).json({ error: "Enter your name, a valid email, and a username." });
      return;
    }

    const user = await updateMobileUserProfile(mobileUserId(req), { name, email, username });
    req.mobileUser = user;
    res.json({ user: mobileUserResponse(user) });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      res.status(409).json({ error: "That email or username is already taken." });
      return;
    }

    next(error);
  }
});

apiRouter.post("/account/password", async (req, res, next) => {
  try {
    const currentPassword = passwordBody(req.body?.currentPassword);
    const newPassword = passwordBody(req.body?.newPassword);

    if (!currentPassword || newPassword.length < 8) {
      res.status(400).json({ error: "Enter your current password and a new password with at least 8 characters." });
      return;
    }

    const didChange = await changeMobilePassword(mobileUserId(req), currentPassword, newPassword);
    if (!didChange) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

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
        posterUrl: absolutize(req, posterUrl(item, "posterdetail")),
        posterCardUrl: absolutize(req, posterUrl(item, "postercard")),
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

    res.set("Cache-Control", "private, no-store");
    res.json({
      episodes: episodes.map((episode) => ({
        id: episode.episode_id,
        databaseId: episode.id,
        seriesId: episode.series_id,
        seriesTitle: episode.series_title,
        episodeNumber: episode.episode_number,
        title: episode.title,
        hook: episode.hook,
        thumbnailUrl: episodeThumbnailUrl(req, episode),
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
    if (isProduction) {
      res.status(410).json({
        error: { code: "STORE_VERIFICATION_REQUIRED", message: "Use a verified App Store or Google Play purchase." },
      });
      return;
    }
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

apiRouter.get("/profile/watch-history", async (req, res, next) => {
  try {
    res.json({
      items: (await listWatchHistory(mobileUserId(req))).map((item) => profileEpisodeResponse(req, item)),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/profile/likes", async (req, res, next) => {
  try {
    res.json({
      items: (await listLikedEpisodes(mobileUserId(req))).map((item) => profileEpisodeResponse(req, item)),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/unlock", async (req, res, next) => {
  try {
    const publicEpisodeId = req.params.episodeId;
    const episodeId = await getEpisodePublicId(publicEpisodeId);
    if (!episodeId) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }
    const userId = mobileUserId(req);
    if (req.body?.method === "ad") {
      res.status(403).json({
        error: { code: "VERIFIED_REWARD_REQUIRED", message: "Complete a verified rewarded ad to unlock this episode." },
      });
      return;
    }
    const method = "coins" as const;
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
    const publicEpisodeId = req.params.episodeId;
    const episodeId = await getEpisodeDatabaseId(publicEpisodeId);
    if (!episodeId) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }
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

    const uid = episode.cloudflare_video_uid;
    const localUrl = allowLocalMedia && uid?.startsWith("local:")
      ? legacyMediaUrl(uid.slice("local:".length))
      : null;
    if (!episode.cloudflare_ready || (!localUrl && !isStreamVideoUid(uid))) {
      res.status(409).json({ error: "Episode video is not ready." });
      return;
    }

    const playbackUrl = isStreamVideoUid(uid) ? createPlaybackUrl(uid) : absolutize(req, localUrl);
    res.set("Cache-Control", "private, no-store");
    res.json({
      episodeId: episode.episode_id,
      playbackUrl,
      contentType: localUrl ? "auto" : "hls",
      progressSeconds: episode.progress_seconds ?? 0,
      expiresInSeconds: STREAM_PLAYBACK_TTL_SECONDS,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/progress", async (req, res, next) => {
  try {
    const episodeId = await getEpisodePublicId(req.params.episodeId);
    if (!episodeId) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }
    const progressSeconds = Number.parseInt(String(req.body?.progressSeconds ?? "0"), 10);
    await saveProgress(episodeId, mobileUserId(req), Number.isNaN(progressSeconds) ? 0 : progressSeconds);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/episodes/:episodeId/engagement", async (req, res, next) => {
  try {
    const episodeId = await getEpisodePublicId(req.params.episodeId);
    if (!episodeId) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }
    res.json({ engagement: await getEpisodeEngagement(episodeId, mobileUserId(req)) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/reactions", async (req, res, next) => {
  try {
    const episodeId = await getEpisodePublicId(req.params.episodeId);
    if (!episodeId) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }
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
    const episodeId = await getEpisodePublicId(req.params.episodeId);
    if (!episodeId) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }
    res.json({
      comments: (await listEpisodeComments(episodeId, mobileUserId(req))).map(commentResponse),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/comments/:commentId/report", async (req, res, next) => {
  try {
    const commentId = Number.parseInt(String(req.params.commentId), 10);
    const reason = stringBody(req.body?.reason);
    if (!commentId || !reason) {
      res.status(400).json({ error: { code: "INVALID_REPORT", message: "Choose a report reason." } });
      return;
    }
    await reportComment(commentId, mobileUserId(req), reason, stringBody(req.body?.details));
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/users/:userId/block", async (req, res, next) => {
  try {
    await blockUser(mobileUserId(req), String(req.params.userId));
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/comments/:commentId", async (req, res, next) => {
  try {
    const deleted = await deleteOwnComment(Number.parseInt(String(req.params.commentId), 10), mobileUserId(req));
    res.status(deleted ? 204 : 404).end();
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/episodes/:episodeId/comments", async (req, res, next) => {
  try {
    const episodeId = await getEpisodePublicId(req.params.episodeId);
    if (!episodeId) {
      res.status(404).json({ error: "Episode is not available." });
      return;
    }
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

function episodeThumbnailUrl(req: Request, episode: EpisodeRow): string | null {
  if ((!episode.is_free && !episode.is_unlocked) || !episode.cloudflare_ready) return null;
  const uid = episode.cloudflare_video_uid;
  if (!isStreamVideoUid(uid)) {
    return allowLocalMedia ? absolutize(req, legacyMediaUrl(episode.thumbnail_url)) : null;
  }

  try {
    const frameTime = episode.cloudflare_thumbnail_time_ms ?? (episode.duration_seconds ?? 0) * 100;
    return createThumbnailUrl(uid, frameTime);
  } catch (error) {
    if (!isProduction && error instanceof MediaError && error.status === 503) return null;
    throw error;
  }
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

function isValidUsername(value: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(value);
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

function profileEpisodeResponse(req: Request, item: {
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  hook: string | null;
  progressSeconds: number;
  activityAt: Date | string;
  series: {
    id: number;
    series_id: string;
    title: string;
    slug: string;
    synopsis: string | null;
    genres: string | null;
    poster_url: string | null;
    poster_image_id: string | null;
    episode_count: number;
    free_episode_count: number;
    latest_episode_at: Date | string | null;
    progress_seconds?: number | null;
    status: string;
  };
}) {
  return {
    episodeId: item.episodeId,
    episodeNumber: item.episodeNumber,
    episodeTitle: item.episodeTitle,
    hook: item.hook,
    progressSeconds: item.progressSeconds,
    activityAt: item.activityAt,
    series: {
      id: item.series.series_id,
      databaseId: item.series.id,
      title: item.series.title,
      slug: item.series.slug,
      synopsis: item.series.synopsis,
      genres: splitGenres(item.series.genres),
      posterUrl: absolutize(req, posterUrl(item.series, "posterdetail")),
      posterCardUrl: absolutize(req, posterUrl(item.series, "postercard")),
      episodeCount: Number(item.series.episode_count ?? 0),
      freeEpisodeCount: Number(item.series.free_episode_count ?? 0),
      latestEpisodeAt: item.series.latest_episode_at,
      progressSeconds: Number(item.series.progress_seconds ?? item.progressSeconds ?? 0),
      status: item.series.status,
    },
  };
}

function mobileUserResponse(user: Request["mobileUser"]): { id: string; email: string; username: string | null; name: string; coinBalance: number } | null {
  if (!user) {
    return null;
  }

  return {
    id: user.userId,
    email: user.email,
    username: user.username,
    name: user.name,
    coinBalance: user.coinBalance,
  };
}
