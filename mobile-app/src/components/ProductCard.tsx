import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductCardData } from '@/api/types';
import { colors, layout, radius, rtl, shadows, spacing, type } from '@/theme';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { PriceText } from './PriceText';
import { StockDot } from './StockDot';

export interface ProductCardProps {
  product: ProductCardData;
  width?: number;
  /** הסתרת שורת המלאי — לרשימות צרות במיוחד */
  showStock?: boolean;
}

/**
 * כרטיס מוצר — כרטיס לבן על קנבס העמוד: תמונת קטלוג ב-contain על לבן,
 * תגית מבצע/אזל, שם היצרן, כותרת בשתי שורות, מצב מלאי מפורש ומחיר מודגש.
 * לחיצה מנווטת למסך המוצר.
 */
export function ProductCard({ product, width, showStock = true }: ProductCardProps) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;

  const minPrice = parseFloat(product.priceRange.minVariantPrice.amount);
  const maxPrice = parseFloat(product.priceRange.maxVariantPrice.amount);
  const compareMin = parseFloat(product.compareAtPriceRange?.minVariantPrice?.amount ?? '0');
  const soldOut = !product.availableForSale;
  const onSale = !soldOut && compareMin > minPrice && minPrice > 0;
  const salePercent = onSale ? Math.round(((compareMin - minPrice) / compareMin) * 100) : 0;
  const hasRange = maxPrice > minPrice;

  /**
   * כמו באתר (theme/snippets/price.liquid): מוצר טווח שבו רק הווריאנט הזול
   * פורסם ללא מחיר שומר מחיר "החל מ־" אמיתי לפי הווריאנט היקר, ולא נופל
   * ל"מחיר בטלפון" — שם זה שמור למוצרים שאין להם מחיר בכלל.
   */
  const displayPrice =
    minPrice <= 0 && maxPrice > 0
      ? product.priceRange.maxVariantPrice
      : product.priceRange.minVariantPrice;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.985,
      speed: 50,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 30,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, width != null ? { width } : styles.flex]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={product.title}
        onPress={() => router.push(`/product/${product.handle}`)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.imageWrap}>
          {product.featuredImage != null ? (
            <Image
              source={{ uri: product.featuredImage.url }}
              style={[styles.image, soldOut && styles.imageDimmed]}
              contentFit="contain"
              transition={200}
              accessibilityLabel={product.featuredImage.altText ?? product.title}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Icon name="image-outline" size={34} color={colors.borderStrong} />
            </View>
          )}
          {onSale && salePercent > 0 && (
            <View style={styles.badgeSlot}>
              {/* ‎ — סימן LTR כדי שהמינוס יוצג לפני המספר גם ב-RTL */}
              <Badge label={`‎-${salePercent}%`} variant="sale" />
            </View>
          )}
          {soldOut && (
            <View style={styles.soldOutCenter}>
              <Badge label="אזל מהמלאי" variant="soldout" />
            </View>
          )}
        </View>

        <View style={styles.info}>
          {product.vendor !== '' && (
            <Text style={styles.vendor} numberOfLines={1}>
              {product.vendor}
            </Text>
          )}
          <Text style={styles.title} numberOfLines={2}>
            {product.title}
          </Text>
          <View style={styles.priceRow}>
            {hasRange && <Text style={styles.fromLabel}>החל מ־</Text>}
            <PriceText
              price={displayPrice}
              compareAt={onSale ? product.compareAtPriceRange.minVariantPrice : null}
              size="md"
            />
          </View>
          {showStock && (
            <StockDot level={soldOut ? 'out' : 'in'} style={styles.stockRow} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...shadows.sm,
  },
  cardPressed: {
    borderColor: colors.accent,
  },
  /* תמונת קטלוג — תמיד על לבן, תמיד contain */
  imageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    padding: spacing.sm + 2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageDimmed: {
    opacity: 0.35,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
  },
  badgeSlot: {
    position: 'absolute',
    top: spacing.sm,
    insetInlineStart: spacing.sm,
  },
  soldOutCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    padding: spacing.md,
    paddingTop: spacing.sm + 2,
    gap: spacing.xs,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
  vendor: {
    ...type.metaSmall,
    ...rtl.text,
    fontWeight: '700',
  },
  title: {
    ...type.small,
    ...rtl.text,
    fontWeight: '600',
    minHeight: 40,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  fromLabel: {
    ...type.metaSmall,
  },
  stockRow: {
    marginTop: spacing.xxs,
  },
});
