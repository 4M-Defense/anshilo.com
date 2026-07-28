import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const FAVORITES_KEY = 'shilo.favorites';

/** מועדפים — שמורים מקומית לפי handle של מוצר */
interface FavoritesContextValue {
  favorites: string[];
  isFavorite: (handle: string) => boolean;
  toggleFavorite: (handle: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY)
      .then((raw) => {
        if (raw) setFavorites(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const toggleFavorite = useCallback((handle: string) => {
    setFavorites((prev) => {
      const next = prev.includes(handle)
        ? prev.filter((h) => h !== handle)
        : [...prev, handle];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (handle: string) => favorites.includes(handle),
    [favorites]
  );

  const value = useMemo(
    () => ({ favorites, isFavorite, toggleFavorite }),
    [favorites, isFavorite, toggleFavorite]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites חייב להיות בתוך FavoritesProvider');
  return ctx;
}
