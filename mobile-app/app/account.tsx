import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatMoney } from '@/api/client';
import {
  CUSTOMER_ORDERS_QUERY,
  CustomerAuthError,
  customerFetch,
  type CustomerOrder,
  type CustomerOrders,
} from '@/api/customerAccount';
import { Button, EmptyState, Icon, SectionHeader, Skeleton } from '@/components';
import { STORE_INFO, WHATSAPP_URL, whatsappWithMessage } from '@/config';
import { useAuth } from '@/state/AuthContext';
import { alignEnd, colors, radius, rtlText, shadows, spacing, typography } from '@/theme';

/** תאריך בעברית, בלי תלות בנתוני Intl של המנוע (שונים בין iOS לאנדרואיד) */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const STATUS_LABELS: Record<string, string> = {
  PAID: 'שולם',
  PENDING: 'ממתין לתשלום',
  REFUNDED: 'הוחזר',
  PARTIALLY_REFUNDED: 'הוחזר חלקית',
  VOIDED: 'בוטל',
  AUTHORIZED: 'אושר',
  PARTIALLY_PAID: 'שולם חלקית',
  EXPIRED: 'פג',
};

function OrderCard({ order }: { order: CustomerOrder }) {
  const status = order.financialStatus != null ? STATUS_LABELS[order.financialStatus] : null;
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHead}>
        <Text style={styles.orderName}>{rtlText(order.name)}</Text>
        <Text style={styles.orderTotal} maxFontSizeMultiplier={2}>
          {formatMoney(order.totalPrice)}
        </Text>
      </View>
      <View style={styles.orderMetaRow}>
        <Text style={styles.orderDate} maxFontSizeMultiplier={2}>
          {rtlText(formatDate(order.processedAt))}
        </Text>
        {status != null && <Text style={styles.orderStatus}>{status}</Text>}
      </View>
      {order.lineItems.nodes.length > 0 && (
        <View style={styles.orderItems}>
          {order.lineItems.nodes.map((item, i) => (
            <Text key={`${order.id}-${i}`} style={styles.orderItem} numberOfLines={1}>
              {rtlText(`${item.quantity} × ${item.title}`)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function AccountScreen() {
  const { status, profile, error, busy, signIn, signOut, getAccessToken } = useAuth();

  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);

  const loadOrders = useCallback(async () => {
    const token = await getAccessToken();
    if (token == null) return;
    setLoadingOrders(true);
    setOrdersError('');
    try {
      const data = await customerFetch<CustomerOrders>(token, CUSTOMER_ORDERS_QUERY, { first: 20 });
      setOrders(data.customer?.orders.nodes ?? []);
    } catch (err) {
      setOrdersError(
        err instanceof CustomerAuthError || err instanceof Error
          ? err.message
          : 'שגיאה בטעינת ההזמנות'
      );
    } finally {
      setLoadingOrders(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (status === 'signedIn') loadOrders();
  }, [status, loadOrders]);

  /* ---------- מחיקת חשבון ---------- */

  /**
   * מסלול מחיקת החשבון — דרישה מחייבת של אפל (App Review 5.1.1(v)):
   * אפליקציה שמאפשרת יצירת חשבון חייבת לאפשר גם למחוק אותו, ומתוך
   * האפליקציה. זו אחת מסיבות הדחייה הנפוצות ביותר.
   *
   * המחיקה אינה מתבצעת כאן אלא נשלחת כבקשה לצוות החנות, כי אין ברירה:
   * שופיפיי לא חושפת מחיקת לקוח לא ב-Storefront API ולא ב-Customer
   * Account API — מחיקת לקוח אפשרית רק מצד האדמין. הדפוס הזה (בקשה
   * שנפתחת מתוך האפליקציה, עם זהות הלקוח ממולאת מראש) הוא מה שאפל
   * מקבלת כשהפלטפורמה לא מאפשרת מחיקה תכנותית.
   *
   * שני ערוצים, כי אימייל לבדו נכשל בשקט על מכשיר בלי חשבון דואר מוגדר.
   */
  const requestAccountDeletion = useCallback(() => {
    const who = profile?.emailAddress?.emailAddress ?? profile?.displayName ?? '';
    const subject = 'בקשה למחיקת חשבון';
    const body =
      'שלום,\n\nאני מבקש/ת למחוק את חשבון הלקוח שלי ואת הפרטים האישיים ' +
      'המשויכים אליו.\n\n' +
      (who !== '' ? `החשבון: ${who}\n` : '') +
      '\nנשלח מאפליקציית א.נ. שילו.';

    const openMail = () => {
      const url =
        `mailto:${STORE_INFO.email}` +
        `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      Linking.openURL(url).catch(() => {
        Alert.alert(
          'לא הצלחנו לפתוח את הדואר',
          `אפשר לשלוח בקשה לכתובת ${STORE_INFO.email} או להתקשר ל-${STORE_INFO.phone}.`
        );
      });
    };

    const openWhatsapp = () => {
      const url = whatsappWithMessage(WHATSAPP_URL, body);
      if (url === '') return openMail();
      Linking.openURL(url).catch(openMail);
    };

    Alert.alert(
      'מחיקת החשבון שלי',
      'הבקשה תישלח לצוות החנות, והחשבון והפרטים האישיים יימחקו תוך 14 ימי ' +
        'עסקים. פרטי הזמנות שכבר בוצעו נשמרים כנדרש בחוק. הפעולה אינה הפיכה.',
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'וואטסאפ', onPress: openWhatsapp },
        { text: 'אימייל', style: 'destructive', onPress: openMail },
      ]
    );
  }, [profile]);

  /* ---------- לא מחוברים ---------- */

  if (status === 'signedOut') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.signInCard}>
          <Icon name="person-circle-outline" size={64} color={colors.accent} />
          <Text style={styles.signInTitle}>החשבון שלי</Text>
          <Text style={styles.signInText}>
            התחברו כדי לראות את ההזמנות שלכם, לעקוב אחרי משלוחים ולשמור את פרטי המשלוח
            לפעם הבאה.
          </Text>
          <Button
            title="התחברות"
            onPress={signIn}
            loading={busy}
            icon={<Icon name="log-in-outline" size={18} color={colors.onAccent} />}
            style={styles.signInButton}
          />
          <Text style={styles.signInHint}>
            אפשר להתחבר עם גוגל, או עם קוד שנשלח לאימייל. ההתחברות מתבצעת בעמוד המאובטח
            של שופיפיי - האפליקציה לא רואה את הסיסמה שלכם.
          </Text>
        </View>
        {error != null && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{rtlText(error)}</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  if (status === 'loading') {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  /* ---------- מחוברים ---------- */

  const name = profile?.displayName?.trim();
  const email = profile?.emailAddress?.emailAddress ?? null;
  const phone = profile?.phoneNumber?.phoneNumber ?? null;
  const address = profile?.defaultAddress?.formatted?.join(', ') ?? null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Icon name="person" size={28} color={colors.onAccent} />
        </View>
        <View style={styles.profileLabels}>
          <Text style={styles.profileName} numberOfLines={1}>
            {name != null && name !== '' ? rtlText(name) : 'הלקוח שלנו'}
          </Text>
          {email != null && (
            <Text style={styles.profileMeta} numberOfLines={1}>
              {rtlText(email)}
            </Text>
          )}
          {phone != null && (
            <Text style={styles.profileMeta} numberOfLines={1}>
              {rtlText(phone)}
            </Text>
          )}
        </View>
      </View>

      {address != null && (
        <>
          <SectionHeader title="כתובת המשלוח שלי" />
          <View style={styles.plainCard}>
            <Text style={styles.addressText}>{rtlText(address)}</Text>
          </View>
        </>
      )}

      <SectionHeader title="ההזמנות שלי" />
      {loadingOrders && orders == null ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} width="100%" height={104} radius={radius.card} />
          ))}
        </View>
      ) : ordersError !== '' ? (
        <View style={styles.errorBanner}>
          <Icon name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{rtlText(ordersError)}</Text>
          <Pressable accessibilityRole="button" onPress={loadOrders} hitSlop={spacing.sm}>
            <Text style={styles.retry}>נסו שוב</Text>
          </Pressable>
        </View>
      ) : orders != null && orders.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="עוד אין הזמנות"
          text="כשתזמינו אצלנו, ההזמנה תופיע כאן עם כל הפרטים."
        />
      ) : (
        <View style={styles.orders}>
          {orders?.map((order) => <OrderCard key={order.id} order={order} />)}
        </View>
      )}

      <Button
        title="התנתקות"
        variant="outline"
        onPress={signOut}
        loading={busy}
        style={styles.signOutButton}
      />

      {/*
        מחיקת חשבון — חובה של אפל (הנחיה 5.1.1(v)), ולכן חייבת להיות נגישה
        ולא קבורה. מופרדת חזותית מהתנתקות: שתיהן "יציאה", אבל רק אחת בלתי הפיכה.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="מחיקת החשבון שלי"
        onPress={requestAccountDeletion}
        hitSlop={spacing.sm}
        style={({ pressed }) => [styles.deleteRow, pressed && styles.deletePressed]}
      >
        <Icon name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>מחיקת החשבון שלי</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  /* התחברות */
  signInCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  signInTitle: {
    fontSize: typography.h1,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  signInText: {
    fontSize: typography.body,
    lineHeight: typography.body + 8,
    color: colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  signInButton: { alignSelf: 'stretch', marginTop: spacing.sm },
  signInHint: {
    fontSize: typography.tiny,
    lineHeight: typography.tiny + 6,
    color: colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  /* פרופיל */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileLabels: { flex: 1, gap: 2 },
  profileName: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  profileMeta: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },

  plainCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  addressText: {
    fontSize: typography.body,
    lineHeight: typography.body + 6,
    color: colors.text,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },

  /* הזמנות */
  skeletons: { gap: spacing.md },
  orders: { gap: spacing.md },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.xs,
  },
  orderHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  orderName: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
    writingDirection: 'rtl',
  },
  orderTotal: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.accent,
    writingDirection: 'ltr',
  },
  orderMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderDate: { fontSize: typography.small, color: colors.textMuted, writingDirection: 'ltr' },
  orderStatus: {
    fontSize: typography.tiny,
    fontWeight: '700',
    color: colors.success,
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  orderItems: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  orderItem: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },

  /* שגיאה */
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.base,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.small,
    color: colors.danger,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  retry: { fontSize: typography.small, fontWeight: '800', color: colors.danger },

  signOutButton: { marginTop: spacing.sm },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    /* יעד מגע — לא לרדת מ-44 נקודות (WCAG 2.5.5) */
    minHeight: 44,
  },
  deletePressed: { opacity: 0.6 },
  deleteText: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.danger,
    textAlign: 'center',
    writingDirection: 'rtl',
    textDecorationLine: 'underline',
  },
});
