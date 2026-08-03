import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCollections } from '@/api/client';
import type { Collection, PageInfo } from '@/api/types';
import { CollectionImage, EmptyState, ErrorView, Icon, Skeleton, StoreLogo } from '@/components';
import { alignEnd, colors, radius, rtlText, shadows, gridColumns, gridItemWidth, spacing, typography } from '@/theme';

const PAGE_SIZE = 24;
/** יחס גובה-רוחב של אריח קטגוריה */
const TILE_RATIO = 0.82;

function errorText(err: unknown): string {
  return err instanceof Error && err.message !== ''
    ? err.message
    : 'שגיאה בטעינת המחלקות. נסו שוב.';
}

/**
 * אריח מחלקה: התמונה יושבת על לבן ב-contain, והכותרת בפס נפרד מתחתיה.
 *
 * קודם התמונה מלאה את האריח ב-cover, עם שלוש שכבות האפלה וכותרת לבנה עליה.
 * זה עובד לצילום אווירה, אבל חלק גדול מהמחלקות והמותגים בקטלוג הזה מיוצגים
 * ב**לוגו** (בלאנדסטון, בוש, בונדקס, בונה, גרואה, האנטר) — ו-cover חתך אותם,
 * ההאפלה עמעמה אותם, והכותרת הלבנה ישבה עליהם. שלוש פגיעות באותו אלמנט.
 *
 * הפתרון תואם גם ל-ProductCard וגם למערכת העיצוב של האתר: תמונות קטלוג על
 * לבן, ב-contain, בלי שכבות מעל, והטקסט בדיו מתחת לתמונה ולא עליה.
 */
function CategoryTile({
  collection,
  width,
  height,
  onPress,
}: {
  collection: Collection;
  width: number;
  height: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={collection.title}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width, height }, pressed && styles.tilePressed]}
    >
      <CollectionImage
        image={collection.image}
        title={collection.title}
        letterSize={height * 0.34}
      />
      <View style={styles.tileFooter}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {rtlText(collection.title)}
        </Text>
        {/* שברון "קדימה" — ‏dir דואג להיפוך תחת RTL */}
        <Icon name="chevron-forward" size={16} color={colors.textMuted} dir />
      </View>
    </Pressable>
  );
}

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const columns = gridColumns(width);
  const tileWidth = gridItemWidth(width, columns);
  const tileHeight = Math.round(tileWidth * TILE_RATIO);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasNextPage: false, endCursor: null });
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [footerError, setFooterError] = useState('');
  const requestId = useRef(0);

  const loadFirst = useCallback(async (silent = false) => {
    const id = ++requestId.current;
    if (!silent) {
      setStatus('loading');
      setMessage('');
    }
    setFooterError('');
    try {
      const page = await getCollections(PAGE_SIZE);
      if (id !== requestId.current) return;
      setCollections(page.nodes);
      setPageInfo(page.pageInfo);
      setStatus('ready');
    } catch (err) {
      if (id !== requestId.current) return;
      // ברענון שקט (משיכה) עם תוכן קיים — לא מוחקים את המסך
      if (!silent) {
        setStatus('error');
        setMessage(errorText(err));
      }
    }
  }, []);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirst(true);
    setRefreshing(false);
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (
      loadingMore ||
      refreshing ||
      status !== 'ready' ||
      !pageInfo.hasNextPage ||
      pageInfo.endCursor == null
    ) {
      return;
    }
    const id = requestId.current;
    setLoadingMore(true);
    setFooterError('');
    try {
      const page = await getCollections(PAGE_SIZE, pageInfo.endCursor);
      if (id !== requestId.current) return;
      setCollections((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.nodes.filter((c) => !seen.has(c.id))];
      });
      setPageInfo(page.pageInfo);
    } catch (err) {
      if (id === requestId.current) setFooterError(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, refreshing, status, pageInfo]);

  const renderTile = useCallback(
    ({ item }: ListRenderItemInfo<Collection>) => (
      <CategoryTile
        collection={item}
        width={tileWidth}
        height={tileHeight}
        onPress={() => router.push(`/collection/${item.handle}`)}
      />
    ),
    [tileWidth, tileHeight, router]
  );

  const footer = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator size="small" color={colors.accent} />
    </View>
  ) : footerError !== '' ? (
    <View style={styles.footerError}>
      <Text style={styles.footerErrorText} numberOfLines={2}>
        {footerError}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="נסו שוב"
        onPress={loadMore}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.footerRetry, pressed && styles.tilePressed]}
      >
        <Text style={styles.footerRetryText}>נסו שוב</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      {/* כותרת מסך — הטאבים ללא header מובנה */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <StoreLogo height={24} style={styles.headerLogo} />
        <View style={styles.eyebrow} />
        <Text style={styles.headerTitle}>מחלקות</Text>
        <Text style={styles.headerSub}>כל מחלקות החנות במקום אחד</Text>
      </View>

      {status === 'loading' ? (
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} width={tileWidth} height={tileHeight} radius={radius.lg} />
          ))}
        </View>
      ) : status === 'error' ? (
        <ErrorView message={message} onRetry={() => loadFirst()} />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          key={`grid-${columns}`}
          renderItem={renderTile}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="grid-outline"
                title="אין מחלקות להצגה"
                text="נראה שהחנות עדיין מסתדרת. נסו לרענן בעוד רגע."
                actionLabel="רענון"
                onAction={() => loadFirst()}
              />
            </View>
          }
          ListFooterComponent={footer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs + 2,
    alignItems: 'flex-start',
    backgroundColor: colors.bg,
  },
  /* הלוגו נמתח לרוחב הכותרת כדי ש-contentPosition="right" יצמיד אותו לימין */
  headerLogo: {
    alignSelf: 'stretch',
    marginBottom: spacing.xxs,
  },
  eyebrow: {
    width: 22,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  headerTitle: {
    fontSize: typography.h1,
    fontWeight: '800',
    color: colors.ink,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  headerSub: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },

  /* רשימה */
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  columnWrapper: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  emptyWrap: {
    paddingTop: spacing.xxl,
  },

  /* אריח */
  tile: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    ...shadows.card,
  },
  tilePressed: {
    opacity: 0.85,
  },
  /* אזור התמונה — לבן, עם ריווח כדי שלוגו לא ייגע בקצוות */
  tileImageWrap: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  letter: {
    fontWeight: '800',
    color: colors.accent,
    opacity: 0.45,
  },
  /* פס הכותרת — מתחת לתמונה, לא עליה */
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileTitle: {
    flex: 1,
    fontSize: typography.small,
    lineHeight: typography.small + 5,
    fontWeight: '700',
    color: colors.ink,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },

  /* פוטר עימוד */
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  footerError: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  footerErrorText: {
    flex: 1,
    fontSize: typography.small,
    lineHeight: typography.small + 5,
    color: colors.text,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  footerRetry: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  footerRetryText: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.danger,
  },
});
