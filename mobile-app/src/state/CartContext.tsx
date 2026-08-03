import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CartMissingError,
  StorefrontError,
  cartCreate,
  cartLinesAdd,
  cartLinesRemove,
  cartLinesUpdate,
  cartNoteUpdate,
  getCart,
} from '../api/client';
import type { Cart, UserError } from '../api/types';

const CART_ID_KEY = 'shilo.cartId';

/**
 * מזהה עגלה הוא לא העדפה - הוא אסימון גישה.
 *
 * `gid://shopify/Cart/<token>?key=<key>` מאפשר, יחד עם טוקן ה-Storefront
 * הציבורי שקיים בכל בנדל של האפליקציה, לקרוא את תוכן העגלה, את ההערה לשליח
 * (שהיא טקסט חופשי שהקונה מוזמן למלא בו קומה, טלפון ושעות נוחות) ואת
 * ה-checkoutUrl החי - ולשנות את השורות לפני התשלום. AsyncStorage הוא קובץ לא
 * מוצפן שנכנס גם לגיבויים לא מוצפנים של המכשיר, ולכן המזהה עובר ל-Keychain /
 * Android Keystore. היסטוריית החיפוש והמועדפים נשארים ב-AsyncStorage - שם זה
 * בסדר.
 */
/**
 * האם SecureStore זמין בפועל.
 *
 * ל-expo-secure-store אין מימוש web כלל (המודול שם הוא אובייקט ריק), ולכן כל
 * קריאה נכשלת שם - וגם במקומות נוספים שבהם המודול הנייטיבי חסר. app.json מגדיר
 * יעד web, כך שזה מסלול שנשלח בפועל. isAvailableAsync בודק את זה בלי לזרוק.
 */
async function secureAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function readCartId(): Promise<string | null> {
  if (await secureAvailable()) {
    try {
      const secure = await SecureStore.getItemAsync(CART_ID_KEY);
      if (secure) return secure;
    } catch {
      /* Keychain נעול או קריאה שנכשלה - ננסה את המקום הישן */
    }
  }
  try {
    /* הגירה ממקום האחסון הקודם, כדי שהעגלה של מי שכבר התקין את האפליקציה לא
       תיעלם בשדרוג.
     *
     * מוחקים את המקור **רק אחרי** שאומתה כתיבה מוצלחת. קודם writeCartId בלעה כל
     * שגיאה והחזירה void, והשורה שאחריה מחקה בכל מקרה את העותק היחיד שנשאר - כך
     * שבכל מקום שבו SecureStore לא זמין (web, מודול נייטיבי חסר) מזהה העגלה נמחק
     * לתמיד, והעגלה האמיתית של הקונה נשארה בשרת בלי דרך לחזור אליה. */
    const legacy = await AsyncStorage.getItem(CART_ID_KEY);
    if (legacy) {
      const migrated = await writeCartId(legacy);
      if (migrated) await AsyncStorage.removeItem(CART_ID_KEY);
      return legacy;
    }
  } catch {
    /* אין אחסון בכלל - העגלה תיווצר מחדש */
  }
  return null;
}

/**
 * שומר את מזהה העגלה ומחזיר האם הוא באמת נשמר.
 *
 * כשאין SecureStore נופלים בחזרה ל-AsyncStorage. פחות מוגן - אבל עגלה שאבדה היא
 * נזק ודאי לקונה, בעוד שדליפה של מזהה עגלה דורשת גישה למכשיר. עדיף לשמור פחות
 * טוב מלא לשמור בכלל.
 */
async function writeCartId(id: string): Promise<boolean> {
  if (await secureAvailable()) {
    try {
      await SecureStore.setItemAsync(CART_ID_KEY, id);
      /* קריאה חזרה: כתיבה שלא זרקה אבל גם לא שמרה היא בדיוק מצב הכשל שמפניו
         ההגנה הזאת נבנתה. */
      const readback = await SecureStore.getItemAsync(CART_ID_KEY);
      if (readback === id) return true;
    } catch {
      /* ניסיון נוסף ב-AsyncStorage למטה */
    }
  }
  try {
    await AsyncStorage.setItem(CART_ID_KEY, id);
    return true;
  } catch {
    /* עגלה שלא נשמרת עדיין עובדת בסשן הנוכחי */
    return false;
  }
}

async function clearCartId(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(CART_ID_KEY).catch(() => undefined),
    AsyncStorage.removeItem(CART_ID_KEY).catch(() => undefined),
  ]);
}

/**
 * האם השגיאה אומרת שהעגלה בצד השרת לא קיימת יותר - הפכה להזמנה, פגה, או נמחקה.
 *
 * שני מסלולים, ושניהם מוגדרים בצורה צרה:
 *
 * 1. CartMissingError - Shopify החזירה `cart: null`. זה המסלול השכיח, והוא זה
 *    שזיהוי-לפי-טקסט פספס לגמרי: אין userError לחפש בו, וה-message הוא עברית
 *    קבועה שלנו.
 * 2. userError ששדה ה-field שלו הוא `cartId`. זה מה שהופך את הבדיקה לצרה. קודם
 *    כאן חיפשנו את המחרוזת "does not exist" בכל ה-details - וזאת בדיוק הנוסח
 *    שבו Shopify מדווחת גם על מזהה שורה מיושן וגם על וריאנט שבוטל. לחיצה כפולה
 *    על פח האשפה, או הסרת שורה שמכשיר אחר כבר הסיר, מחקה לקונה עגלה שלמה
 *    שקיימת ותקינה בשרת - והמזהה נמחק משני מקומות האחסון, כך שגם רענון לא החזיר
 *    אותה.
 */
