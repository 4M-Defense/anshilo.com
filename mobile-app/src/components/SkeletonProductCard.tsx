import { Animated, StyleSheet, View } from 'react-native';
import { colors, layout, radius, spacing } from '@/theme';
import { useSkeletonPulse } from './Skeleton';

export interface SkeletonProductCardProps {
  width?: number;
}

/**
 * שלד טעינה בצורת כרטיס מוצר — זהה במבנה ל-ProductCard כדי שהמעבר
 * מטעינה לתוכן ירגיש חלק (אותם פדינגים, אותם גבהים).
 */
export function SkeletonProductCard({ width }: SkeletonProductCardProps) {
  const opacity = useSkeletonPulse();
  return (
    <View
      style={[styles.card, width != null ? { width } : styles.flex]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.image, { opacity }]} />
      <View style={styles.info}>
        <Animated.View style={[styles.line, styles.vendorLine, { opacity }]} />
        <Animated.View style={[styles.line, styles.titleLine1, { opacity }]} />
        <Animated.View style={[styles.line, styles.titleLine2, { opacity }]} />
        <Animated.View style={[styles.line, styles.priceLine, { opacity }]} />
        <Animated.View style={[styles.line, styles.stockLine, { opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  image: {
    aspectRatio: 1,
    width: '100%',
    backgroundColor: colors.surfaceSunken,
  },
  info: {
    padding: spacing.md,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
  line: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
  },
  vendorLine: {
    width: '38%',
    height: 9,
  },
  titleLine1: {
    width: '96%',
    height: 12,
  },
  titleLine2: {
    width: '72%',
    height: 12,
  },
  priceLine: {
    width: '46%',
    height: 18,
    marginTop: spacing.xxs,
  },
  stockLine: {
    width: '30%',
    height: 10,
  },
});
