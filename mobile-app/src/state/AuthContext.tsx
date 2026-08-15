import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CUSTOMER_PROFILE_QUERY,
  CustomerAuthError,
  customerFetch,
  exchangeCodeForToken,
  getDiscovery,
  refreshAccessToken,
  type CustomerProfile,
  type TokenSet,
} from '@/api/customerAccount';
import { CUSTOMER_ACCOUNT } from '@/config';

/**
 * מצב ההתחברות של הלקוח.
 *
 * הזרימה היא OAuth 2.0 עם PKCE, כפי ששופיפיי מחייבת לקליינט ציבורי:
 *  1. האפליקציה מגרילה code_verifier ושולחת את הגיבוב שלו (S256) לשופיפיי
 *  2. נפתח מסך ההתחברות **של שופיפיי** בדפדפן המאובטח של המערכת. שם מופיע
 *     כפתור גוגל, כי הוא מופעל בהגדרות החנות
 *  3. שופיפיי חוזרת לאפליקציה עם קוד חד-פעמי, דרך הסכמה shop.{shop_id}.app
 *  4. הקוד + ה-verifier מומרים לטוקן
 *
 * המשמעות: **האפליקציה לא רואה סיסמה ולא נוגעת בגוגל**. אין SDK של גוגל,
 * אין client secret, ואין מה לתחזק מול גוגל.
 *
 * הטוקנים נשמרים ב-SecureStore (Keychain ב-iOS, Keystore באנדרואיד) ולא
 * ב-AsyncStorage — refresh token הוא סוד לכל דבר, ו-AsyncStorage הוא קובץ
 * גלוי במכשיר שעבר rooting.
 */

const TOKEN_KEY = 'shilo.customer.tokens.v1';

export interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  profile: CustomerProfile['customer'] | null;
  /** שגיאה שכדאי להציג למשתמש; null כשאין */
  error: string | null;
  /** true בזמן שהדפדפן פתוח או שהטוקן מוחלף */
  busy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** מחזיר טוקן תקף, מרענן אם צריך. null כשלא מחוברים */
  getAccessToken: () => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function readTokens(): Promise<TokenSet | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as TokenSet;
    return typeof parsed.accessToken === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

