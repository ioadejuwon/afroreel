import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Alert,
  ImageBackground,
  ImageSourcePropType,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { Radius, SafeArea, Screen, Shadow, Size, Spacing } from '@/constants/layout';

declare const process: { env?: Record<string, string | undefined> };

type IconName = ComponentProps<typeof Ionicons>['name'];

type Drama = {
  id: string;
  seriesId: string;
  databaseId: number;
  title: string;
  genre: string;
  tags: string[];
  episodeCount: number;
  posterGradient: readonly [string, string];
  posterImage?: ImageSourcePropType;
  mood: string;
  progress?: number;
  progressSeconds?: number;
  isFree?: boolean;
  isLocked?: boolean;
  freeEpisodeCount?: number;
  latestEpisodeAt?: string | null;
  rank?: number;
  status?: 'Ongoing' | 'Completed';
};

type Tab = 'Home' | 'Discover' | 'Wallet' | 'Alerts' | 'Profile';
type PlayerEpisode = {
  id?: string;
  databaseId?: number;
  seriesTitle?: string;
  number: number;
  title: string;
  hook: string;
  progress: number;
  isLocked: boolean;
  isFree?: boolean;
  coinCost?: number;
};
type UnlockMethod = 'coins' | 'ad';
type AppView = 'tabs' | 'series-detail' | 'continue-watching' | 'profile-history' | 'profile-likes' | 'category-list' | 'payment';
type EntryStep = 'splash' | 'onboarding' | 'auth' | 'app';
type SeriesCategory = 'continue' | 'trending' | 'new' | 'free';
type AuthUser = {
  id: string;
  email: string;
  name: string;
  coinBalance: number;
};
type WalletTopUpNotification = {
  coinsAdded: number;
  newBalance: number;
};
type AppNotification = {
  key: string;
  mark: string;
  title: string;
  body: string;
  time: string;
  sortTime: number;
  onPress: () => void;
  unread?: boolean;
  accent?: 'red' | 'gold';
};

const tabs: Tab[] = ['Home', 'Discover', 'Wallet', 'Alerts', 'Profile'];
const tabIcons: Record<Tab, IconName> = {
  Home: 'home',
  Discover: 'compass',
  Wallet: 'wallet',
  Alerts: 'notifications',
  Profile: 'person',
};
const markIcons: Record<string, IconName> = {
  A: 'play-circle',
  C: 'wallet',
  D: 'download',
  F: 'heart',
  G: 'logo-google',
  H: 'help-circle',
  L: 'lock-closed',
  N: 'notifications',
  P: 'person',
  R: 'people',
  S: 'settings',
  W: 'wifi',
};

function getIconForMark(mark: string): IconName {
  return markIcons[mark] ?? 'ellipse';
}
const filters = ['All', 'Romance', 'Family Drama', 'Betrayal', 'Campus', 'Thriller', 'Free', 'Completed'];
const onboardingSlides: {
  eyebrow: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
}[] = [
  {
    eyebrow: 'AFRICAN STORIES',
    title: 'Stories that feel like home.',
    body: 'Binge-worthy African drama crafted for your screen. Real tension, real emotion, and characters worth rooting for.',
    image: require('../../assets/images/onboarding/Pic 1.png'),
  },
  {
    eyebrow: 'WATCH / UNLOCK / BINGE',
    title: 'One more episode is always waiting.',
    body: 'Start free, earn coins by watching ads, or unlock the exact moment you need to know what happens next.',
    image: require('../../assets/images/onboarding/Pic 2.png'),
  },
  {
    eyebrow: 'NEW EPISODES DAILY',
    title: 'Your next obsession starts here.',
    body: 'Find romance, betrayal, family secrets, and cliffhangers made for a quick break or a full-night binge.',
    image: require('../../assets/images/onboarding/Pic 3.png'),
  },
];
const coinPackages = [
  { id: 'starter', name: 'Starter', coins: 100, price: '$1.99' },
  { id: 'plus', name: 'Plus', coins: 300, price: '$4.99', bonus: '+30 bonus' },
  { id: 'premium', name: 'Premium', coins: 1000, price: '$12.99', bonus: '+150 bonus' },
];

const categoryTitles: Record<SeriesCategory, string> = {
  continue: 'Continue Watching',
  trending: 'Trending Now',
  new: 'New Episodes',
  free: 'Free to Watch',
};

function getExpoHost(): string | null {
  const constants = Constants as unknown as {
    expoConfig?: { hostUri?: string; extra?: { apiBaseUrl?: string } };
    manifest?: { debuggerHost?: string; hostUri?: string };
  };
  const hostUri = constants.expoConfig?.hostUri ?? constants.manifest?.hostUri ?? constants.manifest?.debuggerHost;
  const host = hostUri?.split(':')[0];

  return host || null;
}

function getConfiguredApiBaseUrl(): string | undefined {
  const constants = Constants as unknown as {
    expoConfig?: { extra?: { apiBaseUrl?: string } };
  };

  return process.env?.EXPO_PUBLIC_API_BASE_URL ?? constants.expoConfig?.extra?.apiBaseUrl;
}

function createLocalApiBaseUrl(): string {
  const expoHost = getExpoHost();
  const canUseExpoHost = expoHost && !expoHost.includes('exp.direct');

  return `http://${canUseExpoHost ? expoHost : '192.168.68.120'}:3000`;
}
const API_BASE_URL = getConfiguredApiBaseUrl() ?? createLocalApiBaseUrl();
const API_ORIGIN = API_BASE_URL.match(/^https?:\/\/[^/]+/)?.[0] ?? API_BASE_URL;
const API_TIMEOUT_MS = 10000;
const AUTH_TOKEN_STORAGE_KEY = 'afroreel.authToken';
let apiAuthToken: string | null = null;

function setApiAuthToken(token: string | null): void {
  apiAuthToken = token;
}

type ApiSeries = {
  id: string;
  databaseId: number;
  title: string;
  slug: string;
  synopsis: string | null;
  genres: string[];
  posterUrl: string | null;
  episodeCount: number;
  freeEpisodeCount: number;
  latestEpisodeAt: string | null;
  progressSeconds: number;
  status: string;
};

type ApiEpisode = {
  id: string;
  databaseId: number;
  seriesTitle: string;
  episodeNumber: number;
  title: string;
  hook: string | null;
  isLocked: boolean;
  isFree: boolean;
  coinCost: number;
  progressSeconds: number;
};

type ApiProfileEpisode = {
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  hook: string | null;
  progressSeconds: number;
  activityAt: string;
  series: ApiSeries;
};

type WalletTransaction = {
  id: number;
  type: 'top_up' | 'spend' | 'reward';
  coinAmount: number;
  description: string;
  episodeId: string | null;
  seriesTitle: string | null;
  episodeNumber: number | null;
  createdAt: string;
};

type EpisodeEngagement = {
  likeCount: number;
  commentCount: number;
  saveCount: number;
  hasLiked: boolean;
  hasSaved: boolean;
};

