/**
 * מערכת העיצוב של האפליקציה — תואמת אחד-לאחד לת'ים "Shilo Pro" באתר.
 */
export const colors = {
  accent: '#F97316',
  accentHover: '#EA580C',
  accentSoft: '#FFF3E8',
  ink: '#12161C',
  inkSoft: '#1D242E',
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F6F8',
  text: '#1D242E',
  textMuted: '#5D6673',
  border: '#E4E7EB',
  success: '#178A50',
  successSoft: '#E7F5EE',
  danger: '#D93025',
  dangerSoft: '#FCEBEA',
  sale: '#E5484D',
  onAccent: '#FFFFFF',
  onInk: '#F4F5F7',
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typography = {
  /** גדלים */
  h1: 26,
  h2: 21,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

export const shadows = {
  card: {
    shadowColor: '#101418',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#101418',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

/** פס אזהרה (מוטיב המותג) — צבעים לשימוש ברכיב HazardStripe */
export const hazard = {
  a: colors.accent,
  b: colors.ink,
} as const;
