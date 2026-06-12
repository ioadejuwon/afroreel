import { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ImageBackground,
  ImageSourcePropType,
  PanResponder,
  Pressable,
  ScrollView,
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
  title: string;
  genre: string;
  tags: string[];
  episodeCount: number;
  posterGradient: readonly [string, string];
  posterImage?: ImageSourcePropType;
  mood: string;
  progress?: number;
  isFree?: boolean;
  isLocked?: boolean;
  rank?: number;
  status?: 'Ongoing' | 'Completed';
};

const dramas: Drama[] = [
  {
    id: 'lagos-secrets',
    title: 'Lagos Secrets',
    genre: 'Romance / Betrayal',
    tags: ['Romance', 'Betrayal', 'Trending'],
    episodeCount: 24,
    posterGradient: ['#40285f', '#12091f'],
    posterImage: require('../../assets/images/posters/lagossecrets.png'),
    mood: 'A senator daughter. A hidden wedding. One night changes everything.',
    progress: 68,
    rank: 1,
    status: 'Ongoing',
  },
  {
    id: 'broken-promises',
    title: 'Broken Promises',
    genre: 'Family Drama',
    tags: ['Family Drama', 'Betrayal'],
    episodeCount: 31,
    posterGradient: ['#5a202b', '#17080d'],
    posterImage: require('../../assets/images/posters/brokenpromises.png'),
    mood: 'She came home for peace and found the family lie.',
    progress: 34,
    status: 'Ongoing',
  },
  {
    id: 'campus-queens',
    title: 'Campus Queens',
    genre: 'Campus',
    tags: ['Campus', 'Free'],
    episodeCount: 18,
    posterGradient: ['#18414a', '#071416'],
    posterImage: require('../../assets/images/posters/campusqueens.png'),
    mood: 'Popularity has a price. Everyone is collecting.',
    isFree: true,
    status: 'Completed',
  },
  {
    id: 'the-other-wife',
    title: 'The Other Wife',
    genre: 'Marriage / Secrets',
    tags: ['Family Drama', 'Betrayal'],
    episodeCount: 42,
    posterGradient: ['#5c4420', '#181105'],
    posterImage: require('../../assets/images/posters/theotherwife.png'),
    mood: 'Two homes. One husband. No more silence.',
    isLocked: true,
    status: 'Ongoing',
  },
  {
    id: 'silent-scars',
    title: 'Silent Scars',
    genre: 'Thriller',
    tags: ['Thriller', 'Free'],
    episodeCount: 27,
    posterGradient: ['#1f3f27', '#07140a'],
    posterImage: require('../../assets/images/posters/silentscars.png'),
    mood: 'The village forgot. She remembers everything.',
    isFree: true,
    status: 'Completed',
  },
  {
    id: 'rich-mans-game',
    title: "Rich Man's Game",
    genre: 'Luxury Drama',
    tags: ['Romance', 'Betrayal'],
    episodeCount: 36,
    posterGradient: ['#26325c', '#080c18'],
    posterImage: require('../../assets/images/posters/richmansgames.png'),
    mood: 'Money opened the door. Love set the trap.',
    isLocked: true,
    status: 'Ongoing',
  },
  {
    id: 'forbidden-love',
    title: 'Forbidden Love',
    genre: 'Romance',
    tags: ['Romance', 'Trending'],
    episodeCount: 22,
    posterGradient: ['#563148', '#160912'],
    posterImage: require('../../assets/images/posters/forbiddenlove.png'),
    mood: 'Two families said never. They heard forever.',
    isFree: true,
    status: 'Completed',
  },
  {
    id: 'blood-diamond',
    title: 'Blood Diamond',
    genre: 'Thriller / Crime',
    tags: ['Thriller', 'Completed'],
    episodeCount: 28,
    posterGradient: ['#2f1b1f', '#0d0809'],
    posterImage: require('../../assets/images/posters/Reel 1_Reel 1.png'),
    mood: 'A mining town. A missing brother. A price too high.',
    isLocked: true,
    status: 'Completed',
  },
  {
    id: 'nile-of-tears',
    title: 'Nile of Tears',
    genre: 'Family Drama',
    tags: ['Family Drama', 'Free'],
    episodeCount: 16,
    posterGradient: ['#183948', '#071018'],
    posterImage: require('../../assets/images/posters/nileoftears.png'),
    mood: 'Her mother left a letter. The truth left scars.',
    isFree: true,
    status: 'Completed',
  },
];

