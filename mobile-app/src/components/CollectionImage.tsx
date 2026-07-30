import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ShopifyImage } from '@/api/types';
import { colors, radius, spacing } from '@/theme';

export interface CollectionImageProps {
  image: ShopifyImage | null;
  /** לכיתוב הנגישות, ולאות המפלט כשאין תמונה בכלל */
  title: string;
  /** גודל האות במפלט האחרון */
  letterSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * תמונת מחלקה או מותג, באריח אחיד.
 *
 * הבעיה שזה פותר: תמונות הקטלוג בחנות אינן אחידות. חלקן לוגו על רקע לבן,
 * חלקן צילום או באנר עם רקע צבעוני משלו, ולפעמים ביחס־ממדים אחר מהריבוע.
 * `contain` על משטח לבן מציג את הראשונות היטב, אבל את השניות הוא הופך
 * ל"מלבן עם רקע בתוך רקע" — וזה מה שנראה לא מקצועי.
 *
 * הפתרון הוא לצייר את התמונה פעמיים: פעם ראשונה ב-`cover` עם טשטוש כבד, כדי
 * למלא את הריבוע בצבעים של התמונה עצמה, ופעם שנייה ב-`contain` מעליה. כך:
 *
 *  • תמונה עם רקע לבן — הרקע המטושטש לבן גם הוא, והתוצאה זהה לקודם
 *  • תמונה עם רקע צבעוני — הרקע ממשיך את התמונה במקום להתנגש בלבן
 *  • יחס־ממדים חריג — הפסים בצדדים מתמלאים ולא נראים כמו טעות
 *
 * וחשוב לא פחות: שום דבר לא נחתך. `cover` לבדו היה פותר את האחידות אבל קוצץ
 * את הלוגואים — בדיוק התקלה שתוקנה קודם באריחי המחלקות.
 */
export function CollectionImage({
  image,
  title,
  letterSize = 42,
  style,
}: CollectionImageProps) {
  if (image == null) {
    return (
      <View style={[styles.wrap, styles.empty, style]}>
        <Text style={[styles.letter, { fontSize: letterSize }]} allowFontScaling={false}>
          {title.trim().charAt(0)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Image
        source={{ uri: image.url }}
        style={styles.backdrop}
        contentFit="cover"
        blurRadius={28}
        /* דקורטיבי בלבד — הכיתוב היחיד לקורא המסך הוא על התמונה החדה */
        accessible={false}
        cachePolicy="memory-disk"
      />
      <Image
        source={{ uri: image.url }}
        style={styles.image}
        contentFit="contain"
        transition={200}
        accessibilityLabel={image.altText ?? title}
        cachePolicy="memory-disk"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    /*
     * הרקע מוחלש כדי שהוא יישאר רקע: בטשטוש מלא ובעוצמה מלאה הוא היה מתחרה
     * בתמונה החדה שמעליו ומכתים תמונות עם רקע לבן בגוון אפרפר.
     */
    opacity: 0.55,
  },
  image: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    margin: spacing.md,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
  },
  letter: {
    fontWeight: '800',
    color: colors.accent,
    opacity: 0.45,
  },
});
