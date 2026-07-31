import { useEffect, useMemo, useRef, useState } from 'react';
import {
  I18nManager,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StorefrontFilter } from '@/api/types';
import { alignEnd, colors, radius, rtlText, shadows, spacing, typography } from '@/theme';
import { Button } from './Button';
import { Icon } from './Icon';

/**
 * מה שנבחר בסינון.
 *
 * `values` ממופה לפי `value.id` ולא לפי אינדקס, כי שופיפיי מחזיר את הפאסטות
 * מחדש בכל בקשה — עם מספרי מוצרים מעודכנים ולפעמים בסדר אחר — והבחירה חייבת
 * לשרוד את זה. הערך שנשמר הוא ה-`input` הגולמי, בדיוק כפי שהגיע.
 *
 * טווח המחירים נשמר בנפרד כי הוא היחיד שאיננו בחירה מרשימה: שופיפיי מחזיר
 * עבורו ערך אחד עם הגבולות, והקלט האמיתי נבנה כאן מהמספרים שהמשתמש הזין.
 */
export interface AppliedFilters {
  values: Record<string, string>;
  price: { min: number | null; max: number | null };
}

export const NO_FILTERS: AppliedFilters = { values: {}, price: { min: null, max: null } };

export function countApplied(applied: AppliedFilters): number {
  const price = applied.price.min != null || applied.price.max != null ? 1 : 0;
  return Object.keys(applied.values).length + price;
}

/** הופך את הבחירה לרשימת ה-`input` שנשלחת ל-Storefront API */
export function toFilterInputs(applied: AppliedFilters): string[] {
  const inputs = Object.values(applied.values);
  const { min, max } = applied.price;
  if (min != null || max != null) {
    const range: Record<string, number> = {};
    if (min != null) range.min = min;
    if (max != null) range.max = max;
    inputs.push(JSON.stringify({ price: range }));
  }
  return inputs;
}

function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = parseFloat(trimmed.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/* ---------- סליידר טווח מחירים ---------- */

interface PriceBounds {
  min: number;
  max: number;
}

/**
 * הגבולות האמיתיים של המחלקה, מתוך פאסטת ה-PRICE_RANGE.
 *
 * שופיפיי מחזיר לפאסטה הזאת ערך אחד יחיד, שה-`input` שלו הוא
 * `{"price":{"min":0,"max":4899}}` — כלומר המחיר הנמוך והגבוה של המחלקה
 * שהמשתמש נמצא בה. אין צורך בשאילתה נוספת כדי לדעת את קצוות הסליידר.
 *
 * מחזיר null כשהמבנה אינו כצפוי, וכשזה קורה נשארים בשדות ההקלדה.
 */
function parsePriceBounds(filter: StorefrontFilter | undefined): PriceBounds | null {
  const raw = filter?.values[0]?.input;
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const price = (parsed as { price?: { min?: unknown; max?: unknown } })?.price;
    if (typeof price?.min !== 'number' || typeof price?.max !== 'number') return null;
    const min = Math.floor(price.min);
    const max = Math.ceil(price.max);
    return max > min ? { min, max } : null;
  } catch {
    return null;
  }
}

const HANDLE = 28;

/**
 * סליידר דו-ידיות לטווח מחירים.
 *
 * על כיוון: תחת RTL המחיר הנמוך צריך להיות מימין. המיקום נעשה ב-
 * `insetInlineStart`, כלומר מרחק מקצה ה**התחלה** — שתחת RTL הוא הימני —
 * ולכן שבר 0 יושב מימין ושבר 1 משמאל בלי חשבון ידני. אותה לוגיקה בדיוק
 * חלה על שורת המספרים: `flexDirection: 'row'` תחת RTL מתחיל מימין, והערך
 * הנמוך נכתב ראשון.
 *
 * מכאן נובע גם כיוון הגרירה: ככל שהשבר גדל הידית נעה שמאלה, ולכן תחת RTL
 * תזוזת אצבע ימינה צריכה דווקא **להקטין** את הערך. זה ה-`dir` למטה.
 * PanResponder מדווח dx בקואורדינטות מסך פיזיות ואינו מתהפך מעצמו.
 *
 * PanResponder ולא ספריית ג'סטורות: הוא חלק מהליבה של react-native, ולכן
 * אינו מזיז את טביעת האצבע של הבנייה — נמדד.
 */
