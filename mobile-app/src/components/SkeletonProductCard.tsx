import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  image: {
    aspectRatio: 1,
    width: '100%',
    backgroundColor: colors.surfaceAlt,
  },
  info: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  line: {
    backgroundColor: colors.border,
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
    height: 16,
    marginTop: spacing.xs,
  },
});
