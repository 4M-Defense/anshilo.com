/** בדיקת חיים — מאפשרת לוודא שהפריסה באוויר בלי לצרוך טוקנים של Anthropic. */
export function GET(): Response {
  return Response.json({ ok: true });
}
