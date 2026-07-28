import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { Button } from './Button';
import { Icon } from './Icon';

export interface EmptyStateProps {
  /** שם אייקון בסגנון Ionicons (למשל "cart-outline") */
  icon: string;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** מצב ריק ידידותי — אייקון בעיגול רך, כותרת, הסבר וכפתור פעולה אופציונלי */
export function EmptyState({ icon, title, text, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={32} color={colors.accent} knockout={colors.accentSoft} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {text != null && <Text style={styles.text}>{text}</Text>}
      {actionLabel != null && onAction != null && (
        <Button title={actionLabel} onPress={onAction} style={styles.button} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.lg,
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  text: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    lineHeight: typography.small + 7,
    color: colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    maxWidth: 280,
  },
  button: {
    marginTop: spacing.xl,
    minWidth: 180,
  },
});
