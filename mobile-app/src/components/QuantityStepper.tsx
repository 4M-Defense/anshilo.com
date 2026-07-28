import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { Icon } from './Icon';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * בורר כמות בצורת פיל — כפתורי +/- בגודל מגע 44, רטט קל בכל שינוי.
 * סדר הילדים: [+][ערך][-] — בפריסת RTL הפלוס מוצג מימין, כמקובל.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  disabled = false,
}: QuantityStepperProps) {
  const canIncrease = !disabled && value < max;
  const canDecrease = !disabled && value > min;

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(next);
  };

  return (
    <View style={[styles.wrap, disabled && styles.wrapDisabled]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="הוספת יחידה"
        disabled={!canIncrease}
        onPress={() => step(1)}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.button, pressed && canIncrease && styles.buttonPressed]}
      >
        <Icon name="add" size={18} color={canIncrease ? colors.ink : colors.border} />
      </Pressable>
      <Text style={styles.value} allowFontScaling={false} accessibilityLabel={`כמות: ${value}`}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="הפחתת יחידה"
        disabled={!canDecrease}
        onPress={() => step(-1)}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.button, pressed && canDecrease && styles.buttonPressed]}
      >
        <Icon name="remove" size={18} color={canDecrease ? colors.ink : colors.border} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  wrapDisabled: {
    opacity: 0.5,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  value: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: typography.h3,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
});
