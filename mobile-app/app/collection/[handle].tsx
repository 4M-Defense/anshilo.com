import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { getCollectionProducts, type CollectionSort } from '@/api/client';
import type { Collection, PageInfo, ProductCardData, StorefrontFilter } from '@/api/types';
import {
  EmptyState,
  ErrorView,
  FilterSheet,
  Icon,
  NO_FILTERS,
  ProductCard,
  Skeleton,
  SkeletonProductCard,
  countApplied,
  toFilterInputs,
  type AppliedFilters,
} from '@/components';
import { alignEnd, colors, radius, rtlText, gridColumns, gridItemWidth, spacing, typography } from '@/theme';

const PAGE_SIZE = 24;
/** תיאור ארוך מזה מקבל "קרא עוד" */
const LONG_DESCRIPTION = 140;

const SORT_OPTIONS: { key: CollectionSort; label: string }[] = [
  { key: 'default', label: 'מומלץ' },
  { key: 'best_selling', label: 'הנמכרים ביותר' },
  { key: 'price_asc', label: 'מחיר: מהנמוך לגבוה' },
  { key: 'price_desc', label: 'מחיר: מהגבוה לנמוך' },
  { key: 'newest', label: 'החדשים ביותר' },
  { key: 'title', label: 'א׳-ב׳' },
];

function errorText(err: unknown): string {
  return err instanceof Error && err.message !== ''
    ? err.message
    : 'שגיאה בטעינת המוצרים. נסו שוב.';
}

type ScreenState = 'loading' | 'error' | 'notFound' | 'ready';
type LoadMode = 'initial' | 'sort' | 'refresh';

