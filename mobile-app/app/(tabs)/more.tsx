import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Icon, Rule, SectionHeader } from '@/components';
import { DIRECTIONS_URL, STORE_INFO, STORE_LOGO, TEL_URL, WHATSAPP_URL } from '@/config';
import { useAuth } from '@/state/AuthContext';
import { colors, radius, shadows, spacing, typography } from '@/theme';

const WEBSITE_LABEL = STORE_INFO.website.replace(/^https?:\/\//, '');

/**
 * גרסת האפליקציה לפוטר.
 *
 * `nativeApplicationVersion` הוא ה-CFBundleShortVersionString של הבינארי, וזה
 * המספר הנכון להציג — אבל הוא null בהרצת פיתוח. הגיבוי הקודם היה `'1.0.0'`
 * מקובע, ולכן הפוטר הציג 1.0.0 גם אחרי שעברנו ל-1.0.1. במקום מספר קבוע
 * נופלים ל-`expoConfig.version`, שנקרא מ-app.json ומתעדכן יחד עם הקוד.
 *
 * מספר הבנייה מוצג בסוגריים כשהוא קיים: כך אפשר לדעת מהטלפון איזו בנייה
 * מ-TestFlight מותקנת בפועל, בלי לנחש.
 */
const APP_VERSION = (() => {
  const version = Constants.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';
  const build = Constants.nativeBuildVersion;
  if (version === '') return '—';
  return build != null && build !== '' ? `${version} (${build})` : version;
})();

/** שורת פעולה בכרטיס — אייקון בבועה, תווית, ושברון "קדימה" (מוטה שמאלה ב-RTL) */
function ActionRow({
  icon,
  label,
  sublabel,
  onPress,
  first = false,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color={colors.accent} knockout={colors.accentSoft} />
      </View>
      <View style={styles.rowLabels}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {sublabel != null && (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sublabel}
          </Text>
        )}
      </View>
      {/* שברון "קדימה" — ‏dir דואג להיפוך תחת RTL */}
      <Icon name="chevron-forward" size={16} color={colors.textMuted} dir />
    </Pressable>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, profile } = useAuth();

  const openLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('אופס', 'לא הצלחנו לפתוח את הקישור במכשיר הזה.');
    });
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* כותרת המסך — לטאבים אין header מובנה */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.eyebrow} />
        <Text style={styles.headerTitle}>עוד</Text>
        <Text style={styles.headerSub}>שירות, יצירת קשר ומידע על החנות</Text>
      </View>

      {/* כרטיס מותג */}
      <View style={styles.brandCard}>
        <View style={styles.brandBody}>
          <View style={styles.brandEyebrow} />
          {/* הסמל של החנות על משטח הדיו — לבן מסביב כדי שהכחול ייקרא */}
          <View style={styles.brandLogoPlate}>
            <Image
              source={{ uri: STORE_LOGO.square }}
              style={styles.brandLogo}
              contentFit="contain"
              transition={200}
              accessibilityLabel={STORE_INFO.name}
            />
          </View>
          <Text style={styles.brandName}>{STORE_INFO.name}</Text>
          <Text style={styles.brandTagline}>{STORE_INFO.tagline}</Text>
          <View style={styles.brandExpRow}>
            <Icon name="hammer" size={14} color={colors.accent} />
            {/* ‎ — סימני LTR שומרים על "30+" בסדר הנכון בטקסט עברי */}
            <Text style={styles.brandExp}>{'‎30+‎ שנות ניסיון בענף הבניין'}</Text>
          </View>
        </View>
        <Rule />
      </View>

      {/* קיצורי דרך */}
      <View style={styles.card}>
        <ActionRow
          first
          icon={status === 'signedIn' ? 'person-circle' : 'person-circle-outline'}
          label={status === 'signedIn' ? 'החשבון שלי' : 'התחברות'}
          sublabel={
            status === 'signedIn'
              ? (profile?.displayName?.trim() ?? 'ההזמנות והפרטים שלי')
              : 'התחברו עם גוגל וראו את ההזמנות שלכם'
          }
          onPress={() => router.push('/account')}
        />
        <ActionRow
          icon="heart-outline"
          label="המועדפים שלי"
          sublabel="המוצרים ששמרתם לפעם הבאה"
          onPress={() => router.push('/favorites')}
        />
      </View>

      {/* יצירת קשר */}
      <SectionHeader title="דברו איתנו" />
      <View style={styles.card}>
        <ActionRow
          first
          icon="call-outline"
          label="התקשרו אלינו"
          sublabel={STORE_INFO.phone}
          onPress={() => openLink(TEL_URL)}
        />
        {WHATSAPP_URL !== '' && (
          <ActionRow
            icon="logo-whatsapp"
            label="וואטסאפ"
            sublabel="מענה מהיר בצ'אט"
            onPress={() => openLink(WHATSAPP_URL)}
          />
        )}
        <ActionRow
          icon="globe-outline"
          label="האתר שלנו"
          sublabel={WEBSITE_LABEL}
          onPress={() => openLink(STORE_INFO.website)}
        />
      </View>

      {/* כתובת ושעות פעילות */}
      <SectionHeader title="כתובת ושעות פעילות" />
      <View style={[styles.card, styles.infoCard]}>
        {/* הכתובת לחיצה ופותחת ניווט אלינו */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`ניווט אל ${STORE_INFO.name}, ${STORE_INFO.address}`}
          onPress={() => openLink(DIRECTIONS_URL)}
          style={({ pressed }) => [styles.addressRow, pressed && styles.rowPressed]}
        >
          <View style={styles.rowIcon}>
            <Icon name="location" size={20} color={colors.accent} knockout={colors.accentSoft} />
          </View>
          <View style={styles.addressLabels}>
            <Text style={styles.addressText}>{`${STORE_INFO.name}, ${STORE_INFO.address}`}</Text>
            <Text style={styles.addressHint}>לחצו לניווט</Text>
          </View>
          {/* שברון "קדימה" — ‏dir דואג להיפוך תחת RTL */}
          <Icon name="chevron-forward" size={16} color={colors.textMuted} dir />
        </Pressable>
        <View style={styles.infoDivider} />
        {STORE_INFO.hours.map((slot) => (
          <View key={slot.days} style={styles.hoursRow}>
            <Text style={styles.hoursDays}>{slot.days}</Text>
            <Text style={styles.hoursValue} allowFontScaling={false}>
              {slot.hours}
            </Text>
          </View>
        ))}
      </View>

      {/* קצת עלינו */}
      <SectionHeader title="קצת עלינו" />
      <View style={styles.aboutCard}>
        <Text style={styles.aboutText}>
          כבר יותר משלושים שנה א.נ. שילו היא הכתובת של אנשי המקצוע ובעלי הבתים בקרית ענבים
          והסביבה - חנות חומרי בניין, אספקה טכנית ומחסן עצים תחת קורת גג אחת. הצוות שלנו מכיר
          כל מוצר על המדף וישמח לעזור לכם למצוא בדיוק את מה שאתם צריכים, בין אם אתם בונים בית
          ובין אם מחליפים ברז. מוזמנים לבקר, להתקשר או לכתוב לנו - אצלנו תמיד יש מי שמקשיב.
        </Text>
      </View>

      {/* פוטר גרסה */}
      <Text style={styles.version} allowFontScaling={false}>
        {`${STORE_INFO.name} · גרסה ${APP_VERSION}`}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },

  /* כותרת */
  header: {
    gap: spacing.xs + 2,
    alignItems: 'flex-start',
  },
  eyebrow: {
    width: 22,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  headerTitle: {
    fontSize: typography.h1,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerSub: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* כרטיס מותג */
  brandCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ink,
    ...shadows.card,
  },
  brandBody: {
    padding: spacing.xl,
    gap: spacing.xs + 2,
    alignItems: 'flex-start',
  },
  brandEyebrow: {
    width: 22,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginBottom: spacing.xs,
  },
  brandLogoPlate: {
    width: 76,
    height: 76,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontSize: typography.h1,
    fontWeight: '800',
    color: colors.onInk,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  brandTagline: {
    fontSize: typography.body,
    fontWeight: '500',
    color: colors.onInk,
    opacity: 0.8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  brandExpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  brandExp: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.accent,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* כרטיסים */
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadows.card,
  },

  /* שורת פעולה */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceAlt,
  },
  rowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabels: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rowSub: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* כתובת ושעות */
  infoCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addressLabels: {
    flex: 1,
    gap: 2,
  },
  addressHint: {
    fontSize: typography.tiny,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  addressText: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.surfaceAlt,
    marginVertical: spacing.xs,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  hoursDays: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  hoursValue: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },

  /* עלינו */
  aboutCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  aboutText: {
    fontSize: typography.body,
    lineHeight: typography.body + 9,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* גרסה */
  version: {
    marginTop: spacing.sm,
    fontSize: typography.tiny,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
