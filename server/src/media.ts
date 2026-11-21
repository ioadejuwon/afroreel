import type { EpisodeMedia } from "./content";
import { imageDeliveryUrl, isStreamVideoUid } from "./cloudflare";
import { allowLocalMedia } from "./config";

type Poster = {
  poster_image_id: string | null;
  poster_url: string | null;
};

export function posterUrl(
  series: Poster,
  variant: Parameters<typeof imageDeliveryUrl>[1],
): string | null {
  const cdnUrl = series.poster_image_id && imageDeliveryUrl(series.poster_image_id, variant);
  if (cdnUrl) return cdnUrl;
  return legacyMediaUrl(series.poster_url);
}

export function legacyMediaUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) {
    return allowLocalMedia ? value : null;
  }
  const url = URL.parse(value);
  if (!url || !["http:", "https:"].includes(url.protocol)) return null;
  if (!allowLocalMedia && url.pathname.includes("/uploads/")) return null;
  return value;
}

export function videoUploadResponse(episode: EpisodeMedia) {
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
