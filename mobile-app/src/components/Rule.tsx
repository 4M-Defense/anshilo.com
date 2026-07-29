import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, spacing } from '@/theme';

export interface RuleProps {
  /**
   * `blueprint` — פס דק לרוחב: שליש ראשון באדום המותג, ההמשך בגוון גבול.
   *   זהו המוטיב שהחליף את פסי האזהרה של v1 (מקביל ל-.blueprint-rule באתר).
   * `accent`   — פס מבטא קצר, לשימוש מעל כותרת מדור.
   * `hairline` — קו שערה שקט להפרדת תוכן.
   */
  variant?: 'blueprint' | 'accent' | 'hairline';
  style?: StyleProp<ViewStyle>;
}

/** קו הפרדה של המערכת — קו שערה שקט או פס תכנית (blueprint) */
export function Rule({ variant = 'hairline', style }: RuleProps) {
  if (variant === 'hairline') {
    return <View style={[styles.hairline, style]} accessibilityElementsHidden />;
  }
  if (variant === 'accent') {
    return <View style={[styles.accent, style]} accessibilityElementsHidden />;
  }
  return (
    <View style={[styles.blueprint, style]} accessibilityElementsHidden>
      <View style={styles.blueprintLead} />
      <View style={styles.blueprintTail} />
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: {
    height: layout.hairline,
    backgroundColor: colors.border,
  },
  accent: {
    width: layout.ruleWidth,
    height: layout.ruleHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  blueprint: {
    flexDirection: 'row',
    height: layout.ruleHeight,
    borderRadius: spacing.xxs,
    overflow: 'hidden',
  },
  blueprintLead: {
    flex: 34,
    backgroundColor: colors.accent,
  },
  blueprintTail: {
    flex: 66,
    backgroundColor: colors.border,
  },
});
