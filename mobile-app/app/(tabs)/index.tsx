import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCollectionsByHandle, getProducts } from '@/api/client';
import type { Collection, ProductCardData } from '@/api/types';
import {
  Button,
  Rule,
  Icon,
  ProductCard,
  SectionHeader,
  Skeleton,
  SkeletonProductCard,
  StoreLogo,
} from '@/components';
import {
  BRAND_NAMES,
  HOME_FEED,
  IMPORTERS,
  STORE_INFO,
  TEL_URL,
  WHATSAPP_URL,
} from '@/config';
import { colors, radius, rtlText, shadows, spacing, typography } from '@/theme';

/* ---------- קבועי פריסה ---------- */

const RAIL_CARD_WIDTH = 168;
const COLLECTION_TILE_SIZE = 76;
const BRAND_TILE_WIDTH = 132;

/* ---------- טעינת נתונים אזורית ---------- */

function errorText(err: unknown): string {
  return err instanceof Error && err.message !== ''
    ? err.message
    : 'שגיאה בטעינת הנתונים. נסו שוב.';
}

type RegionStatus = 'loading' | 'error' | 'ready';

interface RegionState<T> {
  status: RegionStatus;
  data: T | null;
  message: string;
}

/**
 * אזור נתונים עצמאי במסך הבית: טעינה, שגיאה עם ניסיון חוזר ורענון שקט.
 * כשל באזור אחד מציג שגיאה מקומית — ולא מרוקן את שאר המסך.
 */
function useRegion<T>(load: () => Promise<T>) {
  const [state, setState] = useState<RegionState<T>>({
    status: 'loading',
    data: null,
    message: '',
  });
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) =>
      prev.data == null ? { status: 'loading', data: null, message: '' } : prev
    );
    try {
      const data = await load();
      if (id === requestId.current) setState({ status: 'ready', data, message: '' });
    } catch (err) {
      if (id === requestId.current) {
        setState((prev) =>
          // אם כבר יש תוכן על המסך — רענון כושל לא מוחק אותו
          prev.data == null
            ? { status: 'error', data: null, message: errorText(err) }
            : prev
        );
      }
    }
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

/**
 * המחלקות של מסך הבית — בדיוק אותן מחלקות, באותו סדר, כמו רצועת "המחלקות
 * שלנו" באתר (theme/templates/index.json → section `category_rail`).
 *
 * קודם עמד כאן `getCollections(10)`, שמחזיר את עשר הקטגוריות הראשונות בסדר
 * ברירת המחדל של שופיפיי — כלומר משהו שאין לו שום קשר למחלקות שבאתר. זו
 * הסיבה שהרצועה באפליקציה לא נראתה כמו באתר.
 *
 * handles שלא קיימים בחנות מסוננים בשקט על ידי getCollectionsByHandle, כך
 * ששינוי בקטלוג לא שובר את המסך.
 */
const loadCollections = async (): Promise<Collection[]> =>
  getCollectionsByHandle(HOME_FEED.departments);
/** פס המותגים — אותם מותגים ובאותו סדר כמו "המותגים שאנחנו מייצגים" באתר */
const loadBrands = async (): Promise<Collection[]> =>
  getCollectionsByHandle(HOME_FEED.brands);

const loadBestSellers = async (): Promise<ProductCardData[]> =>
  (await getProducts({ first: 6, sortKey: 'BEST_SELLING' })).nodes;
const loadNewArrivals = async (): Promise<ProductCardData[]> =>
  (await getProducts({ first: 8, sortKey: 'CREATED_AT', reverse: true })).nodes;

/* ---------- רכיבי עזר מקומיים ---------- */

/** שגיאה אזורית — שורת התראה עם כפתור ניסיון חוזר, במקום מסך שגיאה מלא */
function RegionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.regionError}>
      <Icon name="alert-circle-outline" size={20} color={colors.danger} />
      <Text style={styles.regionErrorText} numberOfLines={3}>
        {rtlText(message)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="נסו שוב"
        onPress={onRetry}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.regionRetry, pressed && styles.pressed]}
      >
        <Text style={styles.regionRetryText}>נסו שוב</Text>
      </Pressable>
    </View>
  );
}

