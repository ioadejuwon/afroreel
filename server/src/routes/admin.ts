import { Router, type Request, type Response, type NextFunction } from "express";
import { attemptAdminLogin, requireAdmin } from "../auth";
import {
  applyStreamVideoStatus,
  attachLocalVideo,
  beginEpisodeStreamUpload,
  createEpisode,
  createSeries,
  deleteEpisode,
  getDashboardData,
  getEpisodeMedia,
  getUsersData,
  listEpisodes,
  listSeries,
  markEpisodeUploadComplete,
  setEpisodeStatus,
  setSeriesPoster,
  setSeriesStatus,
  type EpisodeMedia,
  type EpisodeStatus,
  type SeriesStatus,
} from "../content";
import {
  createImageDirectUpload,
  createTusUpload,
  getStreamVideo,
  isStreamVideoUid,
  MediaError,
  STREAM_MAX_DURATION_SECONDS,
  verifyPosterImage,
} from "../cloudflare";
import { allowLocalMedia, config } from "../config";
import { posterUrl } from "../media";
import { saveLocalVideoStream, savePosterDataUrl } from "../uploads";

export const adminRouter = Router();
const adminViews = new Set(["dashboard", "series", "series-new", "series-detail", "episodes", "users", "monetization", "analytics", "settings"]);

function adminPath(req: Request, suffix = ""): string {
  return `${req.baseUrl || "/admin"}${suffix}`;
}

function renderLogin(req: Request, res: Response, error = ""): void {
  res.render("login", {
    admin: req.admin ?? null,
    csrfToken: req.csrfToken(),
    error,
  });
}

async function renderAdmin(req: Request, res: Response, options: {
  status?: number;
  episodeFormError?: string;
  initialView?: string;
  seriesDetailId?: string;
} = {}): Promise<void> {
  const [series, episodes, dashboard, users] = await Promise.all([listSeries(true), listEpisodes(true), getDashboardData(), getUsersData()]);
  const initialView = adminViews.has(options.initialView ?? "") ? options.initialView : "dashboard";
  const selectedSeries = options.seriesDetailId
    ? series.find((item) => item.series_id === options.seriesDetailId || item.id === Number.parseInt(options.seriesDetailId ?? "", 10)) ?? null
    : null;
  const selectedEpisodes = selectedSeries ? episodes.filter((episode) => episode.series_id === selectedSeries.id) : [];

  res.set("Cache-Control", "private, no-store").status(options.status ?? 200).render("admin", {
    admin: req.admin,
    csrfToken: req.csrfToken(),
    series,
    episodes,
    dashboard,
    users,
    selectedSeries,
    selectedEpisodes,
    posterUrl,
    videoUploadResponse,
    pollStreamLocally: config.nodeEnv === "development",
    episodeFormError: options.episodeFormError ?? "",
    initialView,
  });
}

function adminViewPath(req: Request, view: string): string {
  return adminPath(req, `/${view}`);
}

adminRouter.get("/login", (req, res) => {
  if (req.admin) {
    res.redirect(adminViewPath(req, "dashboard"));
    return;
  }

  renderLogin(req, res);
});

adminRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const admin = await attemptAdminLogin(email, password);

    if (!admin) {
      renderLogin(req, res, "Invalid email or password.");
      return;
    }

    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        next(regenerateError);
        return;
      }

      req.session.adminId = admin.id;
      res.redirect(adminViewPath(req, "dashboard"));
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }

    res.clearCookie("afroreel_admin");
    res.redirect(adminPath(req, "/login"));
  });
});