function isMissingCartError(err: unknown): boolean {
  if (err instanceof CartMissingError) return true;
  if (!(err instanceof StorefrontError)) return false;
  const errors = err.details;
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (e) =>
      e != null &&
      typeof e === 'object' &&
      Array.isArray((e as UserError).field) &&
      (e as UserError).field?.[0] === 'cartId'
  );
}

interface CartContextValue {
  cart: Cart | null;
  /** טעינה ראשונית של העגלה מהאחסון */
  initializing: boolean;
  /** פעולה בתהליך (הוספה/עדכון/הסרה) */
  busy: boolean;
  itemCount: number;
  /** true כשהעגלה גדולה מדף אחד ולא כל השורות מוצגות */
  linesTruncated: boolean;
  addItem: (merchandiseId: string, quantity?: number) => Promise<void>;
  updateLine: (lineId: string, quantity: number) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  setNote: (note: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** מנקה את העגלה המקומית (אחרי checkout מוצלח) */
  resetCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const cartRef = useRef<Cart | null>(null);
  cartRef.current = cart;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const savedId = await readCartId();
        if (savedId) {
          const existing = await getCart(savedId);
          if (!cancelled && existing) {
            setCart(existing);
            return;
          }
          // עגלה שפגה (הפכה להזמנה או נמחקה) — ניצור חדשה בעת הצורך
          await clearCartId();
        }
      } catch {
        // אין רשת בהפעלה — נמשיך בלי עגלה, תיווצר בהוספה הראשונה
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistCart = useCallback(async (next: Cart) => {
    setCart(next);
    await writeCartId(next.id);
  }, []);

  const dropCart = useCallback(async () => {
    setCart(null);
    cartRef.current = null;
    await clearCartId();
  }, []);

  const ensureCart = useCallback(async (): Promise<Cart> => {
    const current = cartRef.current;
    if (current) return current;
    const created = await cartCreate();
    await persistCart(created);
    return created;
  }, [persistCart]);

  /**
   * ריפוי עצמי מעגלה מתה.
   *
   * שחזור התאוששות היה קיים רק בהפעלת האפליקציה וב-refresh מפורש. כל נתיב
   * כתיבה החזיק בעגלה שבזיכרון, ולכן אחרי checkout שהושלם (או אחרי שהקונה סיים
   * את אותו checkout במכשיר אחר) כל "הוספה לעגלה" נכשלה שוב ושוב עם הטקסט
   * האנגלי של Shopify, ושום דבר לא תיקן את זה מלבד סגירת האפליקציה. עכשיו
   * העגלה המקומית נזרקת והפעולה מנסה שוב פעם אחת על עגלה חדשה.
   */
  const withCartRecovery = useCallback(
    async <T,>(run: (cartId: string) => Promise<T>, retryOnFresh: boolean): Promise<T> => {
      const target = await ensureCart();
      try {
        return await run(target.id);
      } catch (err) {
        if (!isMissingCartError(err)) throw err;
        await dropCart();
        if (!retryOnFresh) throw err;
        const fresh = await cartCreate();
        await persistCart(fresh);
        return run(fresh.id);
      }
    },
    [dropCart, ensureCart, persistCart]
  );

  const addItem = useCallback(
    async (merchandiseId: string, quantity = 1) => {
      setBusy(true);
      try {
        /* הוספה היא הפעולה היחידה שאפשר לחזור עליה על עגלה חדשה בלי לאבד
           מידע - עדכון והסרה מתייחסים למזהה שורה שלא קיים בעגלה החדשה. */
        const next = await withCartRecovery(
          (cartId) => cartLinesAdd(cartId, [{ merchandiseId, quantity }]),
          true
        );
        await persistCart(next);
      } finally {
        setBusy(false);
      }
    },
    [persistCart, withCartRecovery]
  );

  const updateLine = useCallback(
    async (lineId: string, quantity: number) => {
      const current = cartRef.current;
      if (!current) return;
      setBusy(true);
      try {
        const next = await withCartRecovery(
          (cartId) =>
            quantity <= 0
              ? cartLinesRemove(cartId, [lineId])
              : cartLinesUpdate(cartId, [{ id: lineId, quantity }]),
          false
        );
        await persistCart(next);
      } finally {
        setBusy(false);
      }
    },
    [persistCart, withCartRecovery]
  );

  const removeLine = useCallback(
    async (lineId: string) => updateLine(lineId, 0),
    [updateLine]
  );

  const setNote = useCallback(
    async (note: string) => {
      const current = cartRef.current;
      if (!current) return;
      const next = await withCartRecovery((cartId) => cartNoteUpdate(cartId, note), false);
      setCart(next);
    },
    [withCartRecovery]
  );

  const refresh = useCallback(async () => {
    const current = cartRef.current;
    if (!current) return;
    const fresh = await getCart(current.id);
    if (fresh) {
      setCart(fresh);
    } else {
      // העגלה הפכה להזמנה — מתחילים מחדש
      await dropCart();
    }
  }, [dropCart]);

  const resetCart = useCallback(async () => {
    await dropCart();
  }, [dropCart]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      initializing,
      busy,
      itemCount: cart?.totalQuantity ?? 0,
      linesTruncated: cart?.lines.pageInfo?.hasNextPage ?? false,
      addItem,
      updateLine,
      removeLine,
      setNote,
      refresh,
      resetCart,
    }),
    [cart, initializing, busy, addItem, updateLine, removeLine, setNote, refresh, resetCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart חייב להיות בתוך CartProvider');
  return ctx;
}
