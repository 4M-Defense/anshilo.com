import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, rtl, spacing, type } from '@/theme';
import { Icon } from './Icon';
import { Rule } from './Rule';

export interface SectionHeaderProps {
  title: string;
  /** שורת־על קטנה מעל הכותרת (למשל "מוגבל בזמן") */
  eyebrow?: string;
  /** משפט הסבר מתחת לכותרת */
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * כותרת מדור — פס מבטא קצר, שורת־על אופציונלית, כותרת מודגשת בדיו
 * וקישור פעולה בצד ("לכל המוצרים"). מקביל ל-.section-header באתר.
 */
export function SectionHeader({
  title,
  eyebrow,
  subtitle,
  actionLabel,
  onAction,
}: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.titleWrap}>
          <Rule variant="accent" />
          {eyebrow != null && (
            <Text style={styles.eyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
          )}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {actionLabel != null && onAction != null && (
          <Pressable
            onPress={onAction}
            hitSlop={spacing.md}
            accessibilityRole="link"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionText} numberOfLines={1}>
              {actionLabel}
            </Text>
            <Icon name="chevron-forward" size={14} color={colors.accent} dir />
          </Pressable>
        )}
      </View>
      {subtitle != null && (
        <Text style={styles.subtitle} numberOfLines={3}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
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
    ...type.eyebrow,
    ...rtl.text,
  },
  title: {
    ...type.heading,
    ...rtl.text,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xxs,
  },
  actionText: {
    ...type.small,
    color: colors.accent,
    fontWeight: '700',
  },
  actionPressed: {
    opacity: 0.6,
  },
  subtitle: {
    ...type.meta,
    ...rtl.text,
  },
});
