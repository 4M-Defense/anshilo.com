import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { STORE_INFO, TEL_URL } from '@/config';
import { colors, radius, spacing, typography } from '@/theme';
import { Icon } from './Icon';

/**
 * גבול שגיאה לכל האפליקציה.
 *
 * בלי זה, שגיאת רינדור אחת מותירה את הלקוח מול מסך לבן בלי שום הסבר ובלי
 * דרך לצאת ממנו — והוא פשוט סוגר את האפליקציה. כאן הוא רואה מה קרה, יכול
 * לנסות שוב, ואם זה ממשיך יש לו טלפון של החנות.
 *
 * הערה על ניטור: `report` הוא המקום שבו נכנס Sentry או שירות דומה. כרגע
 * הוא כותב לקונסול בלבד, כלומר קריסה אצל לקוח אמיתי לא מגיעה לאף אחד.
 * ראו docs/COMPLIANCE.md.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

function report(error: Error, info: ErrorInfo): void {
  // eslint-disable-next-line no-console
  console.error('[קריסה]', error, info.componentStack);
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    report(error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error == null) return this.props.children;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.iconWrap}>
            <Icon name="alert-circle-outline" size={44} color={colors.danger} />
          </View>

          <Text style={styles.title}>משהו השתבש</Text>
          <Text style={styles.body}>
            נתקלנו בתקלה בלתי צפויה. אפשר לנסות שוב, ואם היא חוזרת - נשמח שתספרו לנו.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ניסיון נוסף"
            onPress={this.reset}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>נסו שוב</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`התקשרות אל ${STORE_INFO.name}`}
            onPress={() => {
              // require כדי לא לגרור את Linking לכל מסך שמייבא את הרכיב
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { Linking } = require('react-native');
              Linking.openURL(TEL_URL).catch(() => {});
            }}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Icon name="call-outline" size={16} color={colors.ink} />
            <Text style={styles.secondaryText}>{STORE_INFO.phone}</Text>
          </Pressable>

          {__DEV__ && (
            <Text style={styles.debug} selectable>
              {error.message}
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: { marginBottom: spacing.xs },
  title: {
    fontSize: typography.h2,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    fontSize: typography.body,
    lineHeight: typography.body + 8,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 420,
  },
  primary: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.sm,
  },
  primaryText: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
  secondary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.ink,
  },
  pressed: { opacity: 0.7 },
  debug: {
    marginTop: spacing.lg,
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
