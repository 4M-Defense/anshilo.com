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
 * תמונת מחלקה או מותג: ריבוע לבן אחיד, התמונה בתוכו ב-contain, וזה הכל.
 *
 * הייתה כאן קודם גרסה שציירה את התמונה פעמיים — פעם ב-cover עם טשטוש כבד כרקע
 * ופעם ב-contain מעליה — כדי "למלא" את הריבוע בצבעי התמונה. זה נראה רע והוסר:
 * תמונות הקטלוג של החנות מצולמות על **לבן**, ולכן ה-contain הניח מלבן לבן חד
 * במרכז והטשטוש מרח צבע סביבו. התוצאה הייתה מלבן לבן צף על כתם צבעוני — בדיוק
 * ההפך מאחידות.
 *
 * הרקע כאן הוא `colors.surface`, שהוא #FFFFFF מדויק, ולכן הלבן של התמונה
 * מתמזג איתו בלי תפר ומה שנראה הוא המוצר בתוך ריבוע לבן נקי. זה גם בדיוק מה
 * שאריחי המותגים עשו כל הזמן, ואלה נראו טוב.
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
  image: {
    flex: 1,
    /* מרווח קטן בלבד — התמונה ממלאת את הריבוע כמעט עד הקצה */
    margin: spacing.sm,
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