type Tab = 'Home' | 'Discover' | 'Wallet' | 'Alerts' | 'Profile';
type PlayerEpisode = {
  id?: number;
  seriesTitle?: string;
  number: number;
  title: string;
  hook: string;
  progress: number;
  isLocked: boolean;
  isFree?: boolean;
  coinCost?: number;
};
type AppView = 'tabs' | 'series-detail' | 'continue-watching' | 'payment';
type EntryStep = 'splash' | 'onboarding' | 'auth' | 'app';

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
const playerEpisodes: PlayerEpisode[] = [
  { number: 4, title: 'The Photograph', hook: 'Amara finds the proof her father tried to bury.', progress: 72, isLocked: false },
  { number: 5, title: 'The Wedding Guest', hook: 'A familiar face arrives just as the vows begin.', progress: 28, isLocked: false },
  { number: 6, title: 'The Other Name', hook: 'The truth is one unlock away.', progress: 0, isLocked: true },
  { number: 7, title: 'No Way Back', hook: 'One confession changes every alliance.', progress: 0, isLocked: true },
];

const API_BASE_URL = process.env?.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

type ApiSeries = {
  id: number;
  title: string;
};

type ApiEpisode = {
  id: number;
  seriesTitle: string;
  episodeNumber: number;
  title: string;
  hook: string | null;
  isLocked: boolean;
  isFree: boolean;
  coinCost: number;
  progressSeconds: number;
};

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-afroreel-user-id': 'demo-user',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export default function HomeScreen() {
  const [entryStep, setEntryStep] = useState<EntryStep>('splash');
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('tabs');

  if (entryStep === 'splash') {
    return <SplashScreen onComplete={() => setEntryStep('onboarding')} />;
  }

  if (entryStep === 'onboarding') {
    return <OnboardingScreen onComplete={() => setEntryStep('auth')} />;
  }

  if (entryStep === 'auth') {
    return <AuthScreen onComplete={() => setEntryStep('app')} />;
  }

  if (isPlayerOpen) {
    return <PlayerScreen onClose={() => setIsPlayerOpen(false)} />;
  }

  if (activeView === 'series-detail') {
    return (
      <SeriesDetailScreen
        onBack={() => setActiveView('tabs')}
        onStartWatching={() => setIsPlayerOpen(true)}
      />
    );
  }

  if (activeView === 'continue-watching') {
    return (
      <ContinueWatchingScreen
        onBack={() => setActiveView('tabs')}
        onResume={() => setIsPlayerOpen(true)}
      />
    );
  }

  if (activeView === 'payment') {
    return <PaymentScreen onBack={() => setActiveView('tabs')} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        {activeTab === 'Home' ? (
          <HomeTab
            onOpenDiscover={() => setActiveTab('Discover')}
            onOpenPlayer={() => setIsPlayerOpen(true)}
            onOpenSeries={() => setActiveView('series-detail')}
            onOpenContinueWatching={() => setActiveView('continue-watching')}
          />
        ) : null}
        {activeTab === 'Discover' ? <DiscoverTab /> : null}
        {activeTab === 'Wallet' ? <WalletTab onOpenPayment={() => setActiveView('payment')} /> : null}
        {activeTab === 'Alerts' ? <NotificationsTab /> : null}
        {activeTab === 'Profile' ? <ProfileTab onOpenContinueWatching={() => setActiveView('continue-watching')} /> : null}
        <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}

function HomeTab({
  onOpenDiscover,
  onOpenPlayer,
  onOpenSeries,
  onOpenContinueWatching,
}: {
  onOpenDiscover: () => void;
  onOpenPlayer: () => void;
  onOpenSeries: () => void;
  onOpenContinueWatching: () => void;
}) {
  const hero = dramas[0];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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

      <Pressable style={styles.heroCard} onPress={onOpenSeries}>
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
            <Pressable style={styles.primaryButton} onPress={onOpenPlayer}>
              <Text style={styles.primaryButtonText}>Watch Now</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>My List</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>

      <DramaRail
        title="Continue Watching"
        data={dramas.filter((drama) => drama.progress)}
        variant="progress"
        onSeeAll={onOpenContinueWatching}
      />
      <DramaRail title="Trending Now" data={dramas.slice(1, 5)} />
      <DramaRail title="New Episodes" data={[dramas[5], dramas[2], dramas[3], dramas[1]]} />
      <DramaRail title="Free to Watch" data={dramas.filter((drama) => drama.isFree)} variant="free" />
    </ScrollView>
  );
}

