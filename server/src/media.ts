import { imageDeliveryUrl } from "./cloudflare";
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
