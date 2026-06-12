/**
 * AfroReel — Episode Types
 */

export type EpisodeDuration = 'short' | 'medium' | 'long';
// short  = 30–60s
// medium = 1–2min
// long   = 2–5min

export interface Episode {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  description?: string;       // Brief hook/teaser text
  thumbnailUrl: string;
  videoUrl: string;           // Cloudflare Stream URL
  durationSeconds: number;
  isFree: boolean;            // First 5 episodes free per PRD
  coinCost: number;           // Default: 5 coins
  isLocked: boolean;          // Derived: !isFree && !userUnlocked
  releaseDate: string;        // ISO date
  viewCount: number;
}

export interface EpisodeWithProgress extends Episode {
  progressSeconds: number;    // User's saved playback position
  isWatched: boolean;
  isUnlocked: boolean;        // User has unlocked this episode
}

export interface UnlockEpisodePayload {
  episodeId: string;
  method: 'coins' | 'ad';
}

export interface UnlockEpisodeResponse {
  success: boolean;
  episodeId: string;
  coinsDeducted: number;
  newCoinBalance: number;
  videoUrl: string;
}

export interface SaveProgressPayload {
  episodeId: string;
  progressSeconds: number;
}
