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
  wrap: {
    alignItems: 'flex-end',
  },
});
