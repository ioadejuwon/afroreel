/**
 * AfroReel — Typography Tokens
 * Font families, sizes, weights, and line heights.
 * Uses Google Fonts loaded via expo-font.
 */

// ── Font Families ────────────────────────────────────────
// Load these in app/_layout.tsx via useFonts()
export const FontFamily = {
  // Display — Fraunces (editorial, cinematic serif)
  displayBlack:   'Fraunces_900Black',
  displayBold:    'Fraunces_700Bold',
  displayBoldItalic: 'Fraunces_700Bold_Italic',
  displaySemiBold:'Fraunces_600SemiBold',
  displayRegular: 'Fraunces_400Regular',

  // Body — DM Sans (clean, modern sans)
  sansBold:       'DMSans_700Bold',
  sansSemiBold:   'DMSans_600SemiBold',
  sansMedium:     'DMSans_500Medium',
  sansRegular:    'DMSans_400Regular',
  sansLight:      'DMSans_300Light',
} as const;

// ── Font Sizes ────────────────────────────────────────────
export const FontSize = {
  xs:    10,
  sm:    12,
  base:  14,
  md:    15,
  lg:    16,
  xl:    18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
  '6xl': 38,
  '7xl': 48,
  hero:  56,
} as const;

// ── Font Weights (for use with system fonts as fallback) ──
export const FontWeight = {
  light:    '300' as const,
  regular:  '400' as const,
  medium:   '500' as const,
  semiBold: '600' as const,
  bold:     '700' as const,
  black:    '900' as const,
};

// ── Line Heights ──────────────────────────────────────────
export const LineHeight = {
  tight:   1.1,
  snug:    1.2,
  normal:  1.4,
  relaxed: 1.6,
  loose:   1.8,
} as const;

// ── Letter Spacing ────────────────────────────────────────
export const LetterSpacing = {
  tight:  -1,
  normal:  0,
  wide:    0.5,
  wider:   1,
  widest:  2,
} as const;

// ── Semantic Text Styles ──────────────────────────────────
// Reusable style objects — spread into StyleSheet
export const TextStyles = {
  // Display
  heroTitle: {
    fontFamily: FontFamily.displayBlack,
    fontSize: FontSize['6xl'],
    lineHeight: FontSize['6xl'] * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize['2xl'],
    lineHeight: FontSize['2xl'] * LineHeight.snug,
    letterSpacing: LetterSpacing.tight,
  },
  cardTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.lg,
    lineHeight: FontSize.lg * LineHeight.snug,
  },
  screenTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize['4xl'],
    lineHeight: FontSize['4xl'] * LineHeight.snug,
    letterSpacing: LetterSpacing.tight,
  },

  // Body
  bodyLarge: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: FontSize.md * LineHeight.relaxed,
  },
  bodyBase: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.base,
    lineHeight: FontSize.base * LineHeight.relaxed,
  },
  bodySmall: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * LineHeight.normal,
  },

  // Labels
  labelBold: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.base,
  },
  labelMedium: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.base,
  },
  caption: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    letterSpacing: LetterSpacing.wide,
  },
  overline: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: LetterSpacing.widest,
    textTransform: 'uppercase' as const,
  },

  // Buttons
  btnPrimary: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  btnSecondary: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
} as const;

export default FontFamily;
