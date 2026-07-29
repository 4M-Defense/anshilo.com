import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  StorefrontError,
  getProductByHandle,
  getProductRecommendations,
} from '@/api/client';
import type { Product, ProductCardData, ShopifyImage } from '@/api/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorView,
  Icon,
  PriceText,
  ProductCard,
  QuantityStepper,
  SectionHeader,
  Skeleton,
} from '@/components';
import { STORE_INFO } from '@/config';
import { useCart } from '@/state/CartContext';
import { useFavorites } from '@/state/FavoritesContext';
import { colors, radius, shadows, spacing, typography } from '@/theme';

/* ---------- המרת descriptionHtml לטקסט קריא ---------- */

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&');
}

function htmlToText(html: string): string {
  const stripped = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/ul|\/ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------- כפתור עגול צף (חזרה / שיתוף / מועדפים) ---------- */

function CircleButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => [styles.circleButton, pressed && styles.circleButtonPressed]}
    >
      {children}
    </Pressable>
  );
}

/* ---------- שורות אמון (משלוח / איסוף / מקוריות) ---------- */

const TRUST_ROWS: { icon: string; text: string }[] = [
  { icon: 'home-outline', text: 'משלוח עד הבית או ישירות לאתר הבנייה' },
  { icon: 'location-outline', text: 'איסוף עצמי מהחנות בקרית ענבים' },
  { icon: 'checkmark-circle-outline', text: 'מותגים מקוריים בלבד' },
];

/* ---------- שלד טעינה ---------- */

function ProductSkeleton({ galleryHeight }: { galleryHeight: number }) {
  return (
    <View>
      <Skeleton width="100%" height={galleryHeight} radius={0} />
      <View style={styles.skeletonBody}>
        <Skeleton width={96} height={24} radius={radius.pill} />
        <Skeleton width="88%" height={22} />
        <Skeleton width="60%" height={22} />
        <Skeleton width={130} height={30} style={{ marginTop: spacing.sm }} />
        <Skeleton width="100%" height={48} radius={radius.md} style={{ marginTop: spacing.lg }} />
        <Skeleton width="100%" height={14} style={{ marginTop: spacing.lg }} />
        <Skeleton width="92%" height={14} />
        <Skeleton width="70%" height={14} />
      </View>
    </View>
  );
}

/* ==================== מסך המוצר ==================== */

