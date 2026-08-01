import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ShopifyImage } from '@/api/types';
import { colors, radius, spacing, typography } from '@/theme';
import { Icon } from './Icon';

export interface ImageZoomModalProps {
  images: readonly ShopifyImage[];
  /** אינדקס התמונה לפתיחה; null = סגור */
  initialIndex: number | null;
  /** כיתוב נגישות כשלתמונה אין altText */
  fallbackAlt: string;
  onClose: () => void;
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 260;
const DOUBLE_TAP_ZOOM = 2.5;
/** תזוזה שמעליה המגע נחשב גרירה ולא הקשה */
const TAP_SLOP = 8;
const SETTLE_MS = 180;
/** חלק מרוחב המסך שצריך לגרור כדי להחליף תמונה */
const PAGE_THRESHOLD = 0.28;
const FLING_VX = 0.35;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Mode = 'undecided' | 'page' | 'pan' | 'pinch';

/**
 * מציג תמונות במסך מלא: החלקה בין תמונות, צביטה עד פי 4, הקשה כפולה.
 *
 * ## למה הכול יושב על PanResponder אחד
 *
 * הגרסאות הקודמות שמו את הזום בתוך FlatList אופקי — ScrollView בתוך
 * ScrollView. זה לא עבד, ולא במקרה:
 *
 * - **הבאג שדווח.** ה-zoom המובנה של ScrollView מזיז `contentOffset` ואין
 *   לו מושג של "גבול תמונה", אז התמונה יצאה מהמסך ולא חזרה.
 * - **באנדרואיד לא היה זום בכלל.** `maximumZoomScale`, `centerContent`
 *   ו-`pinchGestureEnabled` מסומנים `@platform ios` ב-RN עצמה.
 * - **האב בלע את הג'סטורה.** נמדד על אמולטור: ה-ScrollView של ה-FlatList
 *   מיירט את אירועי התנועה לפני שהילד מספיק להתמודד, ולכן
 *   `onMoveShouldSetPanResponder` של הילד **לא נקרא ולו פעם אחת**.
 *   לכבות `scrollEnabled` באמצע ג'סטורה כדי לעקוף את זה הוא בדיוק מה
 *   שגרם לקפיצות בגרסה שלפניה.
 *
 * לכן אין כאן ScrollView בכלל. מזהה ג'סטורה אחד מחליט בעצמו בין דפדוף,
 * גרירה וצביטה, וההזזה נחתכת לגבולות התמונה בכל פעימה — כך שאין מצב שבו
 * התמונה יכולה לצאת מהמסגרת. אותו קוד רץ בשתי הפלטפורמות.
 *
 * הכול על ליבת react-native: gesture-handler ו-reanimated נמדדו בסבב 12
 * והזיזו את טביעת הריצה, כלומר היו מחייבים בנייה חדשה ומנתקים את הבנייה
 * המותקנת מהעדכונים האלחוטיים.
 */
export function ImageZoomModal({ images, initialIndex, fallbackAlt, onClose }: ImageZoomModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const open = initialIndex != null;
  const count = images.length;

  const [page, setPage] = useState(initialIndex ?? 0);
  const pageRef = useRef(page);
  pageRef.current = page;

  /* מיקום רצועת התמונות, וטרנספורם התמונה הפעילה */
  const strip = useRef(new Animated.Value(0)).current;
  const aScale = useRef(new Animated.Value(1)).current;
  const aX = useRef(new Animated.Value(0)).current;
  const aY = useRef(new Animated.Value(0)).current;

  const scale = useRef(1);
  const tx = useRef(0);
  const ty = useRef(0);

  const mode = useRef<Mode>('undecided');
  const start = useRef({ scale: 1, x: 0, y: 0, dist: 0, fx: 0, fy: 0 });
  const lastTap = useRef(0);
  const maxTouches = useRef(0);

  /** תיבת התמונה הפעילה תחת contentFit="contain" — לא תיבת המסך */
  const box = useMemo(() => {
    const im = images[page];
    const ratio = im?.width && im?.height ? im.width / im.height : 1;
    const w = Math.min(width, height * ratio);
    return { w, h: w / ratio };
  }, [images, page, width, height]);
  const boxRef = useRef(box);
  boxRef.current = box;

  /** גבול ההזזה בסקייל נתון: חצי מהחלק של התמונה שחורג מהמסך */
  const limits = useCallback(
    (s: number) => ({
      x: Math.max(0, (boxRef.current.w * s - width) / 2),
      y: Math.max(0, (boxRef.current.h * s - height) / 2),
    }),
    [width, height]
  );

  const apply = useCallback(
    (s: number, x: number, y: number) => {
      const lim = limits(s);
      scale.current = s;
      tx.current = clamp(x, -lim.x, lim.x);
      ty.current = clamp(y, -lim.y, lim.y);
      aScale.setValue(s);
      aX.setValue(tx.current);
      aY.setValue(ty.current);
    },
    [limits, aScale, aX, aY]
  );

  const animateTo = useCallback(
    (s: number, x: number, y: number) => {
      const lim = limits(s);
      scale.current = s;
      tx.current = clamp(x, -lim.x, lim.x);
      ty.current = clamp(y, -lim.y, lim.y);
      Animated.parallel([
        Animated.timing(aScale, { toValue: s, duration: SETTLE_MS, useNativeDriver: true }),
        Animated.timing(aX, { toValue: tx.current, duration: SETTLE_MS, useNativeDriver: true }),
        Animated.timing(aY, { toValue: ty.current, duration: SETTLE_MS, useNativeDriver: true }),
      ]).start();
    },
    [limits, aScale, aX, aY]
  );

  const resetZoom = useCallback(() => {
    scale.current = 1;
    tx.current = 0;
    ty.current = 0;
    aScale.setValue(1);
    aX.setValue(0);
    aY.setValue(0);
  }, [aScale, aX, aY]);

  const goToPage = useCallback(
    (next: number, animated: boolean) => {
      const target = clamp(next, 0, Math.max(0, count - 1));
      resetZoom();
      setPage(target);
      pageRef.current = target;
      if (animated) {
        Animated.timing(strip, {
          toValue: -target * width,
          duration: 220,
          useNativeDriver: true,
        }).start();
      } else {
        strip.setValue(-target * width);
      }
    },
    [count, width, strip, resetZoom]
  );

  /* פתיחה: לקפוץ לתמונה שנלחצה בלי אנימציה */
  useEffect(() => {
    if (!open) return;
    const first = clamp(initialIndex ?? 0, 0, Math.max(0, count - 1));
    setPage(first);
    pageRef.current = first;
    resetZoom();
    strip.setValue(-first * width);
  }, [open, initialIndex, count, width, strip, resetZoom]);

  const handleTap = useCallback(
    (px: number, py: number) => {
      const now = Date.now();
      if (now - lastTap.current > DOUBLE_TAP_MS) {
        lastTap.current = now;
        return;
      }
      lastTap.current = 0;
      if (scale.current > 1.01) {
        animateTo(1, 0, 0);
        return;
      }
      /* עוגן ההקשה: הנקודה שמתחת לאצבע נשארת במקומה */
      const fx = px - width / 2;
      const fy = py - height / 2;
      animateTo(DOUBLE_TAP_ZOOM, fx * (1 - DOUBLE_TAP_ZOOM), fy * (1 - DOUBLE_TAP_ZOOM));
    },
    [animateTo, width, height]
  );

  const beginPinch = useCallback(
    (t: readonly { pageX: number; pageY: number }[]) => {
      start.current = {
        scale: scale.current,
        x: tx.current,
        y: ty.current,
        dist: Math.max(1, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY)),
        fx: (t[0].pageX + t[1].pageX) / 2 - width / 2,
        fy: (t[0].pageY + t[1].pageY) / 2 - height / 2,
      };
      mode.current = 'pinch';
    },
    [width, height]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        /* אין ScrollView מעל, ולכן אפשר לתפוס הכול ולהחליט בעצמנו */
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: (e) => {
          mode.current = 'undecided';
          maxTouches.current = e.nativeEvent.touches.length;
          start.current = { scale: scale.current, x: tx.current, y: ty.current, dist: 0, fx: 0, fy: 0 };
        },

        onPanResponderMove: (e, g) => {
          const t = e.nativeEvent.touches;
          maxTouches.current = Math.max(maxTouches.current, t.length);

          if (t.length >= 2) {
            if (mode.current !== 'pinch' || start.current.dist === 0) beginPinch(t);
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            const s = clamp((start.current.scale * dist) / start.current.dist, 1, MAX_ZOOM);
            const fx = (t[0].pageX + t[1].pageX) / 2 - width / 2;
            const fy = (t[0].pageY + t[1].pageY) / 2 - height / 2;
            /*
             * עיגון הצביטה. מ-screen = t + s·p נובע
             * t₁ = f₁ − (s₁/s₀)·(f₀ − t₀), ולכן הנקודה שהייתה מתחת
             * למרכז הצביטה נשארת מתחתיו.
             */
            const k = s / start.current.scale;
            apply(s, fx - k * (start.current.fx - start.current.x), fy - k * (start.current.fy - start.current.y));
            return;
          }

          /* אצבע ירדה בסוף צביטה — ממשיכים כגרירה מהמצב הנוכחי */
          if (mode.current === 'pinch') {
            start.current = { scale: scale.current, x: tx.current, y: ty.current, dist: 0, fx: g.dx, fy: g.dy };
            mode.current = 'pan';
            return;
          }

          if (mode.current === 'undecided') {
            if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) return;
            mode.current = scale.current > 1.01 ? 'pan' : 'page';
          }

          if (mode.current === 'pan') {
            apply(scale.current, start.current.x + (g.dx - start.current.fx), start.current.y + (g.dy - start.current.fy));
          } else {
            /* דפדוף: הרצועה עוקבת אחרי האצבע, עם התנגדות בקצוות */
            const raw = -pageRef.current * width + g.dx;
            const min = -(count - 1) * width;
            const over = raw > 0 ? raw : raw < min ? raw - min : 0;
            strip.setValue(raw - over * 0.6);
          }
        },

