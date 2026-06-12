/**
 * AfroReel — Layout & Spacing Tokens
 * Spacing scale, border radii, shadows, z-index, and screen dimensions.
 */

import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Screen Dimensions ─────────────────────────────────────
export const Screen = {
  width:          SCREEN_WIDTH,
  height:         SCREEN_HEIGHT,
  isSmall:        SCREEN_WIDTH < 375,   // iPhone SE
  isMedium:       SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414,
  isLarge:        SCREEN_WIDTH >= 414,  // Plus / Pro Max
} as const;

// ── Spacing Scale (4px base unit) ────────────────────────
export const Spacing = {
  0:    0,
  1:    4,
  2:    8,
  3:    12,
  4:    16,
  5:    20,
  6:    24,
  7:    28,
  8:    32,
  10:   40,
  12:   48,
  14:   56,
  16:   64,
  20:   80,
  24:   96,
} as const;

// ── Border Radius ─────────────────────────────────────────
export const Radius = {
  xs:   6,
  sm:   10,
  md:   14,
  lg:   18,
  xl:   22,
  '2xl':28,
  '3xl':36,
  full: 9999,
} as const;

// ── Component Sizes ───────────────────────────────────────
export const Size = {
  // Touch targets (minimum 44pt per Apple HIG / Android guidelines)
  touchMin:       44,

  // Icons
  iconXs:         16,
  iconSm:         20,
  iconMd:         24,
  iconLg:         28,
  iconXl:         32,

  // Avatars
  avatarSm:       32,
  avatarMd:       44,
  avatarLg:       64,
  avatarXl:       80,

  // Buttons
  btnHeightSm:    40,
  btnHeightMd:    50,
  btnHeightLg:    56,

  // Cards
  dramaCardWidth:       130,
  dramaCardHeight:      180,
  heroCardHeight:       220,
  continueCardHeight:   160,
  episodeThumbWidth:    72,
  episodeThumbHeight:   48,

  // Player
  playerActionSize:     46,
  playerProgressHeight: 3,

  // Bottom Nav
  bottomNavHeight:      80,

  // Coin badge
  coinBadgeHeight:      28,
} as const;

// ── Shadows ───────────────────────────────────────────────
export const Shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
    android: { elevation: 3 },
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
    },
    android: { elevation: 6 },
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 24,
    },
    android: { elevation: 12 },
  }),
  gold: Platform.select({
    ios: {
      shadowColor: '#F5C842',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    android: { elevation: 8 },
  }),
} as const;

// ── Z-Index ───────────────────────────────────────────────
export const ZIndex = {
  base:       0,
  card:       10,
  header:     20,
  overlay:    30,
  modal:      40,
  toast:      50,
  bottomNav:  60,
} as const;

// ── Safe Area Padding ─────────────────────────────────────
export const SafeArea = {
  top:    Platform.OS === 'ios' ? 56 : 40,  // Status bar + padding
  bottom: Platform.OS === 'ios' ? 34 : 16,  // Home indicator
} as const;

// ── Hit Slop (expand touch area) ──────────────────────────
export const HitSlop = {
  small:  { top: 8,  bottom: 8,  left: 8,  right: 8  },
  medium: { top: 12, bottom: 12, left: 12, right: 12 },
  large:  { top: 16, bottom: 16, left: 16, right: 16 },
} as const;

export default {
  Screen,
  Spacing,
  Radius,
  Size,
  Shadow,
  ZIndex,
  SafeArea,
  HitSlop,
};
