import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, layout, radius, rtl, spacing, type } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const VARIANTS: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; fg: string; border?: string }
> = {
  /** פעולה ראשית — אדום המותג */
  primary: { bg: colors.accent, bgPressed: colors.accentHover, fg: colors.onAccent },
  /** פעולה משנית — דיו */
  secondary: { bg: colors.ink, bgPressed: colors.inkSoft, fg: colors.onInk },
  /** מסגרת על לבן */
  outline: {
    bg: colors.surface,
    bgPressed: colors.surfaceAlt,
    fg: colors.ink,
    border: colors.borderStrong,
  },
  /** שקוף — לפעולות שקטות בתוך כרטיס */
  ghost: { bg: 'transparent', bgPressed: colors.surfaceAlt, fg: colors.ink },
};

/**
 * כפתור המערכת — גובה 48 (44 בגודל sm), פינות radius.base,
 * ארבעה וריאנטים לפי שפת העיצוב של האתר.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sizeSm,
        { backgroundColor: pressed && !blocked ? v.bgPressed : v.bg },
        v.border != null && { borderWidth: layout.hairline, borderColor: v.border },
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, { color: v.fg }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.base,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeSm: {
    minHeight: layout.touchMin,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...type.bodyStrong,
    ...rtl.text,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
});
