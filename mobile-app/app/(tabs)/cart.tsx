import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StorefrontError, formatMoney } from '@/api/client';
import type { CartLine, MoneyV2 } from '@/api/types';
import { Button, EmptyState, Icon, PriceText, QuantityStepper, Skeleton } from '@/components';
import { useCart } from '@/state/CartContext';
import { colors, radius, shadows, spacing, typography } from '@/theme';

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof StorefrontError ? e.message : fallback;
}

/* ---------- שורת פריט בעגלה ---------- */

function CartLineRow({
  line,
  disabled,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  disabled: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const merchandise = line.merchandise;

  const openProduct = () => router.push(`/product/${merchandise.product.handle}`);

  // תיאור הווריאנט — מוסתר כשמדובר בווריאנט ברירת המחדל של שופיפיי
  const optionsLabel =
    merchandise.title !== 'Default Title'
      ? merchandise.selectedOptions
          .map((o) => o.value)
          .filter((v) => v !== 'Default Title')
          .join(' · ')
      : '';

  // מחיר השוואה כולל לשורה (לצורך קו חוצה על סה"כ השורה)
  const comparePerUnit = line.cost.compareAtAmountPerQuantity;
  const compareTotal: MoneyV2 | null =
    comparePerUnit != null &&
    parseFloat(comparePerUnit.amount) > parseFloat(merchandise.price.amount)
      ? {
          amount: (parseFloat(comparePerUnit.amount) * line.quantity).toFixed(2),
          currencyCode: comparePerUnit.currencyCode,
        }
      : null;

  return (
    <View style={styles.lineCard}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={merchandise.product.title}
        onPress={openProduct}
        style={styles.lineImageWrap}
      >
        {merchandise.image != null ? (
          <Image
            source={{ uri: merchandise.image.url }}
            style={styles.lineImage}
            contentFit="contain"
            transition={200}
            accessibilityLabel={merchandise.image.altText ?? merchandise.product.title}
          />
        ) : (
          <Icon name="image-outline" size={28} color={colors.border} />
        )}
      </Pressable>

      <View style={styles.lineInfo}>
        <View style={styles.lineTitleRow}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={merchandise.product.title}
            onPress={openProduct}
            hitSlop={spacing.xs}
            style={styles.lineTitlePress}
          >
            <Text style={styles.lineTitle} numberOfLines={2}>
              {merchandise.product.title}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הסרת הפריט מהעגלה"
            disabled={disabled}
            onPress={onRemove}
            hitSlop={spacing.sm}
            style={({ pressed }) => [
              styles.trashButton,
              pressed && styles.trashButtonPressed,
              disabled && styles.dimmed,
            ]}
          >
            <Icon name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>

        {optionsLabel !== '' && (
          <Text style={styles.lineOptions} numberOfLines={1}>
            {optionsLabel}
          </Text>
        )}
        {!merchandise.availableForSale && (
          <Text style={styles.lineUnavailable}>אזל מהמלאי — הסירו את הפריט להמשך</Text>
        )}

        <View style={styles.lineBottomRow}>
          <QuantityStepper
            value={line.quantity}
            onChange={onQuantity}
            disabled={disabled}
          />
          <View style={styles.linePriceWrap}>
            <PriceText price={line.cost.totalAmount} compareAt={compareTotal} size="md" />
            {line.quantity > 1 && (
              <Text style={styles.lineUnitPrice}>{formatMoney(merchandise.price)} ליחידה</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---------- שלד שורת פריט ---------- */

function SkeletonCartLine() {
  return (
    <View style={styles.lineCard}>
      <Skeleton width={72} height={72} radius={radius.md} />
      <View style={styles.skeletonInfo}>
        <Skeleton width="92%" height={13} />
        <Skeleton width="55%" height={11} />
        <View style={styles.skeletonBottom}>
          <Skeleton width={110} height={36} radius={radius.pill} />
          <Skeleton width={64} height={18} />
        </View>
      </View>
    </View>
  );
}

/* ==================== מסך העגלה ==================== */

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cart, initializing, busy, itemCount, updateLine, removeLine, setNote, refresh } =
    useCart();

  const [refreshing, setRefreshing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  /* ----- הערות להזמנה ----- */
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cartId = cart?.id ?? null;
  const cartNote = cart?.note ?? '';
  useEffect(() => {
    // סנכרון ראשוני של ההערה בכל פעם שנטענת עגלה אחרת
    setNoteText(cartNote);
    if (cartNote !== '') setNotesOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartId]);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    []
  );

  const handleNoteChange = useCallback(
    (text: string) => {
      setNoteText(text);
      setNoteStatus('idle');
      if (noteTimer.current) clearTimeout(noteTimer.current);
      noteTimer.current = setTimeout(async () => {
        noteTimer.current = null;
        setNoteStatus('saving');
        try {
          await setNote(text);
          setNoteStatus('saved');
        } catch {
          setNoteStatus('error');
        }
      }, 800);
    },
    [setNote]
  );

  /* ----- פעולות על שורות ----- */

  const handleQuantity = useCallback(
    async (line: CartLine, quantity: number) => {
      try {
        await updateLine(line.id, quantity);
      } catch (e) {
        Alert.alert('שגיאה בעדכון הכמות', errorMessage(e, 'לא הצלחנו לעדכן את הכמות. נסו שוב.'));
      }
    },
    [updateLine]
  );

  const handleRemove = useCallback(
    async (line: CartLine) => {
      try {
        await removeLine(line.id);
      } catch (e) {
        Alert.alert('שגיאה בהסרת הפריט', errorMessage(e, 'לא הצלחנו להסיר את הפריט. נסו שוב.'));
      }
    },
    [removeLine]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch {
      // רענון שנכשל — נשארים עם הנתונים הקיימים
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  /* ----- תשלום ----- */

  const handleCheckout = useCallback(async () => {
    if (!cart) return;
    setCheckingOut(true);
    try {
      // אם יש הערה שממתינה לשמירה — נשמור אותה לפני המעבר לתשלום
      if (noteTimer.current) {
        clearTimeout(noteTimer.current);
        noteTimer.current = null;
        try {
          await setNote(noteText);
        } catch {
          // לא חוסם את התשלום
        }
      }
      await WebBrowser.openBrowserAsync(cart.checkoutUrl);
      await refresh();
    } catch (e) {
      Alert.alert('שגיאה', errorMessage(e, 'לא ניתן לפתוח את עמוד התשלום. נסו שוב.'));
    } finally {
      setCheckingOut(false);
    }
  }, [cart, noteText, refresh, setNote]);

  /* ----- חישובי סיכום ----- */

  const lines = cart?.lines.nodes ?? [];
  const currencyCode = cart?.cost.totalAmount.currencyCode ?? 'ILS';
  const savings = lines.reduce((sum, line) => {
    const compare = line.cost.compareAtAmountPerQuantity;
    if (compare == null) return sum;
    const diff =
      (parseFloat(compare.amount) - parseFloat(line.merchandise.price.amount)) * line.quantity;
    return diff > 0 ? sum + diff : sum;
  }, 0);

  /* ----- כותרת המסך ----- */

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.eyebrow} />
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>עגלת הקניות</Text>
        {itemCount > 0 && (
          <Text style={styles.headerCount}>
            {itemCount === 1 ? 'פריט אחד' : `${itemCount} פריטים`}
          </Text>
        )}
      </View>
    </View>
  );

  /* ----- מצב טעינה ראשוני ----- */

  if (initializing) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.skeletonList}>
          <SkeletonCartLine />
          <SkeletonCartLine />
          <SkeletonCartLine />
        </View>
      </View>
    );
  }

  /* ----- עגלה ריקה ----- */

  if (cart == null || lines.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="cart-outline"
            title="העגלה שלכם ריקה"
            text="כל חומרי הבניין, הכלים והאספקה הטכנית מחכים לכם בקטלוג."
            actionLabel="לקטלוג המוצרים"
            onAction={() => router.push('/(tabs)/catalog')}
          />
        </View>
      </View>
    );
  }

  /* ----- עגלה עם פריטים ----- */

  const footer = (
    <View style={styles.footer}>
      {/* הערות להזמנה */}
      <View style={styles.notesCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="הערות להזמנה"
          accessibilityState={{ expanded: notesOpen }}
          onPress={() => setNotesOpen((open) => !open)}
          style={styles.notesHeader}
        >
          <Icon name="document-text-outline" size={18} color={colors.textMuted} />
          <Text style={styles.notesTitle}>הערות להזמנה</Text>
          <Icon
            name={notesOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </Pressable>
        {notesOpen && (
          <View style={styles.notesBody}>
            <TextInput
              value={noteText}
              onChangeText={handleNoteChange}
              multiline
              placeholder="למשל: לתאם טלפונית לפני אספקה, קומה, שעות נוחות…"
              placeholderTextColor={colors.textMuted}
              style={styles.notesInput}
              textAlignVertical="top"
              accessibilityLabel="הערות להזמנה"
            />
            <Text
              style={[styles.notesStatus, noteStatus === 'error' && styles.notesStatusError]}
            >
              {noteStatus === 'saving'
                ? 'שומר…'
                : noteStatus === 'saved'
                  ? 'ההערה נשמרה ✓'
                  : noteStatus === 'error'
                    ? 'שגיאה בשמירת ההערה — נסו שוב'
                    : 'ההערה נשמרת אוטומטית ומצורפת להזמנה'}
            </Text>
          </View>
        )}
      </View>

      {/* סיכום הזמנה */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>סכום ביניים</Text>
          <Text style={styles.summaryValue}>{formatMoney(cart.cost.subtotalAmount)}</Text>
        </View>
        {savings > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.savingsText]}>חסכתם</Text>
            {/* ‎ — סימן LTR כדי שהמינוס יוצג לפני הסכום גם ב-RTL */}
            <Text style={[styles.summaryValue, styles.savingsText]}>
              {`‎-${formatMoney({ amount: savings.toFixed(2), currencyCode })}`}
            </Text>
          </View>
        )}
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>סה״כ לתשלום</Text>
          <Text style={styles.totalValue} allowFontScaling={false}>
            {formatMoney(cart.cost.totalAmount)}
          </Text>
        </View>
        <Text style={styles.summaryHint}>המחיר כולל מע״מ · המשלוח מחושב בתשלום</Text>
        <Button
          title="מעבר לתשלום מאובטח"
          onPress={handleCheckout}
          loading={checkingOut}
          disabled={busy}
          icon={<Icon name="lock-closed" size={16} color={colors.onAccent} knockout={colors.accent} />}
          style={styles.checkoutButton}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      {header}
      <FlatList
        data={lines}
        keyExtractor={(line) => line.id}
        renderItem={({ item }) => (
          <CartLineRow
            line={item}
            disabled={busy || checkingOut}
            onQuantity={(quantity) => handleQuantity(item, quantity)}
            onRemove={() => handleRemove(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={footer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* כותרת */
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs + 2,
  },
  eyebrow: {
    width: 22,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTitle: {
    fontSize: typography.h1,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerCount: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textMuted,
  },

  /* רשימה */
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },

  /* שורת פריט */
  lineCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  lineImageWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  lineImage: {
    width: '100%',
    height: '100%',
  },
  lineInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  lineTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  lineTitlePress: {
    flex: 1,
  },
  lineTitle: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.text,
    lineHeight: typography.small + 5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  trashButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashButtonPressed: {
    backgroundColor: colors.dangerSoft,
  },
  dimmed: {
    opacity: 0.45,
  },
  lineOptions: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  lineUnavailable: {
    fontSize: typography.tiny,
    fontWeight: '700',
    color: colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  lineBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  linePriceWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  lineUnitPrice: {
    fontSize: typography.tiny,
    color: colors.textMuted,
  },

  /* פוטר: הערות + סיכום */
  footer: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  notesCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  notesTitle: {
    flex: 1,
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notesBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  notesInput: {
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    fontSize: typography.small,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notesStatus: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notesStatusError: {
    color: colors.danger,
    fontWeight: '600',
  },

  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    fontSize: typography.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: typography.small,
    color: colors.text,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  savingsText: {
    color: colors.success,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  totalLabel: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
  },
  totalValue: {
    fontSize: typography.h2,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  summaryHint: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  checkoutButton: {
    marginTop: spacing.sm,
  },

  /* שלדים ומצב ריק */
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  skeletonInfo: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  skeletonBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
});
