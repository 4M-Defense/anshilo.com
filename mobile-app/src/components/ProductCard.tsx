import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductCardData } from '@/api/types';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { PriceText } from './PriceText';

export interface ProductCardProps {
  product: ProductCardData;
  width?: number;
}

/**
 * כרטיס מוצר לרשתות (grid) — תמונה על רקע לבן, תגית מבצע/אזל,
 * יצרן, כותרת בשתי שורות ומחיר. לחיצה מנווטת למסך המוצר.
 */
export function ProductCard({ product, width }: ProductCardProps) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;

  const minPrice = parseFloat(product.priceRange.minVariantPrice.amount);
  const maxPrice = parseFloat(product.priceRange.maxVariantPrice.amount);
  const compareMin = parseFloat(
    product.compareAtPriceRange?.minVariantPrice?.amount ?? '0'
  );
  const soldOut = !product.availableForSale;
  const onSale = !soldOut && compareMin > minPrice && minPrice > 0;
  const salePercent = onSale ? Math.round(((compareMin - minPrice) / compareMin) * 100) : 0;
  const hasRange = maxPrice > minPrice;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.98,
      speed: 50,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 30,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[{ transform: [{ scale }] }, width != null ? { width } : styles.flex]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={product.title}
        onPress={() => router.push(`/product/${product.handle}`)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={styles.card}
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
              <Icon name="image-outline" size={36} color={colors.border} />
            </View>
          )}
          {onSale && salePercent > 0 && (
            <View style={styles.saleBadge}>
              {/* ‎ — סימן LTR כדי שהמינוס יוצג לפני המספר גם ב-RTL */}
              <Badge label={`‎-${salePercent}%`} variant="sale" />
            </View>
          )}
          {soldOut && (
            <>
              <View style={styles.soldOutDim} />
              <View style={styles.soldOutCenter}>
                <Badge label="אזל מהמלאי" variant="soldout" />
              </View>
            </>
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
              price={product.priceRange.minVariantPrice}
              compareAt={onSale ? product.compareAtPriceRange.minVariantPrice : null}
              size="md"
            />
          </View>
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  imageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageDimmed: {
    opacity: 0.4,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  saleBadge: {
    position: 'absolute',
    top: spacing.sm,
    start: spacing.sm,
  },
  soldOutDim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  soldOutCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceAlt,
  },
  vendor: {
    fontSize: typography.tiny,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.text,
    lineHeight: typography.small + 5,
    minHeight: (typography.small + 5) * 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  fromLabel: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