async function writeTokens(tokens: TokenSet | null): Promise<void> {
  try {
    if (tokens == null) await SecureStore.deleteItemAsync(TOKEN_KEY);
    else await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    /* אחסון מאובטח לא זמין — נשארים מחוברים לסשן הנוכחי בלבד */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [profile, setProfile] = useState<CustomerProfile['customer'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** מוחזק ב-ref ולא ב-state: נקרא בתוך קריאות רשת ולא צריך לרנדר מחדש */
  const tokens = useRef<TokenSet | null>(null);

  const clearSession = useCallback(async () => {
    tokens.current = null;
    await writeTokens(null);
    setProfile(null);
    setStatus('signedOut');
  }, []);

  /** טוקן תקף, עם רענון אוטומטי. מנקה את הסשן אם הרענון נדחה. */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const current = tokens.current;
    if (current == null) return null;
    if (Date.now() < current.expiresAt) return current.accessToken;
    if (current.refreshToken == null) {
      await clearSession();
      return null;
    }
    try {
      const next = await refreshAccessToken(current.refreshToken);
      tokens.current = next;
      await writeTokens(next);
      return next.accessToken;
    } catch {
      await clearSession();
      return null;
    }
  }, [clearSession]);

  const loadProfile = useCallback(async (): Promise<boolean> => {
    const token = await getAccessToken();
    if (token == null) return false;
    try {
      const data = await customerFetch<CustomerProfile>(token, CUSTOMER_PROFILE_QUERY);
      setProfile(data.customer);
      return true;
    } catch (err) {
      if (err instanceof CustomerAuthError && err.needsLogin) {
        await clearSession();
        return false;
      }
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת החשבון');
      // הטוקן תקף — נשארים מחוברים גם אם הפרופיל לא נטען
      return true;
    }
  }, [getAccessToken, clearSession]);

  /* שחזור סשן בעלייה */
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await readTokens();
      if (!alive) return;
      if (stored == null) {
        setStatus('signedOut');
        return;
      }
      tokens.current = stored;
      const ok = await loadProfile();
      if (!alive) return;
      setStatus(ok ? 'signedIn' : 'signedOut');
    })();
    return () => {
      alive = false;
    };
    // כוונה: פעם אחת בעלייה
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { authorizationEndpoint } = await getDiscovery();

      // PKCE — expo-auth-session מגריל verifier ומחשב S256 בעצמו
      const request = new AuthSession.AuthRequest({
        clientId: CUSTOMER_ACCOUNT.clientId,
        redirectUri: CUSTOMER_ACCOUNT.redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: CUSTOMER_ACCOUNT.scopes.split(' '),
        usePKCE: true,
      });

      const result = await request.promptAsync({ authorizationEndpoint });

      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success') {
        throw new CustomerAuthError('ההתחברות לא הושלמה. נסו שוב.');
      }

      /* הסכמה shop.{shop_id}.app אינה בלעדית לנו — אפליקציה אחרת במכשיר יכולה
         לרשום אותה ולשגר אלינו תשובת התחברות משלה. PKCE מונע ממנה להשתמש בקוד
         *שלנו*, אבל לא מונע את הכיוון ההפוך: שתדחוף לנו קוד של חשבון *שלה*,
         וכך הלקוח יגלוש בשקט בתוך חשבון של תוקף ויזין לתוכו כתובת ותשלום.
         ה-state מוגרל לכל בקשה, ולכן השוואה אליו פוסלת כל תשובה שלא נולדה כאן. */
      if (request.state && result.params.state !== request.state) {
        throw new CustomerAuthError('תשובת ההתחברות לא תואמת לבקשה. נסו שוב.');
      }

      const code = result.params.code;
      if (typeof code !== 'string' || code === '') {
        const denied = result.params.error_description ?? result.params.error;
        throw new CustomerAuthError(
          typeof denied === 'string' && denied !== ''
            ? `ההתחברות נדחתה: ${denied}`
            : 'ההתחברות לא החזירה קוד. נסו שוב.'
        );
      }
      if (request.codeVerifier == null) {
        throw new CustomerAuthError('שגיאה פנימית באבטחת ההתחברות. נסו שוב.');
      }

      const next = await exchangeCodeForToken(code, request.codeVerifier);
      tokens.current = next;
      await writeTokens(next);
      await loadProfile();
      setStatus('signedIn');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההתחברות נכשלה. נסו שוב.');
      await clearSession();
    } finally {
      setBusy(false);
    }
  }, [loadProfile, clearSession]);

  const signOut = useCallback(async () => {
    setBusy(true);
    const token = tokens.current?.accessToken;
    // מנקים מקומית קודם — גם אם היציאה מהשרת נכשלת, המשתמש מנותק במכשיר
    await clearSession();
    setError(null);
    try {
      if (token != null) {
        const { logoutEndpoint } = await getDiscovery();
        // הפעלת end-session אצל שופיפיי, כדי שהתחברות הבאה תשאל מחדש
        await WebBrowser.openAuthSessionAsync(
          `${logoutEndpoint}?id_token_hint=${encodeURIComponent(token)}`,
          CUSTOMER_ACCOUNT.redirectUri
        );
      }
    } catch {
      /* היציאה המקומית כבר הושלמה */
    } finally {
      setBusy(false);
    }
  }, [clearSession]);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({ status, profile, error, busy, signIn, signOut, getAccessToken, refreshProfile }),
    [status, profile, error, busy, signIn, signOut, getAccessToken, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx == null) throw new Error('useAuth חייב להיות בתוך AuthProvider');
  return ctx;
}
