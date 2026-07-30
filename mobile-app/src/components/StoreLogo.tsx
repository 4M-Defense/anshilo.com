import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { STORE_INFO, STORE_LOGO } from '@/config';

export interface StoreLogoProps {
  /** גובה הלוגו בפיקסלים. הרוחב נגזר מיחס התמונה. */
  height?: number;
  variant?: 'horizontal' | 'square';
  style?: StyleProp<ViewStyle>;
}

/**
 * הלוגו של החנות מה-CDN — אותו קובץ שההדר באתר מציג.
 *
 * הוצא לרכיב משותף כדי שהלוגו יופיע בכל כותרות הטאבים ולא רק בעמוד הבית:
 * זו הזהות של החנות, והיא צריכה להיות נוכחת בכל מסך שהלקוח פותח.
 *
 * `contentPosition="right"` הוא מה שמצמיד את הלוגו לימין בכותרות RTL —
 * `contentFit="contain"` לבד היה ממרכז אותו בתוך המסגרת.
 */
export function StoreLogo({ height = 26, variant = 'horizontal', style }: StoreLogoProps) {
  const square = variant === 'square';
  return (
    <View style={[square ? null : styles.wrap, style]}>
      <Image
        source={{ uri: square ? STORE_LOGO.square : STORE_LOGO.horizontal }}
        style={square ? { width: height, height } : { width: height * 4.94, height }}
        contentFit="contain"
        contentPosition={square ? 'center' : 'right'}
        transition={200}
        accessibilityLabel={STORE_INFO.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * `flex-start` ולא `flex-end`: תחת RTL ההתחלה היא **ימין**. `flex-end` היה
   * דוחף את הלוגו שמאלה בכל כותרת שהתיבה שלה רחבה מהתמונה — העגלה, החיפוש
   * והמחלקות. בדף הבית זה לא נראה, כי שם התיבה מצטמצמת לרוחב התמונה ולכן
   * ל-`alignItems` אין מה ליישר. אותה טעות של חשיבה בצדדים פיזיים במקום
   * לוגיים שהפילה את `textAlign: 'right'`.
   */
  wrap: {
    alignItems: 'flex-start',
  },
});
