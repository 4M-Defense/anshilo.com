import { ASSISTANT_URL } from '../config';
import type { ProductCardData } from './types';

/**
 * הלקוח של "המומחה של שילו" — שרת העוזר (פרויקט assistant-server).
 *
 * הפרוטוקול מכוון: האפליקציה שולחת את התמליל, השרת מחזיר תשובה אחת
 * ורשימת מוצרים להמלצה. כל ההיגיון (פרומפט, חיפוש בקטלוג) חי בשרת —
 * כך שיפור של העוזר לא דורש גרסת אפליקציה חדשה.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AssistantError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
    /** קוד ה-HTTP כשהשגיאה הגיעה מהשרת — 400 מסמן למסך "ההודעה עצמה פסולה" */
    public readonly status?: number
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

/** הודעת ברירת המחדל — כשהשרת נכשל בלי להסביר את עצמו בעברית */
const FALLBACK_MESSAGE = 'שגיאה זמנית. נסו שוב.';

/**
 * תקרת המתנה לתשובה. העוזר חושב ומחפש בקטלוג, ולכן התקרה נדיבה —
 * אבל היא חייבת להתקיים: בלי AbortController בקשה תקועה משאירה את
 * מחוון ההקלדה מרצד לנצח.
 */
const TIMEOUT_MS = 30_000;

/**
 * שליחת התמליל לשרת וקבלת התשובה הבאה.
 *
 * `messages` הוא התמליל המצטבר (המתקשר כבר קוצץ אותו) — השרת חסר זיכרון
 * בכוונה, כל בקשה נושאת את ההקשר שלה. `source: 'app'` מאפשר לשרת להבחין
 * בין פניות מהאפליקציה לפניות מהאתר.
 */
export async function sendChat(
  messages: ChatMessage[]
): Promise<{ reply: string; products: ProductCardData[] }> {
  const controller = new AbortController();
  /*
   * הטיימר חי עד אחרי קריאת ה-body, לא רק עד כותרות התשובה: שרת שנתקע אחרי
   * שליחת הכותרות היה משאיר את response.json() תלוי לנצח ואת חיווי ההקלדה
   * מסתובב בלי מוצא. ה-clearTimeout נמצא בהמשך, אחרי פענוח הגוף.
   */
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError';

  let response: Response;
  try {
    response = await fetch(`${ASSISTANT_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, source: 'app' }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    /*
     * timeout איננו "אין אינטרנט": לולאת הכלים של העוזר יכולה לקחת זמן
     * באמת, ולהגיד למשתמש עם Wi-Fi תקין לבדוק את החיבור זו הטעיה.
     */
    if (isAbort(err)) {
      throw new AssistantError('העוזר עדיין חושב… נסו שוב בעוד רגע.', err);
    }
    throw new AssistantError('אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.', err);
  }

  if (!response.ok) {
    // השרת מחזיר {error} בעברית — מציגים אותה כלשונה; גוף לא צפוי לא מפיל אותנו
    let serverMessage = '';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') serverMessage = body.error.trim();
    } catch {
      // הגוף אינו JSON — נופלים להודעת ברירת המחדל
    } finally {
      clearTimeout(timer);
    }
    throw new AssistantError(serverMessage !== '' ? serverMessage : FALLBACK_MESSAGE, undefined, response.status);
  }

  let payload: { reply?: unknown; products?: unknown };
  try {
    payload = (await response.json()) as { reply?: unknown; products?: unknown };
  } catch (err) {
    if (isAbort(err)) {
      throw new AssistantError('העוזר עדיין חושב… נסו שוב בעוד רגע.', err);
    }
    throw new AssistantError(FALLBACK_MESSAGE, err);
  } finally {
    clearTimeout(timer);
  }

  const reply = typeof payload.reply === 'string' ? payload.reply.trim() : '';
  if (reply === '') {
    throw new AssistantError(FALLBACK_MESSAGE, payload);
  }

  /*
   * המוצרים נבדקים פריט-פריט ולא מוטלים בטיפוס עיוור: גרסת שרת שסטתה מהחוזה
   * (או פריט null) הייתה מפילה את כל המסך בתוך ProductCard, שקורא
   * priceRange.minVariantPrice.amount בלי שמירה. פריט פגום נשמט בשקט —
   * התשובה הטקסטואלית עדיין מוצגת.
   */
  const products = (Array.isArray(payload.products) ? payload.products : []).filter(
    (item): item is ProductCardData => {
      if (item == null || typeof item !== 'object') return false;
      const p = item as Partial<ProductCardData>;
      return (
        typeof p.id === 'string' &&
        typeof p.handle === 'string' &&
        typeof p.title === 'string' &&
        typeof p.priceRange?.minVariantPrice?.amount === 'string'
      );
    }
  );

  return { reply, products };
}
