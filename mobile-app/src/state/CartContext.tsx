import AsyncStorage from '@react-native-async-storage/async-storage';
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
  cartCreate,
  cartLinesAdd,
  cartLinesRemove,
  cartLinesUpdate,
  cartNoteUpdate,
  getCart,
} from '../api/client';
import type { Cart } from '../api/types';

const CART_ID_KEY = 'shilo.cartId';

interface CartContextValue {
  cart: Cart | null;
  /** טעינה ראשונית של העגלה מהאחסון */
  initializing: boolean;
  /** פעולה בתהליך (הוספה/עדכון/הסרה) */
  busy: boolean;
  itemCount: number;
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
        const savedId = await AsyncStorage.getItem(CART_ID_KEY);
        if (savedId) {
          const existing = await getCart(savedId);
          if (!cancelled && existing) {
            setCart(existing);
            return;
          }
          // עגלה שפגה (הפכה להזמנה או נמחקה) — ניצור חדשה בעת הצורך
          await AsyncStorage.removeItem(CART_ID_KEY);
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
    await AsyncStorage.setItem(CART_ID_KEY, next.id);
  }, []);

  const ensureCart = useCallback(async (): Promise<Cart> => {
    const current = cartRef.current;
    if (current) return current;
    const created = await cartCreate();
    await persistCart(created);
    return created;
  }, [persistCart]);

  const addItem = useCallback(
    async (merchandiseId: string, quantity = 1) => {
      setBusy(true);
      try {
        const target = await ensureCart();
        const next = await cartLinesAdd(target.id, [{ merchandiseId, quantity }]);
        await persistCart(next);
      } finally {
        setBusy(false);
      }
    },
    [ensureCart, persistCart]
  );

  const updateLine = useCallback(
    async (lineId: string, quantity: number) => {
      const current = cartRef.current;
      if (!current) return;
      setBusy(true);
      try {
        const next =
          quantity <= 0
            ? await cartLinesRemove(current.id, [lineId])
            : await cartLinesUpdate(current.id, [{ id: lineId, quantity }]);
        await persistCart(next);
      } finally {
        setBusy(false);
      }
    },
    [persistCart]
  );

  const removeLine = useCallback(
    async (lineId: string) => updateLine(lineId, 0),
    [updateLine]
  );

  const setNote = useCallback(
    async (note: string) => {
      const current = cartRef.current;
      if (!current) return;
      const next = await cartNoteUpdate(current.id, note);
      setCart(next);
    },
    []
  );

  const refresh = useCallback(async () => {
    const current = cartRef.current;
    if (!current) return;
    const fresh = await getCart(current.id);
    if (fresh) {
      setCart(fresh);
    } else {
      // העגלה הפכה להזמנה — מתחילים מחדש
      setCart(null);
      await AsyncStorage.removeItem(CART_ID_KEY);
    }
  }, []);

  const resetCart = useCallback(async () => {
    setCart(null);
    await AsyncStorage.removeItem(CART_ID_KEY);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      initializing,
      busy,
      itemCount: cart?.totalQuantity ?? 0,
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
