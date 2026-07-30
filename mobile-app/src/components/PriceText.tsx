import { StyleSheet, Text, View } from 'react-native';
import { formatMoney, isUnpriced } from '@/api/client';
import type { MoneyV2 } from '@/api/types';
import { CALL_FOR_PRICE_LABEL } from '@/config';
import { colors, numeric, radius, spacing, type, typography } from '@/theme';
import { Icon } from './Icon';

export type PriceSize = 'sm' | 'md' | 'lg';

export interface PriceTextProps {
  price: MoneyV2;
  compareAt?: MoneyV2 | null;
  size?: PriceSize;
  /** מציג צ'יפ "חסכון" עם אחוז ההנחה לצד המחיר */
  showSave?: boolean;
}

const SIZE_MAP: Record<PriceSize, { price: number; compare: number }> = {
  sm: { price: typography.body, compare: typography.tiny },
  md: { price: typography.h3 + 2, compare: typography.small },
  lg: { price: typography.h1 + 2, compare: typography.body },
};

/**
 * מחיר מעוצב — מודגש בדיו; במבצע המחיר עובר לאדום המותג והמחיר הקודם
 * מוצג בקו חוצה. הסכום עצמו תמיד בכיווניות LTR, כמו ה-`dir="ltr"` שעוטף כל
 * מחיר באתר — כך ה-₪ יושב לפני הספרות ולא נזרק לקצה השני של השורה.
 *
 * מוצר שפורסם ללא מחיר מקבל "מחיר בטלפון" ולא "0.00 ש"ח" — זהה לאתר
 * (theme/snippets/price.liquid).
 */
export function PriceText({ price, compareAt, size = 'md', showSave = false }: PriceTextProps) {
  const s = SIZE_MAP[size];

  if (isUnpriced(price)) {
    const callSize = s.price - 2;
    return (
      <View style={styles.callRow}>
        <Icon name="call" size={Math.round(s.price * 0.85)} color={colors.accent} />
        <Text
          style={[
            styles.callForPrice,
            { fontSize: callSize, lineHeight: Math.round(callSize * 1.4) },
          ]}
          allowFontScaling={false}
        >
          {CALL_FOR_PRICE_LABEL}
        </Text>
      </View>
    );
  }

  const current = parseFloat(price.amount);
  const previous = compareAt != null ? parseFloat(compareAt.amount) : 0;
  const onSale = compareAt != null && previous > current;
  const savePercent = onSale ? Math.round(((previous - current) / previous) * 100) : 0;

  return (
    <View style={styles.row}>
      <Text
        style={[styles.price, { fontSize: s.price, color: onSale ? colors.accent : colors.ink }]}
        allowFontScaling={false}
      >
        {formatMoney(price)}
      </Text>
      {onSale && (
        <Text
          style={[styles.compare, { fontSize: s.compare }]}
          allowFontScaling={false}
          accessibilityLabel={`מחיר קודם ${formatMoney(compareAt)}`}
        >
          {formatMoney(compareAt)}
        </Text>
      )}
      {onSale && showSave && savePercent > 0 && (
        <Text style={styles.save} allowFontScaling={false}>
          {/* ‎ — סימן LTR כדי שהמינוס יוצג לפני המספר גם ב-RTL */}
          {`‎-${savePercent}%`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  price: {
    ...numeric,
    fontWeight: '800',
    letterSpacing: -0.3,
    writingDirection: 'ltr',
  },
  compare: {
    ...numeric,
    color: colors.textMuted,
    fontWeight: '500',
    textDecorationLine: 'line-through',
    writingDirection: 'ltr',
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  callForPrice: {
    ...type.bodyStrong,
    color: colors.accent,
    fontWeight: '800',
  },
  save: {
    ...type.metaSmall,
    color: colors.accent,
    fontWeight: '700',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    overflow: 'hidden',
  },
});
