import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FlatList, Image, Pressable, StyleSheet, Text, useWindowDimensions, View,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { Radius, Size, Spacing } from '@/constants/layout';
import { fetchJson, resolveMediaUrl } from '@/services/api';
import type { ApiEpisode } from '@/types/api.types';
import type { Drama } from '@/types/series.types';

type Props = {
  series: Drama;
  onBack: () => void;
  onStartWatching: (episodeId: string) => void;
  onRefreshCatalog: () => Promise<void>;
  isRefreshingCatalog: boolean;
};

export default function SeriesDetailScreen({ series, onBack, onStartWatching, onRefreshCatalog, isRefreshingCatalog }: Props) {
  const [episodes, setEpisodes] = useState<ApiEpisode[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFirst, setLastFirst] = useState(false);
  const requestId = useRef(0);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const loadEpisodes = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    setFailed(false);
    setRefreshing(refresh);
    try {
      const result = await fetchJson<{ episodes: ApiEpisode[] }>(`/api/series/${series.databaseId}/episodes`);
      if (id === requestId.current) setEpisodes(result.episodes);
    } catch {
      if (id === requestId.current) setFailed(true);
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [series.databaseId]);

  useEffect(() => {
    void loadEpisodes();
    return () => { requestId.current++; };
  }, [loadEpisodes]);

  const firstEpisode = episodes?.[0];
  const count = episodes?.length ?? series.episodeCount;
  const countLabel = `${count} ${count === 1 ? 'episode' : 'episodes'}`;
  const artwork = series.posterImage ?? series.posterCardImage;
  const cards = lastFirst && episodes ? [...episodes].reverse() : episodes;
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing[8] }}
      showsVerticalScrollIndicator={false}
      numColumns={2}
      columnWrapperStyle={styles.cardRow}
      data={cards ?? []}
      keyExtractor={item => item.id}
      refreshing={refreshing || isRefreshingCatalog}
      onRefresh={() => { void loadEpisodes(true); void onRefreshCatalog(); }}
      ListHeaderComponent={
        <>
          <View style={[styles.hero, { minHeight: Math.min(width * 0.77, 400) }]}>
            <Artwork poster={artwork} colors={series.posterGradient} />
            <LinearGradient colors={['rgba(0,0,0,0.12)', 'transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
            <SafeAreaView edges={['top', 'left', 'right']} style={styles.heroControls}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
                <Ionicons name="chevron-back" size={24} color={Colors.white} />
              </Pressable>
            </SafeAreaView>
            <View style={styles.tags}>
              {series.tags.slice(0, 3).map(tag => <Text key={tag} style={styles.tag}>{tag.toUpperCase()}</Text>)}
            </View>
          </View>
          <View style={styles.info}>
            <Text accessibilityRole="header" style={styles.title}>{series.title}</Text>
            <Text style={styles.meta}>{[countLabel, series.status].filter(Boolean).join('   /   ')}</Text>
            <Text style={styles.synopsis}>{series.mood}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!firstEpisode}
              accessibilityState={{ disabled: !firstEpisode }}
              onPress={() => firstEpisode && onStartWatching(firstEpisode.id)}
              style={({ pressed }) => [styles.watch, !firstEpisode && styles.disabled, pressed && styles.pressed]}
            >
              <Ionicons name="play" size={16} color={Colors.textOnPrimary} />
              <Text style={styles.watchText}>Start Watching</Text>
            </Pressable>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Episodes</Text>
                {episodes && count > 0 && <Text style={styles.sub}>{countLabel} available</Text>}
              </View>
              {episodes && count > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Episode order, ${lastFirst ? 'last to first' : 'first to last'}. Reverse order`}
                  onPress={() => setLastFirst(value => !value)}
                  style={styles.sort}
                >
                  <Text style={styles.sortText}>{lastFirst ? 'Last to first' : 'First to last'}</Text>
                  <Ionicons name={lastFirst ? 'arrow-up' : 'arrow-down'} size={15} color={Colors.primary} />
                </Pressable>
              )}
            </View>
            {failed && (
              <View style={styles.error}>
                <Text style={styles.sub}>Couldn’t load episodes.</Text>
                <Pressable accessibilityRole="button" onPress={() => void loadEpisodes(true)} style={styles.sort}>
                  <Text style={styles.sortText}>Try again</Text>
                </Pressable>
              </View>
            )}
          </View>
        </>
      }
      ListEmptyComponent={failed ? undefined : (
        <Text style={styles.empty}>{episodes ? 'No episodes published yet.' : 'Loading episodes…'}</Text>
      )}
      renderItem={({ item }) => (
        <EpisodeCard episode={item} series={series} onPress={() => onStartWatching(item.id)} />
      )}
    />
  );
}

function Artwork({ still, poster, colors }: {
  still?: string | null;
  poster?: ImageSourcePropType;
  colors: Drama['posterGradient'];
}) {
  const [failedStill, setFailedStill] = useState<string>();
  const [failedPoster, setFailedPoster] = useState<ImageSourcePropType>();
  const showStill = Boolean(still && failedStill !== still);
  const source = showStill && still ? { uri: still } : poster;
  return (
    <LinearGradient colors={colors} style={StyleSheet.absoluteFill}>
      {source && (showStill || poster !== failedPoster) && (
        <Image
          key={showStill ? still : 'poster'}
          source={source}
          style={styles.image}
          resizeMode="cover"
          onError={() => { if (showStill && still) setFailedStill(still); else setFailedPoster(poster); }}
        />
      )}
    </LinearGradient>
  );
}

function EpisodeCard({ episode, series, onPress }: { episode: ApiEpisode; series: Drama; onPress: () => void }) {
  const status = episode.isLocked ? `${episode.coinCost} coins` : episode.isFree ? 'Free' : 'Unlocked';
  const progress = episode.durationSeconds && episode.durationSeconds > 0
    ? Math.min(100, Math.max(0, episode.progressSeconds / episode.durationSeconds * 100)) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Episode ${episode.episodeNumber}, ${episode.title}, ${status}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.frame}>
        <Artwork
          still={resolveMediaUrl(episode.thumbnailUrl ?? null)}
          poster={series.posterCardImage ?? series.posterImage}
          colors={series.posterGradient}
        />
        <View style={styles.badge}>
          {episode.isLocked && <Ionicons name="wallet-outline" size={14} color={Colors.primary} />}
          <Text style={styles.badgeText}>{episode.isLocked ? episode.coinCost : status}</Text>
        </View>
        <View style={styles.frameFooter}>
          <Text style={styles.number}>EP {episode.episodeNumber}</Text>
          {progress > 0 && <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>}
        </View>
      </View>
      <Text numberOfLines={2} style={styles.cardTitle}>{episode.title}</Text>
      <Text style={styles.caption}>Episode {episode.episodeNumber}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  hero: { justifyContent: 'space-between', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  heroControls: { alignItems: 'flex-start', paddingHorizontal: Spacing[5], paddingTop: Spacing[2] },
  back: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.overlay,
    width: Size.touchMin, height: Size.touchMin, borderRadius: Radius.full,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], padding: Spacing[5], paddingBottom: Spacing[4] },
  tag: {
    color: Colors.text, backgroundColor: Colors.backgroundCard, borderColor: Colors.border, borderWidth: 1,
    borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 6, fontSize: 11, fontWeight: '800',
    letterSpacing: 0.6, overflow: 'hidden',
  },
  info: { paddingHorizontal: Spacing[5], paddingTop: Spacing[4] },
  title: { color: Colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  meta: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginTop: Spacing[2] },
  synopsis: { color: Colors.textMuted, fontSize: 16, lineHeight: 23, marginTop: Spacing[3] },
  watch: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    borderRadius: Radius.lg, backgroundColor: Colors.primary, marginTop: Spacing[5], padding: Spacing[3],
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  watchText: { color: Colors.textOnPrimary, fontSize: 17, fontWeight: '800' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    columnGap: Spacing[3], marginTop: Spacing[7], marginBottom: Spacing[2],
  },
  sectionCopy: { flexShrink: 1 },
  sectionTitle: { color: Colors.text, fontWeight: '800', fontSize: 23 },
  sub: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1], minHeight: Size.touchMin },
  sortText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  error: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flexWrap: 'wrap' },
  empty: { color: Colors.textMuted, fontSize: 14, paddingHorizontal: Spacing[5] },
  cardRow: { paddingHorizontal: Spacing[5] - Spacing[3] / 2 },
  card: { width: '50%', paddingHorizontal: Spacing[3] / 2, paddingBottom: Spacing[4] },
  frame: { width: '100%', aspectRatio: 4 / 5, borderRadius: Radius.md, overflow: 'hidden' },
  badge: {
    position: 'absolute', top: Spacing[2], right: Spacing[2], backgroundColor: Colors.overlayHeavy,
    borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing[2], paddingVertical: 3,
  },
  badgeText: { color: Colors.primary, fontWeight: '800', fontSize: 12 },
  frameFooter: { position: 'absolute', bottom: Spacing[2], left: Spacing[2], right: Spacing[2], gap: 6 },
  number: {
    alignSelf: 'flex-start', color: Colors.white, backgroundColor: Colors.overlayHeavy, fontWeight: '800',
    fontSize: 12, borderRadius: Radius.xs, overflow: 'hidden', paddingHorizontal: Spacing[2], paddingVertical: 3,
  },
  track: { height: 4, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  cardTitle: { marginTop: Spacing[2], color: Colors.text, fontSize: 15, fontWeight: '700' },
  caption: { marginTop: 2, color: Colors.textMuted, fontSize: 13 },
});
