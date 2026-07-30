import { StyleSheet, Text, View } from 'react-native';
import { colors, layout, radius, rtl, rtlText, spacing, type } from '@/theme';
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

/**
 * מצב ריק שקט — אייקון דיו בבועה שקועה, כותרת, הסבר וכפתור פעולה אופציונלי.
 * האדום נשמר לכפתור בלבד; העיטור עצמו נייטרלי.
 */
export function EmptyState({ icon, title, text, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={30} color={colors.ink} knockout={colors.surfaceSunken} />
      </View>
      <Text style={styles.title}>{rtlText(title)}</Text>
      {text != null && <Text style={styles.text}>{rtlText(text)}</Text>}
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
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...type.subheading,
    ...rtl.center,
    marginTop: spacing.lg,
    fontWeight: '800',
  },
  text: {
    ...type.small,
    ...rtl.center,
    marginTop: spacing.sm,
    color: colors.textMuted,
    maxWidth: 300,
  },
  button: {
    marginTop: spacing.xl,
    minWidth: 190,
  },
});