export default function ProductScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { addItem, busy } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ProductCardData[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const galleryRef = useRef<FlatList<ShopifyImage>>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const galleryHeight = Math.min(width, 480);

  /* ---------- טעינת המוצר ---------- */

  const load = useCallback(async () => {
    if (!handle) {
      setProduct(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getProductByHandle(handle);
      setProduct(result);
      if (result) {
        const initial =
          result.variants.nodes.find((v) => v.availableForSale) ?? result.variants.nodes[0];
        const map: Record<string, string> = {};
        initial?.selectedOptions.forEach((o) => {
          map[o.name] = o.value;
        });
        setSelected(map);
        setGalleryIndex(0);
        setQty(1);
      }
    } catch (e) {
      setError(e instanceof StorefrontError ? e.message : 'שגיאה בטעינת המוצר. נסו שוב.');
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- מוצרים מומלצים ---------- */

  const productId = product?.id;
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    getProductRecommendations(productId)
      .then((recs) => {
        if (!cancelled) setRecommendations(recs);
      })
      .catch(() => {
        if (!cancelled) setRecommendations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    []
  );

  /* ---------- וריאנט נבחר ---------- */

  const variants = useMemo(() => product?.variants.nodes ?? [], [product]);

  const selectedVariant = useMemo(
    () =>
      variants.find((v) => v.selectedOptions.every((o) => selected[o.name] === o.value)) ??
      variants[0] ??
      null,
    [variants, selected]
  );

  const hasRealOptions =
    product != null &&
    !(product.options.length === 1 && product.options[0].optionValues.length <= 1);

  /** האם קיים וריאנט זמין למכירה עם הערך הזה, בהינתן שאר הבחירות הנוכחיות */
  const isValueAvailable = useCallback(
    (optionName: string, value: string): boolean =>
      variants.some(
        (v) =>
          v.availableForSale &&
          v.selectedOptions.every((o) =>
            o.name === optionName ? o.value === value : selected[o.name] === o.value
          )
      ),
    [variants, selected]
  );

  const selectValue = useCallback(
    (optionName: string, value: string) => {
      const next = { ...selected, [optionName]: value };
      let match = variants.find((v) =>
        v.selectedOptions.every((o) => next[o.name] === o.value)
      );
      if (!match) {
        // אין וריאנט מדויק לצירוף — נאמץ וריאנט אחר עם הערך הזה (עדיפות לזמין)
        const withValue = (v: (typeof variants)[number]) =>
          v.selectedOptions.some((o) => o.name === optionName && o.value === value);
        match = variants.find((v) => v.availableForSale && withValue(v)) ?? variants.find(withValue);
      }
      if (match) {
        const map: Record<string, string> = {};
        match.selectedOptions.forEach((o) => {
          map[o.name] = o.value;
        });
        setSelected(map);
      } else {
        setSelected(next);
      }
      setAdded(false);
      setAddError(null);
    },
    [variants, selected]
  );

  /* ---------- גלריה ---------- */

  const images = product?.images.nodes ?? [];

  const variantImageUrl = selectedVariant?.image?.url;
  useEffect(() => {
    if (!variantImageUrl) return;
    const idx = images.findIndex((im) => im.url === variantImageUrl);
    if (idx >= 0) {
      setGalleryIndex(idx);
      try {
        galleryRef.current?.scrollToIndex({ index: idx, animated: true });
      } catch {
        // הרשימה עדיין לא נמדדה — לא קריטי
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantImageUrl]);

  const onGalleryScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (images.length === 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setGalleryIndex(Math.max(0, Math.min(images.length - 1, i)));
  };

  /* ---------- מלאי / מחיר ---------- */

  const soldOut = selectedVariant == null || !selectedVariant.availableForSale;
  const quantityAvailable = selectedVariant?.quantityAvailable ?? null;
  const lowStock =
    !soldOut && quantityAvailable != null && quantityAvailable > 0 && quantityAvailable <= 5;
  const maxQty = lowStock || (quantityAvailable != null && quantityAvailable > 0)
    ? quantityAvailable!
    : 999;

  useEffect(() => {
    if (qty > maxQty) setQty(maxQty);
  }, [qty, maxQty]);

  const stock = soldOut
    ? { color: colors.danger, label: 'אזל מהמלאי' }
    : lowStock
      ? {
          color: colors.accent,
          label:
            quantityAvailable === 1
              ? 'נותרה אחרונה במלאי'
              : `נותרו ${quantityAvailable} אחרונות`,
        }
      : { color: colors.success, label: 'במלאי' };

  const price = selectedVariant?.price ?? product?.priceRange.minVariantPrice ?? null;
  const compareAt = selectedVariant?.compareAtPrice ?? null;
  const salePercent =
    price != null && compareAt != null && parseFloat(compareAt.amount) > parseFloat(price.amount)
      ? Math.round(
          ((parseFloat(compareAt.amount) - parseFloat(price.amount)) /
            parseFloat(compareAt.amount)) *
            100
        )
      : 0;

  /* ---------- פעולות ---------- */

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const shareProduct = useCallback(() => {
    if (!handle) return;
    const url = `${STORE_INFO.website}/products/${handle}`;
    Share.share({
      title: product?.title,
      message: product ? `${product.title}\n${url}` : url,
      url,
    }).catch(() => {});
  }, [handle, product]);

  const favorite = handle ? isFavorite(handle) : false;
  const onToggleFavorite = useCallback(() => {
    if (!handle) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggleFavorite(handle);
  }, [handle, toggleFavorite]);

  const handleAddToCart = useCallback(async () => {
    if (!selectedVariant || soldOut) return;
    setAddError(null);
    setAdding(true);
    try {
      await addItem(selectedVariant.id, qty);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setAdded(true);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setAdded(false), 6000);
    } catch (e) {
      setAddError(e instanceof StorefrontError ? e.message : 'שגיאה בהוספה לעגלה. נסו שוב.');
    } finally {
      setAdding(false);
    }
  }, [selectedVariant, soldOut, qty, addItem]);

  const description = useMemo(
    () => (product ? htmlToText(product.descriptionHtml || '') : ''),
    [product]
  );

  /* ---------- תוכן המסך לפי מצב ---------- */

  let content: React.ReactNode;

  if (loading) {
    content = <ProductSkeleton galleryHeight={galleryHeight} />;
  } else if (error != null) {
    content = (
      <View style={[styles.stateWrap, { paddingTop: insets.top + 64 }]}>
        <ErrorView message={error} onRetry={load} />
      </View>
    );
  } else if (product == null) {
    content = (
      <View style={[styles.stateWrap, { paddingTop: insets.top + 64 }]}>
        <EmptyState
          icon="search"
          title="המוצר לא נמצא"
          text="ייתכן שהמוצר הוסר מהחנות או שהקישור שגוי."
          actionLabel="חזרה לחנות"
          onAction={goBack}
        />
      </View>
    );
  } else {
    content = (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ----- גלריית תמונות ----- */}
        <View style={[styles.gallery, { height: galleryHeight }]}>
          {images.length > 0 ? (
            <FlatList
              ref={galleryRef}
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(im, i) => `${im.url}-${i}`}
              onMomentumScrollEnd={onGalleryScrollEnd}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              renderItem={({ item }) => (
                <View style={[styles.galleryPage, { width, height: galleryHeight }]}>
                  <Image
                    source={{ uri: item.url }}
                    style={styles.galleryImage}
                    contentFit="contain"
                    transition={200}
                    accessibilityLabel={item.altText ?? product.title}
                  />
                </View>
              )}
            />
          ) : (
            <View style={[styles.galleryPage, { width, height: galleryHeight }]}>
              <Icon name="image-outline" size={56} color={colors.border} />
            </View>
          )}
          {images.length > 1 && (
            <View style={styles.dotsRow} pointerEvents="none">
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === galleryIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>

        {/* ----- גוף המוצר ----- */}
        <View style={styles.body}>
          <View style={styles.metaRow}>
            {product.vendor !== '' && (
              <View style={styles.vendorChip}>
                <Text style={styles.vendorChipText} numberOfLines={1}>
                  {product.vendor}
                </Text>
              </View>
            )}
            <View style={styles.stockRow}>
              <View style={[styles.stockDot, { backgroundColor: stock.color }]} />
              <Text style={[styles.stockText, { color: stock.color }]}>{stock.label}</Text>
            </View>
          </View>

          <Text style={styles.title}>{product.title}</Text>

          {price != null && (
            <View style={styles.priceRow}>
              <PriceText price={price} compareAt={compareAt} size="lg" />
              {salePercent > 0 && (
                /* ‎ — סימן LTR כדי שהמינוס יוצג לפני המספר גם ב-RTL */
                <Badge label={`‎-${salePercent}%`} variant="sale" />
              )}
            </View>
          )}

          {selectedVariant?.sku != null && selectedVariant.sku !== '' && (
            <Text style={styles.sku}>מק״ט: {selectedVariant.sku}</Text>
          )}

          {/* ----- בחירת וריאנטים ----- */}
          {hasRealOptions &&
            product.options.map((option) => (
              <View key={option.name} style={styles.optionGroup}>
                <Text style={styles.optionName}>
                  {option.name}
                  {selected[option.name] != null && (
                    <Text style={styles.optionValue}>  ·  {selected[option.name]}</Text>
                  )}
                </Text>
                <View style={styles.pillRow}>
                  {option.optionValues.map((value) => {
                    const isSelected = selected[option.name] === value.name;
                    const available = isValueAvailable(option.name, value.name);
                    return (
                      <Pressable
                        key={value.name}
                        accessibilityRole="button"
                        accessibilityLabel={`${option.name}: ${value.name}`}
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => selectValue(option.name, value.name)}
                        style={[
                          styles.pill,
                          isSelected && styles.pillSelected,
                          !available && !isSelected && styles.pillUnavailable,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            isSelected && styles.pillTextSelected,
                            !available && !isSelected && styles.pillTextUnavailable,
                          ]}
                          allowFontScaling={false}
                        >
                          {value.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

          {/* ----- שורות אמון ----- */}
          <View style={styles.trustCard}>
            {TRUST_ROWS.map((row, i) => (
              <View
                key={row.icon}
                style={[styles.trustRow, i > 0 && styles.trustRowBorder]}
              >
                <View style={styles.trustIconWrap}>
                  <Icon name={row.icon} size={18} color={colors.accent} />
                </View>
                <Text style={styles.trustText}>{row.text}</Text>
              </View>
            ))}
          </View>

          {/* ----- תיאור ----- */}
          {description !== '' && (
            <View style={styles.section}>
              <SectionHeader title="תיאור המוצר" />
              <Text style={styles.description}>{description}</Text>
            </View>
          )}
        </View>

        {/* ----- מוצרים מומלצים ----- */}
        {recommendations.length > 0 && (
          <View style={styles.recsSection}>
            <View style={styles.recsHeader}>
              <SectionHeader title="אולי יעניין אתכם" />
            </View>
            <FlatList
              data={recommendations}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.recsList}
              renderItem={({ item }) => <ProductCard product={item} width={168} />}
            />
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      {content}

      {/* ----- סרגל הוספה לעגלה ----- */}
      {!loading && error == null && product != null && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xs }]}>
          {added && (
            <View style={styles.successBanner}>
              <Icon name="checkmark-circle" size={20} color={colors.success} knockout={colors.successSoft} />
              <Text style={styles.successText}>נוסף לעגלה! ✓</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="לצפייה בעגלה"
                onPress={() => router.push('/(tabs)/cart')}
                hitSlop={spacing.sm}
              >
                <Text style={styles.successAction}>לצפייה בעגלה</Text>
              </Pressable>
            </View>
          )}
          {addError != null && (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle" size={18} color={colors.danger} knockout={colors.dangerSoft} />
              <Text style={styles.errorBannerText}>{addError}</Text>
            </View>
          )}
          <View style={styles.bottomBarRow}>
            <QuantityStepper
              value={qty}
              onChange={setQty}
              max={maxQty}
              disabled={soldOut || adding || busy}
            />
            <Button
              title={soldOut ? 'אזל מהמלאי' : 'הוספה לעגלה'}
              onPress={handleAddToCart}
              loading={adding || busy}
              disabled={soldOut}
              icon={
                soldOut ? undefined : (
                  <Icon name="cart-outline" size={18} color={colors.onAccent} />
                )
              }
              style={styles.addButton}
            />
          </View>
        </View>
      )}

      {/* ----- כותרת צפה ----- */}
      <View
        style={[styles.floatingHeader, { top: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <CircleButton label="חזרה" onPress={goBack}>
          {/* ב-RTL חץ "חזרה" מצביע ימינה — היפוך מפורש */}
          <Icon
            name="arrow-back"
            size={20}
            color={colors.ink}
            style={{ transform: [{ scaleX: -1 }] }}
          />
        </CircleButton>
        <View style={styles.floatingActions}>
          <CircleButton label="שיתוף המוצר" onPress={shareProduct}>
            <Icon name="share-outline" size={18} color={colors.ink} />
          </CircleButton>
          <CircleButton
            label={favorite ? 'הסרה מהמועדפים' : 'הוספה למועדפים'}
            onPress={onToggleFavorite}
          >
            <Icon
              name={favorite ? 'heart' : 'heart-outline'}
              size={20}
              color={favorite ? colors.sale : colors.ink}
              knockout={colors.surface}
            />
          </CircleButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
  },

  /* כותרת צפה */
  floatingHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floatingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  circleButtonPressed: {
    backgroundColor: colors.surfaceAlt,
  },

  /* גלריה */
  gallery: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  galleryPage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  dotsRow: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.accent,
  },

  /* גוף */
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  vendorChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    flexShrink: 1,
  },
  vendorChipText: {
    fontSize: typography.tiny,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  stockText: {
    fontSize: typography.small,
    fontWeight: '700',
  },
  title: {
    fontSize: typography.h1,
    lineHeight: typography.h1 + 8,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sku: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* וריאנטים */
  optionGroup: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  optionName: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  optionValue: {
    fontWeight: '500',
    color: colors.textMuted,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  pillSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  pillUnavailable: {
    opacity: 0.45,
    borderStyle: 'dashed',
  },
  pillText: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.text,
  },
  pillTextSelected: {
    color: colors.onInk,
    fontWeight: '700',
  },
  pillTextUnavailable: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },

  /* אמון */
  trustCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  trustRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trustIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustText: {
    flex: 1,
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* תיאור */
  section: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  description: {
    fontSize: typography.body,
    lineHeight: typography.body + 9,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* מומלצים */
  recsSection: {
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.md,
  },
  recsHeader: {
    paddingHorizontal: spacing.lg,
  },
  recsList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },

  /* סרגל תחתון */
  bottomBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm,
    ...shadows.raised,
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addButton: {
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  successText: {
    flex: 1,
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.success,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  successAction: {
    fontSize: typography.small,
    fontWeight: '800',
    color: colors.success,
    textDecorationLine: 'underline',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  errorBannerText: {
    flex: 1,
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  /* שלד */
  skeletonBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
});
