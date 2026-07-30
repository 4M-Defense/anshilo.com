import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { DEFAULT_SETTINGS, fetchAppSettings, type AppSettings } from '@/api/appSettings';

interface SettingsValue {
  settings: AppSettings;
  /** האם ההגדרות מהחנות כבר הגיעו. עד אז `settings` הוא ברירות המחדל */
  loaded: boolean;
  refresh: () => void;
}

const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  refresh: () => {},
});

/**
 * טוען את ההגדרות מהחנות ומחזיק אותן לכל האפליקציה.
 *
 * המצב ההתחלתי הוא **ברירות המחדל ולא null**, ולכן אין מסך טעינה ואין הבהוב:
 * האפליקציה עולה מיד עם מה שהיה מקובע בקוד, וכשהתשובה מהחנות מגיעה השדות
 * שהשתנו מתעדכנים במקום. אם התשובה לא מגיעה, שום דבר לא נשבר.
 *
 * רענון קורה גם כשהאפליקציה חוזרת לחזית — כך שינוי באדמין של שופיפיי מופיע
 * בטלפון בלי לסגור ולפתוח את האפליקציה מחדש.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    /* fetchAppSettings לא זורק — הוא מחזיר ברירות מחדל בכל כשל */
    fetchAppSettings().then((next) => {
      setSettings(next);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  const value = useMemo<SettingsValue>(
    () => ({ settings, loaded, refresh: load }),
    [settings, loaded, load]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** ההגדרות החיות מהחנות, עם ברירות המחדל כרשת ביטחון */
export function useSettings(): AppSettings {
  return useContext(SettingsContext).settings;
}

/** לרכיבים שצריכים לדעת אם התשובה מהחנות כבר הגיעה, או לרענן ידנית */
export function useSettingsState(): SettingsValue {
  return useContext(SettingsContext);
}
