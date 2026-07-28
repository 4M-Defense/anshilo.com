import { StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@/api/client';
import type { MoneyV2 } from '@/api/types';
import { colors, spacing, typography } from '@/theme';

export type PriceSize = 'sm' | 'md' | 'lg';

export interface PriceTextProps {
  price: MoneyV2;
  compareAt?: MoneyV2 | null;
  size?: PriceSize;
}

const SIZE_MAP: Record<PriceSize, { price: number; compare: number }> = {
  sm: { price: typography.small, compare: typography.tiny },
  md: { price: typography.h3, compare: typography.small },
  lg: { price: typography.h1, compare: typography.body },
};

/**
 * מחיר מעוצב: מחיר נוכחי מודגש; במבצע — המחיר באדום ומחיר קודם בקו חוצה.
 */
export function PriceText({ price, compareAt, size = 'md' }: PriceTextProps) {
  const s = SIZE_MAP[size];
  const onSale =
    compareAt != null && parseFloat(compareAt.amount) > parseFloat(price.amount);

  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.price,
          { fontSize: s.price, color: onSale ? colors.sale : colors.ink },
        ]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
  },
  price: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  compare: {
    color: colors.textMuted,
    fontWeight: '500',
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
});
