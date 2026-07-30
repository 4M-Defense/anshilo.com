import { StyleSheet, Text, View } from 'react-native';
import { colors, layout, radius, rtl, rtlText, spacing, type } from '@/theme';
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
          size={30}
          color={colors.danger}
          knockout={colors.dangerSoft}
        />
      </View>
      <Text style={styles.title}>משהו לא עבד כמצופה</Text>
      <Text style={styles.message}>{rtlText(message)}</Text>
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
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
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
  message: {
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
