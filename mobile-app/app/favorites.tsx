import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { getProductByHandle } from '@/api/client';
import type { ProductCardData } from '@/api/types';
import { EmptyState, ErrorView, Icon, ProductCard, SkeletonProductCard } from '@/components';
import { useFavorites } from '@/state/FavoritesContext';
import { colors, radius, spacing, typography } from '@/theme';

function errorText(err: unknown): string {
  return err instanceof Error && err.message !== ''
    ? err.message
    : 'שגיאה בטעינת המועדפים. נסו שוב.';
}

/**
 * מסך המועדפים — נטען כמסך נדחף עם header מובנה ("המועדפים שלי").
 * המועדפים נשמרים כ-handles בלבד, לכן כל מוצר נמשך מהשרת;
 * כשל של מוצר בודד לא מפיל את המסך (Promise.allSettled + התראה חלקית).
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { width } = useWindowDimensions();
  const cardWidth = (width - spacing.lg * 2 - spacing.md) / 2;

  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [message, setMessage] = useState('');
  const [products, setProducts] = useState<Record<string, ProductCardData>>({});
  const [partialError, setPartialError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const productsRef = useRef(products);
  productsRef.current = products;
  /** מוצרים שהוסרו מהחנות (השרת החזיר null) — לא מנסים שוב */
  const goneRef = useRef<Set<string>>(new Set());
  const requestId = useRef(0);

  const load = useCallback(async (handles: readonly string[], fresh = false) => {
    const id = ++requestId.current;
    if (fresh) goneRef.current.clear();
    const target = fresh
      ? [...handles]
      : handles.filter((h) => productsRef.current[h] == null && !goneRef.current.has(h));

    if (target.length === 0) {
      setStatus('ready');
      setPartialError(false);
      return;
    }
    if (!fresh && Object.keys(productsRef.current).length === 0) setStatus('loading');

    const settled = await Promise.allSettled(target.map((h) => getProductByHandle(h)));
    if (id !== requestId.current) return;

    const fetched: Record<string, ProductCardData> = {};
    let failures = 0;
    let firstReason: unknown;
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        if (res.value != null) fetched[target[i]] = res.value;
        else goneRef.current.add(target[i]); // המוצר כבר לא קיים בחנות
      } else {
        failures++;
        if (firstReason === undefined) firstReason = res.reason;
      }
    });

    const merged = fresh ? fetched : { ...productsRef.current, ...fetched };
    const anythingToShow = handles.some((h) => merged[h] != null);

    if (failures > 0 && !anythingToShow) {
      setStatus('error');
      setMessage(errorText(firstReason));
      return;
    }
    setProducts(merged);
    setPartialError(failures > 0);
    setStatus('ready');
  }, []);

  useEffect(() => {
    load(favorites);
  }, [favorites, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(favorites, true);
    setRefreshing(false);
  }, [favorites, load]);

  /** האחרון שנשמר מוצג ראשון */
  const display = useMemo(
    () =>
      [...favorites]
        .reverse()
        .map((h) => products[h])
        .filter((p): p is ProductCardData => p != null),
    [favorites, products]
  );

  const renderCard = useCallback(
    ({ item }: ListRenderItemInfo<ProductCardData>) => (
      <ProductCard product={item} width={cardWidth} />
    ),
    [cardWidth]
  );

  /* אין מועדפים כלל */
  if (favorites.length === 0) {
    return (
      <View style={styles.centerWrap}>
        <EmptyState
          icon="heart-outline"
          title="עדיין אין מועדפים"
          text="לחצו על הלב במסך המוצר כדי לשמור מוצרים שאהבתם — והם יחכו לכם כאן."
          actionLabel="לקטלוג"
          onAction={() => router.navigate('/(tabs)/catalog')}
        />
      </View>
    );
  }

  if (status === 'loading') {
    return (
      <View style={styles.skeletonGrid}>
        {Array.from({ length: Math.min(6, Math.max(2, favorites.length)) }, (_, i) => (
          <SkeletonProductCard key={i} width={cardWidth} />
        ))}
      </View>
    );
  }

  if (status === 'error') {
    return <ErrorView message={message} onRetry={() => load(favorites)} />;
  }

  /* כל המוצרים השמורים הוסרו מהחנות */
  if (display.length === 0) {
    return (
      <View style={styles.centerWrap}>
        <EmptyState
          icon="heart-outline"
          title="המועדפים כבר לא זמינים"
          text="נראה שהמוצרים ששמרתם הוסרו מהחנות. אפשר למצוא חדשים בקטלוג."
          actionLabel="לקטלוג"
          onAction={() => router.navigate('/(tabs)/catalog')}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {partialError && (
        <View style={styles.partialError}>
          <Icon name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={styles.partialErrorText} numberOfLines={2}>
            חלק מהמועדפים לא נטענו.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="נסו שוב"
            onPress={() => load(favorites)}
            hitSlop={spacing.xs}
            style={({ pressed }) => [styles.partialRetry, pressed && styles.pressed]}
          >
            <Text style={styles.partialRetryText}>נסו שוב</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        data={display}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={renderCard}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
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
  centerWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
  },
  skeletonGrid: {
    flex: 1,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  listContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  columnWrapper: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },

  /* שגיאה חלקית — פס התראה מעל הרשימה */
  partialError: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  partialErrorText: {
    flex: 1,
    fontSize: typography.small,
    lineHeight: typography.small + 5,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  partialRetry: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  partialRetryText: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.danger,
  },
  pressed: {
    opacity: 0.6,
  },
});
