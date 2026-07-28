import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

export type BadgeVariant = 'sale' | 'soldout' | 'new' | 'neutral';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; fg: string }> = {
  sale: { bg: colors.sale, fg: colors.onAccent },
  soldout: { bg: colors.ink, fg: colors.onInk },
  new: { bg: colors.success, fg: colors.onAccent },
  neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
};

/** תגית פיל קטנה — מבצע / אזל מהמלאי / חדש / ניטרלית */
export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <Text style={[styles.label, { color: v.fg }]} numberOfLines={1} allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: typography.tiny,
    fontWeight: '700',
    lineHeight: typography.tiny + 2,
    writingDirection: 'rtl',
  },
});
