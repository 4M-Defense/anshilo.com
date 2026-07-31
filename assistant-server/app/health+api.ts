/**
 * בדיקת חיים. מחזיר גם מה שנראה בקצה — Origin, ואם המשתנים הוזרקו — כדי
 * שאבחון תקלה לא יידרש לניחושים. אין כאן שום ערך סודי, רק אם הוא קיים.
 */
export function GET(request: Request): Response {
  return Response.json({
    ok: true,
    sees: {
      origin: request.headers.get('Origin'),
      userAgent: request.headers.get('User-Agent'),
    },
    env: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      storefront: Boolean(process.env.SHOPIFY_STOREFRONT_TOKEN),
    },
  });
}
