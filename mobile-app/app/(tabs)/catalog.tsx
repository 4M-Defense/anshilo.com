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
import { EmptyState, ErrorView, Icon, Skeleton } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme';

const PAGE_SIZE = 24;
/** יחס גובה-רוחב של אריח קטגוריה */
const TILE_RATIO = 0.82;

function errorText(err: unknown): string {
  return err instanceof Error && err.message !== ''
    ? err.message
    : 'שגיאה בטעינת הקטגוריות. נסו שוב.';
}

/**
 * אריח קטגוריה: תמונת רקע עם שכבת האפלה בגוון דיו (מדורגת — כהה יותר למטה,
 * כדי שהכותרת הלבנה תישאר קריאה), או אריח אות פותחת כשאין תמונה.
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
  const hasImage = collection.image != null;
  const fg = hasImage ? colors.onInk : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={collection.title}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width, height }, pressed && styles.tilePressed]}
    >
      {hasImage && collection.image != null ? (
        <>
          <Image
            source={{ uri: collection.image.url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            accessibilityLabel={collection.image.altText ?? collection.title}
          />
          {/* שכבות האפלה נערמות — מדמות מעבר הדרגתי לכהה בתחתית */}
          <View style={styles.overlayFull} />
          <View style={styles.overlayLower} />
          <View style={styles.overlayBottom} />
        </>
      ) : (
        <View style={styles.letterWrap}>
          <Text
            style={[styles.letter, { fontSize: height * 0.42 }]}
            allowFontScaling={false}
          >
            {collection.title.trim().charAt(0)}
          </Text>
        </View>
      )}
      <View style={styles.tileFooter}>
        <Text style={[styles.tileTitle, { color: fg }]} numberOfLines={2}>
          {collection.title}
        </Text>
        {/* שברון "קדימה" — ‏dir דואג להיפוך תחת RTL */}
        <Icon name="chevron-forward" size={16} color={fg} dir />
      </View>
    </Pressable>
  );
}

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const tileWidth = (width - spacing.lg * 2 - spacing.md) / 2;
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
        <View style={styles.eyebrow} />
        <Text style={styles.headerTitle}>קטגוריות</Text>
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
          numColumns={2}
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
                title="אין קטגוריות להצגה"
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
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerSub: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'right',
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
  overlayFull: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.ink,
    opacity: 0.18,
  },
  overlayLower: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
    backgroundColor: colors.ink,
    opacity: 0.24,
  },
  overlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '34%',
    backgroundColor: colors.ink,
    opacity: 0.32,
  },
  letterWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  letter: {
    fontWeight: '800',
    color: colors.accent,
    opacity: 0.55,
  },
  tileFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
  },
  tileTitle: {
    flex: 1,
    fontSize: typography.body,
    lineHeight: typography.body + 4,
    fontWeight: '700',
    textAlign: 'right',
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
    textAlign: 'right',
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
