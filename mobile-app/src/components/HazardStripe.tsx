import { StyleSheet, View } from 'react-native';
import { hazard } from '@/theme';

export interface HazardStripeProps {
  height?: number;
}

/** מספר פסים קבוע שמכסה גם מסכים רחבים (טאבלט) */
const STRIPE_COUNT = 80;

/**
 * פס אזהרה — מוטיב המותג: פסים אלכסוניים כתום/דיו חוזרים.
 * מימוש ב-Views מוטים בלבד (ללא SVG): רקע דיו + פסי מבטא ב-skewX.
 */
export function HazardStripe({ height = 6 }: HazardStripeProps) {
  const stripeWidth = Math.max(height * 1.4, 8);
  return (
    <View
      style={[styles.track, { height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: STRIPE_COUNT }, (_, i) => (
        <View
          key={i}
          style={{
            width: stripeWidth,
            marginEnd: stripeWidth,
            height: height * 3,
            marginTop: -height,
            backgroundColor: hazard.a,
            transform: [{ skewX: '-24deg' }],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: hazard.b,
  },
});
