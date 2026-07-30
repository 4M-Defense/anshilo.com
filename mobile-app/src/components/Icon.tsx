import Ionicons from '@expo/vector-icons/Ionicons';
import { I18nManager, type ColorValue, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '@/theme';

/**
 * אייקוני האפליקציה — Ionicons דרך @expo/vector-icons.
 *
 * לפני כן הרכיב הזה צייר כל גליף ביד, מ-View-ים מוחלטים, ב-1,350 שורות. זה
 * החזיק מבחינה טכנית אבל נראה חלש בפועל: הטלפון, חץ החזרה, השיתוף, החיפוש,
 * העגלה והבית כולם דווחו כלא נראים כמו האייקון שהם אמורים להיות. הבעיה לא
 * הייתה בגליף מסוים אלא בגישה.
 *
 * שמות האייקונים בקוד היו מלכתחילה שמות Ionicons (הקובץ הקודם "חיקה" אותם),
 * ולכן המעבר הוא החלפה ישירה — אף קורא לא צריך להשתנות.
 *
 * בונוס חשוב: זה מחסל לגמרי את באג ה-RTL שהיה כאן. React Native מחליף
 * `left`↔`start` תחת RTL, מה שהפך *כל* גליף שצויר בקואורדינטות פיזיות. גליף
 * של פונט הוא צומת טקסט אחד — אין לו קצוות פריסה להחליף, ולכן הוא מרונדר
 * זהה בשני הכיוונים. `dir` נשאר, ועכשיו הוא באמת רק "האם להפוך אייקון כיווני".
 */
export interface IconProps {
  /** שם Ionicons, למשל "cart-outline" */
  name: string;
  size?: number;
  color?: ColorValue;
  /**
   * נשמר לתאימות לאחור עם הקוראים הקיימים. היה רלוונטי לגליפים המצוירים
   * (צבע "חיתוך" לפרטים פנימיים); ב-Ionicons אין לו משמעות ולכן הוא מתעלם.
   */
  knockout?: ColorValue;
  /** אייקון כיווני (חץ, שברון) — יתהפך אופקית כשהפריסה RTL */
  dir?: boolean;
  style?: StyleProp<TextStyle>;
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** שמות שאין להם מקבילה ב-Ionicons */
const ALIASES: Record<string, IoniconName> = {
  /** אין truck ב-Ionicons; car הוא הקרוב ביותר למשלוח */
  truck: 'car',
  bus: 'car',
  cube: 'cube',
};

/** גליף ניטרלי — עדיף על ריבוע ריק כשמגיע שם לא מוכר */
const FALLBACK: IoniconName = 'ellipse-outline';

const GLYPHS = Ionicons.glyphMap as Record<string, number>;

function resolve(name: string): IoniconName {
  const alias = ALIASES[name];
  if (alias != null) return alias;
  if (name in GLYPHS) return name as IoniconName;
  if (__DEV__) {
    console.warn(`[Icon] השם "${name}" אינו קיים ב-Ionicons — מוצג גליף ברירת מחדל.`);
  }
  return FALLBACK;
}

export function Icon({
  name,
  size = 24,
  color = colors.ink,
  dir = false,
  style,
}: IconProps) {
  return (
    <Ionicons
      name={resolve(name)}
      size={size}
      color={color}
      style={[dir && I18nManager.isRTL ? MIRROR : null, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const MIRROR: TextStyle = { transform: [{ scaleX: -1 }] };