/** אריח קטגוריה עגול-פינות לפס הקטגוריות — תמונה או אות פותחת כגיבוי */
function CollectionTile({
  collection,
  onPress,
}: {
  collection: Collection;
  onPress: () => void;
}) {
  const letter = collection.title.trim().charAt(0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={collection.title}
      onPress={onPress}
      style={({ pressed }) => [styles.collectionTile, pressed && styles.pressed]}
    >
      <View style={styles.collectionImageWrap}>
        {collection.image != null ? (
          <Image
            source={{ uri: collection.image.url }}
            style={styles.collectionImage}
            /* contain, לא cover: חלק מהמחלקות והמותגים מיוצגים בלוגו ולא
               בצילום, ו-cover חותך אותם. ראו ProductCard וגם מערכת העיצוב
               של האתר — תמונות קטלוג יושבות על לבן ב-contain. */
            contentFit="contain"
            transition={200}
            accessibilityLabel={collection.image.altText ?? collection.title}
          />
        ) : (
          <View style={styles.collectionLetterWrap}>
            <Text style={styles.collectionLetter} allowFontScaling={false}>
              {letter}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.collectionTitle} numberOfLines={2}>
        {rtlText(collection.title)}
      </Text>
    </Pressable>
  );
}

/**
 * אריח מותג — הלוגו על לבן ב-contain.
 *
 * תמונות הקולקציות של המותגים הן קובצי לוגו (makita-logo.png, Grohe-logo.png
 * וכו'), ולכן contain ולא cover, ורקע לבן ולא גוון — בדיוק מהסיבה שהאריחים
 * בקטלוג תוקנו. השם מגיע מ-BRAND_NAMES כשיש override, אחרת מכותרת הקולקציה.
 */
function BrandTile({
  collection,
  importer,
  onPress,
}: {
  collection: Collection;
  importer?: { importer: string; note: string; badgeUrl: string };
  onPress: () => void;
}) {
  const label = BRAND_NAMES[collection.handle] ?? collection.title;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.brandTile, pressed && styles.pressed]}
    >
      <View style={styles.brandLogoWrap}>
        {collection.image != null ? (
          <Image
            source={{ uri: collection.image.url }}
            style={styles.brandLogo}
            contentFit="contain"
            transition={200}
            accessibilityLabel={collection.image.altText ?? label}
          />
        ) : (
          <Text style={styles.brandFallback} numberOfLines={2}>
            {rtlText(label)}
          </Text>
        )}
      </View>
      <Text style={styles.brandName} numberOfLines={2}>
        {rtlText(label)}
      </Text>
      {importer != null && (
        <View style={styles.importerRow}>
          {importer.badgeUrl !== '' && (
            <Image
              source={{ uri: importer.badgeUrl }}
              style={styles.importerBadge}
              contentFit="contain"
              accessibilityLabel={`תג יבואן רשמי ${importer.importer}`}
            />
          )}
          <Text style={styles.importerText} numberOfLines={2}>
            {`${importer.note} · ${importer.importer}`}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------- מסך הבית ---------- */

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const collections = useRegion(loadCollections);
  const brands = useRegion(loadBrands);
  const bestSellers = useRegion(loadBestSellers);
  const newArrivals = useRegion(loadNewArrivals);
  const [refreshing, setRefreshing] = useState(false);

  const gridCardWidth = (width - spacing.lg * 2 - spacing.md) / 2;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      collections.reload(),
      brands.reload(),
      bestSellers.reload(),
      newArrivals.reload(),
    ]);
    setRefreshing(false);
  }, [collections.reload, brands.reload, bestSellers.reload, newArrivals.reload]);

  const goCatalog = useCallback(() => {
    router.push('/catalog');
  }, [router]);

  const goCollection = useCallback(
    (handle: string) => {
      router.push(`/collection/${handle}`);
    },
    [router]
  );

  const callStore = useCallback(() => {
    Linking.openURL(TEL_URL).catch(() => {});
  }, []);

  const hasWhatsapp = WHATSAPP_URL !== '';
  const openWhatsapp = useCallback(() => {
    Linking.openURL(WHATSAPP_URL).catch(() => {});
  }, []);

  // מדורים ריקים (חנות בלי נתונים) מוסתרים — המסך לעולם לא נשאר ריק כי
  // הכותרת, ההירו וכרטיס יצירת הקשר תמיד מוצגים.
  const hideCollections =
    collections.status === 'ready' && (collections.data?.length ?? 0) === 0;
  const hideBrands = brands.status === 'ready' && (brands.data?.length ?? 0) === 0;
  const hideBestSellers =
    bestSellers.status === 'ready' && (bestSellers.data?.length ?? 0) === 0;
  const hideNewArrivals =
    newArrivals.status === 'ready' && (newArrivals.data?.length ?? 0) === 0;

  return (
    <View style={styles.screen}>
      {/* כותרת המסך — שם החנות, סלוגן וכפתור חיוג */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerText}>
          {/* הלוגו האמיתי של החנות, מה-CDN — אותו קובץ שההדר באתר מציג */}
          <StoreLogo height={34} />
          <Text style={styles.tagline} numberOfLines={1}>
            {STORE_INFO.tagline}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`חיוג לחנות: ${STORE_INFO.phone}`}
          onPress={callStore}
          hitSlop={spacing.xs}
          style={({ pressed }) => [styles.phoneButton, pressed && styles.pressed]}
        >
          <Icon name="call" size={20} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* באנר הירו — רקע דיו, כותרת כתומה ומוטיב פס אזהרה */}
        <View style={styles.hero}>
          <Icon name="hammer" size={150} color={colors.onInk} style={styles.heroDecor} />
          <View style={styles.heroContent}>
            <Text style={styles.heroKicker}>{STORE_INFO.tagline}</Text>
            <Text style={styles.heroTitle}>כל מה שהמקצוענים צריכים</Text>
            <Text style={styles.heroSub}>
              חומרי בניין, כלי עבודה ואספקה טכנית - הכול במקום אחד, עם שירות אישי של
              אנשי מקצוע.
            </Text>
            <Button title="לכל המחלקות" onPress={goCatalog} style={styles.heroCta} />
          </View>
          <Rule />
        </View>

        {/* פס קטגוריות אופקי */}
        {!hideCollections && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader
                title="קנייה לפי מחלקה"
                actionLabel="לכל המחלקות"
                onAction={goCatalog}
              />
            </View>
            {collections.status === 'loading' && (
              <View style={styles.railSkeleton}>
                {Array.from({ length: 4 }, (_, i) => (
                  <View key={i} style={styles.collectionTileSkeleton}>
                    <Skeleton
                      width={COLLECTION_TILE_SIZE}
                      height={COLLECTION_TILE_SIZE}
                      radius={radius.lg}
                    />
                    <Skeleton width={COLLECTION_TILE_SIZE - 20} height={10} />
                  </View>
                ))}
              </View>
            )}
            {collections.status === 'error' && (
              <RegionError message={collections.message} onRetry={collections.reload} />
            )}
            {collections.status === 'ready' && collections.data != null && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
              >
                {collections.data.map((c) => (
                  <CollectionTile
                    key={c.id}
                    collection={c}
                    onPress={() => goCollection(c.handle)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* פס המותגים — מקביל ל"המותגים שאנחנו מייצגים" באתר */}
        {!hideBrands && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader title="המותגים שאנחנו מייצגים" />
            </View>
            {brands.status === 'loading' && (
              <View style={styles.railSkeleton}>
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} width={BRAND_TILE_WIDTH} height={116} radius={radius.card} />
                ))}
              </View>
            )}
            {brands.status === 'error' && (
              <RegionError message={brands.message} onRetry={brands.reload} />
            )}
            {brands.status === 'ready' && brands.data != null && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
              >
                {brands.data.map((c) => (
                  <BrandTile
                    key={c.id}
                    collection={c}
                    importer={IMPORTERS.find((i) => i.collection === c.handle)}
                    onPress={() => goCollection(c.handle)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* הנמכרים ביותר — רשת שני טורים */}
        {!hideBestSellers && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader title="הנמכרים ביותר" />
            </View>
            {bestSellers.status === 'loading' && (
              <View style={styles.grid}>
                {Array.from({ length: 4 }, (_, i) => (
                  <SkeletonProductCard key={i} width={gridCardWidth} />
                ))}
              </View>
            )}
            {bestSellers.status === 'error' && (
              <RegionError message={bestSellers.message} onRetry={bestSellers.reload} />
            )}
            {bestSellers.status === 'ready' && bestSellers.data != null && (
              <View style={styles.grid}>
                {bestSellers.data.map((p) => (
                  <ProductCard key={p.id} product={p} width={gridCardWidth} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* חדשים אצלנו — פס מוצרים אופקי */}
        {!hideNewArrivals && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader title="חדשים אצלנו" />
            </View>
            {newArrivals.status === 'loading' && (
              <View style={styles.railSkeleton}>
                {Array.from({ length: 3 }, (_, i) => (
                  <SkeletonProductCard key={i} width={RAIL_CARD_WIDTH} />
                ))}
              </View>
            )}
            {newArrivals.status === 'error' && (
              <RegionError message={newArrivals.message} onRetry={newArrivals.reload} />
            )}
            {newArrivals.status === 'ready' && newArrivals.data != null && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
              >
                {newArrivals.data.map((p) => (
                  <ProductCard key={p.id} product={p} width={RAIL_CARD_WIDTH} />
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* כרטיס יצירת קשר — טלפון, וואטסאפ ושעות פעילות */}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>צריכים ייעוץ מקצועי?</Text>
          <Text style={styles.contactText}>
            הצוות שלנו זמין לכל שאלה - מחירים, מלאי, אספקה והתאמת חומרים לפרויקט.
          </Text>
          <View style={styles.contactButtons}>
            <Button
              title="התקשרו אלינו"
              onPress={callStore}
              style={styles.contactButton}
              icon={<Icon name="call" size={16} color={colors.onAccent} />}
            />
            {hasWhatsapp && (
              <Button
                title="וואטסאפ"
                variant="secondary"
                onPress={openWhatsapp}
                style={styles.contactButton}
                icon={<Icon name="logo-whatsapp" size={16} color={colors.onInk} />}
              />
            )}
          </View>
          <View style={styles.contactDivider} />
          <View style={styles.contactMetaRow}>
            <Icon name="time-outline" size={16} color={colors.textMuted} />
            <Text style={styles.contactMetaTitle}>שעות פעילות</Text>
          </View>
          {STORE_INFO.hours.map((row) => (
            <View key={row.days} style={styles.hoursRow}>
              <Text style={styles.hoursDays}>{row.days}</Text>
              <Text style={styles.hoursValue} allowFontScaling={false}>
                {row.hours}
              </Text>
            </View>
          ))}
          <View style={styles.contactMetaRow}>
            <Icon name="location-outline" size={16} color={colors.textMuted} />
            <Text style={styles.addressText}>{STORE_INFO.address}</Text>
          </View>
        </View>
      </ScrollView>
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

  /* כותרת */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  headerText: {
    flexShrink: 1,
    gap: 2,
  },
  storeName: {
    fontSize: typography.h2,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tagline: {
    fontSize: typography.tiny,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  phoneButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* תוכן נגלל */
  scrollContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },

  /* הירו */
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    overflow: 'hidden',
    ...shadows.raised,
  },
  heroDecor: {
    position: 'absolute',
    left: -spacing.xl,
    bottom: spacing.xl,
    opacity: 0.08,
    transform: [{ rotate: '-15deg' }],
  },
  heroContent: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroKicker: {
    fontSize: typography.tiny,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.onInk,
    opacity: 0.65,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroTitle: {
    fontSize: typography.h1,
    lineHeight: typography.h1 + 7,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroSub: {
    fontSize: typography.small,
    lineHeight: typography.small + 8,
    color: colors.onInk,
    opacity: 0.85,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },

  /* מדורים */
  section: {
    gap: spacing.md,
  },
  sectionHeaderWrap: {
    paddingHorizontal: spacing.lg,
  },
  railContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  railSkeleton: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },

  /* אריחי קטגוריות */
  collectionTile: {
    width: COLLECTION_TILE_SIZE + spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  collectionTileSkeleton: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  collectionImageWrap: {
    width: COLLECTION_TILE_SIZE,
    height: COLLECTION_TILE_SIZE,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    /* לבן, לא surfaceAlt — לוגואים של מותגים מגיעים על רקע לבן, וכל גוון
       אחר יוצר מסגרת אפורה מסביבם */
    backgroundColor: colors.surface,
    padding: spacing.xs,
  },
  collectionImage: {
    width: '100%',
    height: '100%',
  },
  collectionLetterWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  collectionLetter: {
    fontSize: typography.h1,
    fontWeight: '800',
    color: colors.accent,
  },
  collectionTitle: {
    fontSize: typography.tiny,
    lineHeight: typography.tiny + 4,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  headerLogo: {
    width: 168,
    height: 34,
  },

  /* אריחי מותגים */
  brandTile: {
    width: BRAND_TILE_WIDTH,
    gap: spacing.sm,
  },
  brandLogoWrap: {
    height: 72,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    /* לבן — לוגואים מגיעים על רקע לבן */
    backgroundColor: colors.surface,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandFallback: {
    fontSize: typography.small,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  brandName: {
    fontSize: typography.tiny,
    lineHeight: typography.tiny + 4,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  importerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  importerBadge: {
    width: 22,
    height: 22,
  },
  importerText: {
    flex: 1,
    fontSize: typography.tiny - 1,
    lineHeight: typography.tiny + 3,
    fontWeight: '600',
    color: colors.success,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  /* שגיאה אזורית */
  regionError: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  regionErrorText: {
    flex: 1,
    fontSize: typography.small,
    lineHeight: typography.small + 5,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  regionRetry: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  regionRetryText: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.danger,
  },

  /* כרטיס יצירת קשר */
  contactCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  contactTitle: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  contactText: {
    fontSize: typography.small,
    lineHeight: typography.small + 7,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  contactButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  contactButton: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  contactDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  contactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactMetaTitle: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: spacing.xl,
  },
  hoursDays: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.text,
    writingDirection: 'rtl',
  },
  hoursValue: {
    fontSize: typography.small,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  addressText: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