adminRouter.get("/", requireAdmin, async (req, res, next) => {
  try {
    res.redirect(adminViewPath(req, "dashboard"));
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/series/new", requireAdmin, async (req, res, next) => {
  try {
    await renderAdmin(req, res, { initialView: "series-new" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/series/:seriesId", requireAdmin, async (req, res, next) => {
  try {
    const seriesId = String(req.params.seriesId || "");
    await renderAdmin(req, res, { initialView: "series-detail", seriesDetailId: seriesId });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/:view", requireAdmin, async (req, res, next) => {
  try {
    const view = String(req.params.view || "");
    if (!adminViews.has(view)) {
      res.status(404).send("Admin page not found");
      return;
    }

    await renderAdmin(req, res, { initialView: view });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/series", requireAdmin, async (req, res, next) => {
  try {
    const title = stringBody(req.body.title);
    if (!title) {
      throw new MediaError(400, "Series title is required.");
    }

    const posterImageId = stringBody(req.body.posterImageId) || null;
    if (posterImageId) await verifyPosterImage(posterImageId);
    const posterData = stringBody(req.body.posterDataUrl);
    if (!posterImageId && posterData && !allowLocalMedia) {
      throw new MediaError(400, "Upload the poster to Cloudflare Images.");
    }
    const series = await createSeries({
      title,
      synopsis: stringBody(req.body.synopsis),
      genres: stringBody(req.body.genres),
      posterUrl: !posterImageId && posterData ? await savePosterDataUrl(posterData) : null,
      posterImageId,
      status: enumBody<SeriesStatus>(req.body.status, ["draft", "live"], "draft"),
    });

    const redirectTo = adminPath(req, `/series/${series.seriesId}`);
    if (wantsJson(req)) {
      res.status(201).json({ redirectTo });
      return;
    }
    res.redirect(redirectTo);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/series/:seriesId/poster", requireAdmin, async (req, res, next) => {
  try {
    const seriesId = paramNumber(req.params.seriesId);
    const imageId = stringBody(req.body?.posterImageId);
    if (seriesId < 1 || !imageId) throw new MediaError(400, "Choose a poster for this series.");

    await verifyPosterImage(imageId);
    if (!await setSeriesPoster(seriesId, imageId)) throw new MediaError(404, "Series not found.");
    const redirectTo = adminPath(req, `/series/${seriesId}`);
    if (wantsJson(req)) {
      res.json({ redirectTo });
      return;
    }
    res.redirect(redirectTo);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/episodes", requireAdmin, async (req, res, next) => {
  try {
    const seriesId = numberBody(req.body.seriesId);
    const episodeNumber = numberBody(req.body.episodeNumber);
    const title = stringBody(req.body.title);
    const coinCost = numberBody(req.body.coinCost);

    if (!seriesId || !episodeNumber || !title) {
      if (wantsJson(req)) {
        res.status(400).json({ error: "Series, episode number, and title are required." });
        return;
      }

      const returnTo = stringBody(req.body.returnTo);
      await renderAdmin(req, res, {
        status: 400,
        episodeFormError: "Series, episode number, and title are required.",
        initialView: returnTo === "series-detail" ? "series-detail" : "episodes",
        seriesDetailId: returnTo === "series-detail" ? String(seriesId) : undefined,
      });
      return;
    }

    const episodeId = await createEpisode({
      seriesId,
      episodeNumber,
      title,
      hook: stringBody(req.body.hook),
      isFree: req.body.isFree === "on",
      coinCost: coinCost >= 0 ? coinCost : 5,
      releaseDate: stringBody(req.body.releaseDate) || null,
      status: enumBody<EpisodeStatus>(req.body.status, ["draft", "processing"], "draft"),
    });

    const returnTo = stringBody(req.body.returnTo);
    const redirectTo = returnTo === "series-detail"
      ? adminPath(req, `/series/${stringBody(req.body.seriesPublicId) || seriesId}`)
      : adminViewPath(req, returnTo === "series" ? "series" : "episodes");

    if (wantsJson(req)) {
      res.json({ ok: true, episodeId, redirectTo });
      return;
    }

    if (returnTo === "series-detail") {
      res.redirect(redirectTo);
      return;
    }

    res.redirect(redirectTo);
  } catch (error) {
    const message = episodeCreateErrorMessage(error);
    if (message) {
      if (wantsJson(req)) {
        res.status(400).json({ error: message });
        return;
      }

      const returnTo = stringBody(req.body.returnTo);
      await renderAdmin(req, res, {
        status: 400,
        episodeFormError: message,
        initialView: returnTo === "series-detail" ? "series-detail" : "episodes",
        seriesDetailId: returnTo === "series-detail" ? String(req.body.seriesId ?? "") : undefined,
      });
      return;
    }

    next(error);
  }
});

adminRouter.post("/series/:seriesId/status", requireAdmin, async (req, res, next) => {
  try {
    const seriesId = paramNumber(req.params.seriesId);
    const status = enumBody<SeriesStatus>(req.body.status, ["draft", "live"], "draft");
    await setSeriesStatus(seriesId, status);
    if (wantsJson(req)) {
      res.json({ ok: true, status });
      return;
    }
    res.redirect(adminViewPath(req, "series"));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/episodes/:episodeId/status", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    const status = enumBody<EpisodeStatus>(req.body.status, ["draft", "processing", "live"], "draft");
    await setEpisodeStatus(episodeId, status);
    if (wantsJson(req)) {
      res.json({ ok: true, status });
      return;
    }
    if (stringBody(req.body.returnTo) === "series-detail") {
      res.redirect(adminPath(req, `/series/${stringBody(req.body.seriesPublicId) || numberBody(req.body.seriesId)}`));
      return;
    }
    res.redirect(adminViewPath(req, "episodes"));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/episodes/:episodeId/delete", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    await deleteEpisode(episodeId);
    if (wantsJson(req)) {
      res.json({ ok: true, episodeId });
      return;
    }
    if (stringBody(req.body.returnTo) === "series-detail") {
      res.redirect(adminPath(req, `/series/${stringBody(req.body.seriesPublicId) || numberBody(req.body.seriesId)}`));
      return;
    }
    res.redirect(adminViewPath(req, "series"));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/tus-upload-url", requireAdmin, async (req, res, next) => {
  try {
    await reserveStreamUpload(req, res, paramNumber(req.params.episodeId));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/local-video", requireAdmin, async (req, res, next) => {
  try {
    if (!allowLocalMedia) throw new MediaError(404, "This page is using the old video uploader. Reload the page, then choose the file again to upload to Cloudflare Stream.");
    const episodeId = paramNumber(req.params.episodeId);
    const contentLength = Number.parseInt(req.header("content-length") || "0", 10);
    const originalName = req.header("x-file-name") || `episode-${episodeId}.mp4`;

    await requireEpisodeMedia(episodeId);
    const videoUrl = await saveLocalVideoStream(req, originalName, Number.isNaN(contentLength) ? 0 : contentLength);
    await attachLocalVideo(episodeId, videoUrl);
    res.json({ ready: true, uid: `local:${videoUrl}`, playbackUrl: videoUrl });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/cloudflare/tus-upload-url", requireAdmin, async (req, res, next) => {
  try {
    await reserveStreamUpload(req, res, numberBody(req.body?.episodeId));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/cloudflare/image-upload-url", requireAdmin, async (req, res, next) => {
  try {
    const upload = await createImageDirectUpload();
    res.set("Cache-Control", "no-store").json(upload);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/cloudflare-complete", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    const uid = stringBody(req.body?.uid);
    const episode = await requireEpisodeMedia(episodeId);

    if (!isStreamVideoUid(uid)) throw new MediaError(400, "A Stream upload ID is required.");
    if (uid !== episode.cloudflare_pending_uid && uid !== episode.cloudflare_video_uid) {
      throw new MediaError(409, "This upload was replaced. Refresh the episode before trying again.");
    }

    await markEpisodeUploadComplete(episodeId, uid);
    const current = await requireEpisodeMedia(episodeId);
    const status = videoUploadResponse(current);
    if (uid !== status.uid) {
      throw new MediaError(409, "This upload was replaced. Refresh the episode before trying again.");
    }
    res.json({ ok: true, ...status });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/refresh-video", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    const episode = await requireEpisodeMedia(episodeId);
    const video = videoUploadResponse(episode);
    if (video.canRefresh && video.uid) {
      await applyStreamVideoStatus(await getStreamVideo(video.uid));
    }
    res.json(videoUploadResponse(await requireEpisodeMedia(episodeId)));
  } catch (error) {
    next(error);
  }
});

async function requireEpisodeMedia(episodeId: number): Promise<EpisodeMedia> {
  if (!Number.isSafeInteger(episodeId) || episodeId < 1) {
    throw new MediaError(400, "Choose a valid episode.");
  }
  const episode = await getEpisodeMedia(episodeId);
  if (!episode) throw new MediaError(404, "Episode not found.");
  return episode;
}

async function reserveStreamUpload(req: Request, res: Response, episodeId: number): Promise<void> {
  const episode = await requireEpisodeMedia(episodeId);
  const uploadLength = Number(req.body?.uploadLength);
  const name = stringBody(req.body?.name).slice(0, 255) || `episode-${episodeId}.mp4`;
  const maxDurationSeconds = Number(req.body?.maxDurationSeconds ?? STREAM_MAX_DURATION_SECONDS);
  if (!Number.isSafeInteger(uploadLength) || uploadLength < 1 || uploadLength > 30 * 1024 ** 3) {
    throw new MediaError(400, "Choose a video file between 1 byte and 30 GiB.");
  }
  if (!Number.isSafeInteger(maxDurationSeconds) || maxDurationSeconds < 1 || maxDurationSeconds > STREAM_MAX_DURATION_SECONDS) {
    throw new MediaError(400, "The episode video must be 30 minutes or shorter.");
  }
  const upload = await createTusUpload({ uploadLength, name, maxDurationSeconds });
  if (!await beginEpisodeStreamUpload(episodeId, upload.uid, episode.cloudflare_pending_uid)) {
    throw new MediaError(409, "Another upload changed this episode. Refresh it and try again.");
  }
  res.set("Cache-Control", "no-store").json(upload);
}

function videoUploadResponse(episode: EpisodeMedia) {
  const uid = episode.cloudflare_pending_uid ?? episode.cloudflare_video_uid;
  const activeUid = episode.cloudflare_video_uid;
  const activeReady = Boolean(episode.cloudflare_ready) &&
    (isStreamVideoUid(activeUid) || (allowLocalMedia && Boolean(activeUid?.startsWith("local:"))));
  const state = episode.cloudflare_upload_state ?? (activeReady ? "ready" : isStreamVideoUid(uid) ? "processing" : "missing");
  const labels = {
    uploading: "Uploading",
    processing: "Processing",
    ready: isStreamVideoUid(activeUid) ? "Ready · Cloudflare Stream" : "Ready · Local video",
    failed: "Upload failed",
    missing: "Missing video",
  };
  return {
    uid,
    state,
    ready: state === "ready",
    activeReady,
    label: labels[state] + (activeReady && state !== "ready" ? " · Existing video still active" : ""),
    status: episode.status,
    error: episode.cloudflare_upload_error,
    canRefresh: isStreamVideoUid(uid) && (state === "uploading" || state === "processing"),
  };
}

function stringBody(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberBody(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function paramNumber(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] ?? "" : value ?? "", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function enumBody<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function wantsJson(req: Request): boolean {
  return req.accepts(["json", "html"]) === "json";
}

function episodeCreateErrorMessage(error: unknown): string | null {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const errno = typeof error === "object" && error !== null && "errno" in error ? Number(error.errno) : 0;

  if (code === "ER_DUP_ENTRY" || errno === 1062) {
    return "That episode number already exists for this series. Choose a different episode number.";
  }

  if (code === "ER_NO_REFERENCED_ROW_2" || errno === 1452) {
    return "Choose an existing series before creating an episode.";
  }

  if (code === "ER_TRUNCATED_WRONG_VALUE" || code === "ER_WARN_DATA_OUT_OF_RANGE" || errno === 1292 || errno === 1264) {
    return "One of the episode fields has an invalid value. Check the release date, episode number, and coin cost.";
  }

  return null;
}
