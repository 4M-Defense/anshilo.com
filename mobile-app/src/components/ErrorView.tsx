import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { Button } from './Button';
import { Icon } from './Icon';

export interface ErrorViewProps {
  message: string;
  onRetry: () => void;
}

/** מצב שגיאה מלא — אייקון אזהרה, הודעה בעברית וכפתור "נסו שוב" */
export function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon
          name="alert-circle-outline"
          size={32}
          color={colors.danger}
          knockout={colors.dangerSoft}
        />
      </View>
      <Text style={styles.title}>אופס, משהו השתבש</Text>
      <Text style={styles.message}>{message}</Text>
      <Button title="נסו שוב" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
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
  message: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    lineHeight: typography.small + 7,
    color: colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    maxWidth: 300,
  },
  button: {
    marginTop: spacing.xl,
    minWidth: 180,
  },
});
