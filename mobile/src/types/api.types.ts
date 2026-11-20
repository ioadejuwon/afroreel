export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  coinBalance: number;
};

export type ApiSeries = {
  id: string;
  databaseId: number;
  title: string;
  slug: string;
  synopsis: string | null;
  genres: string[];
  posterUrl: string | null;
  posterCardUrl?: string | null;
  episodeCount: number;
  freeEpisodeCount: number;
  latestEpisodeAt: string | null;
  progressSeconds: number;
  status: string;
};

export type ApiEpisode = {
  id: string;
  databaseId: number;
  seriesTitle: string;
  episodeNumber: number;
  title: string;
  hook: string | null;
  thumbnailUrl?: string | null;
  durationSeconds: number | null;
  isLocked: boolean;
  isFree: boolean;
  coinCost: number;
  progressSeconds: number;
};

export type ApiPlaybackSession = {
  episodeId: string;
  playbackUrl: string;
  contentType?: 'hls' | 'auto';
  progressSeconds: number;
  expiresInSeconds: number;
};

export type ApiProfileEpisode = {
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  hook: string | null;
  progressSeconds: number;
  activityAt: string;
  series: ApiSeries;
};

export type WalletTransaction = {
  id: number;
  type: 'top_up' | 'spend' | 'reward';
  coinAmount: number;
  description: string;
  episodeId: string | null;
  seriesTitle: string | null;
  episodeNumber: number | null;
  createdAt: string;
};

export type EpisodeEngagement = {
  likeCount: number;
  commentCount: number;
  saveCount: number;
  hasLiked: boolean;
  hasSaved: boolean;
};

export type EpisodeComment = {
  id: number;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
