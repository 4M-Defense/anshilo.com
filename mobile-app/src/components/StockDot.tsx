import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, rtl, spacing, type } from '@/theme';

export type StockLevel = 'in' | 'low' | 'out';

export interface StockDotProps {
  level: StockLevel;
  /** טקסט מותאם; ברירת המחדל היא הניסוח הקבוע של החנות */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

const TONE: Record<StockLevel, { color: string; halo: string; label: string }> = {
  in: { color: colors.success, halo: colors.successSoft, label: 'במלאי' },
  low: { color: colors.warning, halo: colors.warningSoft, label: 'מלאי מתדלדל' },
  out: { color: colors.textMuted, halo: colors.surfaceSunken, label: 'אזל מהמלאי' },
};

/**
 * מצב מלאי מפורש — נקודה צבועה בטבעת רכה וטקסט לצדה.
 * מקביל ל-.stock-dot באתר: ירוק במלאי, ענבר מתדלדל, אפור אזל.
 */
export function StockDot({ level, label, style }: StockDotProps) {
  const tone = TONE[level];
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.halo, { backgroundColor: tone.halo }]}>
        <View style={[styles.dot, { backgroundColor: tone.color }]} />
      </View>
      <Text style={[styles.label, { color: tone.color }]} numberOfLines={1}>
        {label ?? tone.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  halo: {
    width: 13,
    height: 13,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  label: {
    ...type.metaSmall,
    ...rtl.text,
    fontWeight: '700',
  },
});
