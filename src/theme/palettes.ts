// Light and dark color palettes + shadow definitions

export type ThemeColors = typeof COLORS_LIGHT;

interface ShadowStyle {
  boxShadow: string;
}

export type ThemeShadows = {
  small: ShadowStyle;
  medium: ShadowStyle;
  large: ShadowStyle;
  glow: ShadowStyle;
};

// ── Light palette ──────────────────────────────────────────────────
export const COLORS_LIGHT = {
  // Primary accent
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryLight: '#818CF8',

  // Backgrounds
  background: '#FFFFFF',
  surface: '#F4F5F9',
  surfaceLight: '#E9EBF2',
  surfaceHover: '#DDE0EA',

  // Text hierarchy
  text: '#0A0B10',
  textSecondary: '#4E5261',
  textMuted: '#858A99',
  textDisabled: '#BCC0CC',

  // Borders
  border: '#E3E5ED',
  borderLight: '#D1D4DF',
  borderFocus: '#4F46E5',

  // Semantic colors
  success: '#4E5261',
  warning: '#0A0B10',
  error: '#DC2626',
  trending: '#D97706',
  errorBackground: 'rgba(220, 38, 38, 0.10)',
  info: '#4E5261',

  // Special
  overlay: 'rgba(0, 0, 0, 0.4)',
  divider: '#E9EBF2',
};

// ── Dark palette ───────────────────────────────────────────────────
export const COLORS_DARK = {
  // Primary accent
  primary: '#818CF8',
  primaryDark: '#6366F1',
  primaryLight: '#A5B4FC',

  // Backgrounds
  background: '#0B0D12',
  surface: '#13151C',
  surfaceLight: '#1C1F28',
  surfaceHover: '#242833',

  // Text hierarchy
  text: '#FFFFFF',
  textSecondary: '#AEB2C0',
  textMuted: '#7E8394',
  textDisabled: '#474B59',

  // Borders
  border: '#1C1F28',
  borderLight: '#282C38',
  borderFocus: '#818CF8',

  // Semantic colors
  success: '#AEB2C0',
  warning: '#FFFFFF',
  error: '#C75050',
  trending: '#F59E0B',
  errorBackground: 'rgba(239, 68, 68, 0.15)',
  info: '#AEB2C0',

  // Special
  overlay: 'rgba(0, 0, 0, 0.7)',
  divider: '#181B23',
};

// ── Light shadows ────────────────────────────────────────────────────
// Uses CSS boxShadow (RN 0.76+ with New Architecture) for cross-platform
// shadow rendering. Works identically on iOS and Android.
export const SHADOWS_LIGHT: ThemeShadows = {
  small: {
    boxShadow: '0px 1px 8px 0px rgba(0,0,0,0.18)',
  },
  medium: {
    boxShadow: '0px 2px 10px 0px rgba(0,0,0,0.22)',
  },
  large: {
    boxShadow: '0px 4px 18px 0px rgba(0,0,0,0.35)',
  },
  glow: {
    boxShadow: '0px 0px 12px 0px rgba(79,70,229,0.25)',
  },
};

// ── Dark shadows (crisp white glow for depth) ───────────────────────
export const SHADOWS_DARK: ThemeShadows = {
  small: {
    boxShadow: '0px 0px 6px 0px rgba(255,255,255,0.18)',
  },
  medium: {
    boxShadow: '0px 0px 6px 0px rgba(255,255,255,0.20)',
  },
  large: {
    boxShadow: '0px 0px 10px 0px rgba(255,255,255,0.25)',
  },
  glow: {
    boxShadow: '0px 0px 8px 0px rgba(129,140,248,0.30)',
  },
};

// ── Elevation factory ──────────────────────────────────────────────
export function createElevation(colors: ThemeColors) {
  return {
    level0: {
      backgroundColor: colors.background,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    level1: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    level2: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    level3: {
      backgroundColor: `${colors.surface}F2`,
      borderTopWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 16,
      blur: {
        ios: { blurAmount: 10, blurType: colors.background === COLORS_DARK.background ? 'dark' : 'light' },
        android: { overlayColor: colors.overlay },
      },
    },
    level4: {
      backgroundColor: `${colors.surface}FA`,
      borderTopWidth: 1,
      borderColor: colors.primary,
      borderRadius: 16,
      blur: {
        ios: { blurAmount: 15, blurType: colors.background === COLORS_DARK.background ? 'dark' : 'light' },
        android: { overlayColor: colors.overlay },
      },
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.textMuted,
      borderRadius: 2,
      alignSelf: 'center' as const,
    },
  } as const;
}
