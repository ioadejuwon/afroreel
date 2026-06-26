import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage } from "node:http";
import { config } from "./config";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function uploadRoot(): string {
  return path.isAbsolute(config.uploadDir) ? config.uploadDir : path.join(process.cwd(), config.uploadDir);
}

export async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(path.join(uploadRoot(), "posters"), { recursive: true });
  await fs.mkdir(path.join(uploadRoot(), "videos"), { recursive: true });
}

export async function savePosterDataUrl(dataUrl: string | undefined): Promise<string | null> {
  if (!dataUrl) {
    return null;
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Poster must be a JPEG, PNG, or WebP image.");
  }

  const mimeType = match[1];
  const extension = imageTypes[mimeType];
  const body = match[2];
  if (!extension || !body) {
    throw new Error("Unsupported poster image.");
  }

  const buffer = Buffer.from(body, "base64");
  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Poster image must be 20 MB or smaller.");
  }

  await ensureUploadDirs();
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  await fs.writeFile(path.join(uploadRoot(), "posters", filename), buffer);

  return `/uploads/posters/${filename}`;
}

export async function saveLocalVideoStream(stream: IncomingMessage, originalName: string, contentLength: number): Promise<string> {
  if (!contentLength) {
    throw new Error("Choose a video file and try again.");
  }

  const extension = path.extname(originalName).toLowerCase() || ".mp4";
  const safeExtension = /^\.[a-z0-9]+$/.test(extension) ? extension : ".mp4";
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExtension}`;
  const filePath = path.join(uploadRoot(), "videos", filename);

  await ensureUploadDirs();
  await pipeline(stream, createWriteStream(filePath));

  return `/uploads/videos/${filename}`;
}
