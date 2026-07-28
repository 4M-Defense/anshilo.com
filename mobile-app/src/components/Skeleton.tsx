import { useEffect } from 'react';
import {
  Animated,
  Easing,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius as radiusTokens } from '@/theme';

/**
 * דופק אחיד וגלובלי לכל השלדים במסך — כולם "נושמים" יחד.
 * useNativeDriver: האנימציה רצה על ה-UI thread ולא חוסמת JS.
 */
const pulse = new Animated.Value(0.55);
let pulseStarted = false;

function ensurePulseRunning() {
  if (pulseStarted) return;
  pulseStarted = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 720,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0.55,
        duration: 720,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ])
  ).start();
}

/** מחזיר את ערך הדופק המשותף (ומפעיל אותו בעת הצורך) */
export function useSkeletonPulse(): Animated.Value {
  useEffect(() => {
    ensurePulseRunning();
  }, []);
  return pulse;
}

export interface SkeletonProps {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** בלוק שלד מהבהב — לשימוש בזמן טעינת נתונים */
export function Skeleton({ width, height, radius = radiusTokens.sm, style }: SkeletonProps) {
  const opacity = useSkeletonPulse();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}