type EpisodeComment = {
  id: number;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (apiAuthToken) {
    headers.authorization = `Bearer ${apiAuthToken}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...headers,
        ...(options?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? `Timed out loading ${url}`
      : `Could not reach ${url}`;

    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status} from ${url}`;

    try {
      const payload = await response.json() as { error?: string };
      errorMessage = payload.error || errorMessage;
    } catch {
      // Keep the transport error if the response is not JSON.
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

function resolveMediaUrl(value: string | null): string | null {
  if (!value || value.startsWith('http')) {
    return value;
  }

  return `${API_ORIGIN}${value.startsWith('/') ? value : `/${value}`}`;
}

const posterGradients: readonly (readonly [string, string])[] = [
  ['#40285f', '#12091f'],
  ['#5a202b', '#17080d'],
  ['#18414a', '#071416'],
  ['#5c4420', '#181105'],
  ['#1f3f27', '#07140a'],
  ['#26325c', '#080c18'],
];

function mapApiSeriesToDrama(item: ApiSeries, index: number): Drama {
  const tags = item.genres.length > 0 ? item.genres : ['Drama'];
  const genre = tags.join(' / ');
  const progressSeconds = item.progressSeconds ?? 0;

  return {
    id: item.slug || String(item.id),
    seriesId: item.id,
    databaseId: item.databaseId,
    title: item.title,
    genre,
    tags: [...tags, index === 0 ? 'Trending' : '', item.status === 'live' ? 'Ongoing' : ''].filter(Boolean),
    episodeCount: item.episodeCount,
    freeEpisodeCount: item.freeEpisodeCount ?? 0,
    isFree: (item.freeEpisodeCount ?? 0) > 0,
    latestEpisodeAt: item.latestEpisodeAt,
    progressSeconds,
    progress: progressSeconds > 0 ? 35 : undefined,
    posterGradient: posterGradients[index % posterGradients.length],
    posterImage: item.posterUrl ? { uri: resolveMediaUrl(item.posterUrl) ?? item.posterUrl } : undefined,
    mood: item.synopsis || 'A new AfroReel story is ready to watch.',
    rank: index + 1,
    status: item.status === 'live' ? 'Ongoing' : 'Completed',
  };
}

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  return new Intl.NumberFormat('en', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function getContinueWatchingSeries(series: Drama[]): Drama[] {
  return series
    .filter((drama) => (drama.progressSeconds ?? 0) > 0)
    .sort((a, b) => (b.progressSeconds ?? 0) - (a.progressSeconds ?? 0));
}

function getTrendingSeries(series: Drama[]): Drama[] {
  return [...series]
    .filter((drama) => drama.episodeCount > 0)
    .sort((a, b) => b.episodeCount - a.episodeCount || (a.rank ?? 0) - (b.rank ?? 0));
}

function getNewEpisodeSeries(series: Drama[]): Drama[] {
  return [...series]
    .filter((drama) => drama.latestEpisodeAt)
    .sort((a, b) => new Date(b.latestEpisodeAt ?? 0).getTime() - new Date(a.latestEpisodeAt ?? 0).getTime());
}

function getFreeSeries(series: Drama[]): Drama[] {
  return series.filter((drama) => drama.isFree);
}

function getCategorySeries(series: Drama[], category: SeriesCategory): Drama[] {
  if (category === 'continue') {
    return getContinueWatchingSeries(series);
  }
  if (category === 'trending') {
    return getTrendingSeries(series);
  }
  if (category === 'new') {
    return getNewEpisodeSeries(series);
  }

  return getFreeSeries(series);
}

export default function HomeScreen() {
  const [entryStep, setEntryStep] = useState<EntryStep>('splash');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('tabs');
  const [activeCategory, setActiveCategory] = useState<SeriesCategory>('trending');
  const [seriesCatalog, setSeriesCatalog] = useState<Drama[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Drama | null>(null);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [walletTopUpNotification, setWalletTopUpNotification] = useState<WalletTopUpNotification | null>(null);

  const loadSeriesCatalog = useCallback(async () => {
    const payload = await fetchJson<{ series: ApiSeries[] }>('/api/series');

    return payload.series.map(mapApiSeriesToDrama);
  }, []);

  const applySeriesCatalog = useCallback((nextSeries: Drama[]) => {
    setSeriesCatalog(nextSeries);
    setSelectedSeries((currentSeries) => {
      if (nextSeries.length === 0) {
        return null;
      }

      if (!currentSeries) {
        return nextSeries[0];
      }

      return nextSeries.find((item) => item.databaseId === currentSeries.databaseId) ?? nextSeries[0];
    });
  }, []);

  const refreshSeriesCatalog = useCallback(async () => {
    setIsRefreshingCatalog(true);

    try {
      applySeriesCatalog(await loadSeriesCatalog());
      setCatalogError('');
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Could not load local API data.');
      applySeriesCatalog([]);
    } finally {
      setIsRefreshingCatalog(false);
    }
  }, [applySeriesCatalog, loadSeriesCatalog]);

  useEffect(() => {
    setApiAuthToken(authToken);
  }, [authToken]);

  useEffect(() => {
    let isMounted = true;

    async function loadStoredAuth() {
      try {
        const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
        if (!storedToken) {
          return;
        }

        setApiAuthToken(storedToken);
        const payload = await fetchJson<{ user: AuthUser }>('/api/auth/me');

        if (isMounted) {
          setAuthToken(storedToken);
          setCurrentUser(payload.user);
        }
      } catch {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
        setApiAuthToken(null);
      }
    }

    void loadStoredAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (authToken && entryStep !== 'splash') {
      setEntryStep('app');
    }
  }, [authToken, entryStep]);

  useEffect(() => {
    if (entryStep !== 'app' || !authToken) {
      return;
    }

    let isMounted = true;

    async function loadInitialSeriesCatalog() {
      try {
        const nextSeries = await loadSeriesCatalog();

        if (isMounted) {
          setCatalogError('');
          applySeriesCatalog(nextSeries);
        }
      } catch (error) {
        if (isMounted) {
          setCatalogError(error instanceof Error ? error.message : 'Could not load local API data.');
          applySeriesCatalog([]);
        }
      }
    }

    void loadInitialSeriesCatalog();

    return () => {
      isMounted = false;
    };
  }, [applySeriesCatalog, authToken, entryStep, loadSeriesCatalog]);

  const openSeries = useCallback((series: Drama) => {
    setSelectedSeries(series);
    setActiveView('series-detail');
  }, []);

  const openPlayer = useCallback((series?: Drama) => {
    if (series) {
      setSelectedSeries(series);
    }

    setIsPlayerOpen(true);
  }, []);

  const openCategory = useCallback((category: SeriesCategory) => {
    setActiveCategory(category);
    setActiveView('category-list');
  }, []);

  const showProfilePlaceholder = useCallback((title: string) => {
    Alert.alert(title, 'This profile tool is coming soon.');
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
    setApiAuthToken(null);
    setAuthToken(null);
    setCurrentUser(null);
    setSeriesCatalog([]);
    setSelectedSeries(null);
    setActiveTab('Home');
    setActiveView('tabs');
    setEntryStep('auth');
  }, []);

  if (entryStep === 'splash') {
    return <SplashScreen onComplete={() => setEntryStep(authToken ? 'app' : 'onboarding')} />;
  }

  if (entryStep === 'onboarding') {
    return <OnboardingScreen onComplete={() => setEntryStep('auth')} />;
  }

  if (entryStep === 'auth') {
    return (
      <AuthScreen
        onComplete={(token) => {
          setAuthToken(token);
          setEntryStep('app');
        }}
        onUserLoaded={setCurrentUser}
      />
    );
  }

  if (isPlayerOpen && selectedSeries) {
    return (
      <PlayerScreen
        series={selectedSeries}
        user={currentUser}
        onUserChange={setCurrentUser}
        onClose={() => setIsPlayerOpen(false)}
      />
    );
  }

  if (activeView === 'series-detail' && selectedSeries) {
    return (
      <SeriesDetailScreen
        series={selectedSeries}
        onBack={() => setActiveView('tabs')}
        onStartWatching={() => openPlayer(selectedSeries)}
        onRefreshCatalog={refreshSeriesCatalog}
        isRefreshingCatalog={isRefreshingCatalog}
      />
    );
  }

  if (activeView === 'continue-watching') {
    return (
      <ContinueWatchingScreen
        series={seriesCatalog}
        onBack={() => setActiveView('tabs')}
        onResume={openPlayer}
        onRefresh={refreshSeriesCatalog}
        isRefreshing={isRefreshingCatalog}
      />
    );
  }

  if (activeView === 'profile-history') {
    return (
      <ProfileActivityScreen
        title="Watch History"
        eyebrow="Your activity"
        intro="Episodes you have played most recently."
        endpoint="/api/profile/watch-history"
        emptyTitle="No watch history yet"
        emptyBody="Episodes will appear here after playback starts."
        actionLabel="Resume"
        onBack={() => setActiveView('tabs')}
        onOpenItem={openPlayer}
      />
    );
  }

  if (activeView === 'profile-likes') {
    return (
      <ProfileActivityScreen
        title="Likes"
        eyebrow="Saved reactions"
        intro="Episodes you have liked across AfroReel."
        endpoint="/api/profile/likes"
        emptyTitle="No liked episodes yet"
        emptyBody="Tap the heart on an episode to collect it here."
        actionLabel="Open"
        onBack={() => setActiveView('tabs')}
        onOpenItem={openSeries}
      />
    );
  }

  if (activeView === 'category-list') {
    return (
      <CategorySeriesScreen
        title={categoryTitles[activeCategory]}
        series={getCategorySeries(seriesCatalog, activeCategory)}
        category={activeCategory}
        onBack={() => setActiveView('tabs')}
        onOpenSeries={openSeries}
        onRefresh={refreshSeriesCatalog}
        isRefreshing={isRefreshingCatalog}
      />
    );
  }

  if (activeView === 'payment') {
    return (
      <PaymentScreen
        onBack={() => setActiveView('tabs')}
        onComplete={(user, coinsAdded) => {
          setCurrentUser(user);
          setWalletTopUpNotification({ coinsAdded, newBalance: user.coinBalance });
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        {activeTab === 'Home' ? (
          <HomeTab
            series={seriesCatalog}
            onOpenDiscover={() => setActiveTab('Discover')}
            onOpenPlayer={openPlayer}
            onOpenSeries={openSeries}
            onOpenCategory={openCategory}
            onRefresh={refreshSeriesCatalog}
            isRefreshing={isRefreshingCatalog}
            catalogError={catalogError}
          />
        ) : null}
        {activeTab === 'Discover' ? (
          <DiscoverTab
            series={seriesCatalog}
            onOpenSeries={openSeries}
            onRefresh={refreshSeriesCatalog}
            isRefreshing={isRefreshingCatalog}
          />
        ) : null}
        {activeTab === 'Wallet' ? <WalletTab user={currentUser} onOpenPayment={() => setActiveView('payment')} /> : null}
        {activeTab === 'Alerts' ? (
          <NotificationsTab
            series={seriesCatalog}
            user={currentUser}
            walletTopUpNotification={walletTopUpNotification}
            onOpenSeries={openSeries}
            onOpenWallet={() => setActiveTab('Wallet')}
          />
        ) : null}
        {activeTab === 'Profile' ? (
          <ProfileTab
            user={currentUser}
            series={seriesCatalog}
            onOpenContinueWatching={() => setActiveView('continue-watching')}
            onOpenWatchHistory={() => setActiveView('profile-history')}
            onOpenLikes={() => setActiveView('profile-likes')}
            onOpenWallet={() => setActiveTab('Wallet')}
            onOpenAlerts={() => setActiveTab('Alerts')}
            onEditProfile={() => showProfilePlaceholder('Edit profile')}
            onOpenSettings={() => showProfilePlaceholder('Settings')}
            onOpenHelp={() => showProfilePlaceholder('Help and support')}
            onSignOut={signOut}
          />
        ) : null}
        <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}

function HomeTab({
  series,
  onOpenDiscover,
  onOpenPlayer,
  onOpenSeries,
  onOpenCategory,
  onRefresh,
  isRefreshing,
  catalogError,
}: {
  series: Drama[];
  onOpenDiscover: () => void;
  onOpenPlayer: (series?: Drama) => void;
  onOpenSeries: (series: Drama) => void;
  onOpenCategory: (category: SeriesCategory) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  catalogError: string;
}) {
  const hero = series[0];
  const continueWatchingSeries = getContinueWatchingSeries(series);
  const trendingSeries = getTrendingSeries(series);
  const newEpisodeSeries = getNewEpisodeSeries(series);
  const freeSeries = getFreeSeries(series);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Good evening</Text>
          <Text style={styles.headerTitle}>Drama awaits.</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} accessibilityLabel="Search" onPress={onOpenDiscover}>
            <Ionicons name="search" size={20} color={Colors.text} />
          </Pressable>
          <Pressable style={styles.avatar} accessibilityLabel="Profile">
            <Ionicons name="person" size={20} color={Colors.textOnPrimary} />
          </Pressable>
        </View>
      </View>

      {hero ? (
        <Pressable style={styles.heroCard} onPress={() => onOpenSeries(hero)}>
          <PosterVisual drama={hero} isHero />
          <LinearGradient
            colors={['transparent', 'rgba(10,10,15,0.38)', Colors.overlayHeavy]}
            style={StyleSheet.absoluteFill}
            
          />
          <View style={styles.heroCopy}>
            <Text style={styles.featuredPill}>TRENDING #1</Text>
            <Text style={styles.heroTitle}>{hero.title}</Text>
            <Text style={styles.heroMeta}>
              {hero.episodeCount} Episodes  /  {hero.genre}
              
            </Text>
            
            <Text style={styles.heroMood}>{hero.mood}</Text>
            <View style={styles.heroActions}>
              <Pressable style={styles.primaryButton} onPress={() => onOpenPlayer(hero)}>
                <Text style={styles.primaryButtonText}>Watch Now</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>My List</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      ) : (
        <View style={styles.discoverySpotlight}>
          <LinearGradient colors={['#2b1d38', '#0b0b12']} style={StyleSheet.absoluteFill} />
          <View style={styles.discoverySpotlightCopy}>
            <Text style={styles.featuredPill}>{catalogError ? 'API ERROR' : 'LIVE DATA'}</Text>
            <Text style={styles.discoveryTitle}>
              {catalogError ? 'Could not load local data' : 'No live series found'}
            </Text>
            <Text style={styles.discoveryBody}>
              {catalogError || 'Publish a live series in the local admin to see it here.'}
            </Text>
          </View>
        </View>
      )}

      <DramaRail
        title="Continue Watching"
        data={continueWatchingSeries}
        variant="progress"
        emptyMessage="Start watching an episode and your progress will appear here."
        onSeeAll={() => onOpenCategory('continue')}
        onOpenSeries={onOpenSeries}
      />
      <DramaRail
        title="Trending Now"
        data={trendingSeries.slice(0, 5)}
        onSeeAll={() => onOpenCategory('trending')}
        onOpenSeries={onOpenSeries}
      />
      <DramaRail
        title="New Episodes"
        data={newEpisodeSeries.slice(0, 5)}
        onSeeAll={() => onOpenCategory('new')}
        onOpenSeries={onOpenSeries}
      />
      <DramaRail
        title="Free to Watch"
        data={freeSeries}
        variant="free"
        emptyMessage="Mark an episode as free in the admin to show it here."
        onSeeAll={() => onOpenCategory('free')}
        onOpenSeries={onOpenSeries}
      />
    </ScrollView>
  );
}

function DiscoverTab({
  series,
  onOpenSeries,
  onRefresh,
  isRefreshing,
}: {
  series: Drama[];
  onOpenSeries: (series: Drama) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [query, setQuery] = useState('');

  const filteredDramas = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return series.filter((drama) => {
      const matchesFilter =
        activeFilter === 'All' ||
        drama.tags.includes(activeFilter) ||
        drama.genre.includes(activeFilter) ||
        (activeFilter === 'Free' && drama.isFree) ||
        (activeFilter === 'Completed' && drama.status === 'Completed');

      const haystack = `${drama.title} ${drama.genre} ${drama.mood} ${drama.tags.join(' ')}`.toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, query, series]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      <View style={styles.discoverHeader}>
        <Text style={styles.eyebrow}>Discover</Text>
        <Text style={styles.headerTitle}>Find your next obsession.</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={Colors.textDim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles, moods, genres"
          placeholderTextColor={Colors.textDim}
          style={styles.searchInput}
          selectionColor={Colors.primary}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRail}
      >
        {filters.map((filter) => {
          const isActive = filter === activeFilter;

          return (
            <Pressable
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.discoverySpotlight}>
        <LinearGradient colors={['#2b1d38', '#0b0b12']} style={StyleSheet.absoluteFill} />
        <View style={styles.discoverySpotlightCopy}>
          <Text style={styles.featuredPill}>CURATED</Text>
          <Text style={styles.discoveryTitle}>High-stakes romance</Text>
          <Text style={styles.discoveryBody}>
            Power, secrets, family pressure, and the kind of cliffhanger that makes bedtime negotiable.
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {activeFilter === 'All' ? 'All Dramas' : activeFilter}
        </Text>
        <Text style={styles.resultCount}>{filteredDramas.length} titles</Text>
      </View>

      <View style={styles.posterGrid}>
        {filteredDramas.map((drama) => (
          <Pressable key={`discover-${drama.id}`} style={styles.gridPoster} onPress={() => onOpenSeries(drama)}>
            <PosterVisual drama={drama} />
            {drama.isFree ? (
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>FREE</Text>
              </View>
            ) : null}
            {drama.isLocked ? (
              <View style={styles.lockBadge}>
                <Text style={styles.lockBadgeText}>LOCKED</Text>
              </View>
            ) : null}
            <LinearGradient colors={['transparent', Colors.overlayHeavy]} style={styles.posterFade} />
            <View style={styles.posterCopy}>
              <Text style={styles.posterTitle} numberOfLines={2}>
                {drama.title}
              </Text>
              <Text style={styles.posterMeta} numberOfLines={1}>
                {drama.genre}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function CategorySeriesScreen({
  title,
  series,
  category,
  onBack,
  onOpenSeries,
  onRefresh,
  isRefreshing,
}: {
  title: string;
  series: Drama[];
  category: SeriesCategory;
  onBack: () => void;
  onOpenSeries: (series: Drama) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}) {
  const emptyCopy = category === 'continue'
    ? 'Start watching an episode and your progress will appear here.'
    : category === 'free'
      ? 'Mark an episode as free in the admin to show it here.'
      : 'No titles found in this category yet.';

  return (
    <View style={styles.categoryScreen}>
      <SafeAreaView>
        <View style={styles.categoryHeader}>
          <Pressable style={styles.iconButton} onPress={onBack} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.categoryHeaderCopy}>
            <Text style={styles.eyebrow}>{series.length} title{series.length === 1 ? '' : 's'}</Text>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.categoryContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {series.length > 0 ? (
          <View style={styles.posterGrid}>
            {series.map((drama) => (
              <Pressable key={`category-${category}-${drama.id}`} style={styles.gridPoster} onPress={() => onOpenSeries(drama)}>
                <PosterVisual drama={drama} />
                {drama.isFree ? (
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>FREE</Text>
                  </View>
                ) : null}
                {drama.isLocked ? (
                  <View style={styles.lockBadge}>
                    <Text style={styles.lockBadgeText}>LOCKED</Text>
                  </View>
                ) : null}
                <LinearGradient colors={['transparent', Colors.overlayHeavy]} style={styles.posterFade} />
                <View style={styles.posterCopy}>
                  <Text style={styles.posterTitle} numberOfLines={2}>
                    {drama.title}
                  </Text>
                  <Text style={styles.posterMeta} numberOfLines={1}>
                    {drama.episodeCount} eps
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.discoverySpotlight}>
            <LinearGradient colors={['#2b1d38', '#0b0b12']} style={StyleSheet.absoluteFill} />
            <View style={styles.discoverySpotlightCopy}>
              <Text style={styles.featuredPill}>LIVE DATA</Text>
              <Text style={styles.discoveryTitle}>Nothing here yet</Text>
              <Text style={styles.discoveryBody}>{emptyCopy}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    const loadingInterval = setInterval(() => {
      setActiveDot((currentDot) => (currentDot + 1) % 3);
    }, 320);
    const transitionTimeout = setTimeout(onComplete, 1800);

    return () => {
      clearInterval(loadingInterval);
      clearTimeout(transitionTimeout);
    };
  }, [onComplete]);

  return (
    <View style={styles.splashScreen}>
      <ImageBackground
        source={require('../../assets/images/onboarding/Pic 4.png')}
        resizeMode="cover"
        style={styles.splashImage}
      />
      <LinearGradient
        colors={['rgba(10,10,15,0.18)', 'rgba(10,10,15,0.48)', Colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.splashContent}>
        <Text style={styles.splashBrand}>AfroReel</Text>
        <Text style={styles.splashEyebrow}>AFRICAN DRAMA STREAMING</Text>
      </View>

      <SafeAreaView style={styles.splashFooter}>
        <View style={styles.splashLoader}>
          {[0, 1, 2].map((dot) => (
            <View
              key={dot}
              style={[styles.splashLoaderDot, activeDot === dot && styles.splashLoaderDotActive]}
            />
          ))}
        </View>
        <Text style={styles.splashTagline}>Binge-worthy African stories.</Text>
      </SafeAreaView>
    </View>
  );
}

function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = onboardingSlides[activeSlide];
  const isLastSlide = activeSlide === onboardingSlides.length - 1;

  return (
    <View style={styles.onboardingScreen}>
      <ImageBackground
        source={slide.image}
        resizeMode="cover"
        style={styles.onboardingImage}
      />

      <LinearGradient
        colors={['rgba(10,10,15,0.08)', 'rgba(10,10,15,0.48)', Colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.onboardingSafeArea}>
        <View style={styles.onboardingTopBar}>
          <Text style={styles.onboardingBrand}>AfroReel</Text>
          <Pressable onPress={onComplete} hitSlop={12}>
            <Text style={styles.onboardingSkip}>Skip</Text>
          </Pressable>
        </View>

        <View style={styles.onboardingContent}>
          <View style={styles.onboardingDots}>
            {onboardingSlides.map((item, index) => (
              <View
                key={item.eyebrow}
                style={[styles.onboardingDot, index === activeSlide && styles.onboardingDotActive]}
              />
            ))}
          </View>

          <Text style={styles.onboardingEyebrow}>{slide.eyebrow}</Text>
          <Text style={styles.onboardingTitle}>{slide.title}</Text>
          <Text style={styles.onboardingBody}>{slide.body}</Text>

          <Pressable
            style={styles.onboardingButton}
            onPress={() => {
              if (isLastSlide) {
                onComplete();
                return;
              }

              setActiveSlide((currentSlide) => currentSlide + 1);
            }}
          >
            <Text style={styles.onboardingButtonText}>
              {isLastSlide ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.textOnPrimary} style={styles.onboardingButtonArrow} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function AuthScreen({
  onComplete,
  onUserLoaded,
}: {
  onComplete: (token: string, user: AuthUser) => void;
  onUserLoaded: (user: AuthUser) => void;
}) {
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitAuth = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setAuthError('Enter your email address.');
      return;
    }

    if (isCreatingAccount && password.length < 8) {
      setAuthError('Create a password with at least 8 characters.');
      return;
    }

    if (!password) {
      setAuthError('Enter your password.');
      return;
    }

    setIsSubmitting(true);
    setAuthError('');

    try {
      const payload = await fetchJson<{ token: string; user: AuthUser }>(
        isCreatingAccount ? '/api/auth/signup' : '/api/auth/signin',
        {
          method: 'POST',
          body: JSON.stringify({ email: normalizedEmail, password }),
        },
      );

      setApiAuthToken(payload.token);
      await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, payload.token);
      onUserLoaded(payload.user);
      onComplete(payload.token, payload.user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, isCreatingAccount, isSubmitting, onComplete, onUserLoaded, password]);

  return (
    <View style={styles.authScreen}>
      <ImageBackground
        source={require('../../assets/images/onboarding/Pic 5.png')}
        resizeMode="cover"
        style={styles.authImage}
      />
      <LinearGradient
        colors={['rgba(10,10,15,0.16)', 'rgba(10,10,15,0.62)', Colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.authSafeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.authContent}
        >
          <View style={styles.authBrandBlock}>
            <Text style={styles.authBrand}>AfroReel</Text>
            <Text style={styles.authEyebrow}>AFRICAN DRAMA STREAMING</Text>
          </View>

          <View style={styles.authForm}>
            <Text style={styles.authTitle}>
              {isCreatingAccount ? 'Create your account.' : 'Welcome back.'}
            </Text>
            <Text style={styles.authSubtitle}>
              {isCreatingAccount
                ? 'Your next favorite story is waiting.'
                : 'Sign in to keep watching where you left off.'}
            </Text>

            <Text style={styles.authFieldLabel}>EMAIL ADDRESS</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textDim}
              selectionColor={Colors.primary}
              style={styles.authInput}
              value={email}
            />

            <Text style={styles.authFieldLabel}>PASSWORD</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={Colors.textDim}
              secureTextEntry
              selectionColor={Colors.primary}
              style={styles.authInput}
              value={password}
            />

            {!isCreatingAccount ? (
              <Pressable style={styles.authForgot}>
                <Text style={styles.authForgotText}>Forgot password?</Text>
              </Pressable>
            ) : null}

            {authError ? <Text style={styles.authError}>{authError}</Text> : null}

            <Pressable
              style={[styles.authContinueButton, isSubmitting && styles.authContinueButtonDisabled]}
              onPress={submitAuth}
              disabled={isSubmitting}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? 'Please wait...' : isCreatingAccount ? 'Create Account' : 'Continue'}
              </Text>
            </Pressable>

            <View style={styles.authDivider}>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerText}>OR CONTINUE WITH</Text>
              <View style={styles.authDividerLine} />
            </View>

            <View style={styles.authSocialRow}>
              <Pressable style={[styles.authSocialButton, styles.authSocialButtonDisabled]} disabled>
                <Ionicons name="logo-google" size={18} color={Colors.text} />
                <Text style={styles.authSocialText}>Google</Text>
              </Pressable>
              <Pressable style={[styles.authSocialButton, styles.authSocialButtonDisabled]} disabled>
                <Ionicons name="logo-apple" size={19} color={Colors.text} />
                <Text style={styles.authSocialText}>Apple</Text>
              </Pressable>
            </View>

            <View style={styles.authToggleRow}>
              <Text style={styles.authToggleCopy}>
                {isCreatingAccount ? 'Already have an account?' : 'New to AfroReel?'}
              </Text>
              <Pressable
                onPress={() => {
                  setAuthError('');
                  setIsCreatingAccount((currentValue) => !currentValue);
                }}
              >
                <Text style={styles.authToggleAction}>
                  {isCreatingAccount ? 'Sign in' : 'Create account'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function WalletTab({ user, onOpenPayment }: { user: AuthUser | null; onOpenPayment: () => void }) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  const coinBalance = user?.coinBalance ?? 0;
  const unlockEstimate = Math.floor(coinBalance / 5);

  const loadTransactions = useCallback(async () => {
    setIsLoadingTransactions(true);

    try {
      const payload = await fetchJson<{ transactions: WalletTransaction[] }>('/api/wallet/transactions');
      setTransactions(payload.transactions);
      setTransactionError('');
    } catch (error) {
      setTransactionError(error instanceof Error ? error.message : 'Could not load wallet history.');
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [coinBalance, loadTransactions]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <LinearGradient colors={['#2a1d35', Colors.background]} style={styles.walletHero}>
        <Text style={styles.walletEyebrow}>YOUR WALLET</Text>
        <View style={styles.walletCoinMark}>
          <Ionicons name="wallet" size={36} color={Colors.textOnPrimary} />
        </View>
        <Text style={styles.walletBalance}>{coinBalance.toLocaleString()}</Text>
        <Text style={styles.walletBalanceLabel}>available coins</Text>
        <Text style={styles.walletHint}>
          {unlockEstimate > 0
            ? `That is enough to unlock ${unlockEstimate} episode${unlockEstimate === 1 ? '' : 's'}.`
            : 'Top up or earn coins to unlock paid episodes.'}
        </Text>
      </LinearGradient>

      <View style={styles.walletSectionHeader}>
        <Text style={styles.sectionTitle}>Top up coins</Text>
        <Text style={styles.walletSectionCopy}>Open checkout to choose a pack and keep the story moving.</Text>
      </View>

      <Pressable style={styles.walletPurchaseButton} onPress={onOpenPayment}>
        <Ionicons name="add-circle" size={18} color={Colors.textOnPrimary} />
        <Text style={styles.primaryButtonText}>Buy coins</Text>
      </Pressable>

      <View style={styles.walletSectionHeader}>
        <Text style={styles.sectionTitle}>Earn free coins</Text>
        <Text style={styles.walletSectionCopy}>A little patience can fund a cliffhanger.</Text>
      </View>

      <View style={styles.earnList}>
        <EarnRow mark="A" label="Watch a short ad" description="Earn coins in under a minute" reward="+5" />
        <EarnRow mark="D" label="Daily check-in" description="Come back tomorrow for another reward" reward="+2" />
        <EarnRow mark="R" label="Invite a friend" description="Referral rewards are coming soon" reward="Soon" disabled />
      </View>

      <View style={styles.walletSectionHeader}>
        <Text style={styles.sectionTitle}>Wallet history</Text>
        <Text style={styles.walletSectionCopy}>Track coin additions and episode unlocks.</Text>
      </View>

      <View style={styles.walletHistoryList}>
        {isLoadingTransactions && transactions.length === 0 ? (
          <Text style={styles.walletHistoryState}>Loading wallet history...</Text>
        ) : null}
        {transactionError ? <Text style={styles.walletHistoryState}>{transactionError}</Text> : null}
        {!isLoadingTransactions && !transactionError && transactions.length === 0 ? (
          <Text style={styles.walletHistoryState}>No coin activity yet.</Text>
        ) : null}
        {transactions.map((transaction) => (
          <WalletHistoryRow key={transaction.id} transaction={transaction} />
        ))}
      </View>
    </ScrollView>
  );
}

function WalletHistoryRow({ transaction }: { transaction: WalletTransaction }) {
  const isCredit = transaction.coinAmount > 0;
  const amount = Math.abs(transaction.coinAmount).toLocaleString();
  const fallbackTitle = isCredit ? 'Coins added' : 'Coins spent';
  const subtitle = transaction.type === 'spend' && transaction.seriesTitle
    ? `${transaction.seriesTitle}${transaction.episodeNumber ? `, Episode ${transaction.episodeNumber}` : ''}`
    : formatWalletTransactionDate(transaction.createdAt);

  return (
    <View style={styles.walletHistoryRow}>
      <View style={[styles.walletHistoryIcon, isCredit ? styles.walletHistoryIconCredit : styles.walletHistoryIconSpend]}>
        <Ionicons name={isCredit ? 'add' : 'remove'} size={18} color={isCredit ? Colors.success : Colors.primary} />
      </View>
      <View style={styles.walletHistoryCopy}>
        <Text style={styles.walletHistoryTitle}>{transaction.description || fallbackTitle}</Text>
        <Text style={styles.walletHistoryMeta}>{subtitle}</Text>
      </View>
      <Text style={[styles.walletHistoryAmount, isCredit ? styles.walletHistoryAmountCredit : styles.walletHistoryAmountSpend]}>
        {isCredit ? '+' : '-'}{amount}
      </Text>
    </View>
  );
}

function formatWalletTransactionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recent';
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function PaymentScreen({ onBack, onComplete }: { onBack: () => void; onComplete: (user: AuthUser, coinsAdded: number) => void }) {
  const [selectedPackage, setSelectedPackage] = useState('plus');
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [isComplete, setIsComplete] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedCoinPackage = coinPackages.find((coinPackage) => coinPackage.id === selectedPackage) ?? coinPackages[1];
  const completePayment = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setPaymentError('');

    try {
      const payload = await fetchJson<{ user: AuthUser }>('/api/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ coins: selectedCoinPackage.coins }),
      });
      onComplete(payload.user, selectedCoinPackage.coins);
      setIsComplete(true);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Could not update your wallet. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onComplete, selectedCoinPackage.coins]);

  if (isComplete) {
    return (
      <View style={styles.paymentSuccessScreen}>
        <LinearGradient colors={['#251a32', Colors.background]} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.paymentSuccessSafeArea}>
          <View style={styles.paymentSuccessIcon}>
            <Ionicons name="checkmark" size={38} color={Colors.textOnPrimary} />
          </View>
          <Text style={styles.paymentSuccessEyebrow}>PAYMENT COMPLETE</Text>
          <Text style={styles.paymentSuccessTitle}>Your coins are ready.</Text>
          <Text style={styles.paymentSuccessBody}>
            {selectedCoinPackage.coins.toLocaleString()} coins have been added to your AfroReel wallet.
          </Text>
          <Pressable style={styles.paymentSuccessButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>Return to wallet</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.paymentScreen}>
      <SafeAreaView>
        <View style={styles.paymentHeader}>
          <Pressable style={styles.iconButton} onPress={onBack} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.paymentHeaderCopy}>
            <Text style={styles.eyebrow}>Secure checkout</Text>
            <Text style={styles.headerTitle}>Buy coins</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.paymentContent}>
        <Text style={styles.paymentSectionTitle}>Choose your pack</Text>
        <View style={styles.paymentPackageList}>
          {coinPackages.map((coinPackage) => {
            const isSelected = selectedPackage === coinPackage.id;

            return (
              <Pressable
                key={coinPackage.id}
                style={[styles.paymentPackage, isSelected && styles.paymentPackageSelected]}
                onPress={() => setSelectedPackage(coinPackage.id)}
              >
                <View>
                  <View style={styles.packageTitleRow}>
                    <Text style={styles.packageName}>{coinPackage.name}</Text>
                    {coinPackage.bonus ? <Text style={styles.packageBonus}>{coinPackage.bonus}</Text> : null}
                  </View>
                  <Text style={styles.packageCoins}>{coinPackage.coins.toLocaleString()} coins</Text>
                </View>
                <Text style={styles.packagePrice}>{coinPackage.price}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.paymentSectionTitle}>Payment method</Text>
        <View style={styles.paymentMethodList}>
          <PaymentMethod
            id="card"
            mark="C"
            label="Credit or debit card"
            description="Visa, Mastercard, or Amex"
            selectedMethod={selectedMethod}
            onSelect={setSelectedMethod}
          />
          <PaymentMethod
            id="flutterwave"
            mark="F"
            label="Flutterwave"
            description="Pay securely with local options"
            selectedMethod={selectedMethod}
            onSelect={setSelectedMethod}
          />
          <PaymentMethod
            id="apple"
            mark="A"
            label="Apple Pay"
            description="Coming soon"
            selectedMethod={selectedMethod}
            onSelect={setSelectedMethod}
            disabled
          />
        </View>

        <View style={styles.paymentSummary}>
          <View style={styles.paymentSummaryRow}>
            <Text style={styles.paymentSummaryLabel}>Selected pack</Text>
            <Text style={styles.paymentSummaryValue}>{selectedCoinPackage.coins.toLocaleString()} coins</Text>
          </View>
          <View style={styles.paymentSummaryRow}>
            <Text style={styles.paymentSummaryLabel}>Total</Text>
            <Text style={styles.paymentSummaryTotal}>{selectedCoinPackage.price}</Text>
          </View>
        </View>

        <Text style={styles.paymentSecurity}>
          Secure checkout. Your payment details are encrypted and never stored by AfroReel.
        </Text>

        {paymentError ? <Text style={styles.authError}>{paymentError}</Text> : null}

        <Pressable
          style={[styles.paymentButton, isSubmitting && styles.authContinueButtonDisabled]}
          onPress={completePayment}
          disabled={isSubmitting}
        >
          <Text style={styles.primaryButtonText}>{isSubmitting ? 'Please wait...' : `Pay ${selectedCoinPackage.price}`}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function PaymentMethod({
  id,
  mark,
  label,
  description,
  selectedMethod,
  onSelect,
  disabled = false,
}: {
  id: string;
  mark: string;
  label: string;
  description: string;
  selectedMethod: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const isSelected = id === selectedMethod;

  return (
    <Pressable
      style={[styles.paymentMethod, isSelected && styles.paymentMethodSelected, disabled && styles.paymentMethodDisabled]}
      onPress={() => onSelect(id)}
      disabled={disabled}
    >
      <View style={styles.paymentMethodIcon}>
        <Ionicons name={getIconForMark(mark)} size={20} color={Colors.primary} />
      </View>
      <View style={styles.paymentMethodCopy}>
        <Text style={styles.paymentMethodLabel}>{label}</Text>
        <Text style={styles.paymentMethodDescription}>{description}</Text>
      </View>
      <View style={[styles.paymentRadio, isSelected && styles.paymentRadioSelected]}>
        {isSelected ? <View style={styles.paymentRadioDot} /> : null}
      </View>
    </Pressable>
  );
}

function EarnRow({
  mark,
  label,
  description,
  reward,
  disabled = false,
}: {
  mark: string;
  label: string;
  description: string;
  reward: string;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.earnRow, disabled && styles.earnRowDisabled]} disabled={disabled}>
      <View style={styles.earnIcon}>
        <Ionicons name={getIconForMark(mark)} size={18} color={disabled ? Colors.textDim : Colors.primary} />
      </View>
      <View style={styles.earnCopy}>
        <Text style={styles.earnLabel}>{label}</Text>
        <Text style={styles.earnDescription}>{description}</Text>
      </View>
      <View style={[styles.rewardBadge, disabled && styles.rewardBadgeDisabled]}>
        <Text style={[styles.rewardText, disabled && styles.rewardTextDisabled]}>{reward}</Text>
      </View>
    </Pressable>
  );
}

function NotificationsTab({
  series,
  user,
  walletTopUpNotification,
  onOpenSeries,
  onOpenWallet,
}: {
  series: Drama[];
  user: AuthUser | null;
  walletTopUpNotification: WalletTopUpNotification | null;
  onOpenSeries: (series: Drama) => void;
  onOpenWallet: () => void;
}) {
  const newEpisodeSeries = getNewEpisodeSeries(series).slice(0, 3);
  const continueWatchingSeries = getContinueWatchingSeries(series).slice(0, 2);
  const notifications: AppNotification[] = [
    ...newEpisodeSeries.map((drama) => ({
      key: `new-${drama.databaseId}`,
      mark: 'N',
      title: `${drama.title} has live episodes`,
      body: `${drama.episodeCount} episode${drama.episodeCount === 1 ? '' : 's'} available from the database.`,
      time: formatNotificationDate(drama.latestEpisodeAt),
      sortTime: notificationTimeValue(drama.latestEpisodeAt),
      onPress: () => onOpenSeries(drama),
      unread: (drama.progressSeconds ?? 0) === 0,
    })),
    ...continueWatchingSeries.map((drama) => ({
      key: `continue-${drama.databaseId}`,
      mark: 'W',
      title: `Resume ${drama.title}`,
      body: `${formatPlaybackTime(drama.progressSeconds ?? 0)} watched on your account.`,
      time: 'Saved',
      sortTime: notificationTimeValue(drama.latestEpisodeAt) - 1,
      onPress: () => onOpenSeries(drama),
    })),
  ];

  if (user) {
    notifications.push(
      walletTopUpNotification
        ? {
            key: 'wallet-top-up',
            mark: 'C',
            title: `${walletTopUpNotification.coinsAdded.toLocaleString()} coins added to your balance`,
            body: `Your wallet balance is now ${walletTopUpNotification.newBalance.toLocaleString()} coins.`,
            time: 'Now',
            sortTime: Date.now(),
            onPress: onOpenWallet,
            unread: true,
            accent: 'gold',
          }
        : {
            key: 'wallet-balance',
            mark: 'C',
            title: `${user.coinBalance.toLocaleString()} coins available`,
            body: 'This balance is loaded from your signed-in account.',
            time: 'Now',
            sortTime: 0,
            onPress: onOpenWallet,
            accent: 'gold',
          },
    );
  }

  notifications.sort((first, second) => second.sortTime - first.sortTime);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.notificationsHeader}>
        <View>
          <Text style={styles.eyebrow}>Updates</Text>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <Pressable>
          <Text style={styles.notificationsClear}>Mark all read</Text>
        </Pressable>
      </View>

      {notifications.length > 0 ? (
        <View style={styles.notificationList}>
          {notifications.map((notification) => (
            <NotificationRow
              key={notification.key}
              mark={notification.mark}
              title={notification.title}
              body={notification.body}
              time={notification.time}
              onPress={notification.onPress}
              unread={notification.unread}
              accent={notification.accent}
            />
          ))}
        </View>
      ) : (
        <View style={styles.discoverySpotlight}>
          <LinearGradient colors={['#2b1d38', '#0b0b12']} style={StyleSheet.absoluteFill} />
          <View style={styles.discoverySpotlightCopy}>
            <Text style={styles.featuredPill}>LIVE DATA</Text>
            <Text style={styles.discoveryTitle}>No account updates yet</Text>
            <Text style={styles.discoveryBody}>Personal alerts will appear after your account has watch activity or live catalog updates.</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function formatNotificationDate(value: string | null | undefined): string {
  if (!value) {
    return 'Live';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Live';
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function notificationTimeValue(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function NotificationRow({
  mark,
  title,
  body,
  time,
  onPress,
  unread = false,
  accent = 'red',
}: {
  mark: string;
  title: string;
  body: string;
  time: string;
  onPress: () => void;
  unread?: boolean;
  accent?: 'red' | 'gold';
}) {
  const isGold = accent === 'gold';

  return (
    <Pressable style={styles.notificationRow} onPress={onPress}>
      <View style={[styles.notificationIcon, isGold && styles.notificationIconGold]}>
        <Ionicons name={getIconForMark(mark)} size={18} color={isGold ? Colors.textOnPrimary : Colors.primary} />
      </View>
      <View style={styles.notificationCopy}>
        <View style={styles.notificationTitleRow}>
          <Text style={styles.notificationTitle}>{title}</Text>
          <Text style={styles.notificationTime}>{time}</Text>
        </View>
        <Text style={styles.notificationBody}>{body}</Text>
      </View>
      {unread ? <View style={styles.notificationUnreadDot} /> : null}
    </Pressable>
  );
}

function ProfileTab({
  user,
  series,
  onOpenContinueWatching,
  onOpenWatchHistory,
  onOpenLikes,
  onOpenWallet,
  onOpenAlerts,
  onEditProfile,
  onOpenSettings,
  onOpenHelp,
  onSignOut,
}: {
  user: AuthUser | null;
  series: Drama[];
  onOpenContinueWatching: () => void;
  onOpenWatchHistory: () => void;
  onOpenLikes: () => void;
  onOpenWallet: () => void;
  onOpenAlerts: () => void;
  onEditProfile: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onSignOut: () => void;
}) {
  const profileName = user?.name || 'AfroReel Viewer';
  const profileEmail = user?.email || 'Signed-in account';
  const profileInitial = profileName.trim().charAt(0).toUpperCase() || 'A';
  const continueItems = getContinueWatchingSeries(series);
  const watchedEpisodeCount = continueItems.length;
  const watchedSeriesCount = new Set(continueItems.map((drama) => drama.databaseId)).size;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <LinearGradient colors={['#251831', Colors.background]} style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{profileInitial}</Text>
        </View>
        <Text style={styles.profileName}>{profileName}</Text>
        <Text style={styles.profileEmail}>{profileEmail}</Text>
        <Pressable style={styles.profileEditButton} onPress={onEditProfile}>
          <Text style={styles.profileEditText}>Edit profile</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.profileStats}>
        <ProfileStat value={(user?.coinBalance ?? 0).toLocaleString()} label="Coins" />
        <View style={styles.profileStatDivider} />
        <ProfileStat value={String(watchedEpisodeCount)} label="Episodes" />
        <View style={styles.profileStatDivider} />
        <ProfileStat value={String(watchedSeriesCount)} label="Series" />
      </View>

      <ProfileSection title="Your activity">
        <ProfileRow mark="W" label="Continue watching" description="Resume your latest episodes" onPress={onOpenContinueWatching} />
        <ProfileRow mark="H" label="Watch history" description="Stories you have played" onPress={onOpenWatchHistory} />
        <ProfileRow mark="F" label="Likes" description="Episodes you reacted to" onPress={onOpenLikes} />
        <ProfileRow mark="P" label="Coin purchases" description="Receipts and transaction history" onPress={onOpenWallet} />
      </ProfileSection>

      <ProfileSection title="Preferences">
        <ProfileRow mark="N" label="Notifications" description="New episodes and reward alerts" onPress={onOpenAlerts} />
        <ProfileRow mark="S" label="Settings" description="Playback, privacy, and account" onPress={onOpenSettings} />
        <ProfileRow mark="?" label="Help and support" description="Get answers or contact us" onPress={onOpenHelp} />
      </ProfileSection>

      <View style={styles.profileLogoutArea}>
        <Pressable style={styles.profileLogoutButton} onPress={onSignOut}>
          <Text style={styles.profileLogoutText}>Log out</Text>
        </Pressable>
        <Text style={styles.profileVersion}>AfroReel version 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function ProfileSection({ title, children }: { title: string; children: ViewProps['children'] }) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{title}</Text>
      <View style={styles.profileRowList}>{children}</View>
    </View>
  );
}

function ProfileRow({
  mark,
  label,
  description,
  onPress,
}: {
  mark: string;
  label: string;
  description: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.profileRow} onPress={onPress}>
      <View style={styles.profileRowIcon}>
        <Ionicons name={getIconForMark(mark)} size={18} color={Colors.primary} />
      </View>
      <View style={styles.profileRowCopy}>
        <Text style={styles.profileRowLabel}>{label}</Text>
        <Text style={styles.profileRowDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
    </Pressable>
  );
}

function ProfileActivityScreen({
  title,
  eyebrow,
  intro,
  endpoint,
  emptyTitle,
  emptyBody,
  actionLabel,
  onBack,
  onOpenItem,
}: {
  title: string;
  eyebrow: string;
  intro: string;
  endpoint: string;
  emptyTitle: string;
  emptyBody: string;
  actionLabel: string;
  onBack: () => void;
  onOpenItem: (series: Drama) => void;
}) {
  const [items, setItems] = useState<ApiProfileEpisode[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadItems = useCallback(async () => {
    const payload = await fetchJson<{ items: ApiProfileEpisode[] }>(endpoint);
    return payload.items;
  }, [endpoint]);

  const refreshItems = useCallback(async () => {
    setIsRefreshing(true);

    try {
      setItems(await loadItems());
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load this list.');
      setItems([]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadItems]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialItems() {
      try {
        const nextItems = await loadItems();

        if (isMounted) {
          setItems(nextItems);
          setError('');
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load this list.');
          setItems([]);
        }
      }
    }

    void loadInitialItems();

    return () => {
      isMounted = false;
    };
  }, [loadItems]);

  return (
    <View style={styles.continueScreen}>
      <SafeAreaView>
        <View style={styles.continueHeader}>
          <Pressable style={styles.iconButton} onPress={onBack} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.continueHeaderCopy}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.continueContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refreshItems} tintColor={Colors.primary} />
        }
      >
        <Text style={styles.continueIntro}>{intro}</Text>

        {error ? <Text style={styles.walletHistoryState}>{error}</Text> : null}

        {items.length > 0 ? items.map((item, index) => {
          const drama = mapApiSeriesToDrama(item.series, index);
          const activityDate = formatNotificationDate(item.activityAt);

          return (
            <Pressable
              key={`${endpoint}-${item.episodeId}`}
              style={styles.continueCard}
              onPress={() => onOpenItem(drama)}
            >
              <View style={styles.continueArtwork}>
                <PosterVisual drama={drama} isHero />
                <LinearGradient colors={['transparent', Colors.overlayHeavy]} style={StyleSheet.absoluteFill} />
                <View style={styles.continueArtworkCopy}>
                  <Text style={styles.continueCardTitle}>{drama.title}</Text>
                  <Text style={styles.continueCardMeta}>
                    Episode {item.episodeNumber}: {item.episodeTitle}
                  </Text>
                </View>
              </View>
              <View style={styles.continueCardFooter}>
                <View style={styles.continueCardFooterCopy}>
                  <Text style={styles.continueUpdated}>
                    {item.progressSeconds > 0 ? `${formatPlaybackTime(item.progressSeconds)} watched` : `Added ${activityDate}`}
                  </Text>
                  <Text style={styles.profileActivityHook} numberOfLines={1}>
                    {item.hook || drama.mood}
                  </Text>
                </View>
                <View style={styles.continueResumeButton}>
                  <Text style={styles.continueResumeText}>{actionLabel}</Text>
                </View>
              </View>
            </Pressable>
          );
        }) : !error ? (
          <View style={styles.discoverySpotlight}>
            <LinearGradient colors={['#2b1d38', '#0b0b12']} style={StyleSheet.absoluteFill} />
            <View style={styles.discoverySpotlightCopy}>
              <Text style={styles.featuredPill}>PROFILE</Text>
              <Text style={styles.discoveryTitle}>{emptyTitle}</Text>
              <Text style={styles.discoveryBody}>{emptyBody}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ContinueWatchingScreen({
  series,
  onBack,
  onResume,
  onRefresh,
  isRefreshing,
}: {
  series: Drama[];
  onBack: () => void;
  onResume: (series?: Drama) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}) {
  const continueItems = series
    .filter((drama) => (drama.progressSeconds ?? 0) > 0)
    .sort((a, b) => (b.progressSeconds ?? 0) - (a.progressSeconds ?? 0));

  return (
    <View style={styles.continueScreen}>
      <SafeAreaView>
        <View style={styles.continueHeader}>
          <Pressable style={styles.iconButton} onPress={onBack} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.continueHeaderCopy}>
            <Text style={styles.eyebrow}>Your queue</Text>
            <Text style={styles.headerTitle}>Continue Watching</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.continueContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <Text style={styles.continueIntro}>
          Pick up exactly where the drama left you.
        </Text>

        {continueItems.length > 0 ? continueItems.map((drama) => (
          <Pressable key={drama.id} style={styles.continueCard} onPress={() => onResume(drama)}>
            <View style={styles.continueArtwork}>
              <PosterVisual drama={drama} isHero />
              <LinearGradient colors={['transparent', Colors.overlayHeavy]} style={StyleSheet.absoluteFill} />
              <View style={styles.continueArtworkCopy}>
                <Text style={styles.continueCardTitle}>{drama.title}</Text>
                <Text style={styles.continueCardMeta}>
                  {formatPlaybackTime(drama.progressSeconds ?? 0)} watched
                </Text>
              </View>
            </View>
            <View style={styles.continueCardFooter}>
              <View style={styles.continueCardFooterCopy}>
                <Text style={styles.continueUpdated}>Progress saved locally</Text>
                <View style={styles.continueProgressTrack}>
                  <View style={[styles.continueProgressFill, { width: `${drama.progress ?? 35}%` }]} />
                </View>
              </View>
              <View style={styles.continueResumeButton}>
                <Text style={styles.continueResumeText}>Resume</Text>
              </View>
            </View>
          </Pressable>
        )) : (
          <View style={styles.discoverySpotlight}>
            <LinearGradient colors={['#2b1d38', '#0b0b12']} style={StyleSheet.absoluteFill} />
            <View style={styles.discoverySpotlightCopy}>
              <Text style={styles.featuredPill}>LIVE DATA</Text>
              <Text style={styles.discoveryTitle}>No watch history yet</Text>
              <Text style={styles.discoveryBody}>Live series from the online database will appear here after viewing starts.</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PlayerScreen({
  series,
  user,
  onUserChange,
  onClose,
}: {
  series: Drama;
  user: AuthUser | null;
  onUserChange: (user: AuthUser) => void;
  onClose: () => void;
}) {
  const [remoteEpisodes, setRemoteEpisodes] = useState<PlayerEpisode[]>([]);
  const [remoteSeriesTitle, setRemoteSeriesTitle] = useState(series.title);
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isUnlockSheetOpen, setIsUnlockSheetOpen] = useState(false);
  const [unlockedEpisodes, setUnlockedEpisodes] = useState<number[]>([]);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [engagement, setEngagement] = useState<EpisodeEngagement>({
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    hasLiked: false,
    hasSaved: false,
  });
  const [comments, setComments] = useState<EpisodeComment[]>([]);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const lastSavedProgressRef = useRef<Record<string, number>>({});
  const episode = remoteEpisodes[Math.min(activeEpisodeIndex, remoteEpisodes.length - 1)];
  const isLocked = Boolean(episode?.isLocked && !unlockedEpisodes.includes(episode.number));
  const videoPlayer = useVideoPlayer(playbackUrl ? { uri: playbackUrl } : null, (player) => {
    player.loop = false;
    player.timeUpdateEventInterval = 0.5;
  });
  const progressPercent = durationSeconds > 0 ? Math.min((currentTimeSeconds / durationSeconds) * 100, 100) : 0;

  useEffect(() => {
    if (!playbackUrl || isLocked || isPaused) {
      videoPlayer.pause();
      return;
    }

    videoPlayer.play();
  }, [isLocked, isPaused, playbackUrl, videoPlayer]);

  useEffect(() => {
    setCurrentTimeSeconds(0);
    setDurationSeconds(0);

    const timeSubscription = videoPlayer.addListener('timeUpdate', ({ currentTime }) => {
      setCurrentTimeSeconds(currentTime);
      setDurationSeconds(videoPlayer.duration);
    });
    const sourceSubscription = videoPlayer.addListener('sourceLoad', ({ duration }) => {
      setDurationSeconds(duration);
    });

    return () => {
      timeSubscription.remove();
      sourceSubscription.remove();
    };
  }, [playbackUrl, videoPlayer]);

  useEffect(() => {
    let isMounted = true;

    async function loadRemoteEpisodes() {
      try {
        const seriesId = series.seriesId;
        const episodePayload = await fetchJson<{ episodes: ApiEpisode[] }>(`/api/series/${seriesId}/episodes`);
        if (!isMounted) {
          return;
        }

        setRemoteSeriesTitle(series.title);
        setRemoteEpisodes(
          episodePayload.episodes.map((item, index) => ({
            id: item.id,
            databaseId: item.databaseId,
            seriesTitle: item.seriesTitle,
            number: index + 1,
            title: item.title,
            hook: item.hook ?? '',
            progress: item.progressSeconds > 0 ? 35 : 0,
            isLocked: item.isLocked,
            isFree: item.isFree,
            coinCost: item.coinCost,
          })),
        );
        setActiveEpisodeIndex(0);
      } catch {
        if (isMounted) {
          setRemoteEpisodes([]);
        }
      }
    }

    void loadRemoteEpisodes();

    return () => {
      isMounted = false;
    };
  }, [series.seriesId, series.title]);

  useEffect(() => {
    let isMounted = true;

    async function loadPlayback() {
      setPlaybackUrl(null);
      setPlaybackError('');

      if (!episode?.id || isLocked) {
        return;
      }

      try {
        const payload = await fetchJson<{ playbackUrl: string }>(`/api/episodes/${episode.id}/playback`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (isMounted) {
          setPlaybackUrl(payload.playbackUrl);
        }
      } catch {
        if (isMounted) {
          setPlaybackError('Video is not ready yet.');
        }
      }
    }

    void loadPlayback();

    return () => {
      isMounted = false;
    };
  }, [episode?.id, isLocked]);

  useEffect(() => {
    if (!episode?.id || isLocked || currentTimeSeconds < 5) {
      return;
    }

    const episodeId = episode.id;
    const progressSeconds = Math.floor(currentTimeSeconds);
    const lastSavedProgress = lastSavedProgressRef.current[episodeId] ?? 0;
    if (progressSeconds - lastSavedProgress < 5) {
      return;
    }

    lastSavedProgressRef.current[episodeId] = progressSeconds;
    void fetchJson(`/api/episodes/${episodeId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ progressSeconds }),
    }).catch(() => {
      lastSavedProgressRef.current[episodeId] = lastSavedProgress;
    });
  }, [currentTimeSeconds, episode?.id, isLocked]);

  useEffect(() => {
    let isMounted = true;
    setEngagement({
      likeCount: 0,
      commentCount: 0,
      saveCount: 0,
      hasLiked: false,
      hasSaved: false,
    });
    setComments([]);
    setCommentDraft('');
    setCommentError('');
    setIsCommentsOpen(false);

    async function loadEngagement() {
      if (!episode?.id) {
        return;
      }

      try {
        const payload = await fetchJson<{ engagement: EpisodeEngagement }>(`/api/episodes/${episode.id}/engagement`);
        if (isMounted) {
          setEngagement(payload.engagement);
        }
      } catch {
        // Keep the action buttons usable even if counts cannot be loaded.
      }
    }

    void loadEngagement();

    return () => {
      isMounted = false;
    };
  }, [episode?.id]);

  const loadComments = useCallback(async () => {
    if (!episode?.id) {
      return;
    }

    try {
      const payload = await fetchJson<{ comments: EpisodeComment[] }>(`/api/episodes/${episode.id}/comments`);
      setComments(payload.comments);
      setCommentError('');
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Could not load comments.');
    }
  }, [episode?.id]);

  const toggleReaction = useCallback(async (type: 'like' | 'save') => {
    if (!episode?.id) {
      return;
    }

    const field = type === 'like' ? 'hasLiked' : 'hasSaved';
    const countField = type === 'like' ? 'likeCount' : 'saveCount';
    const nextIsActive = !engagement[field];
    const previousEngagement = engagement;

    setEngagement((currentEngagement) => ({
      ...currentEngagement,
      [field]: nextIsActive,
      [countField]: Math.max(0, currentEngagement[countField] + (nextIsActive ? 1 : -1)),
    }));

    try {
      const payload = await fetchJson<{ engagement: EpisodeEngagement }>(`/api/episodes/${episode.id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ type, isActive: nextIsActive }),
      });
      setEngagement(payload.engagement);
    } catch {
      setEngagement(previousEngagement);
    }
  }, [engagement, episode?.id]);

  const openComments = useCallback(() => {
    setIsCommentsOpen(true);
    void loadComments();
  }, [loadComments]);

  const postComment = useCallback(async () => {
    if (!episode?.id || isPostingComment) {
      return;
    }

    const body = commentDraft.trim();
    if (!body) {
      setCommentError('Write a comment first.');
      return;
    }

    setIsPostingComment(true);
    setCommentError('');

    try {
      const payload = await fetchJson<{
        comment: EpisodeComment;
        engagement: EpisodeEngagement;
      }>(`/api/episodes/${episode.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setComments((currentComments) => [payload.comment, ...currentComments]);
      setEngagement(payload.engagement);
      setCommentDraft('');
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Could not post comment.');
    } finally {
      setIsPostingComment(false);
    }
  }, [commentDraft, episode?.id, isPostingComment]);

  const shareEpisode = useCallback(async () => {
    if (!episode) {
      return;
    }

    await Share.share({
      message: `Watch ${episode.seriesTitle ?? remoteSeriesTitle} Episode ${episode.number}: ${episode.title} on AfroReel.`,
      title: `${episode.seriesTitle ?? remoteSeriesTitle} on AfroReel`,
    });
  }, [episode, remoteSeriesTitle]);

  const moveEpisode = useCallback(
    (direction: 'next' | 'previous') => {
      const offset = direction === 'next' ? 1 : -1;
      setActiveEpisodeIndex((currentIndex) => {
        const nextIndex = Math.min(Math.max(currentIndex + offset, 0), remoteEpisodes.length - 1);
        const nextEpisode = remoteEpisodes[nextIndex];

        if (nextEpisode?.isLocked && !unlockedEpisodes.includes(nextEpisode.number)) {
          setIsUnlockSheetOpen(true);
        }

        return nextIndex;
      });
    },
    [remoteEpisodes, unlockedEpisodes],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 18,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -54) {
            moveEpisode('next');
          } else if (gestureState.dy > 54) {
            moveEpisode('previous');
          }
        },
      }),
    [moveEpisode],
  );

  const unlockCurrentEpisode = async (method: UnlockMethod) => {
    if (!episode) {
      return;
    }

    if (episode.id) {
      try {
        const payload = await fetchJson<{ user?: AuthUser }>(`/api/episodes/${episode.id}/unlock`, {
          method: 'POST',
          body: JSON.stringify({ method }),
        });
        if (payload.user) {
          onUserChange(payload.user);
        }
      } catch {
        return;
      }
    }

    setUnlockedEpisodes((currentEpisodes) => [...currentEpisodes, episode.number]);
    setIsUnlockSheetOpen(false);
  };

  if (!episode) {
    return (
      <View style={styles.playerScreen}>
        <LinearGradient colors={['#4b2949', '#12080f', '#030305']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.playerSafeArea}>
          <View style={styles.playerTopBar}>
            <Pressable style={styles.playerRoundButton} onPress={onClose} accessibilityLabel="Close player">
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Pressable>
          </View>
          <View style={styles.lockedEpisode}>
            <View style={styles.lockedEpisodeIcon}>
              <Ionicons name="play-circle" size={28} color={Colors.textOnPrimary} />
            </View>
            <Text style={styles.lockedEpisodeEyebrow}>LIVE DATA</Text>
            <Text style={styles.lockedEpisodeTitle}>No episodes published yet.</Text>
            <Text style={styles.lockedEpisodeBody}>
              Add live episodes for {series.title} in the online admin to test playback here.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.playerScreen} {...panResponder.panHandlers}>
      <LinearGradient colors={['#4b2949', '#12080f', '#030305']} style={StyleSheet.absoluteFill} />
      <View style={styles.playerBackdrop}>
        {playbackUrl && !isLocked ? (
          <VideoView
            player={videoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        ) : (
          <>
            <View style={styles.playerBackdropGlow} />
            <View style={styles.playerPortrait}>
              <Text style={styles.playerPortraitText}>L</Text>
            </View>
          </>
        )}
      </View>
      <LinearGradient
        colors={['rgba(0,0,0,0.22)', 'transparent', 'rgba(0,0,0,0.88)']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.playerSafeArea}>
          <View style={styles.playerTopBar}>
            <Pressable style={styles.playerRoundButton} onPress={onClose} accessibilityLabel="Close player">
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.coinChip}>
            <Ionicons name="wallet" size={14} color={Colors.textOnPrimary} />
            <Text style={styles.coinChipText}>{(user?.coinBalance ?? 0).toLocaleString()} coins</Text>
          </View>
          <Pressable style={styles.playerRoundButton} accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.text} />
          </Pressable>
        </View>

        {!isLocked ? (
          <Pressable style={styles.playerTapArea} onPress={() => setIsPaused((paused) => !paused)}>
            {isPaused ? (
              <View style={styles.playerPauseIcon}>
                <Ionicons name="play" size={34} color={Colors.textOnPrimary} />
              </View>
            ) : null}
          </Pressable>
        ) : null}

        {!isLocked ? (
          <>
            <View style={styles.playerDetails}>
              <Text style={styles.playerSeries}>{episode.seriesTitle ?? remoteSeriesTitle}</Text>
              <Text style={styles.playerEpisode}>
                Episode {episode.number} / {episode.title}
              </Text>
              <Text style={styles.playerHook}>{episode.hook}</Text>
              {playbackError ? <Text style={styles.playerSwipeHint}>{playbackError}</Text> : null}
              <Text style={styles.playerSwipeHint}>Swipe up for the next episode</Text>
            </View>

            <View style={styles.playerActions}>
              <PlayerAction
                label={formatCompactCount(engagement.likeCount)}
                icon="heart"
                isActive={engagement.hasLiked}
                activeColor={Colors.danger}
                accessibilityLabel="Like episode"
                onPress={() => toggleReaction('like')}
              />
              <PlayerAction
                label={formatCompactCount(engagement.commentCount)}
                icon="chatbubble"
                accessibilityLabel="Open comments"
                onPress={openComments}
              />
              <PlayerAction
                label="Share"
                icon="arrow-redo"
                accessibilityLabel="Share episode"
                onPress={shareEpisode}
              />
              <PlayerAction
                label={formatCompactCount(engagement.saveCount)}
                icon="bookmark"
                isActive={engagement.hasSaved}
                activeColor={Colors.primary}
                accessibilityLabel="Save episode"
                onPress={() => toggleReaction('save')}
              />
            </View>

            <View style={styles.playerProgressArea}>
              <View style={styles.playerProgressMeta}>
                <Text style={styles.playerProgressText}>{formatPlaybackTime(currentTimeSeconds)}</Text>
                <Text style={styles.playerProgressText}>{formatPlaybackTime(durationSeconds)}</Text>
              </View>
              <View style={styles.playerProgressTrack}>
                <View style={[styles.playerProgressFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>
          </>
        ) : (
          <View style={styles.lockedEpisode}>
            <View style={styles.lockedEpisodeIcon}>
              <Text style={styles.lockedEpisodeIconText}>L</Text>
            </View>
            <Text style={styles.lockedEpisodeEyebrow}>EPISODE {episode.number}</Text>
            <Text style={styles.lockedEpisodeTitle}>Unlock the next reveal.</Text>
            <Text style={styles.lockedEpisodeBody}>
              {episode.hook || `${episode.title} is ready to unlock from the database.`}
            </Text>
            <Pressable style={styles.lockedEpisodeButton} onPress={() => setIsUnlockSheetOpen(true)}>
              <Text style={styles.primaryButtonText}>Continue the drama</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      {isUnlockSheetOpen ? (
        <UnlockSheet
          episodeNumber={episode.number}
          onClose={() => setIsUnlockSheetOpen(false)}
          onUnlock={unlockCurrentEpisode}
          coinCost={episode.coinCost ?? 5}
        />
      ) : null}

      {isCommentsOpen ? (
        <CommentsSheet
          comments={comments}
          commentDraft={commentDraft}
          commentError={commentError}
          isPostingComment={isPostingComment}
          onChangeDraft={setCommentDraft}
          onClose={() => setIsCommentsOpen(false)}
          onPost={postComment}
          onRefresh={loadComments}
        />
      ) : null}
    </View>
  );
}

function SeriesDetailScreen({
  series,
  onBack,
  onStartWatching,
  onRefreshCatalog,
  isRefreshingCatalog,
}: {
  series: Drama;
  onBack: () => void;
  onStartWatching: () => void;
  onRefreshCatalog: () => Promise<void>;
  isRefreshingCatalog: boolean;
}) {
  const [episodes, setEpisodes] = useState<PlayerEpisode[]>([]);
  const [isRefreshingEpisodes, setIsRefreshingEpisodes] = useState(false);

  const loadEpisodes = useCallback(async () => {
    if (!series.databaseId) {
      return [];
    }

    const payload = await fetchJson<{ episodes: ApiEpisode[] }>(`/api/series/${series.databaseId}/episodes`);

    return payload.episodes.map((item, index) => ({
      id: item.id,
      databaseId: item.databaseId,
      seriesTitle: item.seriesTitle,
      number: index + 1,
      title: item.title,
      hook: item.hook ?? '',
      progress: item.progressSeconds > 0 ? 35 : 0,
      isLocked: item.isLocked,
      isFree: item.isFree,
      coinCost: item.coinCost,
    }));
  }, [series.databaseId]);

  const refreshSeriesDetail = useCallback(async () => {
    setIsRefreshingEpisodes(true);

    try {
      const [nextEpisodes] = await Promise.all([loadEpisodes(), onRefreshCatalog()]);
      setEpisodes(nextEpisodes);
    } catch {
      setEpisodes([]);
    } finally {
      setIsRefreshingEpisodes(false);
    }
  }, [loadEpisodes, onRefreshCatalog]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialEpisodes() {
      try {
        const nextEpisodes = await loadEpisodes();

        if (!isMounted) {
          return;
        }

        setEpisodes(nextEpisodes);
      } catch {
        if (isMounted) {
          setEpisodes([]);
        }
      }
    }

    void loadInitialEpisodes();

    return () => {
      isMounted = false;
    };
  }, [loadEpisodes]);

  const episodeCount = episodes.length;
  const episodeCountLabel = `${episodeCount} ${episodeCount === 1 ? 'episode' : 'episodes'}`;

  return (
    <View style={styles.detailScreen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.detailContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingCatalog || isRefreshingEpisodes}
            onRefresh={refreshSeriesDetail}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.detailHero}>
          <PosterVisual drama={series} isHero />
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'transparent', Colors.background]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={styles.detailTopBar}>
              <Pressable style={styles.playerRoundButton} onPress={onBack} accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Pressable>
            <Pressable style={styles.playerRoundButton} accessibilityLabel="More options">
              <Ionicons name="ellipsis-horizontal" size={22} color={Colors.text} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.detailInfo}>
          <View style={styles.detailTagRow}>
            {series.tags.slice(0, 3).map((tag) => (
              <Text key={`${series.id}-${tag}`} style={styles.detailTag}>{tag.toUpperCase()}</Text>
            ))}
          </View>
          <Text style={styles.detailTitle}>{series.title}</Text>
          <Text style={styles.detailMeta}>4.8 rating  /  {episodeCountLabel}  /  {series.status}</Text>
          <Text style={styles.detailSynopsis}>{series.mood}</Text>
          <Pressable style={styles.detailWatchButton} onPress={onStartWatching}>
            <Text style={styles.primaryButtonText}>Start Watching</Text>
          </Pressable>
        </View>

        <View style={styles.detailEpisodeHeader}>
          <View>
            <Text style={styles.sectionTitle}>Episodes</Text>
            <Text style={styles.detailEpisodeSub}>
              {episodeCount > 0 ? `${episodeCountLabel} uploaded.` : 'No uploaded episodes found.'}
            </Text>
          </View>
          <Text style={styles.detailSort}>Newest</Text>
        </View>

        <View style={styles.detailEpisodeList}>
          {episodes.length > 0 ? episodes.map((episode) => (
            <EpisodeRow key={episode.number} episode={episode} onPress={onStartWatching} />
          )) : (
            <Text style={styles.detailSynopsis}>No live episodes are published for this series yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function EpisodeRow({ episode, onPress }: { episode: PlayerEpisode; onPress: () => void }) {
  const isFree = Boolean(episode.isFree);

  return (
    <Pressable style={styles.episodeRow} onPress={onPress}>
      <LinearGradient colors={['#42275e', '#160b1d']} style={styles.episodeThumb}>
        <Text style={styles.episodeThumbText}>{episode.number}</Text>
      </LinearGradient>
      <View style={styles.episodeCopy}>
        <Text style={styles.episodeTitle}>Episode {episode.number}: {episode.title}</Text>
        <Text style={styles.episodeHook} numberOfLines={1}>{episode.hook}</Text>
        {episode.progress > 0 ? (
          <View style={styles.episodeProgressTrack}>
            <View style={[styles.episodeProgressFill, { width: `${episode.progress}%` }]} />
          </View>
        ) : null}
      </View>
      {isFree ? (
        <View style={[styles.episodeBadge, styles.episodeBadgeFree]}>
          <Text style={[styles.episodeBadgeText, styles.episodeBadgeTextFree]}>FREE</Text>
        </View>
      ) : (
        <View style={[styles.episodeBadge, styles.episodeBadgeLocked]}>
          <Text style={[styles.episodeBadgeText, styles.episodeBadgeTextLocked]}>{episode.coinCost ?? 0}</Text>
          <Ionicons name="cash" size={10} color={Colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

function PlayerAction({
  label,
  icon,
  isActive = false,
  activeColor = Colors.primary,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  icon: IconName;
  isActive?: boolean;
  activeColor?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.playerAction} onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <View style={[styles.playerActionIcon, isActive && styles.playerActionIconActive]}>
        <Ionicons name={icon} size={20} color={isActive ? activeColor : Colors.text} />
      </View>
      <Text style={[styles.playerActionLabel, isActive && styles.playerActionLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function CommentsSheet({
  comments,
  commentDraft,
  commentError,
  isPostingComment,
  onChangeDraft,
  onClose,
  onPost,
  onRefresh,
}: {
  comments: EpisodeComment[];
  commentDraft: string;
  commentError: string;
  isPostingComment: boolean;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onPost: () => void;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.commentsOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.commentsSheet}>
        <View style={styles.unlockHandle} />
        <View style={styles.commentsHeader}>
          <View>
            <Text style={styles.unlockEyebrow}>REACTIONS</Text>
            <Text style={styles.commentsTitle}>Comments</Text>
          </View>
          <Pressable style={styles.playerRoundButton} onPress={onClose} accessibilityLabel="Close comments">
            <Ionicons name="close" size={20} color={Colors.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.commentsList} contentContainerStyle={styles.commentsListContent}>
          {comments.length > 0 ? comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>{comment.authorName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.commentCopy}>
                <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                <Text style={styles.commentBody}>{comment.body}</Text>
                <Text style={styles.commentTime}>{formatNotificationDate(comment.createdAt)}</Text>
              </View>
            </View>
          )) : (
            <View style={styles.commentsEmpty}>
              <Text style={styles.commentsEmptyTitle}>No comments yet</Text>
              <Text style={styles.commentsEmptyBody}>Start the conversation on this episode.</Text>
            </View>
          )}
        </ScrollView>

        {commentError ? <Text style={styles.authError}>{commentError}</Text> : null}

        <View style={styles.commentComposer}>
          <TextInput
            value={commentDraft}
            onChangeText={onChangeDraft}
            placeholder="Add a comment"
            placeholderTextColor={Colors.textDim}
            selectionColor={Colors.primary}
            style={styles.commentInput}
            maxLength={500}
            multiline
          />
          <Pressable
            style={[styles.commentPostButton, isPostingComment && styles.authContinueButtonDisabled]}
            onPress={onPost}
            disabled={isPostingComment}
            accessibilityLabel="Post comment"
          >
            <Ionicons name={isPostingComment ? 'hourglass' : 'send'} size={18} color={Colors.textOnPrimary} />
          </Pressable>
        </View>

        <Pressable style={styles.commentsRefreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={14} color={Colors.primary} />
          <Text style={styles.commentsRefreshText}>Refresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UnlockSheet({
  episodeNumber,
  coinCost,
  onClose,
  onUnlock,
}: {
  episodeNumber: number;
  coinCost: number;
  onClose: () => void;
  onUnlock: (method: UnlockMethod) => void;
}) {
  return (
    <View style={styles.unlockOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.unlockSheet}>
        <View style={styles.unlockHandle} />
        <Text style={styles.unlockEyebrow}>EPISODE {episodeNumber} IS LOCKED</Text>
        <Text style={styles.unlockTitle}>Continue the drama.</Text>
        <Text style={styles.unlockBody}>
          You are one unlock away from what happens next.
        </Text>

        <Pressable style={styles.unlockOption} onPress={() => onUnlock('ad')}>
          <View style={styles.unlockOptionIcon}>
            <Ionicons name="play-circle" size={20} color={Colors.primary} />
          </View>
          <View style={styles.unlockOptionCopy}>
            <Text style={styles.unlockOptionTitle}>Watch a short ad</Text>
            <Text style={styles.unlockOptionBody}>Earn enough coins and keep watching</Text>
          </View>
          <Text style={styles.unlockOptionReward}>+5</Text>
        </Pressable>

        <Pressable style={[styles.unlockOption, styles.unlockOptionFeatured]} onPress={() => onUnlock('coins')}>
          <View style={styles.unlockOptionIcon}>
            <Ionicons name="wallet" size={20} color={Colors.primary} />
          </View>
          <View style={styles.unlockOptionCopy}>
            <Text style={styles.unlockOptionTitle}>Unlock now</Text>
            <Text style={styles.unlockOptionBody}>Use your current coin balance</Text>
          </View>
          <Text style={styles.unlockOptionPrice}>{coinCost} coins</Text>
        </Pressable>

        <Pressable style={styles.unlockLater} onPress={onClose}>
          <Text style={styles.unlockLaterText}>Maybe later</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BottomNav({
  activeTab,
  onChange,
}: {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const isActive = tab === activeTab;

        return (
          <Pressable key={tab} style={styles.navItem} onPress={() => onChange(tab)}>
            <View style={[styles.navIcon, isActive && styles.navIconActive]}>
              <Ionicons
                name={tabIcons[tab]}
                size={18}
                color={isActive ? Colors.primary : Colors.textDim}
              />
            </View>
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
              {tab}
            </Text>
            {isActive ? <View style={styles.navDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function DramaRail({
  title,
  data,
  variant,
  emptyMessage,
  onSeeAll,
  onOpenSeries,
}: {
  title: string;
  data: Drama[];
  variant?: 'progress' | 'free';
  emptyMessage?: string;
  onSeeAll?: () => void;
  onOpenSeries?: (series: Drama) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={onSeeAll}>
          <Text style={styles.sectionAction}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
      >
        {data.length === 0 ? (
          <View style={styles.railEmpty}>
            <Text style={styles.railEmptyText}>{emptyMessage ?? 'No titles found.'}</Text>
          </View>
        ) : data.map((drama) => (
          <Pressable
            key={`${title}-${drama.id}`}
            style={styles.posterCard}
            onPress={() => onOpenSeries?.(drama)}
          >
            <PosterVisual drama={drama} />
            {variant === 'free' || drama.isFree ? (
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>FREE</Text>
              </View>
            ) : null}
            {drama.isLocked ? (
              <View style={styles.lockBadge}>
                <Text style={styles.lockBadgeText}>LOCKED</Text>
              </View>
            ) : null}
            <LinearGradient
              colors={['transparent', Colors.overlayHeavy]}
              style={styles.posterFade}
            />
            <View style={styles.posterCopy}>
              <Text style={styles.posterTitle} numberOfLines={2}>
                {drama.title}
              </Text>
              <Text style={styles.posterMeta} numberOfLines={1}>
                {drama.episodeCount} eps
              </Text>
              {variant === 'progress' && typeof drama.progress === 'number' ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${drama.progress}%` }]} />
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function PosterVisual({ drama, isHero = false }: { drama: Drama; isHero?: boolean }) {
  if (drama.posterImage) {
    return (
      <ImageBackground
        source={drama.posterImage}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      >
        <View style={[styles.posterRim, isHero && styles.heroPosterRim]} />
      </ImageBackground>
    );
  }

  return (
    <LinearGradient colors={drama.posterGradient} style={StyleSheet.absoluteFill}>
      <View style={[styles.posterMark, isHero && styles.heroPosterMark]}>
        <Text style={[styles.posterInitial, isHero && styles.heroPosterInitial]}>
          {drama.title.charAt(0)}
        </Text>
      </View>
      <View style={[styles.posterRim, isHero && styles.heroPosterRim]} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  splashScreen: {
    alignItems: 'center',
    backgroundColor: Colors.background,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  splashImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  splashContent: {
    alignItems: 'center',
    marginTop: 116,
  },
  splashBrand: {
    color: Colors.text,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: 0,
  },
  splashEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[3],
  },
  splashFooter: {
    alignItems: 'center',
    bottom: 0,
    left: 0,
    paddingBottom: Spacing[4],
    position: 'absolute',
    right: 0,
  },
  splashLoader: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginBottom: Spacing[5],
  },
  splashLoaderDot: {
    backgroundColor: Colors.textDim,
    borderRadius: Radius.full,
    height: 6,
    width: 6,
  },
  splashLoaderDotActive: {
    backgroundColor: Colors.primary,
    transform: [{ scale: 1.25 }],
  },
  splashTagline: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  onboardingScreen: {
    backgroundColor: Colors.background,
    flex: 1,
    overflow: 'hidden',
  },
  onboardingImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  onboardingSafeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  onboardingTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
  },
  onboardingBrand: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
  },
  onboardingSkip: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
    opacity: 0.82,
  },
  onboardingContent: {
    marginTop: 'auto',
    paddingBottom: SafeArea.bottom + Spacing[5],
    paddingHorizontal: Spacing[6],
  },
  onboardingDots: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginBottom: Spacing[5],
  },
  onboardingDot: {
    backgroundColor: 'rgba(245,200,66,0.32)',
    borderRadius: Radius.full,
    height: 4,
    width: 10,
  },
  onboardingDotActive: {
    backgroundColor: Colors.primary,
    width: 30,
  },
  onboardingEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: Spacing[3],
  },
  onboardingTitle: {
    color: Colors.text,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 44,
    maxWidth: 345,
  },
  onboardingBody: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: Spacing[4],
    maxWidth: 340,
  },
  onboardingButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing[6],
    minHeight: 56,
    paddingHorizontal: Spacing[5],
  },
  onboardingButtonText: {
    color: Colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  onboardingButtonArrow: {
    color: Colors.textOnPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: Spacing[2],
  },
  authScreen: {
    backgroundColor: Colors.background,
    flex: 1,
    overflow: 'hidden',
  },
  authSafeArea: {
    flex: 1,
  },
  authImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  authContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: SafeArea.bottom + Spacing[5],
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[10],
  },
  authBrandBlock: {
    alignItems: 'center',
    marginBottom: Spacing[8],
  },
  authBrand: {
    color: Colors.primary,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0,
  },
  authEyebrow: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[2],
  },
  authForm: {
    backgroundColor: 'rgba(19,19,26,0.94)',
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing[5],
  },
  authTitle: {
    color: Colors.text,
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: 0,
  },
  authSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: Spacing[5],
    marginTop: Spacing[2],
  },
  authFieldLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: Spacing[2],
    marginTop: Spacing[3],
  },
  authInput: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    minHeight: 50,
    paddingHorizontal: Spacing[4],
  },
  authForgot: {
    alignSelf: 'flex-end',
    marginTop: Spacing[3],
  },
  authForgotText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  authError: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: Spacing[4],
  },
  authContinueButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
    marginTop: Spacing[5],
    minHeight: 52,
  },
  authContinueButtonDisabled: {
    opacity: 0.68,
  },
  authDivider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing[3],
    marginVertical: Spacing[5],
  },
  authDividerLine: {
    backgroundColor: Colors.border,
    flex: 1,
    height: 1,
  },
  authDividerText: {
    color: Colors.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0,
  },
  authSocialRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  authSocialButton: {
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing[2],
    justifyContent: 'center',
    minHeight: 48,
  },
  authSocialButtonDisabled: {
    opacity: 0.48,
  },
  authSocialMark: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  authSocialText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  authToggleRow: {
    flexDirection: 'row',
    gap: Spacing[1],
    justifyContent: 'center',
    marginTop: Spacing[5],
  },
  authToggleCopy: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  authToggleAction: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  walletHero: {
    alignItems: 'center',
    minHeight: 280,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[6],
  },
  walletEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  walletCoinMark: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: 58,
    justifyContent: 'center',
    marginTop: Spacing[5],
    ...Shadow.gold,
    width: 58,
  },
  walletCoinMarkText: {
    color: Colors.textOnPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  walletBalance: {
    color: Colors.primary,
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[3],
  },
  walletBalanceLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: -Spacing[2],
  },
  walletHint: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing[3],
  },
  walletSectionHeader: {
    paddingBottom: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[6],
  },
  walletSectionCopy: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  packageList: {
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
  },
  packageCard: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 76,
    paddingHorizontal: Spacing[4],
  },
  packageCardSelected: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primary,
  },
  packageCoinMark: {
    alignItems: 'center',
    backgroundColor: 'rgba(245,200,66,0.13)',
    borderRadius: Radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  packageCoinMarkText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  packageCopy: {
    flex: 1,
  },
  packageTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  packageName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  packageBonus: {
    backgroundColor: Colors.successBg,
    borderRadius: Radius.full,
    color: Colors.success,
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
  },
  packageCoins: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: Spacing[1],
  },
  packagePrice: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  walletPurchaseButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: Spacing[2],
    justifyContent: 'center',
    marginHorizontal: Spacing[5],
    minHeight: 52,
  },
  earnList: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
  },
  earnRow: {
    alignItems: 'center',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 72,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  earnRowDisabled: {
    opacity: 0.58,
  },
  earnIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    borderRadius: Radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  earnIconText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  earnCopy: {
    flex: 1,
  },
  earnLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  earnDescription: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  rewardBadge: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success,
    borderRadius: Radius.full,
    borderWidth: 1,
    minWidth: 44,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
  },
  rewardBadgeDisabled: {
    backgroundColor: Colors.backgroundSurface,
    borderColor: Colors.border,
  },
  rewardText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  rewardTextDisabled: {
    color: Colors.textMuted,
  },
  walletHistoryList: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
  },
  walletHistoryState: {
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  walletHistoryRow: {
    alignItems: 'center',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 72,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  walletHistoryIcon: {
    alignItems: 'center',
    borderRadius: Radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  walletHistoryIconCredit: {
    backgroundColor: Colors.successBg,
  },
  walletHistoryIconSpend: {
    backgroundColor: Colors.primaryBg,
  },
  walletHistoryCopy: {
    flex: 1,
  },
  walletHistoryTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  walletHistoryMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  walletHistoryAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  walletHistoryAmountCredit: {
    color: Colors.success,
  },
  walletHistoryAmountSpend: {
    color: Colors.primary,
  },
  paymentScreen: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  paymentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
  },
  paymentHeaderCopy: {
    flex: 1,
  },
  paymentContent: {
    paddingBottom: SafeArea.bottom + Spacing[6],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[6],
  },
  paymentSectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: Spacing[3],
    marginTop: Spacing[3],
  },
  paymentPackageList: {
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  paymentPackage: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: Spacing[4],
  },
  paymentPackageSelected: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primary,
  },
  paymentMethodList: {
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  paymentMethod: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 74,
    paddingHorizontal: Spacing[4],
  },
  paymentMethodSelected: {
    backgroundColor: Colors.primaryBg,
  },
  paymentMethodDisabled: {
    opacity: 0.52,
  },
  paymentMethodIcon: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundSurface,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  paymentMethodIconText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  paymentMethodCopy: {
    flex: 1,
  },
  paymentMethodLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  paymentMethodDescription: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  paymentRadio: {
    alignItems: 'center',
    borderColor: Colors.borderActive,
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  paymentRadioSelected: {
    borderColor: Colors.primary,
  },
  paymentRadioDot: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: 10,
    width: 10,
  },
  paymentSummary: {
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing[3],
    marginTop: Spacing[6],
    padding: Spacing[4],
  },
  paymentSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentSummaryLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  paymentSummaryValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  paymentSummaryTotal: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  paymentSecurity: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: Spacing[4],
    textAlign: 'center',
  },
  paymentButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
    marginTop: Spacing[5],
    minHeight: 54,
  },
  paymentSuccessScreen: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  paymentSuccessSafeArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  paymentSuccessIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: 88,
    justifyContent: 'center',
    ...Shadow.gold,
    width: 88,
  },
  paymentSuccessIconText: {
    color: Colors.textOnPrimary,
    fontSize: 36,
    fontWeight: '700',
  },
  paymentSuccessEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[6],
  },
  paymentSuccessTitle: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[3],
    textAlign: 'center',
  },
  paymentSuccessBody: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: Spacing[3],
    textAlign: 'center',
  },
  paymentSuccessButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
    marginTop: Spacing[6],
    minHeight: 52,
    paddingHorizontal: Spacing[6],
  },
  notificationsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
  },
  notificationsClear: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  notificationList: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    marginTop: Spacing[4],
  },
  notificationRow: {
    alignItems: 'flex-start',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 86,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    position: 'relative',
  },
  notificationIcon: {
    alignItems: 'center',
    backgroundColor: Colors.dangerBg,
    borderColor: 'rgba(232,68,90,0.35)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  notificationIconGold: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryBorder,
  },
  notificationIconText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  notificationIconTextGold: {
    color: Colors.primary,
  },
  notificationCopy: {
    flex: 1,
  },
  notificationTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing[2],
    justifyContent: 'space-between',
  },
  notificationTitle: {
    color: Colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  notificationTime: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '700',
  },
  notificationBody: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: Spacing[1],
    paddingRight: Spacing[2],
  },
  notificationUnreadDot: {
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    height: 7,
    position: 'absolute',
    right: Spacing[3],
    top: Spacing[3],
    width: 7,
  },
  profileHero: {
    alignItems: 'center',
    minHeight: 248,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[6],
  },
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.full,
    borderWidth: 4,
    height: 84,
    justifyContent: 'center',
    ...Shadow.gold,
    width: 84,
  },
  profileAvatarText: {
    color: Colors.textOnPrimary,
    fontSize: 36,
    fontWeight: '700',
  },
  profileName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[4],
  },
  profileEmail: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  profileEditButton: {
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginTop: Spacing[4],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  profileEditText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  profileStats: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderBottomColor: Colors.border,
    borderTopColor: Colors.border,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: Spacing[5],
    marginTop: -Spacing[3],
    minHeight: 76,
  },
  profileStat: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  profileStatValue: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  profileStatLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: Spacing[1],
    textTransform: 'uppercase',
  },
  profileStatDivider: {
    backgroundColor: Colors.border,
    height: 34,
    width: 1,
  },
  profileSection: {
    marginTop: Spacing[6],
  },
  profileSectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    paddingBottom: Spacing[3],
    paddingHorizontal: Spacing[5],
    textTransform: 'uppercase',
  },
  profileRowList: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
  },
  profileRow: {
    alignItems: 'center',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 72,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  profileRowIcon: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  profileRowIconText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  profileRowCopy: {
    flex: 1,
  },
  profileRowLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  profileRowDescription: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  profileRowArrow: {
    color: Colors.textDim,
    fontSize: 18,
    fontWeight: '700',
  },
  profileLogoutArea: {
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[7],
  },
  profileLogoutButton: {
    alignItems: 'center',
    borderColor: 'rgba(232,68,90,0.38)',
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    width: '100%',
  },
  profileLogoutText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  profileVersion: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    marginTop: Spacing[4],
  },
  continueScreen: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  continueHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
  },
  continueHeaderCopy: {
    flex: 1,
  },
  continueContent: {
    gap: Spacing[4],
    paddingBottom: SafeArea.bottom + Spacing[6],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
  },
  categoryScreen: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  categoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
  },
  categoryHeaderCopy: {
    flex: 1,
  },
  categoryContent: {
    paddingBottom: SafeArea.bottom + Spacing[6],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
  },
  continueIntro: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: Spacing[1],
  },
  continueCard: {
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  continueArtwork: {
    height: Size.continueCardHeight,
    overflow: 'hidden',
    position: 'relative',
  },
  continueArtworkCopy: {
    bottom: 0,
    left: 0,
    padding: Spacing[4],
    position: 'absolute',
    right: 0,
  },
  continueCardTitle: {
    color: Colors.text,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
  },
  continueCardMeta: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: Spacing[1],
  },
  continueCardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[4],
  },
  continueCardFooterCopy: {
    flex: 1,
  },
  continueUpdated: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  profileActivityHook: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  continueProgressTrack: {
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    height: 3,
    marginTop: Spacing[2],
    overflow: 'hidden',
  },
  continueProgressFill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: '100%',
  },
  continueResumeButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: Spacing[4],
  },
  continueResumeText: {
    color: Colors.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  playerScreen: {
    backgroundColor: Colors.black,
    flex: 1,
    overflow: 'hidden',
  },
  playerBackdrop: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  playerBackdropGlow: {
    backgroundColor: 'rgba(232,68,90,0.14)',
    borderRadius: Radius.full,
    height: 430,
    position: 'absolute',
    width: 430,
  },
  playerPortrait: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 244,
    justifyContent: 'center',
    width: 244,
  },
  playerPortraitText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 136,
    fontWeight: '700',
  },
  playerSafeArea: {
    flex: 1,
  },
  playerTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
  },
  playerRoundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  playerRoundButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  coinChip: {
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing[2],
    minHeight: 34,
    paddingHorizontal: Spacing[3],
  },
  coinChipMark: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  coinChipText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  playerTapArea: {
    bottom: 126,
    left: 0,
    position: 'absolute',
    right: 74,
    top: 92,
  },
  playerPauseIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.46)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 78,
    justifyContent: 'center',
    marginTop: '60%',
    width: 78,
  },
  playerPauseIconText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  playerDetails: {
    bottom: 64,
    left: Spacing[5],
    maxWidth: Screen.width - 116,
    position: 'absolute',
  },
  playerSeries: {
    color: Colors.white,
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: 0,
  },
  playerEpisode: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: Spacing[2],
  },
  playerHook: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: Spacing[2],
  },
  playerSwipeHint: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: Spacing[3],
  },
  playerActions: {
    bottom: 112,
    gap: Spacing[4],
    position: 'absolute',
    right: Spacing[4],
  },
  playerAction: {
    alignItems: 'center',
    gap: Spacing[1],
  },
  playerActionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  playerActionIconActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.42)',
  },
  playerActionIconText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  playerActionLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '800',
  },
  playerActionLabelActive: {
    color: Colors.white,
  },
  playerProgressArea: {
    bottom: 22,
    left: Spacing[5],
    position: 'absolute',
    right: Spacing[5],
  },
  playerProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  playerProgressText: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 10,
    fontWeight: '700',
  },
  playerProgressTrack: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.full,
    height: 3,
    overflow: 'hidden',
  },
  playerProgressFill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: '100%',
  },
  lockedEpisode: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  lockedEpisodeIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    marginBottom: Spacing[5],
    width: 72,
  },
  lockedEpisodeIconText: {
    color: Colors.primary,
    fontSize: 28,
    fontWeight: '700',
  },
  lockedEpisodeEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  lockedEpisodeTitle: {
    color: Colors.white,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[3],
    textAlign: 'center',
  },
  lockedEpisodeBody: {
    color: Colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: Spacing[3],
    textAlign: 'center',
  },
  lockedEpisodeButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
    marginTop: Spacing[6],
    minHeight: 52,
    paddingHorizontal: Spacing[6],
  },
  unlockOverlay: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  unlockSheet: {
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderTopWidth: 1,
    paddingBottom: SafeArea.bottom + Spacing[5],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
  },
  unlockHandle: {
    alignSelf: 'center',
    backgroundColor: Colors.borderActive,
    borderRadius: Radius.full,
    height: 4,
    marginBottom: Spacing[5],
    width: 38,
  },
  unlockEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  unlockTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[2],
  },
  unlockBody: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing[5],
    marginTop: Spacing[2],
  },
  unlockOption: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundSurface,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    marginBottom: Spacing[3],
    minHeight: 72,
    paddingHorizontal: Spacing[4],
  },
  unlockOptionFeatured: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryBorder,
  },
  unlockOptionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(245,200,66,0.12)',
    borderRadius: Radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  unlockOptionIconText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  unlockOptionCopy: {
    flex: 1,
  },
  unlockOptionTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  unlockOptionBody: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  unlockOptionReward: {
    color: Colors.success,
    fontSize: 16,
    fontWeight: '700',
  },
  unlockOptionPrice: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  commentsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.54)',
    justifyContent: 'flex-end',
  },
  commentsSheet: {
    backgroundColor: Colors.backgroundSurface,
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    maxHeight: '76%',
    paddingBottom: SafeArea.bottom + Spacing[5],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
  },
  commentsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing[4],
  },
  commentsTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
  },
  commentsList: {
    maxHeight: 320,
  },
  commentsListContent: {
    gap: Spacing[4],
    paddingBottom: Spacing[4],
  },
  commentRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing[3],
  },
  commentAvatar: {
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    borderRadius: Radius.full,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  commentAvatarText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  commentCopy: {
    flex: 1,
    gap: Spacing[1],
  },
  commentAuthor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  commentBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  commentTime: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  commentsEmpty: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing[5],
  },
  commentsEmptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  commentsEmptyBody: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing[2],
    textAlign: 'center',
  },
  commentComposer: {
    alignItems: 'flex-end',
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[3],
    padding: Spacing[2],
  },
  commentInput: {
    color: Colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    maxHeight: 96,
    minHeight: 42,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
  },
  commentPostButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  commentsRefreshButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: Spacing[1],
    marginTop: Spacing[3],
  },
  commentsRefreshText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  unlockLater: {
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  unlockLaterText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  detailScreen: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  detailContent: {
    paddingBottom: SafeArea.bottom + Spacing[8],
  },
  detailHero: {
    height: 344,
    overflow: 'hidden',
    position: 'relative',
  },
  detailArtwork: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  detailArtworkHalo: {
    backgroundColor: 'rgba(245,200,66,0.08)',
    borderRadius: Radius.full,
    height: 300,
    position: 'absolute',
    width: 300,
  },
  detailArtworkPortrait: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 196,
    justifyContent: 'center',
    width: 196,
  },
  detailArtworkText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 112,
    fontWeight: '700',
  },
  detailTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
  },
  detailInfo: {
    marginTop: -44,
    paddingHorizontal: Spacing[5],
  },
  detailTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  detailTag: {
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    borderWidth: 1,
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
  },
  detailTitle: {
    color: Colors.text,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0,
  },
  detailMeta: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: Spacing[2],
  },
  detailSynopsis: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: Spacing[4],
  },
  detailWatchButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
    marginTop: Spacing[5],
    minHeight: 52,
  },
  detailEpisodeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing[7],
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
  },
  detailEpisodeSub: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  detailSort: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  detailEpisodeList: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
  },
  episodeRow: {
    alignItems: 'center',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 84,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  episodeThumb: {
    alignItems: 'center',
    borderRadius: Radius.sm,
    height: Size.episodeThumbHeight,
    justifyContent: 'center',
    overflow: 'hidden',
    width: Size.episodeThumbWidth,
  },
  episodeThumbText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 20,
    fontWeight: '700',
  },
  episodeCopy: {
    flex: 1,
  },
  episodeTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  episodeHook: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  episodeProgressTrack: {
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    height: 3,
    marginTop: Spacing[2],
    overflow: 'hidden',
  },
  episodeProgressFill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: '100%',
  },
  episodeBadge: {
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
  },
  episodeBadgeFree: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success,
  },
  episodeBadgeLocked: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryBorder,
  },
  episodeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  episodeBadgeTextFree: {
    color: Colors.success,
  },
  episodeBadgeTextLocked: {
    color: Colors.primary,
  },
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: Size.bottomNavHeight + SafeArea.bottom + Spacing[6],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[4],
  },
  discoverHeader: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[4],
  },
  eyebrow: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: Spacing[1],
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing[3],
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundSurface,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  iconText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarText: {
    color: Colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  heroCard: {
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: Size.heroCardHeight + 26,
    marginHorizontal: Spacing[5],
    overflow: 'hidden',
    position: 'relative',
    ...Shadow.lg,
  },
  heroCopy: {
    bottom: 0,
    left: 0,
    padding: Spacing[5],
    position: 'absolute',
    right: 0,
  },
  featuredPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.full,
    borderWidth: 1,
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
  },
  heroMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing[1],
  },
  heroMood: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: Spacing[2],
    maxWidth: 290,
    opacity: 0.88,
  },
  heroActions: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[4],
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: Spacing[5],
  },
  primaryButtonText: {
    color: Colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    marginTop: Spacing[6],
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  sectionAction: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  resultCount: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  railContent: {
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
  },
  railEmpty: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 82,
    paddingHorizontal: Spacing[4],
    width: Screen.width - Spacing[10],
  },
  railEmptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  posterCard: {
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    height: Size.dramaCardHeight,
    overflow: 'hidden',
    position: 'relative',
    width: Size.dramaCardWidth,
  },
  posterFade: {
    bottom: 0,
    height: 92,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  posterCopy: {
    bottom: 0,
    left: 0,
    padding: Spacing[2],
    position: 'absolute',
    right: 0,
  },
  posterTitle: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  posterMeta: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: Spacing[1],
  },
  freeBadge: {
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
    left: Spacing[2],
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    position: 'absolute',
    top: Spacing[2],
  },
  freeBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  lockBadge: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    position: 'absolute',
    right: Spacing[2],
    top: Spacing[2],
  },
  lockBadgeText: {
    color: Colors.primary,
    fontSize: 9,
    fontWeight: '700',
  },
  progressTrack: {
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    height: 3,
    marginTop: Spacing[2],
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: '100%',
  },
  posterMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    marginTop: 42,
    width: 64,
  },
  heroPosterMark: {
    height: 112,
    marginTop: 34,
    width: 112,
  },
  posterInitial: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: 32,
    fontWeight: '700',
  },
  heroPosterInitial: {
    fontSize: 58,
  },
  posterRim: {
    borderColor: 'rgba(245,200,66,0.16)',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 144,
    left: -36,
    position: 'absolute',
    top: -28,
    width: 144,
  },
  heroPosterRim: {
    height: 260,
    left: -70,
    top: -74,
    width: 260,
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: Colors.backgroundSurface,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing[3],
    minHeight: 52,
    marginHorizontal: Spacing[5],
    paddingHorizontal: Spacing[4],
  },
  searchGlyph: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  searchInput: {
    color: Colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    minHeight: 48,
    padding: 0,
  },
  filterRail: {
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[5],
  },
  filterChip: {
    backgroundColor: Colors.backgroundSurface,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  filterTextActive: {
    color: Colors.textOnPrimary,
  },
  discoverySpotlight: {
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: 142,
    marginHorizontal: Spacing[5],
    marginBottom: Spacing[6],
    overflow: 'hidden',
  },
  discoverySpotlightCopy: {
    bottom: 0,
    left: 0,
    padding: Spacing[5],
    position: 'absolute',
    right: 0,
    top: 0,
    justifyContent: 'center',
  },
  discoveryTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: Spacing[2],
  },
  discoveryBody: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    maxWidth: 300,
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
  },
  gridPoster: {
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    height: 168,
    overflow: 'hidden',
    position: 'relative',
    width: (Screen.width - Spacing[5] * 2 - Spacing[2] * 2) / 3,
  },
  placeholderScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
    paddingBottom: Size.bottomNavHeight + SafeArea.bottom,
  },
  placeholderTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: Spacing[2],
    textAlign: 'center',
  },
  placeholderBody: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: Spacing[3],
    textAlign: 'center',
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: Colors.overlayBlur,
    borderColor: Colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    height: Size.bottomNavHeight + SafeArea.bottom,
    justifyContent: 'space-around',
    left: 0,
    paddingBottom: SafeArea.bottom,
    paddingHorizontal: Spacing[1],
    position: 'absolute',
    right: 0,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing[1],
    justifyContent: 'center',
    minHeight: 58,
  },
  navIcon: {
    alignItems: 'center',
    borderRadius: Radius.full,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  navIconActive: {
    backgroundColor: Colors.primaryBg,
  },
  navIconText: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  navIconTextActive: {
    color: Colors.primary,
  },
  navLabel: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '800',
  },
  navLabelActive: {
    color: Colors.primary,
  },
  navDot: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: 4,
    width: 4,
  },
});
