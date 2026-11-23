import { Router, type Request, type Response, type NextFunction } from "express";
import { attemptAdminLogin, requireAdmin } from "../auth";
import {
  applyStreamVideoStatus,
  attachLocalVideo,
  beginEpisodeStreamUpload,
  createEpisode,
  createSeries,
  deleteEpisode,
  deleteSeries,
  duplicateSeries,
  editSeries,
  getEpisodeMedia,
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
} from "../cloudflare";
import { allowLocalMedia, config } from "../config";
import { analyticsReport, ledgerName, ledgers, listRecords, recordDetail, setAccountAccess, userDirectory, userProfile } from "../admin-reports";
import { seriesEpisodeAccess, episodeDefaults, saveEpisodeDefaults } from "../admin-settings";
import { coinProducts } from "../commerce";
import { monetizationSettings, saveMonetizationSettings } from "../monetization";
import { buildDashboardCatalog, buildUploadList, getDashboardAudience } from "../dashboard";
import { posterUrl, videoUploadResponse } from "../media";
import { saveLocalVideoStream, savePosterDataUrl } from "../uploads";

import { passwordRouter, accountRoutes } from "./studio-password";
import { teamRoutes } from "./team";
import { canOpenView, permissions, studioHome } from "../studio-access";

export const adminRouter = Router();
adminRouter.use(passwordRouter, accountRoutes(renderAdmin));
adminRouter.use(teamRoutes(renderAdmin));

function accessTo(view: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin) return requireAdmin(req,res,next);
    if (!canOpenView(req.admin.role, view)) { res.status(403).send("Your role does not have access to this page."); return; }
    next();
  };
}
const adminViews = new Set(["dashboard", "series", "series-new", "series-detail", "episodes", "users", "monetization", "analytics", "settings"]);

function adminPath(req: Request, suffix = ""): string {
  return `${req.baseUrl || "/admin"}${suffix}`;
}

function renderLogin(req: Request, res: Response, error = ""): void {
  res.render("login", {
    admin: req.admin ?? null,
    passwordUpdated: req.query.password === "updated",
    csrfToken: req.csrfToken(),
    error,
  });
}

