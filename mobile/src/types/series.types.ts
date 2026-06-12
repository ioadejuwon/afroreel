/**
 * AfroReel — Series Types
 */

export type Genre =
  | 'romance'
  | 'family-drama'
  | 'betrayal'
  | 'campus'
  | 'thriller'
  | 'mystery'
  | 'comedy';

export type SeriesStatus = 'ongoing' | 'completed' | 'coming-soon';

export interface Series {
  id: string;
  title: string;
  synopsis: string;
  posterUrl: string;          // Vertical poster image (2:3 ratio)
  bannerUrl?: string;         // Wide banner for hero cards
  trailerUrl?: string;
  genre: Genre[];
  tags: string[];             // e.g. ['Lagos', 'Rich', 'Love triangle']
  rating: number;             // 0–5
  totalEpisodes: number;
  status: SeriesStatus;
  isFeatured: boolean;
  isTrending: boolean;
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesWithProgress extends Series {
  lastWatchedEpisode?: number;
  progressPercent?: number;   // 0–100
}

// Sections shown on the Home Feed
export type HomeSectionKey =
  | 'featured'
  | 'trending'
  | 'continueWatching'
  | 'newEpisodes'
  | 'freeToWatch';

export interface HomeSection {
  key: HomeSectionKey;
  title: string;
  data: Series[] | SeriesWithProgress[];
}
