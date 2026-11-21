import type { RowDataPacket } from "mysql2";
import type { EpisodeRow, SeriesRow } from "./content";
import { pool } from "./db";
import { videoUploadResponse } from "./media";

export function buildUploadList(episodes: EpisodeRow[]) {
  return episodes.map(episode => {
    const video = videoUploadResponse(episode);
    const issue = video.state === "missing" ? "Needs video" : video.state === "failed" ? "Upload failed" : null;
    return { episode, video, issue };
  }).sort((a, b) => Number(Boolean(b.issue)) - Number(Boolean(a.issue)) ||
    Number(b.video.state === "missing") - Number(a.video.state === "missing"));
}

export function buildDashboardCatalog(series: SeriesRow[], episodes: EpisodeRow[]) {
  const uploads = buildUploadList(episodes);
  const queue = uploads.filter(item => item.issue);
  const ready = uploads.filter(item => item.video.activeReady).length;
  const liveSeries = new Map(series.filter(item => item.status === "live").map(item => [item.id, item.series_id]));
  const published = uploads.filter(({ episode }) => episode.status === "live" && liveSeries.has(episode.series_id));
  const recentlyLive = published.filter(item => item.video.activeReady)
    .map(({ episode }) => ({
      episode, seriesPublicId: liveSeries.get(episode.series_id)!,
      released: new Date(episode.release_date ?? episode.created_at).getTime(),
    }))
    .sort((a, b) => b.released - a.released || b.episode.id - a.episode.id)
    .slice(0, 3);
  const missing = uploads.filter(item => item.video.state === "missing").length;
  const failed = queue.filter(item => !item.video.activeReady && item.video.state === "failed").length;

  return {
    uploads, queue, ready, recentlyLive, missing, failed, liveCount: published.length,
    inProgress: uploads.length - ready - missing - failed,
  };
}

type AudienceTotals = RowDataPacket & { viewers: number; seconds: number | string; unlocks: number };
type ViewerDay = { day: string; viewers: number };

export function viewerTrend(activity: ViewerDay[], today: Date) {
  const counts = new Map(activity.map(row => [row.day, Number(row.viewers)]));
  const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - 13 + index);
    const day = date.toISOString().slice(0, 10);
    return { day, label: dateFormat.format(date), viewers: counts.get(day) ?? 0 };
  });
  return {
    days, showChart: days.filter(day => day.viewers > 0).length >= 2,
    peak: Math.max(1, ...days.map(day => day.viewers)),
  };
}

export async function getDashboardAudience() {
  const today = new Date();
  const [totals, activity] = await Promise.all([
    pool.execute<AudienceTotals[]>(
      `SELECT COUNT(DISTINCT user_id) AS viewers, COALESCE(SUM(progress_seconds), 0) AS seconds,
              (SELECT COUNT(*) FROM episode_unlocks WHERE method = 'coins') AS unlocks FROM watch_progress`,
    ),
    pool.execute<(ViewerDay & RowDataPacket)[]>(
      `SELECT DATE_FORMAT(view_date, '%Y-%m-%d') AS day, COUNT(*) AS viewers FROM daily_viewers
       WHERE view_date BETWEEN DATE_SUB(?, INTERVAL 13 DAY) AND ? GROUP BY view_date ORDER BY view_date`,
      [today.toISOString().slice(0, 10), today.toISOString().slice(0, 10)],
    ),
  ]);
  const { viewers, seconds, unlocks } = totals[0][0];
  const minutes = Math.round(Number(seconds) / 60);
  const watchTime = Number(seconds) > 0 && minutes === 0 ? "<1 min" : `${minutes.toLocaleString("en")} min`;
  return { viewers, watchTime, unlocks, trend: viewerTrend(activity[0], today) };
}
