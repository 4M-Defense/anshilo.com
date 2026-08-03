import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchProducts } from '@/api/client';
import type { PageInfo, ProductCardData } from '@/api/types';
import { EmptyState, ErrorView, Icon, ProductCard, SkeletonProductCard } from '@/components';
import { POPULAR_SEARCHES } from '@/config';
import { colors, radius, spacing, typography } from '@/theme';

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 350;
const RECENT_KEY = 'shilo.recentSearches';
const MAX_RECENT = 8;

/* הצעות החיפוש נשאבות מ-src/config.ts, שם הן מתועדות כזהות ל-popular_searches
   של הת'ים. הרשימה כאן הייתה רשימה שנייה, שונה, שהצילה את הראשונה — כך שהצ'יפים
   באפליקציה ובאתר הציעו מונחים אחרים. */

function errorText(err: unknown): string {
  return err instanceof Error && err.message !== ''
    ? err.message
    : 'שגיאה בחיפוש. נסו שוב.';
}

/** צ'יפ חיפוש — "אחרון" (ניטרלי עם אייקון שעון) או "פופולרי" (בגוון המבטא) */
function SearchChip({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: 'recent' | 'popular';
  onPress: () => void;
}) {
  const popular = tone === 'popular';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`חיפוש ${label}`}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => [
        styles.chip,
        popular && styles.chipPopular,
        pressed && styles.chipPressed,
      ]}
    >
      <Icon
        name={popular ? 'search' : 'time-outline'}
        size={13}
        color={popular ? colors.accent : colors.textMuted}
      />
      <Text
        style={[styles.chipText, popular && styles.chipTextPopular]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = (width - spacing.lg * 2 - spacing.md) / 2;

  const [text, setText] = useState('');
  const trimmed = text.trim();

  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasNextPage: false, endCursor: null });
  const [executedQuery, setExecutedQuery] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [footerError, setFooterError] = useState('');

  const [recent, setRecent] = useState<string[]>([]);

  const requestId = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** מחרוזת שסומנה לחיפוש מיידי (צ'יפ) — עוקפת את ההשהיה */
  const immediateRef = useRef<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  /* ---------- חיפושים אחרונים (AsyncStorage) ---------- */

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (raw == null) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecent(parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT));
        }
      })
      .catch(() => {});
  }, []);

  const saveRecent = useCallback((q: string) => {
    setRecent((prev) => {
      const next = [q, ...prev.filter((item) => item !== q)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  }, []);

  /* ---------- ביצוע חיפוש ---------- */

  const runSearch = useCallback(async (q: string) => {
    const id = ++requestId.current;
    setStatus('loading');
    setMessage('');
    setFooterError('');
    try {
      const page = await searchProducts(q, { first: PAGE_SIZE });
      if (id !== requestId.current) return;
      setResults(page.nodes);
      setPageInfo(page.pageInfo);
      setTotalCount(page.totalCount);
      setExecutedQuery(q);
      setStatus('ready');
    } catch (err) {
      if (id !== requestId.current) return;
      setStatus('error');
      setMessage(errorText(err));
    }
  }, []);

  /** השהיית 350ms על הקלדה; מחרוזת ריקה מחזירה למצב התחלתי */
  useEffect(() => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    if (trimmed === '') {
      requestId.current++; // ביטול חיפוש שבדרך
      immediateRef.current = null;
      setStatus('idle');
      setResults([]);
      setTotalCount(0);
      setPageInfo({ hasNextPage: false, endCursor: null });
      setFooterError('');
      return;
    }
    if (immediateRef.current === trimmed) {
      immediateRef.current = null;
      runSearch(trimmed);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    };
  }, [trimmed, runSearch]);

  const onSubmit = useCallback(() => {
    if (trimmed === '') return;
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    saveRecent(trimmed);
    runSearch(trimmed);
  }, [trimmed, saveRecent, runSearch]);

  const onChipPress = useCallback(
    (q: string) => {
      Keyboard.dismiss();
      immediateRef.current = q;
      setText(q);
      saveRecent(q);
    },
    [saveRecent]
  );

  const onClear = useCallback(() => {
    setText('');
    inputRef.current?.focus();
  }, []);

  /* ---------- עימוד ---------- */

  const loadMore = useCallback(async () => {
    if (
      loadingMore ||
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
      const page = await searchProducts(executedQuery, {
        first: PAGE_SIZE,
        after: pageInfo.endCursor,
      });
      if (id !== requestId.current) return;
      setResults((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.nodes.filter((p) => !seen.has(p.id))];
      });
      setPageInfo(page.pageInfo);
    } catch (err) {
      if (id === requestId.current) setFooterError(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, status, pageInfo, executedQuery]);

  const renderCard = useCallback(
    ({ item }: ListRenderItemInfo<ProductCardData>) => (
      <ProductCard product={item} width={cardWidth} />
    ),
    [cardWidth]
  );

  /* ---------- תצוגות ---------- */

  const countLine =
    totalCount === 1
      ? `תוצאה אחת עבור „${executedQuery}"`
      : `${totalCount} תוצאות עבור „${executedQuery}"`;

  const listFooter = loadingMore ? (
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
        style={({ pressed }) => [styles.footerRetry, pressed && styles.chipPressed]}
      >
        <Text style={styles.footerRetryText}>נסו שוב</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      {/* כותרת המסך — לטאבים אין header מובנה */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.eyebrow} />
        <Text style={styles.headerTitle}>חיפוש</Text>
        <View style={styles.searchField}>
          <Icon name="search" size={20} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onSubmitEditing={onSubmit}
            placeholder="מה מחפשים? מקדחה, צבע, ברגים…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="שדה חיפוש מוצרים"
            allowFontScaling={false}
          />
          {text !== '' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ניקוי החיפוש"
              onPress={onClear}
              hitSlop={spacing.sm}
              style={({ pressed }) => pressed && styles.chipPressed}
            >
              <Icon
                name="close-circle"
                size={20}
                color={colors.textMuted}
                knockout={colors.surfaceAlt}
              />
            </Pressable>
          )}
        </View>
      </View>

      {status === 'idle' ? (
        /* מצב התחלתי — חיפושים אחרונים ופופולריים */
        <ScrollView
          contentContainerStyle={styles.idleContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {recent.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>חיפושים אחרונים</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ניקוי כל החיפושים האחרונים"
                  onPress={clearRecent}
                  hitSlop={spacing.sm}
                  style={({ pressed }) => pressed && styles.chipPressed}
                >
                  <Text style={styles.clearAll}>ניקוי הכל</Text>
                </Pressable>
              </View>
              <View style={styles.chipsWrap}>
                {recent.map((q) => (
                  <SearchChip key={q} label={q} tone="recent" onPress={() => onChipPress(q)} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>חיפושים פופולריים</Text>
            <View style={styles.chipsWrap}>
              {POPULAR_SEARCHES.map((q) => (
                <SearchChip key={q} label={q} tone="popular" onPress={() => onChipPress(q)} />
              ))}
            </View>
          </View>
        </ScrollView>
      ) : status === 'loading' ? (
        /* שלדי טעינה */
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonProductCard key={i} width={cardWidth} />
          ))}
        </View>
      ) : status === 'error' ? (
        <ErrorView message={message} onRetry={() => runSearch(trimmed !== '' ? trimmed : executedQuery)} />
      ) : results.length === 0 ? (
        /* אין תוצאות */
        <ScrollView
          contentContainerStyle={styles.emptyContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <EmptyState
            icon="search-outline"
            title="לא נמצאו תוצאות"
            text={`לא מצאנו מוצרים עבור „${executedQuery}". נסו מילה כללית יותר או בדקו את האיות — למשל „מקדחה" במקום דגם מסוים.`}
          />
        </ScrollView>
      ) : (
        /* תוצאות */
        <View style={styles.resultsWrap}>
          <Text style={styles.countLine} accessibilityLiveRegion="polite">
            {countLine}
          </Text>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            numColumns={2}
            renderItem={renderCard}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={listFooter}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* כותרת ושדה חיפוש */
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
  searchField: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: typography.body,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 0,
  },

  /* מצב התחלתי */
  idleContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  clearAll: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.accent,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipPopular: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipText: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.text,
    writingDirection: 'rtl',
  },
  chipTextPopular: {
    color: colors.accentHover,
    fontWeight: '700',
  },

  /* טעינה */
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },

  /* תוצאות */
  resultsWrap: {
    flex: 1,
  },
  countLine: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  columnWrapper: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xxl,
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
