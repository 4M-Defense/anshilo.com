import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager } from 'react-native';
import { CartProvider } from '@/state/CartContext';
import { FavoritesProvider } from '@/state/FavoritesContext';
import { colors, fontFamily, typography } from '@/theme';

// כפיית RTL — בבנייה אמיתית (TestFlight / Play) הפלאגין expo-localization
// כבר כופה זאת ברמת ה-native, לפני שה-JS בכלל עולה, ולכן התנאי כאן לא ייכנס.
//
// ב-Expo Go פלאגיני config *אינם* פועלים, ולכן הקריאות למטה הן מה שכן קורה —
// והן נכנסות לתוקף רק בטעינה הבאה. מכאן נובע פער אמיתי: הרצה ראשונה ב-Expo Go
// היא LTR, בעוד שהבנייה ל-TestFlight היא RTL מהפריים הראשון. כל בדיקה של
// פריסה, אייקונים או יישור טקסט חייבת להיעשות כשה-RTL באמת דלוק, אחרת בודקים
// אפליקציה אחרת מזו שהלקוחות יקבלו.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  if (__DEV__) {
    console.warn(
      '[RTL] הפריסה עדיין LTR. טענו מחדש (r ב-Expo CLI) לפני בדיקת פריסה — ' +
        'אחרת מה שנראה על המסך אינו מה שייבנה ל-TestFlight.'
    );
  }
}

export default function RootLayout() {
  return (
    <CartProvider>
      <FavoritesProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            // סרגל כותרת לבן עם קו שערה — הכותרת עצמה בדיו
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: {
              fontFamily,
              fontSize: typography.h3,
              fontWeight: '800',
              color: colors.ink,
            },
            headerTintColor: colors.ink,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            // הקנבס מאחורי הכרטיסים — אפור־תכלת בהיר
            contentStyle: { backgroundColor: colors.page },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* מסך המוצר בונה כותרת משלו (תמונה + כפתורי פעולה) */}
          <Stack.Screen name="product/[handle]" options={{ headerShown: false }} />
          {/* הכותרת נקבעת במסך עצמו לפי שם הקטגוריה */}
          <Stack.Screen name="collection/[handle]" options={{ title: '' }} />
          <Stack.Screen name="favorites" options={{ title: 'המועדפים שלי' }} />
        </Stack>
      </FavoritesProvider>
    </CartProvider>
  );
}
