import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, rtl, spacing, type } from '@/theme';

export type BadgeVariant =
  | 'sale'
  | 'soldout'
  | 'new'
  | 'offer'
  | 'soft'
  | 'neutral'
  | 'outline';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
}

const VARIANTS: Record<BadgeVariant, { bg: string; fg: string; border?: string }> = {
  /** אחוז הנחה — אדום המותג */
  sale: { bg: colors.accent, fg: colors.onAccent },
  /** אזל מהמלאי — דיו */
  soldout: { bg: colors.ink, fg: colors.onInk },
  /** חדש בקטלוג — דיו */
  new: { bg: colors.ink, fg: colors.onInk },
  /** מבצע — ענבר */
  offer: { bg: colors.highlight, fg: colors.onHighlight },
  /** גוון אדום עדין */
  soft: { bg: colors.accentSoft, fg: colors.accent },
  /** ניטרלי */
  neutral: { bg: colors.surfaceAlt, fg: colors.ink },
  /** מסגרת בלבד */
  outline: { bg: colors.surface, fg: colors.textMuted, border: colors.border },
};

/** תגית פיל קטנה — מבצע / אזל מהמלאי / חדש / ניטרלית */
export function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  const v = VARIANTS[variant];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: v.bg },
        v.border != null && { borderWidth: layout.hairline, borderColor: v.border },
        style,
      ]}
    >
      <Text style={[styles.label, { color: v.fg }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
        {label}
      </Text>
    </View>
  );
}

/** גובה שורה צמוד — שומר על גובה פיל אחיד בכל התגיות */
const LABEL_LINE_HEIGHT = 14;

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  label: {
    ...type.metaSmall,
    ...rtl.text,
    fontWeight: '700',
    lineHeight: LABEL_LINE_HEIGHT,
  },
});