        onPanResponderRelease: (e, g) => {
          const wasTap = mode.current === 'undecided' && maxTouches.current <= 1;
          if (mode.current === 'page') {
            const far = Math.abs(g.dx) > width * PAGE_THRESHOLD || Math.abs(g.vx) > FLING_VX;
            /* ב-RTL הכיוון אינו מתהפך: dx הוא קואורדינטות מסך פיזיות */
            const dir = g.dx < 0 ? 1 : -1;
            goToPage(far ? pageRef.current + dir : pageRef.current, true);
          } else if (mode.current === 'pan' || mode.current === 'pinch') {
            if (scale.current <= 1.01) animateTo(1, 0, 0);
            else animateTo(scale.current, tx.current, ty.current);
          }
          mode.current = 'undecided';
          maxTouches.current = 0;
          if (wasTap) handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
        },

        onPanResponderTerminate: () => {
          if (mode.current === 'page') goToPage(pageRef.current, true);
          else animateTo(scale.current <= 1.01 ? 1 : scale.current, tx.current, ty.current);
          mode.current = 'undecided';
          maxTouches.current = 0;
        },
      }),
    [apply, animateTo, beginPinch, goToPage, handleTap, width, height, count, strip]
  );

  if (!open) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.strip,
            { width: width * Math.max(1, count), transform: [{ translateX: strip }] },
          ]}
          {...pan.panHandlers}
        >
          {images.map((im, i) => {
            const active = i === page;
            const near = Math.abs(i - page) <= 1;
            const ratio = im.width && im.height ? im.width / im.height : 1;
            const w = Math.min(width, height * ratio);
            return (
              <View key={`${im.url}-${i}`} style={[styles.page, { width, height }]}>
                {near && (
                  <Animated.View
                    style={
                      active
                        ? { transform: [{ translateX: aX }, { translateY: aY }, { scale: aScale }] }
                        : undefined
                    }
                  >
                    <Image
                      source={{ uri: im.url }}
                      style={{ width: w, height: w / ratio }}
                      contentFit="contain"
                      transition={150}
                      accessibilityLabel={im.altText ?? fallbackAlt}
                    />
                  </Animated.View>
                )}
              </View>
            );
          })}
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="סגירת התצוגה המוגדלת"
          onPress={onClose}
          hitSlop={spacing.md}
          style={[styles.closeButton, { top: insets.top + spacing.sm }]}
        >
          <Icon name="close" size={22} color={colors.surface} />
        </Pressable>

        {count > 1 && (
          <View style={[styles.counter, { bottom: insets.bottom + spacing.lg }]}>
            <Text style={styles.counterText} allowFontScaling={false}>
              {page + 1} / {count}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.ink,
    overflow: 'hidden',
  },
  /*
   * הרצועה בנויה שמאל-לימין תמיד. `direction: 'ltr'` מנטרל את היפוך
   * הפריסה תחת RTL, כדי שתמונה i תשב תמיד ב-offset של i·width ולא
   * במראה שלו — אחרת חשבון הדפדוף היה מתהפך רק בעברית.
   */
  strip: {
    flex: 1,
    flexDirection: 'row',
    direction: 'ltr',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    insetInlineEnd: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterText: {
    fontSize: typography.tiny,
    fontWeight: '700',
    color: colors.surface,
  },
});
