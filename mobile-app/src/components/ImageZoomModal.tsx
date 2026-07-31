import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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

/**
 * עמוד אחד במציג המוגדל — צריך קומפוננטה נפרדת כי לכל עמוד יש ref משלו
 * ל-ScrollView שלו (איפוס זום, זום כפול-הקשה).
 *
 * הצביטה עצמה היא ה-zoom המובנה של ScrollView ב-iOS (maximumZoomScale) —
 * מנגנון נייטיב לחלוטין, בלי תלות חדשה ולכן בלי לגעת ב-fingerprint של
 * הבנייה. הקשה כפולה עושה זום פנימה למרכז ההקשה והחוצה בחזרה.
 */
function ZoomPage({
  image,
  alt,
  width,
  height,
  onZoomChange,
}: {
  image: ShopifyImage;
  alt: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const lastTap = useRef(0);
  const zoomed = useRef(false);

  const onTap = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastTap.current > DOUBLE_TAP_MS) {
        lastTap.current = now;
        return;
      }
      lastTap.current = 0;
      if (zoomed.current) {
        scrollRef.current?.scrollResponderZoomTo?.({ x: 0, y: 0, width, height, animated: true });
      } else {
        const w = width / DOUBLE_TAP_ZOOM;
        const h = height / DOUBLE_TAP_ZOOM;
        scrollRef.current?.scrollResponderZoomTo?.({
          x: Math.max(0, x - w / 2),
          y: Math.max(0, y - h / 2),
          width: w,
          height: h,
          animated: true,
        });
      }
    },
    [width, height]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scale = e.nativeEvent.zoomScale ?? 1;
      const isZoomed = scale > 1.02;
      if (isZoomed !== zoomed.current) {
        zoomed.current = isZoomed;
        onZoomChange(isZoomed);
      }
    },
    [onZoomChange]
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={{ width, height }}
      minimumZoomScale={1}
      maximumZoomScale={MAX_ZOOM}
      bouncesZoom
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      centerContent
      onScroll={onScroll}
      scrollEventThrottle={64}
    >
      <Pressable
        onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        style={{ width, height }}
      >
        <Image
          source={{ uri: image.url }}
          style={{ width, height }}
          contentFit="contain"
          transition={150}
          accessibilityLabel={image.altText ?? alt}
        />
      </Pressable>
    </ScrollView>
  );
}

/**
 * מציג תמונות במסך מלא: החלקה בין תמונות, צביטה להגדלה עד פי 4,
 * הקשה כפולה לזום מהיר. נפתח מהקשה על תמונת המוצר בגלריה.
 */
export function ImageZoomModal({ images, initialIndex, fallbackAlt, onClose }: ImageZoomModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  /* בזמן זום נועלים את הדפדוף האופקי — אחרת גרירת התמונה מחליפה עמוד */
  const [pagingLocked, setPagingLocked] = useState(false);

  const open = initialIndex != null;

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width]
  );

  if (!open) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          data={images as ShopifyImage[]}
          horizontal
          pagingEnabled
          scrollEnabled={!pagingLocked}
          initialScrollIndex={Math.min(initialIndex ?? 0, images.length - 1)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(im, i) => `${im.url}-${i}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            <ZoomPage
              image={item}
              alt={fallbackAlt}
              width={width}
              height={height}
              onZoomChange={setPagingLocked}
            />
          )}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="סגירת התצוגה המוגדלת"
          onPress={onClose}
          hitSlop={spacing.md}
          style={[styles.closeButton, { top: insets.top + spacing.sm }]}
        >
          <Icon name="close" size={22} color={colors.surface} />
        </Pressable>

        {images.length > 1 && (
          <View style={[styles.counter, { bottom: insets.bottom + spacing.lg }]}>
            <Text style={styles.counterText} allowFontScaling={false}>
              {page + 1} / {images.length}
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