function DiscoverTab() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [query, setQuery] = useState('');

  const filteredDramas = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return dramas.filter((drama) => {
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
  }, [activeFilter, query]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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
          <Pressable key={`discover-${drama.id}`} style={styles.gridPoster}>
            <PosterVisual drama={drama} />
            {drama.isFree ? (
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>FREE</Text>
              </View>
            ) : null}
            {drama.isLocked ? (
              <View style={styles.lockBadge}>
                <Text style={styles.lockBadgeText}>5c</Text>
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

function AuthScreen({ onComplete }: { onComplete: () => void }) {
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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

            <Pressable style={styles.authContinueButton} onPress={onComplete}>
              <Text style={styles.primaryButtonText}>
                {isCreatingAccount ? 'Create Account' : 'Continue'}
              </Text>
            </Pressable>

            <View style={styles.authDivider}>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerText}>OR CONTINUE WITH</Text>
              <View style={styles.authDividerLine} />
            </View>

            <View style={styles.authSocialRow}>
              <Pressable style={styles.authSocialButton} onPress={onComplete}>
                <Ionicons name="logo-google" size={18} color={Colors.text} />
                <Text style={styles.authSocialText}>Google</Text>
              </Pressable>
              <Pressable style={styles.authSocialButton} onPress={onComplete}>
                <Ionicons name="logo-apple" size={19} color={Colors.text} />
                <Text style={styles.authSocialText}>Apple</Text>
              </Pressable>
            </View>

            <View style={styles.authToggleRow}>
              <Text style={styles.authToggleCopy}>
                {isCreatingAccount ? 'Already have an account?' : 'New to AfroReel?'}
              </Text>
              <Pressable onPress={() => setIsCreatingAccount((currentValue) => !currentValue)}>
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

function WalletTab({ onOpenPayment }: { onOpenPayment: () => void }) {
  const [selectedPackage, setSelectedPackage] = useState('plus');

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <LinearGradient colors={['#2a1d35', Colors.background]} style={styles.walletHero}>
        <Text style={styles.walletEyebrow}>YOUR WALLET</Text>
        <View style={styles.walletCoinMark}>
          <Ionicons name="wallet" size={36} color={Colors.textOnPrimary} />
        </View>
        <Text style={styles.walletBalance}>250</Text>
        <Text style={styles.walletBalanceLabel}>available coins</Text>
        <Text style={styles.walletHint}>That is enough to unlock 50 episodes.</Text>
      </LinearGradient>

      <View style={styles.walletSectionHeader}>
        <Text style={styles.sectionTitle}>Top up coins</Text>
        <Text style={styles.walletSectionCopy}>Choose a pack and keep the story moving.</Text>
      </View>

      <View style={styles.packageList}>
        {coinPackages.map((coinPackage) => {
          const isSelected = selectedPackage === coinPackage.id;

          return (
            <Pressable
              key={coinPackage.id}
              onPress={() => setSelectedPackage(coinPackage.id)}
              style={[styles.packageCard, isSelected && styles.packageCardSelected]}
            >
              <View style={styles.packageCoinMark}>
                <Ionicons name="wallet" size={16} color={Colors.textOnPrimary} />
              </View>
              <View style={styles.packageCopy}>
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

      <Pressable style={styles.walletPurchaseButton} onPress={onOpenPayment}>
        <Text style={styles.primaryButtonText}>Continue to payment</Text>
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
    </ScrollView>
  );
}

function PaymentScreen({ onBack }: { onBack: () => void }) {
  const [selectedPackage, setSelectedPackage] = useState('plus');
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [isComplete, setIsComplete] = useState(false);
  const selectedCoinPackage = coinPackages.find((coinPackage) => coinPackage.id === selectedPackage) ?? coinPackages[1];

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

        <Pressable style={styles.paymentButton} onPress={() => setIsComplete(true)}>
          <Text style={styles.primaryButtonText}>Pay {selectedCoinPackage.price}</Text>
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

function NotificationsTab() {
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

      <NotificationGroup title="New Episodes">
        <NotificationRow
          mark="N"
          title="Broken Promises is back"
          body="Episode 14 is live. The family meeting did not go as planned."
          time="12m"
          unread
        />
        <NotificationRow
          mark="L"
          title="Lagos Secrets: Episode 8"
          body="Dinner is served. So is the truth."
          time="2h"
          unread
        />
      </NotificationGroup>

      <NotificationGroup title="Bonus Rewards">
        <NotificationRow
          mark="C"
          title="You received 10 free coins"
          body="Your weekly reward is ready to spend on any locked episode."
          time="4h"
          unread
          accent="gold"
        />
        <NotificationRow
          mark="D"
          title="Your daily check-in is waiting"
          body="Open your wallet and collect today's coin reward."
          time="Yesterday"
          accent="gold"
        />
      </NotificationGroup>

      <NotificationGroup title="Picked for You">
        <NotificationRow
          mark="P"
          title="Because you watched Lagos Secrets"
          body="The Other Wife has secrets, pressure, and one very dangerous wedding."
          time="Yesterday"
        />
        <NotificationRow
          mark="T"
          title="A thriller for tonight"
          body="Silent Scars is now complete. Binge all 27 episodes."
          time="Mon"
        />
      </NotificationGroup>
    </ScrollView>
  );
}

function NotificationGroup({ title, children }: { title: string; children: ViewProps['children'] }) {
  return (
    <View style={styles.notificationGroup}>
      <Text style={styles.notificationGroupTitle}>{title}</Text>
      <View style={styles.notificationGroupList}>{children}</View>
    </View>
  );
}

function NotificationRow({
  mark,
  title,
  body,
  time,
  unread = false,
  accent = 'red',
}: {
  mark: string;
  title: string;
  body: string;
  time: string;
  unread?: boolean;
  accent?: 'red' | 'gold';
}) {
  const isGold = accent === 'gold';

  return (
    <Pressable style={styles.notificationRow}>
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

function ProfileTab({ onOpenContinueWatching }: { onOpenContinueWatching: () => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <LinearGradient colors={['#251831', Colors.background]} style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>A</Text>
        </View>
        <Text style={styles.profileName}>Amara Okafor</Text>
        <Text style={styles.profileEmail}>amara@example.com</Text>
        <Pressable style={styles.profileEditButton}>
          <Text style={styles.profileEditText}>Edit profile</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.profileStats}>
        <ProfileStat value="250" label="Coins" />
        <View style={styles.profileStatDivider} />
        <ProfileStat value="18" label="Episodes" />
        <View style={styles.profileStatDivider} />
        <ProfileStat value="4" label="Series" />
      </View>

      <ProfileSection title="Your activity">
        <ProfileRow mark="W" label="Continue watching" description="Resume your latest episodes" onPress={onOpenContinueWatching} />
        <ProfileRow mark="H" label="Watch history" description="Stories you have played" />
        <ProfileRow mark="P" label="Coin purchases" description="Receipts and transaction history" />
      </ProfileSection>

      <ProfileSection title="Preferences">
        <ProfileRow mark="N" label="Notifications" description="New episodes and reward alerts" />
        <ProfileRow mark="S" label="Settings" description="Playback, privacy, and account" />
        <ProfileRow mark="?" label="Help and support" description="Get answers or contact us" />
      </ProfileSection>

      <View style={styles.profileLogoutArea}>
        <Pressable style={styles.profileLogoutButton}>
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

function ContinueWatchingScreen({
  onBack,
  onResume,
}: {
  onBack: () => void;
  onResume: () => void;
}) {
  const continueItems = [
    { drama: dramas[0], episode: 5, remaining: '1m 28s left', updated: 'Watched 12 minutes ago' },
    { drama: dramas[1], episode: 11, remaining: '42s left', updated: 'Watched yesterday' },
    { drama: dramas[5], episode: 8, remaining: '2m 04s left', updated: 'Watched Monday' },
  ];

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.continueContent}>
        <Text style={styles.continueIntro}>
          Pick up exactly where the drama left you.
        </Text>

        {continueItems.map(({ drama, episode, remaining, updated }) => (
          <Pressable key={drama.id} style={styles.continueCard} onPress={onResume}>
            <View style={styles.continueArtwork}>
              <PosterVisual drama={drama} isHero />
              <LinearGradient colors={['transparent', Colors.overlayHeavy]} style={StyleSheet.absoluteFill} />
              <View style={styles.continueArtworkCopy}>
                <Text style={styles.continueCardTitle}>{drama.title}</Text>
                <Text style={styles.continueCardMeta}>Episode {episode}  /  {remaining}</Text>
              </View>
            </View>
            <View style={styles.continueCardFooter}>
              <View style={styles.continueCardFooterCopy}>
                <Text style={styles.continueUpdated}>{updated}</Text>
                <View style={styles.continueProgressTrack}>
                  <View style={[styles.continueProgressFill, { width: `${drama.progress ?? 46}%` }]} />
                </View>
              </View>
              <View style={styles.continueResumeButton}>
                <Text style={styles.continueResumeText}>Resume</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function PlayerScreen({ onClose }: { onClose: () => void }) {
  const [remoteEpisodes, setRemoteEpisodes] = useState<PlayerEpisode[]>([]);
  const [remoteSeriesTitle, setRemoteSeriesTitle] = useState('Lagos Secrets');
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isUnlockSheetOpen, setIsUnlockSheetOpen] = useState(false);
  const [unlockedEpisodes, setUnlockedEpisodes] = useState<number[]>([]);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const activeEpisodes = remoteEpisodes.length > 0 ? remoteEpisodes : playerEpisodes;
  const episode = activeEpisodes[Math.min(activeEpisodeIndex, activeEpisodes.length - 1)];
  const isLocked = episode.isLocked && !unlockedEpisodes.includes(episode.number);
  const videoPlayer = useVideoPlayer(playbackUrl ? { uri: playbackUrl } : null, (player) => {
    player.loop = false;
  });

  useEffect(() => {
    if (!playbackUrl || isLocked || isPaused) {
      videoPlayer.pause();
      return;
    }

    videoPlayer.play();
  }, [isLocked, isPaused, playbackUrl, videoPlayer]);

  useEffect(() => {
    let isMounted = true;

    async function loadRemoteEpisodes() {
      try {
        const seriesPayload = await fetchJson<{ series: ApiSeries[] }>('/api/series');
        const firstSeries = seriesPayload.series[0];
        if (!firstSeries) {
          return;
        }

        const episodePayload = await fetchJson<{ episodes: ApiEpisode[] }>(`/api/series/${firstSeries.id}/episodes`);
        if (!isMounted || episodePayload.episodes.length === 0) {
          return;
        }

        setRemoteSeriesTitle(firstSeries.title);
        setRemoteEpisodes(
          episodePayload.episodes.map((item) => ({
            id: item.id,
            seriesTitle: item.seriesTitle,
            number: item.episodeNumber,
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
        // Keep the prototype fallback content when the API is unavailable.
      }
    }

    void loadRemoteEpisodes();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const moveEpisode = useCallback(
    (direction: 'next' | 'previous') => {
      const offset = direction === 'next' ? 1 : -1;
      setActiveEpisodeIndex((currentIndex) => {
        const nextIndex = Math.min(Math.max(currentIndex + offset, 0), activeEpisodes.length - 1);
        const nextEpisode = activeEpisodes[nextIndex];

        if (nextEpisode.isLocked && !unlockedEpisodes.includes(nextEpisode.number)) {
          setIsUnlockSheetOpen(true);
        }

        return nextIndex;
      });
    },
    [activeEpisodes, unlockedEpisodes],
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

  const unlockCurrentEpisode = async () => {
    if (episode.id) {
      try {
        await fetchJson(`/api/episodes/${episode.id}/unlock`, {
          method: 'POST',
          body: JSON.stringify({ method: 'coins' }),
        });
      } catch {
        return;
      }
    }

    setUnlockedEpisodes((currentEpisodes) => [...currentEpisodes, episode.number]);
    setIsUnlockSheetOpen(false);
  };

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
            <Text style={styles.coinChipText}>250 coins</Text>
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
              <PlayerAction label="12.8k" mark="L" />
              <PlayerAction label="860" mark="C" />
              <PlayerAction label="Share" mark="S" />
              <PlayerAction label="Saved" mark="+" />
            </View>

            <View style={styles.playerProgressArea}>
              <View style={styles.playerProgressMeta}>
                <Text style={styles.playerProgressText}>01:18</Text>
                <Text style={styles.playerProgressText}>02:46</Text>
              </View>
              <View style={styles.playerProgressTrack}>
                <View style={[styles.playerProgressFill, { width: `${episode.progress}%` }]} />
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
              You are one episode away from finding out who sent the photograph.
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
        />
      ) : null}
    </View>
  );
}

function SeriesDetailScreen({
  onBack,
  onStartWatching,
}: {
  onBack: () => void;
  onStartWatching: () => void;
}) {
  const series = dramas[0];

  return (
    <View style={styles.detailScreen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
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
            <Text style={styles.detailTag}>ROMANCE</Text>
            <Text style={styles.detailTag}>BETRAYAL</Text>
            <Text style={styles.detailTag}>LAGOS</Text>
          </View>
          <Text style={styles.detailTitle}>{series.title}</Text>
          <Text style={styles.detailMeta}>4.8 rating  /  {series.episodeCount} episodes  /  Ongoing</Text>
          <Text style={styles.detailSynopsis}>
            A senator&apos;s daughter returns to Lagos for a wedding and finds a photograph that could
            unravel two families. Every answer leaves her with a more dangerous question.
          </Text>
          <Pressable style={styles.detailWatchButton} onPress={onStartWatching}>
            <Text style={styles.primaryButtonText}>Start Watching</Text>
          </Pressable>
        </View>

        <View style={styles.detailEpisodeHeader}>
          <View>
            <Text style={styles.sectionTitle}>Episodes</Text>
            <Text style={styles.detailEpisodeSub}>Episodes 1-5 are free to watch.</Text>
          </View>
          <Text style={styles.detailSort}>Newest</Text>
        </View>

        <View style={styles.detailEpisodeList}>
          {playerEpisodes.map((episode) => (
            <EpisodeRow key={episode.number} episode={episode} onPress={onStartWatching} />
          ))}
          <EpisodeRow
            episode={{
              number: 8,
              title: 'The Family Table',
              hook: 'Dinner is served. So is the truth.',
              progress: 0,
              isLocked: true,
            }}
            onPress={onStartWatching}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function EpisodeRow({ episode, onPress }: { episode: PlayerEpisode; onPress: () => void }) {
  const isFree = episode.number <= 5;

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
      <View style={[styles.episodeBadge, isFree ? styles.episodeBadgeFree : styles.episodeBadgeLocked]}>
        <Text style={[styles.episodeBadgeText, isFree ? styles.episodeBadgeTextFree : styles.episodeBadgeTextLocked]}>
          {isFree ? 'FREE' : '5c'}
        </Text>
      </View>
    </Pressable>
  );
}

function PlayerAction({ label, mark }: { label: string; mark: string }) {
  return (
    <Pressable style={styles.playerAction}>
      <View style={styles.playerActionIcon}>
        <Ionicons name={getIconForMark(mark)} size={20} color={Colors.text} />
      </View>
      <Text style={styles.playerActionLabel}>{label}</Text>
    </Pressable>
  );
}

function UnlockSheet({
  episodeNumber,
  onClose,
  onUnlock,
}: {
  episodeNumber: number;
  onClose: () => void;
  onUnlock: () => void;
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

        <Pressable style={styles.unlockOption} onPress={onUnlock}>
          <View style={styles.unlockOptionIcon}>
            <Ionicons name="play-circle" size={20} color={Colors.primary} />
          </View>
          <View style={styles.unlockOptionCopy}>
            <Text style={styles.unlockOptionTitle}>Watch a short ad</Text>
            <Text style={styles.unlockOptionBody}>Earn enough coins and keep watching</Text>
          </View>
          <Text style={styles.unlockOptionReward}>+5</Text>
        </Pressable>

        <Pressable style={[styles.unlockOption, styles.unlockOptionFeatured]} onPress={onUnlock}>
          <View style={styles.unlockOptionIcon}>
            <Ionicons name="wallet" size={20} color={Colors.primary} />
          </View>
          <View style={styles.unlockOptionCopy}>
            <Text style={styles.unlockOptionTitle}>Unlock now</Text>
            <Text style={styles.unlockOptionBody}>Use your current coin balance</Text>
          </View>
          <Text style={styles.unlockOptionPrice}>5 coins</Text>
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
  onSeeAll,
}: {
  title: string;
  data: Drama[];
  variant?: 'progress' | 'free';
  onSeeAll?: () => void;
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
        {data.map((drama) => (
          <Pressable key={`${title}-${drama.id}`} style={styles.posterCard}>
            <PosterVisual drama={drama} />
            {variant === 'free' || drama.isFree ? (
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>FREE</Text>
              </View>
            ) : null}
            {drama.isLocked ? (
              <View style={styles.lockBadge}>
                <Text style={styles.lockBadgeText}>5c</Text>
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
    fontWeight: '900',
    letterSpacing: 0,
  },
  splashEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: Spacing[3],
  },
  onboardingTitle: {
    color: Colors.text,
    fontSize: 40,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  onboardingButtonArrow: {
    color: Colors.textOnPrimary,
    fontSize: 18,
    fontWeight: '900',
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
    fontWeight: '900',
    letterSpacing: 0,
  },
  authEyebrow: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
  authContinueButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
    marginTop: Spacing[5],
    minHeight: 52,
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
    fontWeight: '900',
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
  authSocialMark: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  walletBalance: {
    color: Colors.primary,
    fontSize: 64,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  packageBonus: {
    backgroundColor: Colors.successBg,
    borderRadius: Radius.full,
    color: Colors.success,
    fontSize: 9,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  walletPurchaseButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
    marginHorizontal: Spacing[5],
    marginTop: Spacing[4],
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
    fontWeight: '900',
  },
  earnCopy: {
    flex: 1,
  },
  earnLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900',
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
    fontWeight: '900',
    textAlign: 'center',
  },
  rewardTextDisabled: {
    color: Colors.textMuted,
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  paymentMethodCopy: {
    flex: 1,
  },
  paymentMethodLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  paymentSummaryTotal: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  paymentSuccessEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: Spacing[6],
  },
  paymentSuccessTitle: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  notificationGroup: {
    marginTop: Spacing[5],
  },
  notificationGroupTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    paddingBottom: Spacing[3],
    paddingHorizontal: Spacing[5],
    textTransform: 'uppercase',
  },
  notificationGroupList: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  profileName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  profileRowCopy: {
    flex: 1,
  },
  profileRowLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
    letterSpacing: 0,
  },
  continueCardMeta: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  playerScreen: {
    backgroundColor: Colors.black,
    flex: 1,
    overflow: 'hidden',
  },
  playerBackdrop: {
    alignItems: 'center',
    height: '78%',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  coinChipText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  playerTapArea: {
    bottom: 174,
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
    fontWeight: '900',
  },
  playerDetails: {
    bottom: 82,
    left: Spacing[5],
    maxWidth: Screen.width - 116,
    position: 'absolute',
  },
  playerSeries: {
    color: Colors.white,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0,
  },
  playerEpisode: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '900',
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
    bottom: 136,
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
  playerActionIconText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  playerActionLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '800',
  },
  playerProgressArea: {
    bottom: 40,
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
    fontWeight: '900',
  },
  lockedEpisodeEyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  lockedEpisodeTitle: {
    color: Colors.white,
    fontSize: 30,
    fontWeight: '900',
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
    fontWeight: '900',
    letterSpacing: 0,
  },
  unlockTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  unlockOptionCopy: {
    flex: 1,
  },
  unlockOptionTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900',
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
    fontWeight: '900',
  },
  unlockOptionPrice: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
  },
  detailTitle: {
    color: Colors.text,
    fontSize: 34,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  episodeCopy: {
    flex: 1,
  },
  episodeTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '900',
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
    borderRadius: Radius.full,
    borderWidth: 1,
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: Spacing[2],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
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