async function renderAdmin(req: Request, res: Response, options: {
  status?: number;
  episodeFormError?: string;
  initialView?: string;
  seriesDetailId?: string;
  userId?: string;
  recordKind?: string;
  recordId?: string;
  formError?: string;
} = {}): Promise<void> {
  const initialView = options.initialView ?? "dashboard";
  const needsSeries = initialView === "dashboard" || initialView === "episodes" || initialView.startsWith("series");
  const [series, episodes, audience, defaults, monetization] = await Promise.all([
    needsSeries ? listSeries(true) : [], listEpisodes(true),
    initialView === "dashboard" ? getDashboardAudience() : null,
    ["episodes", "series-episode-new", "settings"].includes(initialView) ? episodeDefaults() : null,
    initialView === "settings" ? monetizationSettings() : null,
  ]);
  const query = req.query;
  const stringParam = (key: string) => typeof query[key] === "string" ? query[key] : "";
  let report;
  switch (initialView) {
    case "users": report = await userDirectory(query); break;
    case "user-profile": report = await userProfile(options.userId!, query); break;
    case "monetization": {
      const kind = ledgerName(query.tab);
      try {
        report = await listRecords(kind, query);
      } catch (error) {
        if (!(error instanceof MediaError) || error.status !== 400) throw error;
        options.status = 400;
        options.formError = error.message;
        report = { kind, type: stringParam("type"), start: stringParam("from"), end: stringParam("to"), total: 0 };
      }
      break;
    }
    case "record-detail": report = await recordDetail(ledgerName(options.recordKind), options.recordId!); break;
    case "analytics": report = await analyticsReport(query.days); break;
  }
  const seriesFilter = ["draft", "live"].includes(stringParam("status")) ? stringParam("status") : "all";
  const catalog = buildDashboardCatalog(series, episodes);
  const selectedSeries = options.seriesDetailId
    ? series.find((item) => item.series_id === options.seriesDetailId || String(item.id) === options.seriesDetailId) ?? null
    : null;
  const selectedEpisodes = selectedSeries ? episodes.filter((episode) => episode.series_id === selectedSeries.id) : [];

  res.set("Cache-Control", "private, no-store").status(options.status ?? (options.seriesDetailId && !selectedSeries ? 404 : 200)).render("admin", {
    admin: req.admin,
    access: permissions(req.admin!.role),
    csrfToken: req.csrfToken(),
    series,
    episodes,
    catalog,
    audience,
    queueOnly: initialView === "episodes" && req.query.filter === "needs-video",
    report, defaults, monetization, ledgers, coinProducts, seriesFilter,
    recordLabel: (value: string) => ({
      top_up: "Top-up", spend: "Spend", reward: "Reward", coins: "Coins", ad: "Ad", free: "Free",
      verified: "Verified", revoked: "Revoked", refunded: "Refunded",
      pending: "Pending", expired: "Expired", rejected: "Rejected",
    } as Record<string,string>)[value] ?? value,
    catalogSearch: initialView === "series" ? stringParam("q") : "",
    saved: query.saved === "1",
    formError: options.formError ?? "",
    pageHref: (overrides: Record<string, string | number>) => {
      const params = new URLSearchParams();
      for (const key of ["tab", "type", "from", "to", "page", "search", "status", "q", "days"]) {
        if (stringParam(key)) params.set(key, stringParam(key));
      }
      for (const [key, value] of Object.entries(overrides)) {
        if (value === "") params.delete(key);
        else params.set(key, String(value));
      }
      return req.originalUrl.split("?")[0] + (params.size ? "?" + params : "");
    },
    formatTime: (epoch: number | null) => epoch == null ? "—" : new Date(Number(epoch) * 1000)
      .toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC",
    episodeHref: (row: { episode_db_id?: number; series_id?: string }) => row.episode_db_id && row.series_id
      ? adminPath(req, `/series/${encodeURIComponent(row.series_id)}#episode-${row.episode_db_id}`) : null,
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
    res.redirect(adminViewPath(req, studioHome(req.admin.role)));
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
      req.session.adminVersion = admin.session_version;
      res.redirect(adminViewPath(req, studioHome(admin.role)));
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
    res.redirect(adminViewPath(req, studioHome(req.admin!.role)));
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/series/new", accessTo("series-edit"), async (req, res, next) => {
  try {
    await renderAdmin(req, res, { initialView: "series-new" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/series/:seriesId", accessTo("series-detail"), async (req, res, next) => {
  try {
    const seriesId = String(req.params.seriesId || "");
    await renderAdmin(req, res, { initialView: "series-detail", seriesDetailId: seriesId });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/series/:seriesId/episodes/new", accessTo("series-edit"), async (req, res) => {
  await renderAdmin(req, res, { initialView: "series-episode-new", seriesDetailId: String(req.params.seriesId) });
});

for (const page of ["edit", "preview"]) {
  adminRouter.get(`/series/:seriesId/${page}`, accessTo(page === "preview" ? "series-preview" : "series-edit"), async (req, res) => {
    await renderAdmin(req, res, { initialView: `series-${page}`, seriesDetailId: String(req.params.seriesId) });
  });
}

adminRouter.get("/api/upload-notifications", accessTo("series-edit"), async (_req, res) => {
  const queue = buildUploadList(await listEpisodes(true)).filter(item => item.issue);
  res.set("Cache-Control", "private, no-store").render("partials/layout/upload-notifications", { queue });
});

adminRouter.get("/users/:userId", accessTo("settings"), async (req, res) => {
  await renderAdmin(req, res, { initialView: "user-profile", userId: String(req.params.userId) });
});

adminRouter.post("/users/:userId/access", accessTo("settings"), async (req, res) => {
  const userId = String(req.params.userId);
  try {
    await setAccountAccess(userId, req.body.status, req.body.confirmation);
  } catch (error) {
    if (!(error instanceof MediaError) || error.status !== 400) throw error;
    await renderAdmin(req, res, { initialView: "user-profile", userId, status: 400, formError: error.message });
    return;
  }
  res.redirect(303, adminPath(req, `/users/${encodeURIComponent(userId)}?saved=1`));
});

adminRouter.get("/monetization/:kind/:id", accessTo("settings"), async (req, res) => {
  await renderAdmin(req, res, { initialView: "record-detail", recordKind: String(req.params.kind), recordId: String(req.params.id) });
});

adminRouter.post("/settings", accessTo("settings"), async (req, res) => {
  try {
    await saveEpisodeDefaults(req.body.freeOpening, req.body.lockedPrice);
    await saveMonetizationSettings(req.body);
  } catch (error) {
    if (!(error instanceof MediaError) || error.status !== 400) throw error;
    await renderAdmin(req, res, { initialView: "settings", status: 400, formError: error.message });
    return;
  }
  res.redirect(303, adminPath(req, "/settings?saved=1"));
});

adminRouter.get("/:view", requireAdmin, async (req, res, next) => {
  try {
    const view = String(req.params.view || "");
    if (!adminViews.has(view)) {
      res.status(404).send("Admin page not found");
      return;
    }

    if (!canOpenView(req.admin!.role, view)) { res.status(403).send("Your role does not have access to this page."); return; }
    await renderAdmin(req, res, { initialView: view });
  } catch (error) {
    next(error);
  }
});

async function seriesDetails(req: Request) {
  const title = stringBody(req.body.title);
  const genres = stringBody(req.body.genres);
  if (!title || [...title].length > 190) throw new MediaError(400, "Enter a series title of 1 to 190 characters.");
  if ([...genres].length > 255) throw new MediaError(400, "Genres must be 255 characters or fewer.");
  const posterImageId = stringBody(req.body.posterImageId) || null;
  const access = req.body.defaultEpisodeAccess;
  if (access !== undefined && access !== "free" && access !== "locked") throw new MediaError(400, "Choose Free or Locked.");
  return { title, defaultEpisodeAccess: access, genres, synopsis: stringBody(req.body.synopsis), posterImageId };
}

adminRouter.post("/series", accessTo("series-edit"), async (req, res, next) => {
  try {
    const details = await seriesDetails(req);
    const posterData = stringBody(req.body.posterDataUrl);
    if (!details.posterImageId && posterData && !allowLocalMedia) {
      throw new MediaError(400, "Upload the poster to Cloudflare Images.");
    }
    const series = await createSeries({
      ...details,
      posterUrl: !details.posterImageId && posterData ? await savePosterDataUrl(posterData) : null,
      status: req.body.intent === "draft" ? "draft" : enumBody<SeriesStatus>(req.body.status, ["draft", "live"], "draft"),
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

adminRouter.post("/series/:seriesId/edit", accessTo("series-edit"), async (req, res) => {
  await editSeries(Number(req.params.seriesId), {
    ...await seriesDetails(req),
    status: req.body.status === undefined ? undefined : enumBody<SeriesStatus>(req.body.status, ["live", "draft"], "draft"),
  });
  const redirectTo = adminPath(req, `/series/${Number(req.params.seriesId)}/edit?saved=1`);
  if (wantsJson(req)) res.json({ redirectTo });
  else res.redirect(303, redirectTo);
});

adminRouter.post("/series/:seriesId/duplicate", accessTo("series-edit"), async (req, res) => {
  await duplicateSeries(Number(req.params.seriesId));
  res.redirect(303, adminViewPath(req, "series"));
});

adminRouter.post("/series/:seriesId/delete", accessTo("series-edit"), async (req, res) => {
  const count = stringBody(req.body.expectedEpisodes);
  if (!/^\d+$/.test(count)) throw new MediaError(400, "Confirm the episode count before deleting.");
  await deleteSeries(Number(req.params.seriesId), Number(count), typeof req.body.confirmationTitle === "string" ? req.body.confirmationTitle : "");
  res.redirect(303, adminViewPath(req, "series"));
});

adminRouter.post("/series/:seriesId/poster", accessTo("series-edit"), async (req, res, next) => {
  try {
    const seriesId = paramNumber(req.params.seriesId);
    const imageId = stringBody(req.body?.posterImageId);
    if (seriesId < 1 || !imageId) throw new MediaError(400, "Choose a poster for this series.");

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

adminRouter.post("/episodes", accessTo("series-edit"), async (req, res, next) => {
  try {
    const seriesId = numberBody(req.body.seriesId);
    const episodeNumber = numberBody(req.body.episodeNumber);
    const title = stringBody(req.body.title);

    if (!seriesId || !episodeNumber || !title) {
      if (wantsJson(req)) {
        res.status(400).json({ error: "Series, episode number, and title are required." });
        return;
      }

      const returnTo = stringBody(req.body.returnTo);
      await renderAdmin(req, res, {
        status: 400,
        episodeFormError: "Series, episode number, and title are required.",
        initialView: returnTo === "series-detail" ? "series-episode-new" : "episodes",
        seriesDetailId: returnTo === "series-detail" ? String(seriesId) : undefined,
      });
      return;
    }

    const episodeId = await createEpisode({
      seriesId,
      episodeNumber,
      title,
      hook: stringBody(req.body.hook),
      ...await seriesEpisodeAccess(seriesId, episodeNumber, req.body),
      releaseDate: stringBody(req.body.releaseDate) || null,
      publishWhenReady: req.body.intent === "publish-when-ready",
      status: req.body.intent === "publish-when-ready" ? "processing" : enumBody<EpisodeStatus>(req.body.status, ["draft", "processing"], "draft"),
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
    const message = error instanceof MediaError && error.status === 400 ? error.message : episodeCreateErrorMessage(error);
    if (message) {
      if (wantsJson(req)) {
        res.status(400).json({ error: message });
        return;
      }

      const returnTo = stringBody(req.body.returnTo);
      await renderAdmin(req, res, {
        status: 400,
        episodeFormError: message,
        initialView: returnTo === "series-detail" ? "series-episode-new" : "episodes",
        seriesDetailId: returnTo === "series-detail" ? String(req.body.seriesId ?? "") : undefined,
      });
      return;
    }

    next(error);
  }
});

adminRouter.post("/series/:seriesId/status", accessTo("series-edit"), async (req, res, next) => {
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

adminRouter.post("/episodes/:episodeId/status", accessTo("series-edit"), async (req, res, next) => {
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

adminRouter.post("/episodes/:episodeId/delete", accessTo("series-edit"), async (req, res, next) => {
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

adminRouter.post("/api/episodes/:episodeId/tus-upload-url", accessTo("series-edit"), async (req, res, next) => {
  try {
    await reserveStreamUpload(req, res, paramNumber(req.params.episodeId));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/local-video", accessTo("series-edit"), async (req, res, next) => {
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

adminRouter.post("/api/cloudflare/tus-upload-url", accessTo("series-edit"), async (req, res, next) => {
  try {
    await reserveStreamUpload(req, res, numberBody(req.body?.episodeId));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/cloudflare/image-upload-url", accessTo("series-edit"), async (req, res, next) => {
  try {
    const upload = await createImageDirectUpload();
    res.set("Cache-Control", "no-store").json(upload);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/cloudflare-complete", accessTo("series-edit"), async (req, res, next) => {
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

adminRouter.post("/api/episodes/:episodeId/refresh-video", accessTo("series-edit"), async (req, res, next) => {
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
