/**
 * AfroReel — Color Design Tokens
 * Single source of truth for all colors across Android & iOS.
 * Dark cinematic theme — gold accent system.
 */

const palette = {
  // ── Blacks & Surfaces ──────────────────────────────────
  black:        '#000000',
  bg:           '#0A0A0F',   // App background
  surface:      '#13131A',   // Cards, inputs
  card:         '#1A1A26',   // Elevated cards
  cardHover:    '#1F1F30',   // Pressed state
  border:       '#2A2A3F',   // Subtle dividers
  borderLight:  '#3A3A55',   // Active borders

  // ── Gold — Primary Accent ──────────────────────────────
  gold:         '#F5C842',   // Primary CTA, coins, highlights
  goldDim:      '#C9A230',   // Pressed gold
  goldSoft:     '#F5C84220', // Gold at 12% opacity (backgrounds)
  goldBorder:   '#F5C84240', // Gold at 25% opacity (borders)

  // ── Red — Emotion / Unlock Accent ─────────────────────
  accent:       '#E8445A',   // Lock CTAs, hearts, urgency
  accentDim:    '#B8334A',   // Pressed red
  accentSoft:   '#E8445A18', // Red at 10% opacity

  // ── Text ──────────────────────────────────────────────
  textPrimary:  '#F0EDE8',   // Main text
  textSecondary:'#8A8799',   // Subtitles, labels
  textDim:      '#4A4860',   // Placeholders, disabled
  textInverse:  '#0A0A0F',   // Text on gold buttons

  // ── Status ────────────────────────────────────────────
  success:      '#2ECC71',   // Free badge, earned coins
  successSoft:  '#2ECC7118',
  warning:      '#F39C12',   // Streak, expiry
  error:        '#E74C3C',   // Errors

  // ── Overlays ──────────────────────────────────────────
  overlayLight: 'rgba(10, 10, 15, 0.5)',
  overlayMid:   'rgba(10, 10, 15, 0.75)',
  overlayHeavy: 'rgba(10, 10, 15, 0.92)',
  overlayBlur:  'rgba(13, 13, 20, 0.95)',

  // ── Drama Poster Gradients (placeholder backgrounds) ──
  drama1: ['#2D1B4E', '#1A0D30'] as [string, string], // Purple — romance
  drama2: ['#1A2D1A', '#0D1A0D'] as [string, string], // Green — thriller
  drama3: ['#2D1A1A', '#1A0D0D'] as [string, string], // Red — betrayal
  drama4: ['#1A1A2D', '#0D0D1A'] as [string, string], // Blue — mystery
  drama5: ['#2D2A1A', '#1A170D'] as [string, string], // Amber — family
  drama6: ['#1A2D2D', '#0D1A1A'] as [string, string], // Teal — campus

  // ── Pure Utilities ────────────────────────────────────
  white:        '#FFFFFF',
  transparent:  'transparent',
} as const;

// ── Semantic aliases (use these in components) ───────────

export const Colors = {
  // Backgrounds
  background:         palette.bg,
  backgroundSurface:  palette.surface,
  backgroundCard:     palette.card,
  backgroundCardAlt:  palette.cardHover,

  // Borders
  border:             palette.border,
  borderActive:       palette.borderLight,
  borderGold:         palette.goldBorder,

  // Brand
  primary:            palette.gold,
  primaryDim:         palette.goldDim,
  primaryBg:          palette.goldSoft,
  primaryBorder:      palette.goldBorder,

  // Danger / Urgency
  danger:             palette.accent,
  dangerDim:          palette.accentDim,
  dangerBg:           palette.accentSoft,

  // Text
  text:               palette.textPrimary,
  textMuted:          palette.textSecondary,
  textDim:            palette.textDim,
  textOnPrimary:      palette.textInverse,

  // Status
  success:            palette.success,
  successBg:          palette.successSoft,
  warning:            palette.warning,
  error:              palette.error,

  // Overlays
  overlay:            palette.overlayMid,
  overlayLight:       palette.overlayLight,
  overlayHeavy:       palette.overlayHeavy,
  overlayBlur:        palette.overlayBlur,

  // Drama gradients
  dramaGradients:     [
    palette.drama1,
    palette.drama2,
    palette.drama3,
    palette.drama4,
    palette.drama5,
    palette.drama6,
  ],

  // Utilities
  white:              palette.white,
  black:              palette.black,
  transparent:        palette.transparent,
} as const;

export type ColorKey = keyof typeof Colors;

export default Colors;