function PriceRangeSlider({
  bounds,
  lo,
  hi,
  onChange,
}: {
  bounds: PriceBounds;
  lo: number;
  hi: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const span = bounds.max - bounds.min;

  /* הערכים החיים נקראים מתוך ה-PanResponder, שנוצר פעם אחת ואינו מתרנדר */
  const state = useRef({ lo, hi, width: 0, start: 0, onChange });
  state.current.lo = lo;
  state.current.hi = hi;
  state.current.width = trackWidth;
  state.current.onChange = onChange;

  const responders = useMemo(() => {
    const make = (which: 'lo' | 'hi') =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        /* הידית תופסת את המגע לפני שה-ScrollView של המגירה יגלול איתו */
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const s = state.current;
          s.start = which === 'lo' ? s.lo : s.hi;
        },
        onPanResponderMove: (_evt, gesture) => {
          const s = state.current;
          if (s.width <= 0) return;
          const dir = I18nManager.isRTL ? -1 : 1;
          const next = Math.round(s.start + ((dir * gesture.dx) / s.width) * span);
          /* הידיות אינן חוצות זו את זו */
          if (which === 'lo') s.onChange(clamp(next, bounds.min, s.hi), s.hi);
          else s.onChange(s.lo, clamp(next, s.lo, bounds.max));
        },
      });
    return { lo: make('lo'), hi: make('hi') };
  }, [bounds.min, bounds.max, span]);

  const fraction = (v: number) => (span === 0 ? 0 : clamp((v - bounds.min) / span, 0, 1));
  const loX = fraction(lo) * trackWidth;
  const hiX = fraction(hi) * trackWidth;

  return (
    <View>
      <View style={styles.sliderValues}>
        <Text style={styles.sliderValue} allowFontScaling={false}>
          {`₪${lo.toLocaleString('en-US')}`}
        </Text>
        <Text style={styles.sliderValue} allowFontScaling={false}>
          {`₪${hi.toLocaleString('en-US')}`}
        </Text>
      </View>

      <View
        style={styles.sliderTrackArea}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.sliderTrack} />
        <View
          style={[styles.sliderFill, { insetInlineStart: loX, width: Math.max(0, hiX - loX) }]}
        />
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="מחיר מינימלי"
          accessibilityValue={{ min: bounds.min, max: bounds.max, now: lo }}
          style={[styles.sliderHandle, { insetInlineStart: loX - HANDLE / 2 }]}
          {...responders.lo.panHandlers}
        />
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="מחיר מקסימלי"
          accessibilityValue={{ min: bounds.min, max: bounds.max, now: hi }}
          style={[styles.sliderHandle, { insetInlineStart: hiX - HANDLE / 2 }]}
          {...responders.hi.panHandlers}
        />
      </View>
    </View>
  );
}

export interface FilterSheetProps {
  visible: boolean;
  /** הפאסטות שהחנות החזירה למחלקה הזאת */
  filters: StorefrontFilter[];
  applied: AppliedFilters;
  /** מספר המוצרים בתוצאה הנוכחית — מוצג על כפתור האישור */
  resultCount: number;
  onClose: () => void;
  onApply: (next: AppliedFilters) => void;
}

/**
 * מגירת סינון — קבוצה לכל פאסטה שהחנות מגדירה, ובתוכה הערכים עם מספר המוצרים.
 *
 * הקבוצות אינן מקובעות בקוד: הן מגיעות מ-`collection.products.filters`, כלומר
 * מאותן הגדרות Search & Discovery שמזינות את הסינון באתר. פילטר שיתווסף בחנות
 * — מתח, קוטר, יצרן — יופיע כאן מעצמו.
 *
 * העריכה מקומית עד ללחיצה על "הצג": כך אין קריאת רשת על כל תיוג, והמשתמש
 * יכול לבחור כמה ערכים ואז להחיל אותם יחד.
 */
