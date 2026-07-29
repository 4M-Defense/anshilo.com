import React from 'react';
import { I18nManager, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';

/**
 * אייקונים בציור טהור ב-React Native (ללא ספריית פונטים).
 * הערה: @expo/vector-icons אינו מותקן בפרויקט, לכן רכיב זה מממש את
 * שמות ה-Ionicons הנפוצים (כולל וריאנט "-outline") באמצעות Views בלבד.
 * שם לא מוכר יקבל גליף ניטרלי (ריבוע מעוגל + נקודה) — לעולם לא ריק.
 *
 * `knockout` — צבע "חיתוך" לפרטים פנימיים בגליפים מלאים (ברירת מחדל: לבן).
 * כיווניות: הציור בקואורדינטות פיזיות (left/top) ולכן יציב גם ב-RTL כפוי.
 * `dir` — מקביל ל-class ‏`icon--dir` באתר: אייקון כיווני (חץ, שברון) שמתהפך
 * אופקית תחת RTL. תמיד עדיף על היפוך ידני בתוך מסך.
 */
export interface IconProps {
  /** שם בסגנון Ionicons, למשל "cart-outline" */
  name: string;
  size?: number;
  color?: ColorValue;
  /** צבע רקע לפרטים פנימיים של גליפים מלאים */
  knockout?: ColorValue;
  /** אייקון כיווני — יתהפך אופקית כשהפריסה RTL */
  dir?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ALIASES: Record<string, string> = {
  apps: 'grid',
  basket: 'cart',
  reload: 'refresh',
  sync: 'refresh',
  'trash-bin': 'trash',
  construct: 'hammer',
  build: 'hammer',
  pricetags: 'pricetag',
  images: 'image',
  chatbubbles: 'chatbubble',
  'chatbubble-ellipses': 'chatbubble',
  chatbox: 'chatbubble',
  share: 'share-social',
  'ellipsis-vertical': 'ellipsis-horizontal',
  'help-circle': 'information-circle',
  information: 'information-circle',
  alert: 'alert-circle',
  pin: 'location',
  navigate: 'location',
  stopwatch: 'time',
  hourglass: 'time',
  phone: 'call',
  whatsapp: 'logo-whatsapp',
  earth: 'globe',
  language: 'globe',
  'mail-open': 'mail',
  send: 'mail',
  'person-circle': 'person',
  people: 'person',
  wallet: 'card',
  cash: 'card',
  'shield-checkmark': 'shield',
  'shield-half': 'shield',
  'lock-open': 'lock-closed',
  bus: 'truck',
  car: 'truck',
  cube: 'truck',
  'flash-off': 'flash',
  'trending-down': 'trending-up',
  'stats-chart': 'trending-up',
  'bar-chart': 'trending-up',
  ribbon: 'trending-up',
  funnel: 'filter',
  'swap-horizontal': 'swap-vertical',
  settings: 'options',
  'heart-dislike': 'heart',
  'star-half': 'star',
  'bag-handle': 'bag',
  storefront: 'home',
  business: 'home',
  receipt: 'document-text',
  document: 'document-text',
  newspaper: 'document-text',
  clipboard: 'document-text',
  'checkmark-done': 'checkmark',
  checkbox: 'checkmark-circle',
  'checkmark-circle-sharp': 'checkmark-circle',
  ban: 'close-circle',
  'file-tray-stacked': 'file-tray',
  archive: 'file-tray',
  happy: 'happy',
};

type Chev = 'up' | 'down' | 'left' | 'right';

export function Icon({
  name,
  size = 24,
  color = colors.ink,
  knockout = colors.surface,
  dir = false,
  style,
}: IconProps) {
  const S = size;
  const c = color;
  const k = knockout;
  const t = Math.max(1.5, S * 0.09);
  const o = /-outline$/.test(name);
  let base = name.replace(/-(outline|sharp)$/, '').toLowerCase();
  base = ALIASES[base] ?? base;

  const A: ViewStyle = { position: 'absolute' };

  /** פס מלא מעוגל */
  const bar = (x: number, y: number, w: number, h: number, e?: ViewStyle): ViewStyle => ({
    ...A,
    left: x,
    top: y,
    width: w,
    height: h,
    borderRadius: Math.min(w, h) / 2,
    backgroundColor: c,
    ...e,
  });
  /** טבעת (עיגול קו) */
  const ring = (x: number, y: number, d: number, e?: ViewStyle): ViewStyle => ({
    ...A,
    left: x,
    top: y,
    width: d,
    height: d,
    borderRadius: d / 2,
    borderWidth: t,
    borderColor: c,
    ...e,
  });
  /** עיגול מלא */
  const dot = (x: number, y: number, d: number, e?: ViewStyle): ViewStyle => ({
    ...A,
    left: x,
    top: y,
    width: d,
    height: d,
    borderRadius: d / 2,
    backgroundColor: c,
    ...e,
  });
  /** מלבן קו */
  const box = (x: number, y: number, w: number, h: number, e?: ViewStyle): ViewStyle => ({
    ...A,
    left: x,
    top: y,
    width: w,
    height: h,
    borderWidth: t,
    borderColor: c,
    ...e,
  });
  /** שברון — ריבוע מסובב 45° עם שתי מסגרות */
  const chev = (dir: Chev, q: number, cx: number, cy: number, e?: ViewStyle): ViewStyle => {
    const sides: Record<Chev, ViewStyle> = {
      up: { borderTopWidth: t, borderLeftWidth: t },
      right: { borderTopWidth: t, borderRightWidth: t },
      down: { borderBottomWidth: t, borderRightWidth: t },
      left: { borderBottomWidth: t, borderLeftWidth: t },
    };
    return {
      ...A,
      left: cx - q / 2,
      top: cy - q / 2,
      width: q,
      height: q,
      borderColor: c,
      transform: [{ rotate: '45deg' }],
      ...sides[dir],
      ...e,
    };
  };

  const fillOr = (e: ViewStyle): ViewStyle => (o ? { borderWidth: t, borderColor: c } : e);
  const inner = o ? c : k; // צבע פרטים פנימיים

  /** צורת לב מלאה (שני עיגולים + מעוין) */
  const heartShape = (col: ColorValue) => (
    <>
      <View style={dot(0.08 * S, 0.16 * S, 0.42 * S, { backgroundColor: col })} />
      <View style={dot(0.5 * S, 0.16 * S, 0.42 * S, { backgroundColor: col })} />
      <View
        style={{
          ...A,
          left: 0.24 * S,
          top: 0.26 * S,
          width: 0.52 * S,
          height: 0.52 * S,
          backgroundColor: col,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </>
  );

  let glyph: React.ReactNode;

  switch (base) {
    case 'home': {
      const roof = 0.5 * S;
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: (S - roof) / 2,
              top: 0.16 * S,
              width: roof,
              height: roof,
              transform: [{ rotate: '45deg' }],
              ...(o
                ? { borderTopWidth: t, borderLeftWidth: t, borderColor: c }
                : { backgroundColor: c }),
            }}
          />
          {o ? (
            <View
              style={{
                ...A,
                left: 0.2 * S,
                top: 0.42 * S,
                width: 0.6 * S,
                height: 0.48 * S,
                borderLeftWidth: t,
                borderRightWidth: t,
                borderBottomWidth: t,
                borderColor: c,
              }}
            />
          ) : (
            <>
              <View style={bar(0.22 * S, 0.4 * S, 0.56 * S, 0.5 * S, { borderRadius: 1 })} />
              <View
                style={bar(0.42 * S, 0.64 * S, 0.16 * S, 0.26 * S, {
                  backgroundColor: k,
                  borderRadius: 1,
                })}
              />
            </>
          )}
        </>
      );
      break;
    }
    case 'grid': {
      const q = 0.38 * S;
      const r = 0.1 * S;
      const cells: [number, number][] = [
        [0.08 * S, 0.08 * S],
        [0.54 * S, 0.08 * S],
        [0.08 * S, 0.54 * S],
        [0.54 * S, 0.54 * S],
      ];
      glyph = (
        <>
          {cells.map(([x, y], i) => (
            <View
              key={i}
              style={{
                ...A,
                left: x,
                top: y,
                width: q,
                height: q,
                borderRadius: r,
                ...fillOr({ backgroundColor: c }),
              }}
            />
          ))}
        </>
      );
      break;
    }
    case 'search':
      glyph = (
        <>
          <View style={ring(0.1 * S, 0.1 * S, 0.56 * S)} />
          <View
            style={bar(0.7 * S - t / 2, 0.53 * S, t * 1.1, 0.34 * S, {
              transform: [{ rotate: '-45deg' }],
            })}
          />
        </>
      );
      break;
    case 'cart':
      glyph = (
        <>
          <View style={bar(0.04 * S, 0.16 * S, 0.24 * S, t)} />
          <View
            style={{
              ...A,
              left: 0.16 * S,
              top: 0.26 * S,
              width: 0.64 * S,
              height: 0.34 * S,
              borderRadius: 0.05 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={dot(0.26 * S, 0.68 * S, 0.14 * S)} />
          <View style={dot(0.58 * S, 0.68 * S, 0.14 * S)} />
        </>
      );
      break;
    case 'menu':
      glyph = (
        <>
          <View style={bar(0.12 * S, 0.26 * S - t / 2, 0.76 * S, t * 1.05)} />
          <View style={bar(0.12 * S, 0.5 * S - t / 2, 0.76 * S, t * 1.05)} />
          <View style={bar(0.12 * S, 0.74 * S - t / 2, 0.76 * S, t * 1.05)} />
        </>
      );
      break;
    case 'heart':
      glyph = (
        <>
          {heartShape(c)}
          {o && (
            <View
              style={{
                ...A,
                left: 0,
                top: 0,
                width: S,
                height: S,
                transform: [{ scale: 0.66 }],
              }}
            >
              {heartShape(k)}
            </View>
          )}
        </>
      );
      break;
    case 'alert-circle':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.06 * S,
              width: 0.88 * S,
              height: 0.88 * S,
              borderRadius: 0.44 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.5 * S - t * 0.6, 0.26 * S, t * 1.2, 0.28 * S, { backgroundColor: inner })} />
          <View style={dot(0.5 * S - t * 0.75, 0.62 * S, t * 1.5, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'warning':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.1 * S,
              width: 0,
              height: 0,
              borderLeftWidth: 0.44 * S,
              borderRightWidth: 0.44 * S,
              borderBottomWidth: 0.78 * S,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: c,
            }}
          />
          <View style={bar(0.5 * S - t * 0.6, 0.42 * S, t * 1.2, 0.22 * S, { backgroundColor: k })} />
          <View style={dot(0.5 * S - t * 0.75, 0.7 * S, t * 1.5, { backgroundColor: k })} />
        </>
      );
      break;
    case 'close':
      glyph = (
        <>
          <View style={bar(0.5 * S - t * 0.55, 0.15 * S, t * 1.1, 0.7 * S, { transform: [{ rotate: '45deg' }] })} />
          <View style={bar(0.5 * S - t * 0.55, 0.15 * S, t * 1.1, 0.7 * S, { transform: [{ rotate: '-45deg' }] })} />
        </>
      );
      break;
    case 'close-circle':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.06 * S,
              width: 0.88 * S,
              height: 0.88 * S,
              borderRadius: 0.44 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.5 * S - t * 0.5, 0.3 * S, t, 0.4 * S, { backgroundColor: inner, transform: [{ rotate: '45deg' }] })} />
          <View style={bar(0.5 * S - t * 0.5, 0.3 * S, t, 0.4 * S, { backgroundColor: inner, transform: [{ rotate: '-45deg' }] })} />
        </>
      );
      break;
    case 'chevron-forward':
      glyph = <View style={chev('right', 0.4 * S, 0.44 * S, 0.5 * S)} />;
      break;
    case 'chevron-back':
      glyph = <View style={chev('left', 0.4 * S, 0.56 * S, 0.5 * S)} />;
      break;
    case 'chevron-up':
      glyph = <View style={chev('up', 0.4 * S, 0.5 * S, 0.56 * S)} />;
      break;
    case 'chevron-down':
      glyph = <View style={chev('down', 0.4 * S, 0.5 * S, 0.44 * S)} />;
      break;
    case 'arrow-forward':
      glyph = (
        <>
          <View style={bar(0.14 * S, 0.5 * S - t / 2, 0.66 * S, t)} />
          <View style={chev('right', 0.3 * S, 0.63 * S, 0.5 * S)} />
        </>
      );
      break;
    case 'arrow-back':
      glyph = (
        <>
          <View style={bar(0.2 * S, 0.5 * S - t / 2, 0.66 * S, t)} />
          <View style={chev('left', 0.3 * S, 0.37 * S, 0.5 * S)} />
        </>
      );
      break;
    case 'arrow-up':
      glyph = (
        <>
          <View style={bar(0.5 * S - t / 2, 0.16 * S, t, 0.66 * S)} />
          <View style={chev('up', 0.3 * S, 0.5 * S, 0.35 * S)} />
        </>
      );
      break;
    case 'arrow-down':
      glyph = (
        <>
          <View style={bar(0.5 * S - t / 2, 0.18 * S, t, 0.66 * S)} />
          <View style={chev('down', 0.3 * S, 0.5 * S, 0.65 * S)} />
        </>
      );
      break;
    case 'add':
      glyph = (
        <>
          <View style={bar(0.18 * S, 0.5 * S - t / 2, 0.64 * S, t)} />
          <View style={bar(0.5 * S - t / 2, 0.18 * S, t, 0.64 * S)} />
        </>
      );
      break;
    case 'remove':
      glyph = <View style={bar(0.18 * S, 0.5 * S - t / 2, 0.64 * S, t)} />;
      break;
    case 'add-circle':
    case 'remove-circle':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.06 * S,
              width: 0.88 * S,
              height: 0.88 * S,
              borderRadius: 0.44 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.32 * S, 0.5 * S - t / 2, 0.36 * S, t, { backgroundColor: inner })} />
          {base === 'add-circle' && (
            <View style={bar(0.5 * S - t / 2, 0.32 * S, t, 0.36 * S, { backgroundColor: inner })} />
          )}
        </>
      );
      break;
    case 'trash':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.38 * S,
              top: 0.09 * S,
              width: 0.24 * S,
              height: 0.1 * S,
              borderTopWidth: t,
              borderLeftWidth: t,
              borderRightWidth: t,
              borderColor: c,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
            }}
          />
          <View style={bar(0.14 * S, 0.18 * S, 0.72 * S, t)} />
          <View
            style={{
              ...A,
              left: 0.22 * S,
              top: 0.22 * S,
              width: 0.56 * S,
              height: 0.66 * S,
              borderBottomLeftRadius: 0.08 * S,
              borderBottomRightRadius: 0.08 * S,
              ...(o
                ? { borderLeftWidth: t, borderRightWidth: t, borderBottomWidth: t, borderColor: c }
                : { backgroundColor: c }),
            }}
          />
          <View style={bar(0.41 * S, 0.34 * S, t * 0.8, 0.36 * S, { backgroundColor: inner })} />
          <View style={bar(0.55 * S, 0.34 * S, t * 0.8, 0.36 * S, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'call':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.16 * S,
              top: 0.16 * S,
              width: 0.68 * S,
              height: 0.68 * S,
              borderBottomLeftRadius: 0.68 * S,
              borderLeftWidth: t * 1.7,
              borderBottomWidth: t * 1.7,
              borderColor: c,
            }}
          />
          <View style={bar(0.12 * S, 0.11 * S, 0.26 * S, t * 1.7, { transform: [{ rotate: '14deg' }] })} />
          <View style={bar(0.72 * S, 0.62 * S, t * 1.7, 0.26 * S, { transform: [{ rotate: '14deg' }] })} />
        </>
      );
      break;
    case 'logo-whatsapp':
      glyph = (
        <>
          <View style={ring(0.07 * S, 0.07 * S, 0.86 * S)} />
          <View
            style={{
              ...A,
              left: 0.1 * S,
              top: 0.72 * S,
              width: 0.14 * S,
              height: 0.14 * S,
              backgroundColor: c,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              ...A,
              left: 0.34 * S,
              top: 0.34 * S,
              width: 0.32 * S,
              height: 0.32 * S,
              borderBottomLeftRadius: 0.32 * S,
              borderLeftWidth: t * 0.9,
              borderBottomWidth: t * 0.9,
              borderColor: c,
            }}
          />
        </>
      );
      break;
    case 'location':
      glyph = (
        <>
          <View style={dot(0.23 * S, 0.06 * S, 0.54 * S)} />
          <View
            style={{
              ...A,
              left: 0.31 * S,
              top: 0.42 * S,
              width: 0.38 * S,
              height: 0.38 * S,
              backgroundColor: c,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View style={dot(0.4 * S, 0.21 * S, 0.2 * S, { backgroundColor: k })} />
        </>
      );
      break;
    case 'time':
      glyph = (
        <>
          <View style={ring(0.07 * S, 0.07 * S, 0.86 * S)} />
          <View style={bar(0.5 * S - t / 2, 0.24 * S, t, 0.28 * S)} />
          <View style={bar(0.5 * S - t / 2, 0.5 * S - t / 2, 0.2 * S, t)} />
        </>
      );
      break;
    case 'checkmark':
      glyph = (
        <View
          style={{
            ...A,
            left: 0.22 * S,
            top: 0.28 * S,
            width: 0.56 * S,
            height: 0.3 * S,
            borderLeftWidth: t,
            borderBottomWidth: t,
            borderColor: c,
            transform: [{ rotate: '-45deg' }],
          }}
        />
      );
      break;
    case 'checkmark-circle':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.06 * S,
              width: 0.88 * S,
              height: 0.88 * S,
              borderRadius: 0.44 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View
            style={{
              ...A,
              left: 0.3 * S,
              top: 0.36 * S,
              width: 0.4 * S,
              height: 0.22 * S,
              borderLeftWidth: t,
              borderBottomWidth: t,
              borderColor: inner,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </>
      );
      break;
    case 'bag':
      glyph = (
        <>
          <View style={ring(0.335 * S, 0.1 * S, 0.33 * S)} />
          <View
            style={{
              ...A,
              left: 0.15 * S,
              top: 0.3 * S,
              width: 0.7 * S,
              height: 0.58 * S,
              borderRadius: 0.07 * S,
              borderBottomLeftRadius: 0.16 * S,
              borderBottomRightRadius: 0.16 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
        </>
      );
      break;
    case 'image':
      glyph = (
        <>
          <View style={box(0.08 * S, 0.12 * S, 0.84 * S, 0.76 * S, { borderRadius: 0.1 * S })} />
          <View style={dot(0.26 * S, 0.28 * S, 0.13 * S)} />
          <View
            style={{
              ...A,
              left: 0.08 * S + t,
              top: 0.12 * S + t,
              width: 0.84 * S - 2 * t,
              height: 0.76 * S - 2 * t,
              borderRadius: 0.06 * S,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: 0.02 * S,
                top: 0.3 * S,
                width: 0.34 * S,
                height: 0.34 * S,
                backgroundColor: c,
                transform: [{ rotate: '45deg' }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0.32 * S,
                top: 0.22 * S,
                width: 0.46 * S,
                height: 0.46 * S,
                backgroundColor: c,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </View>
        </>
      );
      break;
    case 'chatbubble':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.08 * S,
              top: 0.1 * S,
              width: 0.84 * S,
              height: 0.64 * S,
              borderRadius: 0.32 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View
            style={{
              ...A,
              left: 0.22 * S,
              top: 0.62 * S,
              width: 0.18 * S,
              height: 0.18 * S,
              transform: [{ rotate: '45deg' }],
              ...(o
                ? { borderBottomWidth: t, borderLeftWidth: t, borderColor: c }
                : { backgroundColor: c }),
            }}
          />
        </>
      );
      break;
    case 'options': {
      const knob = t * 2.8;
      const rows: [number, number][] = [
        [0.24 * S, 0.6 * S],
        [0.5 * S, 0.26 * S],
        [0.76 * S, 0.52 * S],
      ];
      glyph = (
        <>
          {rows.map(([y, kx], i) => (
            <React.Fragment key={i}>
              <View style={bar(0.1 * S, y - t / 2, 0.8 * S, t)} />
              <View
                style={{
                  ...A,
                  left: kx - knob / 2,
                  top: y - knob / 2,
                  width: knob,
                  height: knob,
                  borderRadius: knob / 2,
                  backgroundColor: k,
                  borderWidth: t,
                  borderColor: c,
                }}
              />
            </React.Fragment>
          ))}
        </>
      );
      break;
    }
    case 'filter':
      glyph = (
        <>
          <View style={bar(0.12 * S, 0.28 * S - t / 2, 0.76 * S, t * 1.1)} />
          <View style={bar(0.25 * S, 0.5 * S - t / 2, 0.5 * S, t * 1.1)} />
          <View style={bar(0.38 * S, 0.72 * S - t / 2, 0.24 * S, t * 1.1)} />
        </>
      );
      break;
    case 'swap-vertical':
      glyph = (
        <>
          <View style={bar(0.32 * S - t / 2, 0.18 * S, t, 0.6 * S)} />
          <View style={chev('up', 0.22 * S, 0.32 * S, 0.26 * S)} />
          <View style={bar(0.68 * S - t / 2, 0.22 * S, t, 0.6 * S)} />
          <View style={chev('down', 0.22 * S, 0.68 * S, 0.74 * S)} />
        </>
      );
      break;
    case 'refresh':
      glyph = (
        <>
          <View style={ring(0.1 * S, 0.1 * S, 0.8 * S)} />
          <View style={bar(0.6 * S, 0.0, 0.36 * S, 0.32 * S, { backgroundColor: k, borderRadius: 0 })} />
          <View
            style={{
              ...A,
              left: 0.68 * S,
              top: 0.13 * S,
              width: 0.16 * S,
              height: 0.16 * S,
              backgroundColor: c,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </>
      );
      break;
    case 'information-circle':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.06 * S,
              width: 0.88 * S,
              height: 0.88 * S,
              borderRadius: 0.44 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={dot(0.5 * S - t * 0.75, 0.24 * S, t * 1.5, { backgroundColor: inner })} />
          <View style={bar(0.5 * S - t * 0.6, 0.44 * S, t * 1.2, 0.3 * S, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'globe':
      glyph = (
        <>
          <View style={ring(0.07 * S, 0.07 * S, 0.86 * S)} />
          <View style={bar(0.1 * S, 0.5 * S - t * 0.4, 0.8 * S, t * 0.8)} />
          <View
            style={ring(0.07 * S, 0.07 * S, 0.86 * S, {
              borderWidth: t * 0.8,
              transform: [{ scaleX: 0.45 }],
            })}
          />
        </>
      );
      break;
    case 'mail':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.2 * S,
              width: 0.88 * S,
              height: 0.6 * S,
              borderRadius: 0.08 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={chev('down', 0.36 * S, 0.5 * S, 0.32 * S, { borderColor: inner })} />
        </>
      );
      break;
    case 'person':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.34 * S,
              top: 0.08 * S,
              width: 0.32 * S,
              height: 0.32 * S,
              borderRadius: 0.16 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={{ ...A, left: 0.12 * S, top: 0.52 * S, width: 0.76 * S, height: 0.4 * S, overflow: 'hidden' }}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 0.76 * S,
                height: 0.76 * S,
                borderRadius: 0.38 * S,
                ...fillOr({ backgroundColor: c }),
              }}
            />
          </View>
        </>
      );
      break;
    case 'card':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.2 * S,
              width: 0.88 * S,
              height: 0.6 * S,
              borderRadius: 0.09 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.06 * S, 0.32 * S, 0.88 * S, t * 1.6, { backgroundColor: o ? c : k, borderRadius: 0 })} />
          <View style={bar(0.14 * S, 0.62 * S, 0.24 * S, t, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'pricetag':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.19 * S,
              top: 0.19 * S,
              width: 0.62 * S,
              height: 0.62 * S,
              borderRadius: 0.1 * S,
              transform: [{ rotate: '45deg' }],
              ...fillOr({ backgroundColor: c }),
            }}
          />
          {o ? (
            <View
              style={ring(0.5 * S - t * 1.1, 0.28 * S - t * 1.1, t * 2.2, { borderWidth: t * 0.8 })}
            />
          ) : (
            <View style={dot(0.5 * S - t, 0.28 * S - t, t * 2, { backgroundColor: k })} />
          )}
        </>
      );
      break;
    case 'document-text':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.2 * S,
              top: 0.06 * S,
              width: 0.6 * S,
              height: 0.88 * S,
              borderRadius: 0.07 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.3 * S, 0.3 * S, 0.4 * S, t * 0.9, { backgroundColor: inner })} />
          <View style={bar(0.3 * S, 0.46 * S, 0.4 * S, t * 0.9, { backgroundColor: inner })} />
          <View style={bar(0.3 * S, 0.62 * S, 0.26 * S, t * 0.9, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'star':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.24 * S,
              top: 0.24 * S,
              width: 0.52 * S,
              height: 0.52 * S,
              borderRadius: 0.1 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View
            style={{
              ...A,
              left: 0.24 * S,
              top: 0.24 * S,
              width: 0.52 * S,
              height: 0.52 * S,
              borderRadius: 0.1 * S,
              transform: [{ rotate: '45deg' }],
              ...fillOr({ backgroundColor: c }),
            }}
          />
        </>
      );
      break;
    case 'ellipsis-horizontal':
      glyph = (
        <>
          <View style={dot(0.1 * S, 0.5 * S - 0.075 * S, 0.15 * S)} />
          <View style={dot(0.425 * S, 0.5 * S - 0.075 * S, 0.15 * S)} />
          <View style={dot(0.75 * S, 0.5 * S - 0.075 * S, 0.15 * S)} />
        </>
      );
      break;
    case 'sad':
    case 'happy':
      glyph = (
        <>
          <View style={ring(0.06 * S, 0.06 * S, 0.88 * S)} />
          <View style={dot(0.3 * S - t * 0.7, 0.36 * S - t * 0.7, t * 1.4)} />
          <View style={dot(0.7 * S - t * 0.7, 0.36 * S - t * 0.7, t * 1.4)} />
          <View
            style={{
              ...A,
              left: 0.3 * S,
              top: base === 'sad' ? 0.58 * S : 0.46 * S,
              width: 0.4 * S,
              height: 0.24 * S,
              borderRadius: 0.2 * S,
              ...(base === 'sad'
                ? { borderTopWidth: t, borderTopColor: c }
                : { borderBottomWidth: t, borderBottomColor: c }),
            }}
          />
        </>
      );
      break;
    case 'lock-closed':
      glyph = (
        <>
          <View style={ring(0.3 * S, 0.1 * S, 0.4 * S)} />
          <View
            style={{
              ...A,
              left: 0.2 * S,
              top: 0.4 * S,
              width: 0.6 * S,
              height: 0.48 * S,
              borderRadius: 0.08 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={dot(0.5 * S - t * 0.8, 0.58 * S, t * 1.6, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'hammer':
      glyph = (
        <>
          <View
            style={bar(0.46 * S - t * 0.7, 0.28 * S, t * 1.4, 0.6 * S, {
              transform: [{ rotate: '45deg' }],
            })}
          />
          <View
            style={{
              ...A,
              left: 0.44 * S,
              top: 0.1 * S,
              width: 0.44 * S,
              height: 0.2 * S,
              borderRadius: 0.06 * S,
              backgroundColor: c,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </>
      );
      break;
    case 'share-social':
      glyph = (
        <>
          <View style={bar(0.24 * S, 0.3 * S - t * 0.45, 0.4 * S, t * 0.9, { transform: [{ rotate: '-25deg' }] })} />
          <View style={bar(0.24 * S, 0.7 * S - t * 0.45, 0.4 * S, t * 0.9, { transform: [{ rotate: '25deg' }] })} />
          <View style={dot(0.64 * S, 0.06 * S, 0.2 * S)} />
          <View style={dot(0.64 * S, 0.74 * S, 0.2 * S)} />
          <View style={dot(0.08 * S, 0.4 * S, 0.2 * S)} />
        </>
      );
      break;
    case 'list':
      glyph = (
        <>
          {[0.26, 0.5, 0.74].map((y) => (
            <React.Fragment key={y}>
              <View style={dot(0.12 * S, y * S - t * 0.8, t * 1.6)} />
              <View style={bar(0.28 * S, y * S - t * 0.5, 0.6 * S, t * 0.95)} />
            </React.Fragment>
          ))}
        </>
      );
      break;
    case 'notifications':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.28 * S,
              top: 0.14 * S,
              width: 0.44 * S,
              height: 0.46 * S,
              borderTopLeftRadius: 0.22 * S,
              borderTopRightRadius: 0.22 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.16 * S, 0.58 * S, 0.68 * S, t * 1.2)} />
          <View style={dot(0.5 * S - t, 0.7 * S, t * 2)} />
        </>
      );
      break;
    case 'file-tray':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.08 * S,
              top: 0.2 * S,
              width: 0.84 * S,
              height: 0.64 * S,
              borderRadius: 0.08 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.26 * S, 0.56 * S, 0.48 * S, t * 1.3, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'phone-portrait':
      glyph = (
        <>
          <View
            style={{
              ...A,
              left: 0.26 * S,
              top: 0.06 * S,
              width: 0.48 * S,
              height: 0.88 * S,
              borderRadius: 0.1 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.4 * S, 0.78 * S, 0.2 * S, t, { backgroundColor: inner })} />
        </>
      );
      break;
    case 'logo-instagram':
      glyph = (
        <>
          <View style={box(0.1 * S, 0.1 * S, 0.8 * S, 0.8 * S, { borderRadius: 0.26 * S })} />
          <View style={ring(0.33 * S, 0.33 * S, 0.34 * S)} />
          <View style={dot(0.66 * S, 0.2 * S, t * 1.4)} />
        </>
      );
      break;
    case 'logo-facebook':
      glyph = (
        <>
          <View style={ring(0.07 * S, 0.07 * S, 0.86 * S)} />
          {/* גוף האות f */}
          <View style={bar(0.48 * S, 0.28 * S, t * 1.2, 0.46 * S)} />
          <View style={bar(0.36 * S, 0.46 * S, 0.28 * S, t * 1.2)} />
          <View
            style={{
              ...A,
              left: 0.48 * S,
              top: 0.28 * S,
              width: 0.16 * S,
              height: 0.16 * S,
              borderTopWidth: t * 1.2,
              borderRightWidth: t * 1.2,
              borderTopRightRadius: 0.1 * S,
              borderColor: c,
            }}
          />
        </>
      );
      break;
    case 'shield':
      glyph = (
        <>
          {/* מגן: כתפיים ישרות למעלה, התכנסות לחוד למטה */}
          <View
            style={{
              ...A,
              left: 0.18 * S,
              top: 0.1 * S,
              width: 0.64 * S,
              height: 0.42 * S,
              borderTopLeftRadius: 0.08 * S,
              borderTopRightRadius: 0.08 * S,
              ...fillOr({ backgroundColor: c }),
              ...(o ? { borderBottomWidth: 0 } : null),
            }}
          />
          <View
            style={{
              ...A,
              left: 0.28 * S,
              top: 0.5 * S,
              width: 0.44 * S,
              height: 0.44 * S,
              borderBottomRightRadius: 0.1 * S,
              transform: [{ rotate: '45deg' }],
              ...(o
                ? { borderRightWidth: t, borderBottomWidth: t, borderColor: c }
                : { backgroundColor: c }),
            }}
          />
          {!o && (
            <View
              style={{
                ...A,
                left: 0.34 * S,
                top: 0.38 * S,
                width: 0.32 * S,
                height: 0.18 * S,
                borderLeftWidth: t,
                borderBottomWidth: t,
                borderColor: k,
                transform: [{ rotate: '-45deg' }],
              }}
            />
          )}
        </>
      );
      break;
    case 'truck':
      glyph = (
        <>
          {/* תא מטען */}
          <View
            style={{
              ...A,
              left: 0.06 * S,
              top: 0.26 * S,
              width: 0.5 * S,
              height: 0.4 * S,
              borderRadius: 0.05 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          {/* תא נהג */}
          <View
            style={{
              ...A,
              left: 0.58 * S,
              top: 0.4 * S,
              width: 0.34 * S,
              height: 0.26 * S,
              borderTopRightRadius: 0.1 * S,
              borderRadius: 0.04 * S,
              ...fillOr({ backgroundColor: c }),
            }}
          />
          <View style={bar(0.04 * S, 0.68 * S, 0.9 * S, t * 0.9)} />
          <View style={dot(0.2 * S, 0.72 * S, 0.16 * S)} />
          <View style={dot(0.64 * S, 0.72 * S, 0.16 * S)} />
        </>
      );
      break;
    case 'flash':
      glyph = (
        <>
          {/* ברק — שני משולשים נגדיים */}
          <View
            style={{
              ...A,
              left: 0.3 * S,
              top: 0.06 * S,
              width: 0,
              height: 0,
              borderLeftWidth: 0.24 * S,
              borderRightWidth: 0.12 * S,
              borderBottomWidth: 0.46 * S,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: c,
              transform: [{ rotate: '180deg' }],
            }}
          />
          <View
            style={{
              ...A,
              left: 0.34 * S,
              top: 0.48 * S,
              width: 0,
              height: 0,
              borderLeftWidth: 0.12 * S,
              borderRightWidth: 0.24 * S,
              borderTopWidth: 0.46 * S,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderTopColor: c,
              transform: [{ rotate: '180deg' }],
            }}
          />
        </>
      );
      break;
    case 'trending-up':
      glyph = (
        <>
          <View
            style={bar(0.1 * S, 0.62 * S, 0.44 * S, t, {
              transform: [{ rotate: '-32deg' }],
            })}
          />
          <View
            style={bar(0.44 * S, 0.46 * S, 0.44 * S, t, {
              transform: [{ rotate: '-32deg' }],
            })}
          />
          <View style={bar(0.62 * S, 0.14 * S, 0.26 * S, t)} />
          <View style={bar(0.86 * S - t, 0.14 * S, t, 0.26 * S)} />
        </>
      );
      break;
    case 'sparkles':
      glyph = (
        <>
          {/* ניצוץ גדול */}
          <View style={bar(0.36 * S - t * 0.5, 0.06 * S, t, 0.36 * S)} />
          <View style={bar(0.18 * S, 0.24 * S - t * 0.5, 0.36 * S, t)} />
          {/* ניצוץ קטן */}
          <View style={bar(0.72 * S - t * 0.4, 0.52 * S, t * 0.8, 0.28 * S)} />
          <View style={bar(0.58 * S, 0.66 * S - t * 0.4, 0.28 * S, t * 0.8)} />
        </>
      );
      break;
    default:
      glyph = (
        <>
          <View style={box(0.14 * S, 0.14 * S, 0.72 * S, 0.72 * S, { borderRadius: 0.16 * S })} />
          <View style={dot(0.42 * S, 0.42 * S, 0.16 * S)} />
        </>
      );
      break;
  }

  return (
    <View
      style={[
        { width: S, height: S },
        // מקביל ל-.icon--dir באתר: אייקון כיווני מתהפך תחת RTL
        dir && I18nManager.isRTL && MIRROR,
        style,
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {glyph}
    </View>
  );
}

const MIRROR: ViewStyle = { transform: [{ scaleX: -1 }] };
