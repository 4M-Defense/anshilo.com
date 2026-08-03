import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { EmptyState } from '@/components';
import { colors } from '@/theme';

/**
 * מסך "לא נמצא".
 *
 * בלי הקובץ הזה expo-router רושם את המסך המובנה שלו, Unmatched — שכולל את
 * הכותרת "Not Found" ואת הטקסטים "Unmatched Route" / "Page could not be found."
 * באנגלית ומשמאל לימין, והוא נכנס גם לבילד production. האפליקציה מצהירה על
 * scheme "anshilo", כך שכל קישור עמוק ישן או שגוי — למשל `anshilo://products/foo`
 * במקום `/product/foo` — הוביל לשם. עכשיו זה נראה כמו שאר האפליקציה, בעברית,
 * באותה שפה שבה מסך המוצר ומסך הקטגוריה מדווחים "לא נמצא".
 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'הדף לא נמצא' }} />
      <EmptyState
        icon="help-circle-outline"
        title="הדף לא נמצא"
        text="הקישור שהגעתם ממנו כבר לא קיים או שהוא שגוי. אפשר להמשיך מהקטלוג."
        actionLabel="למעבר לקטלוג"
        onAction={() => router.replace('/(tabs)/catalog')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.page,
  },
});
