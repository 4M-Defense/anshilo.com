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
import { STORE_INFO } from '@/config';
import {
  CUSTOMER_ORDERS_QUERY,
  CustomerAuthError,
  customerFetch,
  type CustomerOrder,
  type CustomerOrders,
} from '@/api/customerAccount';
import { Button, EmptyState, Icon, SectionHeader, Skeleton } from '@/components';
import { useAuth } from '@/state/AuthContext';
import { colors, radius, shadows, spacing, typography } from '@/theme';

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
        <Text style={styles.orderName}>{order.name}</Text>
        <Text style={styles.orderTotal} maxFontSizeMultiplier={2}>
          {formatMoney(order.totalPrice)}
        </Text>
      </View>
      <View style={styles.orderMetaRow}>
        <Text style={styles.orderDate} maxFontSizeMultiplier={2}>
          {formatDate(order.processedAt)}
        </Text>
        {status != null && <Text style={styles.orderStatus}>{status}</Text>}
      </View>
      {order.lineItems.nodes.length > 0 && (
        <View style={styles.orderItems}>
          {order.lineItems.nodes.map((item, i) => (
            <Text key={`${order.id}-${i}`} style={styles.orderItem} numberOfLines={1}>
              {`${item.quantity} × ${item.title}`}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function AccountScreen() {
  const { status, profile, error, busy, signIn, signOut, getAccessToken } = useAuth();

  /**
   * בקשת מחיקת חשבון.
   *
   * Shopify לא חושפת מחיקת לקוח דרך Customer Account API, ולכן האפליקציה
   * אינה יכולה למחוק את הרשומה בעצמה. מה שהיא כן עושה: פותחת בקשת מחיקה
   * מזוהה מול החנות, ומנתקת מיד — כך שהמכשיר אינו מחזיק עוד טוקן.
   *
   * מחיקה אמיתית בלחיצה אחת תדרוש נקודת קצה בצד שרת שמשתמשת ב-Admin API.
   * ראו docs/COMPLIANCE.md.
   */
  const requestAccountDeletion = useCallback(() => {
    Alert.alert(
      'מחיקת החשבון',
      'נמחק את החשבון ואת הפרטים האישיים שלכם. היסטוריית ההזמנות תישמר רק ' +
        'ככל שהחוק מחייב אותנו לשמור מסמכי עסקה. הפעולה אינה הפיכה.\n\n' +
        'נאשר לכם את הביצוע בדואר אלקטרוני.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'שליחת בקשת מחיקה',
          style: 'destructive',
          onPress: () => {
            const who = profile?.emailAddress ?? profile?.displayName ?? '';
            const subject = encodeURIComponent('בקשה למחיקת חשבון');
            const body = encodeURIComponent(
              `אני מבקש/ת למחוק את חשבוני ואת הפרטים האישיים שלי.\n\n` +
                `מזהה החשבון: ${who}\n` +
                `נשלח מתוך אפליקציית ${STORE_INFO.name}.`
            );
            Linking.openURL(`mailto:${STORE_INFO.email}?subject=${subject}&body=${body}`).catch(
              () => {
                Alert.alert(
                  'לא הצלחנו לפתוח את הדואר',
                  `אפשר לשלוח בקשת מחיקה לכתובת ${STORE_INFO.email} או להתקשר ל-${STORE_INFO.phone}.`
                );
              }
            );
            signOut();
          },
        },
      ]
    );
  }, [profile, signOut]);
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
            <Text style={styles.errorText}>{error}</Text>
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
            {name != null && name !== '' ? name : 'הלקוח שלנו'}
          </Text>
          {email != null && (
            <Text style={styles.profileMeta} numberOfLines={1}>
              {email}
            </Text>
          )}
          {phone != null && (
            <Text style={styles.profileMeta} numberOfLines={1}>
              {phone}
            </Text>
          )}
        </View>
      </View>

      {address != null && (
        <>
          <SectionHeader title="כתובת המשלוח שלי" />
          <View style={styles.plainCard}>
            <Text style={styles.addressText}>{address}</Text>
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
          <Text style={styles.errorText}>{ordersError}</Text>
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

      {/* מחיקת חשבון — אפל דורשת שכל אפליקציה שמאפשרת יצירת חשבון תציע גם
          למחוק אותו מתוך האפליקציה עצמה (הנחיה 5.1.1(v)). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="מחיקת החשבון והנתונים שלי"
        onPress={requestAccountDeletion}
        hitSlop={spacing.sm}
        style={({ pressed }) => [styles.deleteRow, pressed && styles.deletePressed]}
      >
        <Icon name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>מחיקת החשבון והנתונים שלי</Text>
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
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileMeta: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'right',
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
    textAlign: 'right',
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
    textAlign: 'right',
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
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  retry: { fontSize: typography.small, fontWeight: '800', color: colors.danger },

  signOutButton: { marginTop: spacing.sm },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  deletePressed: { opacity: 0.6 },
  deleteText: {
    fontSize: typography.small,
    color: colors.danger,
    textDecorationLine: 'underline',
  },
});
