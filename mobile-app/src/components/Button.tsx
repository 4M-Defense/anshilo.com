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
import { colors, radius, spacing, typography } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const VARIANTS: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; fg: string; border?: string }
> = {
  primary: { bg: colors.accent, bgPressed: colors.accentHover, fg: colors.onAccent },
  secondary: { bg: colors.ink, bgPressed: colors.inkSoft, fg: colors.onInk },
  ghost: {
    bg: colors.surface,
    bgPressed: colors.surfaceAlt,
    fg: colors.ink,
    border: colors.border,
  },
};

/** כפתור ראשי של האפליקציה — גובה 48, שלושה וריאנטים לפי שפת העיצוב */
export function Button({
  title,
  onPress,
  variant = 'primary',
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
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed && !blocked ? v.bgPressed : v.bg },
        v.border != null && { borderWidth: 1, borderColor: v.border },
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
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
});
