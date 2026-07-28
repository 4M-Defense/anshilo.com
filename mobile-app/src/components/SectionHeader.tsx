import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * כותרת מדור: פס מבטא 22×3 (מוטיב ה-eyebrow מהאתר) מעל כותרת מודגשת,
 * ולצדה קישור פעולה אופציונלי ("לכל המוצרים").
 */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        <View style={styles.eyebrow} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {actionLabel != null && onAction != null && (
        <Pressable
          onPress={onAction}
          hitSlop={spacing.sm}
          accessibilityRole="link"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => pressed && styles.actionPressed}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleWrap: {
    flexShrink: 1,
    gap: spacing.xs + 2,
    alignItems: 'flex-start',
  },
  eyebrow: {
    width: 22,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  title: {
    fontSize: typography.h2,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  action: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.accent,
    paddingBottom: 2,
  },
  actionPressed: {
    opacity: 0.6,
  },
});
