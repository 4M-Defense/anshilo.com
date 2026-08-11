import { Tabs } from 'expo-router';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { Icon } from '@/components';
import { useCart } from '@/state/CartContext';
import { colors, fontFamily, layout, numeric, radius, spacing, typography } from '@/theme';

interface TabIconProps {
  color: ColorValue;
  size: number;
  focused: boolean;
}

/** אייקון העגלה עם עיגול מונה באדום המותג */
function CartTabIcon({ color, size, focused }: TabIconProps) {
  const { itemCount } = useCart();
  return (
    <View style={{ width: size, height: size }}>
      <Icon name={focused ? 'cart' : 'cart-outline'} size={size} color={color} />
      {itemCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.5}>
            {itemCount > 99 ? '99+' : String(itemCount)}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.page },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'בית',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'מחלקות',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'חיפוש',
          tabBarIcon: ({ color, size }) => <Icon name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'עגלה',
          tabBarIcon: ({ color, size, focused }) => (
            <CartTabIcon color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'עוד',
          tabBarIcon: ({ color, size }) => <Icon name="menu" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
    elevation: 0,
  },
  tabItem: {
    minHeight: layout.touchMin,
    paddingTop: spacing.xs,
  },
  tabLabel: {
    fontFamily,
    fontSize: typography.tiny,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    insetInlineEnd: -spacing.sm - 2,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    ...numeric,
    fontFamily,
    fontSize: typography.tiny - 1,
    lineHeight: typography.tiny + 1,
    fontWeight: '800',
    color: colors.onAccent,
  },
});