export function FilterSheet({
  visible,
  filters,
  applied,
  resultCount,
  onClose,
  onApply,
}: FilterSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<AppliedFilters>(applied);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');

  const priceFilter = filters.find((f) => f.type === 'PRICE_RANGE');
  const listFilters = filters.filter((f) => f.type !== 'PRICE_RANGE');
  const bounds = useMemo(() => parsePriceBounds(priceFilter), [priceFilter]);

  /** מצב הסליידר. null כשאין גבולות מהחנות — אז מוצגים שדות ההקלדה */
  const [range, setRange] = useState<{ lo: number; hi: number } | null>(null);

  /* פתיחה מחדש מסתנכרנת עם מה שמוחל כרגע, כדי שביטול לא ישאיר טיוטה תלושה */
  useEffect(() => {
    if (!visible) return;
    setDraft(applied);
    setMinText(applied.price.min?.toString() ?? '');
    setMaxText(applied.price.max?.toString() ?? '');
    setRange(
      bounds == null
        ? null
        : {
            lo: clamp(applied.price.min ?? bounds.min, bounds.min, bounds.max),
            hi: clamp(applied.price.max ?? bounds.max, bounds.min, bounds.max),
          }
    );
  }, [visible, applied, bounds]);

  /**
   * המחיר שייצא בפועל.
   *
   * טווח שנשאר על שני הקצוות אינו סינון — הוא "כל המחירים" — ולכן הוא חוזר
   * כ-null ולא נשלח לשופיפיי. זו אותה התנהגות שהייתה לשדות ריקים.
   */
  const priceSelection = (): AppliedFilters['price'] => {
    if (bounds != null && range != null) {
      const full = range.lo <= bounds.min && range.hi >= bounds.max;
      return full ? { min: null, max: null } : { min: range.lo, max: range.hi };
    }
    return { min: parseAmount(minText), max: parseAmount(maxText) };
  };

  const toggle = (id: string, input: string) => {
    setDraft((prev) => {
      const values = { ...prev.values };
      if (values[id] != null) delete values[id];
      else values[id] = input;
      return { ...prev, values };
    });
  };

  const commitPrice = () => {
    setDraft((prev) => ({
      ...prev,
      price: { min: parseAmount(minText), max: parseAmount(maxText) },
    }));
  };

  const clearAll = () => {
    setDraft(NO_FILTERS);
    setMinText('');
    setMaxText('');
    setRange(bounds == null ? null : { lo: bounds.min, hi: bounds.max });
  };

  /* הסינון מוחל רק כאן — לא בכל תזוזת אצבע, אחרת כל גרירה היא קריאה לחנות */
  const apply = () => {
    onApply({ ...draft, price: priceSelection() });
    onClose();
  };

  const draftCount = countApplied({ ...draft, price: priceSelection() });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.header}>
          <Text style={styles.title}>סינון</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סגירה"
            onPress={onClose}
            hitSlop={spacing.md}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Icon name="close" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {filters.length === 0 && (
            <Text style={styles.empty}>
              למחלקה הזאת אין אפשרויות סינון. אפשר להוסיף אותן בניהול החנות,
              באפליקציית Search &amp; Discovery.
            </Text>
          )}

          {priceFilter != null && bounds != null && range != null && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>{rtlText(priceFilter.label)}</Text>
              <PriceRangeSlider
                bounds={bounds}
                lo={range.lo}
                hi={range.hi}
                onChange={(lo, hi) => setRange({ lo, hi })}
              />
            </View>
          )}

          {/* מפלט: אין פאסטת מחיר תקינה מהחנות — חוזרים לשדות ההקלדה */}
          {priceFilter != null && (bounds == null || range == null) && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>{rtlText(priceFilter.label)}</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceField}>
                  <Text style={styles.priceCaption}>מ־</Text>
                  <TextInput
                    value={minText}
                    onChangeText={setMinText}
                    onEndEditing={commitPrice}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    style={styles.priceInput}
                    allowFontScaling={false}
                  />
                </View>
                <View style={styles.priceField}>
                  <Text style={styles.priceCaption}>עד</Text>
                  <TextInput
                    value={maxText}
                    onChangeText={setMaxText}
                    onEndEditing={commitPrice}
                    keyboardType="numeric"
                    placeholder="₪"
                    placeholderTextColor={colors.textMuted}
                    style={styles.priceInput}
                    allowFontScaling={false}
                  />
                </View>
              </View>
            </View>
          )}

          {listFilters.map((filter) => (
            <View key={filter.id} style={styles.group}>
              <Text style={styles.groupLabel}>{rtlText(filter.label)}</Text>
              <View style={styles.valueWrap}>
                {filter.values.map((value) => {
                  const on = draft.values[value.id] != null;
                  /* ערך בלי מוצרים מוצג מעומעם ואינו נבחר — אלא אם הוא כבר מסומן */
                  const dead = value.count === 0 && !on;
                  return (
                    <Pressable
                      key={value.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: dead }}
                      accessibilityLabel={`${filter.label}: ${value.label}`}
                      disabled={dead}
                      onPress={() => toggle(value.id, value.input)}
                      style={({ pressed }) => [
                        styles.value,
                        on && styles.valueOn,
                        dead && styles.valueDead,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.box, on && styles.boxOn]}>
                        {on && <Icon name="checkmark" size={13} color={colors.onAccent} />}
                      </View>
                      <Text
                        style={[styles.valueLabel, on && styles.valueLabelOn]}
                        numberOfLines={1}
                      >
                        {rtlText(value.label)}
                      </Text>
                      <Text style={styles.valueCount} allowFontScaling={false}>
                        {value.count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ניקוי כל הסינונים"
            onPress={clearAll}
            hitSlop={spacing.sm}
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          >
            <Text style={styles.clearText}>נקה הכל</Text>
          </Pressable>
          <Button
            title={draftCount > 0 ? `הצג תוצאות (${draftCount})` : `הצג ${resultCount} מוצרים`}
            onPress={apply}
            style={styles.applyButton}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: typography.h2,
    fontWeight: '800',
    color: colors.ink,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  empty: {
    fontSize: typography.small,
    lineHeight: typography.small + 6,
    color: colors.textMuted,
    textAlign: alignEnd,
    writingDirection: 'rtl',
    paddingTop: spacing.xl,
  },
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    fontSize: typography.body,
    fontWeight: '800',
    color: colors.ink,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  valueWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  valueOn: {
    backgroundColor: colors.surfaceAlt,
  },
  valueDead: {
    opacity: 0.4,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  valueLabel: {
    flex: 1,
    fontSize: typography.small,
    color: colors.text,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  valueLabelOn: {
    fontWeight: '700',
    color: colors.ink,
  },
  valueCount: {
    fontSize: typography.tiny,
    fontWeight: '700',
    color: colors.textMuted,
  },
  /* הערך הנמוך נכתב ראשון, ולכן תחת RTL הוא נופל לימין — כמו הידית שלו */
  sliderValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sliderValue: {
    fontSize: typography.body,
    fontWeight: '800',
    color: colors.ink,
  },
  sliderTrackArea: {
    height: HANDLE + spacing.sm,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  sliderFill: {
    position: 'absolute',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  sliderHandle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
    ...shadows.sm,
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priceField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.sm,
  },
  priceCaption: {
    fontSize: typography.tiny,
    fontWeight: '700',
    color: colors.textMuted,
  },
  priceInput: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.ink,
    paddingVertical: spacing.xxs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  clear: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearText: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.danger,
  },
  applyButton: {
    flex: 1,
  },
});
