import { Router, type Request, type Response, type NextFunction } from "express";
import { attemptAdminLogin, requireAdmin } from "../auth";
import {
  attachCloudflareVideo,
  createEpisode,
  createSeries,
  listEpisodes,
  listSeries,
  markEpisodeReady,
  setEpisodeStatus,
  setSeriesStatus,
  type EpisodeStatus,
  type SeriesStatus,
} from "../content";
import { createTusUpload, getStreamVideo } from "../cloudflare";
import { savePosterDataUrl } from "../uploads";

export const adminRouter = Router();

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

adminRouter.get("/login", (req, res) => {
  if (req.admin) {
    res.redirect(adminPath(req));
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
      res.redirect(adminPath(req));
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
    const [series, episodes] = await Promise.all([listSeries(true), listEpisodes(true)]);
    res.render("admin", {
      admin: req.admin,
      csrfToken: req.csrfToken(),
      series,
      episodes,
    });
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
    await createSeries({
      title,
      synopsis: stringBody(req.body.synopsis),
      genres: stringBody(req.body.genres),
      posterUrl,
      status: enumBody<SeriesStatus>(req.body.status, ["draft", "live"], "draft"),
    });

    res.redirect(adminPath(req));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/episodes", requireAdmin, async (req, res, next) => {
  try {
    const seriesId = numberBody(req.body.seriesId);
    const episodeNumber = numberBody(req.body.episodeNumber);
    const title = stringBody(req.body.title);

    if (!seriesId || !episodeNumber || !title) {
      res.status(400).send("Series, episode number, and title are required.");
      return;
    }

    await createEpisode({
      seriesId,
      episodeNumber,
      title,
      hook: stringBody(req.body.hook),
      isFree: req.body.isFree === "on",
      coinCost: numberBody(req.body.coinCost) || 5,
      releaseDate: stringBody(req.body.releaseDate) || null,
      status: enumBody<EpisodeStatus>(req.body.status, ["draft", "processing", "live"], "draft"),
    });

    res.redirect(adminPath(req));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/series/:seriesId/status", requireAdmin, async (req, res, next) => {
  try {
    const seriesId = paramNumber(req.params.seriesId);
    await setSeriesStatus(seriesId, enumBody<SeriesStatus>(req.body.status, ["draft", "live"], "draft"));
    res.redirect(adminPath(req));
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/episodes/:episodeId/status", requireAdmin, async (req, res, next) => {
  try {
    const episodeId = paramNumber(req.params.episodeId);
    await setEpisodeStatus(episodeId, enumBody<EpisodeStatus>(req.body.status, ["draft", "processing", "live"], "draft"));
    res.redirect(adminPath(req));
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
      res.status(400).json({ error: "uploadLength and episodeId are required." });
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
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function paramNumber(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] ?? "" : value ?? "", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function enumBody<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}
