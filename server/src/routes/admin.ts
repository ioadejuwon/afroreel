import { Router, type Request, type Response, type NextFunction } from "express";
import { attemptAdminLogin, requireAdmin } from "../auth";
import {
  attachCloudflareVideo,
  attachLocalVideo,
  createEpisode,
  createSeries,
  deleteEpisode,
  getDashboardData,
  getUsersData,
  listEpisodes,
  listSeries,
  markEpisodeReady,
  setEpisodeStatus,
  setSeriesStatus,
  type EpisodeStatus,
  type SeriesStatus,
} from "../content";
import { createTusUpload, getStreamVideo } from "../cloudflare";
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

  res.status(options.status ?? 200).render("admin", {
    admin: req.admin,
    csrfToken: req.csrfToken(),
    series,
    episodes,
    dashboard,
    users,
    selectedSeries,
    selectedEpisodes,
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
      res.status(400).send("Series title is required.");
      return;
    }

    const posterUrl = await savePosterDataUrl(stringBody(req.body.posterDataUrl));
    const series = await createSeries({
      title,
      synopsis: stringBody(req.body.synopsis),
      genres: stringBody(req.body.genres),
      posterUrl,
      status: enumBody<SeriesStatus>(req.body.status, ["draft", "live"], "draft"),
    });

    res.redirect(adminPath(req, `/series/${series.seriesId}`));
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
      status: enumBody<EpisodeStatus>(req.body.status, ["draft", "processing", "live"], "draft"),
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
    const episodeId = paramNumber(req.params.episodeId);
    const uploadLength = numberBody(req.body.uploadLength);
    const name = stringBody(req.body.name) || `episode-${episodeId}.mp4`;
    const maxDurationSeconds = numberBody(req.body.maxDurationSeconds) || 1800;

    if (!episodeId) {
      res.status(400).json({ error: "Missing episode ID. Refresh the page and try again." });
      return;
    }

    if (!uploadLength) {
      res.status(400).json({ error: "Missing upload length. Choose a video file and try again." });
      return;
    }

    const upload = await createTusUpload({ uploadLength, name, maxDurationSeconds });
    await attachCloudflareVideo(episodeId, upload.uid);
    res.json(upload);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/local-video", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    const contentLength = Number.parseInt(req.header("content-length") || "0", 10);
    const originalName = req.header("x-file-name") || `episode-${episodeId}.mp4`;

    if (!episodeId) {
      res.status(400).json({ error: "Missing episode ID. Refresh the page and try again." });
      return;
    }

    const videoUrl = await saveLocalVideoStream(req, originalName, Number.isNaN(contentLength) ? 0 : contentLength);
    await attachLocalVideo(episodeId, videoUrl);
    res.json({ ready: true, uid: `local:${videoUrl}`, playbackUrl: videoUrl });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/cloudflare/tus-upload-url", requireAdmin, async (req, res, next) => {
  try {
    const uploadLength = numberBody(req.body.uploadLength);
    const episodeId = numberBody(req.body.episodeId);
    const name = stringBody(req.body.name) || `episode-${episodeId}.mp4`;
    const maxDurationSeconds = numberBody(req.body.maxDurationSeconds) || 1800;

    if (!uploadLength || !episodeId) {
      res.status(400).json({
        error: "Missing upload details. Refresh the page and choose the video file again.",
        missing: {
          uploadLength: !uploadLength,
          episodeId: !episodeId,
        },
      });
      return;
    }

    const upload = await createTusUpload({ uploadLength, name, maxDurationSeconds });
    await attachCloudflareVideo(episodeId, upload.uid);
    res.json(upload);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/cloudflare-complete", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    const uid = stringBody(req.body.uid);

    if (!episodeId || !uid) {
      res.status(400).json({ error: "episodeId and uid are required." });
      return;
    }

    await attachCloudflareVideo(episodeId, uid);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/api/episodes/:episodeId/refresh-video", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    const uid = stringBody(req.body.uid);

    if (!episodeId || !uid) {
      res.status(400).json({ error: "episodeId and uid are required." });
      return;
    }

    if (uid.startsWith("local:")) {
      res.json({ ready: true, durationSeconds: null, thumbnailUrl: null });
      return;
    }

    const video = await getStreamVideo(uid);
    await markEpisodeReady(episodeId, video);
    res.json(video);
  } catch (error) {
    next(error);
  }
});

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