export default function CollectionScreen() {
  const params = useLocalSearchParams<{ handle: string }>();
  const handle = typeof params.handle === 'string' ? params.handle : '';
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = gridColumns(width);
  const cardWidth = gridItemWidth(width, columns);

  const [meta, setMeta] = useState<Collection | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [screenError, setScreenError] = useState('');
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasNextPage: false, endCursor: null });
  const [sort, setSort] = useState<CollectionSort>('default');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [footerError, setFooterError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  /* הפאסטות שהחנות מציעה למחלקה, ומה שנבחר מהן */
  const [filters, setFilters] = useState<StorefrontFilter[]>([]);
  const [applied, setApplied] = useState<AppliedFilters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [totalShown, setTotalShown] = useState(0);
  const requestId = useRef(0);
  const listRef = useRef<FlatList<ProductCardData>>(null);

  const loadPage = useCallback(
    async (sortKey: CollectionSort, mode: LoadMode, activeFilters: AppliedFilters) => {
      const id = ++requestId.current;
      if (mode === 'initial') {
        setScreenState('loading');
        setScreenError('');
      } else if (mode === 'sort') {
        setListLoading(true);
        setListError('');
        setProducts([]);
      }
      setFooterError('');
      try {
        const result = await getCollectionProducts(handle, {
          first: PAGE_SIZE,
          sort: sortKey,
          filters: toFilterInputs(activeFilters),
        });
        if (id !== requestId.current) return;
        if (result == null) {
          setScreenState('notFound');
          return;
        }
        setMeta(result);
        setProducts(result.products.nodes);
        setPageInfo(result.products.pageInfo);
        /*
         * הפאסטות מוחלפות רק כשהחנות החזירה משהו. תשובה מסוננת שמצמצמת ל-0
         * מוצרים מחזירה לפעמים רשימה ריקה, ואיפוס לפיה היה מרוקן את המגירה
         * ומונע מהמשתמש לבטל את הסינון שהוא בעצמו בחר.
         */
        if (result.products.filters != null && result.products.filters.length > 0) {
          setFilters(result.products.filters);
        }
        setTotalShown(result.products.nodes.length);
        setListLoading(false);
        setListError('');
        setScreenState('ready');
      } catch (err) {
        if (id !== requestId.current) return;
        const msg = errorText(err);
        if (mode === 'initial') {
          setScreenState('error');
          setScreenError(msg);
        } else if (mode === 'sort') {
          setListLoading(false);
          setListError(msg);
        }
        // mode === 'refresh': רענון כושל לא מוחק תוכן קיים
      }
    },
    /*
     * `applied` בכוונה *לא* כאן. הפילטרים מגיעים כפרמטר, ולכן זהות `loadPage`
     * לא משתנה כשמסננים — אחרת האפקט שלמטה, שתלוי בה, היה נורה שוב בכל החלת
     * סינון: מאפס את המיון ל"ברירת מחדל", מבזיק שלד על כל המסך ושולח בקשה
     * שנייה מיותרת.
     */
    [handle]
  );

  useEffect(() => {
    setSort('default');
    setDescExpanded(false);
    /*
     * הפאסטות והבחירה מתאפסות עם המחלקה: הן מוגדרות פר-מחלקה, ומזהי הערכים
     * של מחלקה אחת אינם קיימים באחרת.
     */
    setApplied(NO_FILTERS);
    setFilters([]);
    if (handle === '') {
      setScreenState('notFound');
      return;
    }
    loadPage('default', 'initial', NO_FILTERS);
  }, [handle, loadPage]);

  const changeSort = useCallback(
    (key: CollectionSort) => {
      if (key === sort) return;
      setSort(key);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      loadPage(key, 'sort', applied);
    },
    [sort, loadPage, applied]
  );

  const appliedCount = countApplied(applied);

  /**
   * החלת סינון — מאפסת עימוד וגוללת למעלה, כמו החלפת מיון.
   * הפילטרים מועברים במפורש ל-`loadPage` ולא נשענים על ה-state, כי `setApplied`
   * אינו סינכרוני והבקשה הייתה יוצאת עם הבחירה הקודמת.
   */
  const changeFilters = useCallback(
    (next: AppliedFilters) => {
      setApplied(next);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      loadPage(sort, 'sort', next);
    },
    [sort, loadPage]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(sort, 'refresh', applied);
    setRefreshing(false);
  }, [sort, loadPage, applied]);

  const loadMore = useCallback(async () => {
    if (
      screenState !== 'ready' ||
      listLoading ||
      loadingMore ||
      refreshing ||
      !pageInfo.hasNextPage ||
      pageInfo.endCursor == null
    ) {
      return;
    }
    const id = requestId.current;
    setLoadingMore(true);
    setFooterError('');
    try {
      const result = await getCollectionProducts(handle, {
        first: PAGE_SIZE,
        after: pageInfo.endCursor,
        sort,
        /* בלי זה העמוד השני היה מתעלם מהסינון ומחזיר מוצרים שסוננו */
        filters: toFilterInputs(applied),
      });
      if (id !== requestId.current) return;
      if (result == null) return;
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = [...prev, ...result.products.nodes.filter((p) => !seen.has(p.id))];
        setTotalShown(next.length);
        return next;
      });
      setPageInfo(result.products.pageInfo);
    } catch (err) {
      if (id === requestId.current) setFooterError(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  }, [screenState, listLoading, loadingMore, refreshing, pageInfo, handle, sort]);

  const renderProduct = useCallback(
    ({ item }: ListRenderItemInfo<ProductCardData>) => (
      <ProductCard product={item} width={cardWidth} />
    ),
    [cardWidth]
  );

  /* ---------- חלקי רשימה ---------- */

  const description = meta?.description.trim() ?? '';
  const isLongDesc = description.length > LONG_DESCRIPTION;

  const listHeader = (
    <View style={styles.listHeader}>
      {description !== '' && (
        <View style={styles.descriptionWrap}>
          <Text
            style={styles.description}
            numberOfLines={descExpanded || !isLongDesc ? undefined : 3}
          >
            {rtlText(description)}
          </Text>
          {isLongDesc && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={descExpanded ? 'הצג פחות' : 'קרא עוד'}
              onPress={() => setDescExpanded((v) => !v)}
              hitSlop={spacing.sm}
            >
              <Text style={styles.readMore}>{descExpanded ? 'הצג פחות' : 'קרא עוד'}</Text>
            </Pressable>
          )}
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {/* הסינון ראשון בשורה — ב-RTL זה הפריט הימני, לפני אפשרויות המיון */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            appliedCount > 0 ? `סינון, ${appliedCount} פעילים` : 'סינון'
          }
          onPress={() => setSheetOpen(true)}
          style={[styles.chip, styles.filterChip, appliedCount > 0 && styles.chipActive]}
        >
          <Icon
            name="options-outline"
            size={14}
            color={appliedCount > 0 ? colors.onAccent : colors.ink}
          />
          <Text
            style={[styles.chipLabel, appliedCount > 0 && styles.chipLabelActive]}
            allowFontScaling={false}
          >
            {appliedCount > 0 ? `סינון · ${appliedCount}` : 'סינון'}
          </Text>
        </Pressable>
        {appliedCount > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ניקוי הסינון"
            onPress={() => changeFilters(NO_FILTERS)}
            style={[styles.chip, styles.clearChip]}
          >
            <Icon name="close" size={13} color={colors.danger} />
            <Text style={[styles.chipLabel, styles.clearChipLabel]} allowFontScaling={false}>
              נקה
            </Text>
          </Pressable>
        )}
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sort;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={`מיון: ${opt.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => changeSort(opt.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
                allowFontScaling={false}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const listEmpty = listLoading ? (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonProductCard key={i} width={cardWidth} />
      ))}
    </View>
  ) : listError !== '' ? (
    <ErrorView message={listError} onRetry={() => loadPage(sort, 'sort', applied)} />
  ) : appliedCount > 0 ? (
    /*
     * ריק *בגלל הסינון* הוא מצב אחר לגמרי מ"המחלקה ריקה": ההודעה הכללית הייתה
     * טוענת שאין מוצרים במחלקה, והכפתור היה שולח לכל המחלקות — בדיוק הפעולה
     * הלא נכונה. כאן הפעולה היא לנקות את הסינון ולראות את המחלקה שוב.
     */
    <EmptyState
      icon="options-outline"
      title="אין מוצרים שעונים על הסינון"
      text="נסו להסיר חלק מהתנאים, או להרחיב את טווח המחירים."
      actionLabel="ניקוי הסינון"
      onAction={() => changeFilters(NO_FILTERS)}
    />
  ) : (
    <EmptyState
      icon="file-tray-outline"
      title="אין מוצרים במחלקה הזו"
      text="נסו מחלקה אחרת, או חפשו מוצר ספציפי בחיפוש."
      actionLabel="לכל המחלקות"
      onAction={() => router.push('/catalog')}
    />
  );

  const listFooter = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator size="small" color={colors.accent} />
    </View>
  ) : footerError !== '' ? (
    <View style={styles.footerError}>
      <Text style={styles.footerErrorText} numberOfLines={2}>
        {rtlText(footerError)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="נסו שוב"
        onPress={loadMore}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.footerRetry, pressed && styles.pressed]}
      >
        <Text style={styles.footerRetryText}>נסו שוב</Text>
      </Pressable>
    </View>
  ) : null;

  /* ---------- מסך ---------- */

  return (
    <View style={styles.screen}>
      {/* הכותרת המובנית מקבלת את שם הקטגוריה ברגע שנטענה */}
      <Stack.Screen options={{ title: rtlText(meta?.title) }} />

      {screenState === 'loading' && (
        <View style={styles.loadingBody}>
          <Skeleton width="62%" height={14} />
          <Skeleton width="40%" height={14} />
          <View style={styles.loadingChips}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} width={82} height={34} radius={radius.pill} />
            ))}
          </View>
          <View style={styles.skeletonGridBare}>
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonProductCard key={i} width={cardWidth} />
            ))}
          </View>
        </View>
      )}

      {screenState === 'error' && (
        <ErrorView message={screenError} onRetry={() => loadPage(sort, 'initial', applied)} />
      )}

      {screenState === 'notFound' && (
        <View style={styles.centerFill}>
          <EmptyState
            icon="grid-outline"
            title="המחלקה לא נמצאה"
            text="ייתכן שהמחלקה הוסרה מהחנות או שהקישור אינו תקין."
            actionLabel="לכל המחלקות"
            onAction={() => router.replace('/catalog')}
          />
        </View>
      )}

      {screenState === 'ready' && (
        <FlatList
          ref={listRef}
          data={listLoading ? [] : products}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          key={`grid-${columns}`}
          renderItem={renderProduct}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        applied={applied}
        resultCount={totalShown}
        onClose={() => setSheetOpen(false)}
        onApply={changeFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pressed: {
    opacity: 0.7,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },

  /* שלד טעינה ראשונית */
  loadingBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  loadingChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  skeletonGridBare: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },

  /* ראש הרשימה — תיאור + מיון */
  listHeader: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  descriptionWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  description: {
    fontSize: typography.small,
    lineHeight: typography.small + 8,
    color: colors.textMuted,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  readMore: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.accent,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderColor: colors.danger,
  },
  clearChipLabel: {
    color: colors.danger,
    fontWeight: '700',
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.text,
  },
  chipLabelActive: {
    color: colors.onInk,
    fontWeight: '700',
  },

  /* רשת המוצרים */
  listContent: {
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
