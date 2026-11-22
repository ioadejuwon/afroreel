import { Router } from "express";
import { parseStreamVideo, verifyStreamWebhook } from "../cloudflare";
import { applyStreamVideoStatus } from "../content";
import {
  googleWebhookAuthorized,
  grantAdReward,
  processAppleNotification,
  processGoogleNotification,
  verifyAdMobCallback,
} from "../monetization";

export const webhookRouter = Router();

webhookRouter.post("/cloudflare/stream", async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!verifyStreamWebhook(rawBody, req.header("webhook-signature") ?? "")) {
      res.status(401).json({ error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature." } });
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ error: { code: "INVALID_EVENT", message: "Invalid webhook JSON." } });
      return;
    }
    const video = parseStreamVideo(payload);
    if (!video) {
      res.status(400).json({ error: { code: "INVALID_EVENT", message: "Invalid Cloudflare video status." } });
      return;
    }
    await applyStreamVideoStatus(video);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

webhookRouter.get("/admob/reward", async (req, res, next) => {
  try {
    const rawQuery = req.originalUrl.split("?", 2)[1] ?? "";
    const reward = await verifyAdMobCallback(rawQuery);
    await grantAdReward(reward);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

webhookRouter.post("/apple/app-store", async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const body = JSON.parse(rawBody.toString("utf8")) as { signedPayload?: string };
    if (!body.signedPayload) {
      res.status(400).json({ error: "Missing Apple signed payload." });
      return;
    }
    await processAppleNotification(body.signedPayload);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

webhookRouter.post("/google/play", async (req, res, next) => {
  try {
    if (!googleWebhookAuthorized(String(req.query.token ?? ""))) {
      res.status(401).json({ error: "Invalid Google Play webhook token." });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    await processGoogleNotification(JSON.parse(rawBody.toString("utf8")));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
