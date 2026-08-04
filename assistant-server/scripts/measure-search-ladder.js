#!/usr/bin/env node
/**
 * מודד סולם חיפוש מול החיפוש הנאיבי שרץ בפרודקשן, על שאלות כמו שלקוח כותב.
 *
 * מה שנמדד ואילץ את כל זה:
 *
 * 1. חיפוש שופיפיי עושה AND על המילים, ובעברית זה קורס. "מקדחה" מחזיר
 *    מקדחות; "מקדחה לבטון" מחזיר אפס, כי ל' של "לבטון" אינה מתאימה ל"בטון".
 *    "יש לכם ברז למטבח?" מחזיר אפס בגלל "יש" ו"לכם".
 *
 * 2. וגרוע מזה — חיפוש חופשי בעברית מחזיר זבל מדורג ראשון. נמדד:
 *      "נעל"   → סופג לחות לחדרי ארונות
 *      "צבע"   → רמקול מגבר MAKITA
 *      "ברז"   → חותך מוטות ברזל
 *      "כפפות" → ספריי להסרת מדבקות
 *    כלומר גם שאילתה במילה אחת, שנראית כמו המקרה הקל, מחזירה מוצר לא קשור.
 *    זה קרה כי query חופשי סורק גם תיאור ותגיות, ובחנות הזאת התיאורים דלים
 *    (197 מוצרים מפורסמים בלי תיאור שימושי) ולכן ההתאמות מגיעות מרעש.
 *
 * 3. הגבלה ל-title: מתקנת את זה לגמרי. נמדד באותן מילים:
 *      title:נעל    → נעל בלנסטון גברים 910
 *      title:צבע    → אידאל צבע לבדים
 *      title:ברז    → ברז אמבט PATO
 *      title:כפפות  → כפפות אצבע מילווקי
 *    ובדרך התגלה שיש כפפות בחנות — האפס הקודם היה כישלון חיפוש, לא חוסר מלאי.
 *
 * OR נבדק ונדחה: "מקדחה OR בטון" מחזיר חמש תוצאות שהראשונה חותך מוטות ברזל.
 * OR מרחיב את הקבוצה והורג את הדירוג, וזה גרוע מאפס — הלקוח מקבל מוצר לא
 * קשור בביטחון מלא במקום "אין לנו".
 *
 * תו כללי מוביל (*נעל*) גם נדחה כברירת מחדל: הוא מצא "ספריי מחטא נעליים"
 * לפני נעלי עבודה. שופיפיי מתאים תחילית מעצמו, אז המילה הנקייה מדויקת יותר.
 *
 *   node scripts/measure-search-ladder.js
 */

const fs = require('fs');
const path = require('path');

const TOKEN = (() => {
  const p = path.join(__dirname, '..', '..', 'mobile-app', '.env');
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .find((l) => l.startsWith('EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN='));
  return line.split('=')[1].trim();
})();

const ENDPOINT = 'https://3007b3-4.myshopify.com/api/2025-07/graphql.json';
const GQL = `query S($q: String!) { products(first: 6, query: $q) { nodes { title } } }`;

async function search(q) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN },
    body: JSON.stringify({ query: GQL, variables: { q } }),
  });
  const j = await r.json();
  if (j.errors) return [];
  return (j.data?.products?.nodes || []).map((n) => n.title);
}

const STOPWORDS = new Set([
  'צריך', 'צריכה', 'רוצה', 'מחפש', 'מחפשת', 'אני', 'אתם', 'יש', 'לכם', 'לך', 'האם',
  'את', 'של', 'עם', 'בלי', 'או', 'גם', 'כמה', 'איזה', 'איזו', 'מה', 'זה', 'הוא',
  'בבקשה', 'תודה', 'שלום', 'היי', 'טוב', 'כדי', 'בשביל', 'עבור', 'לי', 'לנו',
  'אפשר', 'תן', 'תני', 'תביא', 'מתאים', 'מתאימה', 'טובה', 'הכי', 'מיל', 'מטר',
  'מידה', 'גודל', 'ליטר', 'קוטר', 'גובה',
]);

/**
 * אותיות שימוש — "לבטון" אינו מתאים ל"בטון" שבכותרת.
 *
 * מחזיר וריאנט, לא מחליף. ההחלפה נמדדה ונכשלה: אותן אותיות פותחות גם מילים
 * לגיטימיות, ולכן "כפפות" הפך ל"פפות" ו"מסור" ל"סור", ושתי השאילתות שנפלו
 * בבדיקה נפלו רק מזה. המילה כמו שנכתבה נבדקת ראשונה; הגריעה היא שלב מאוחר.
 */
function withoutPrefixLetter(word) {
  if (word.length >= 4 && /^[לבמהוכש]/.test(word)) return word.slice(1);
  return null;
}

/**
 * הטיות סוף — "נעלי" מול "נעל" שבכותרת, "מקדחות" מול "מקדחה".
 *
 * שופיפיי אינו גוזר עברית, אז הצורה הקצרה נוצרת במפורש. נמדד שזה משנה: על
 * "נעלי" תו כללי מצא ספריי מחטא נעליים, ו-title:נעל מצא נעל בלנסטון.
 */
function withoutSuffix(word) {
  const m = word.match(/^(.{3,})(ים|ות|יים|י)$/);
  return m ? m[1] : null;
}

function contentWords(q) {
  return q
    .replace(/[?!.,"'׳״()\-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
}

/**
 * שלבי הסולם, מהצר לרחב. הראשון שמחזיר תוצאות מנצח.
 *
 * המילה הראשונה מקבלת מקום מיוחד ולא המילה הארוכה. בעברית שם המוצר בא ראשון
 * וההקשר אחריו — "מקדחה לבטון", "סולם לגובה", "ברז למטבח", "נעלי עבודה",
 * "דבק אפוקסי", "צבע לבן". נבדק על שמונה שאילתות: המילה הראשונה היא המוצר
 * בשמונה מתוך שמונה, בעוד שהמילה הארוכה בחרה "בטון" על "מקדחה" ופתחה במסור.
 */
function ladder(rawQuery) {
  const steps = [];
  const push = (q, why) => { if (q && q.trim() && !steps.some((s) => s.q === q)) steps.push({ q: q.trim(), why }); };

  const words = contentWords(rawQuery);
  if (!words.length) { push(rawQuery, 'אין מילות תוכן — חיפוש חופשי'); return steps; }

  const head = words[0];

  if (words.length > 1) push(words.map((w) => `title:${w}`).join(' AND '), 'כל המילים בכותרת');
  if (words.length > 2) push(`title:${head} AND title:${words[1]}`, 'שתי המילים הראשונות');
  push(`title:${head}`, 'המוצר, כלומר המילה הראשונה');

  // הווריאנטים של המילה הראשונה, אחרי שהצורה שנכתבה נוסתה
  const noSuffix = withoutSuffix(head);
  if (noSuffix) push(`title:${noSuffix}`, 'בלי הטיית סוף');
  const noPrefix = withoutPrefixLetter(head);
  if (noPrefix) push(`title:${noPrefix}`, 'בלי אות שימוש');

  // ושאר המילים, למקרה שהראשונה הייתה תואר ולא מוצר
  for (const w of words.slice(1)) push(`title:${w}`, `מילה אחרת בשאילתה: ${w}`);

  push(`title:*${head}*`, 'תו כללי');
  push(rawQuery, 'חיפוש חופשי — מוצא אחרון');

  return steps;
}

const CASES = [
  { q: 'צריך מקדחה לבטון', expect: /מקדח|רוטט|פטישון/ },
  { q: 'אני צריך סולם לגובה 3 מטר', expect: /סולם|מדרג/ },
  { q: 'יש לכם ברז למטבח?', expect: /ברז/ },
  { q: 'נעלי עבודה עם כיפת ברזל מידה 43', expect: /נעל|בלנסטון/ },
  { q: 'מחפש דבק אפוקסי לאריחים', expect: /דבק/ },
  { q: 'צבע לבן לקירות פנים', expect: /צבע/ },
  { q: 'מברגה נטענת עם 2 סוללות', expect: /מברג/ },
  { q: 'כפפות עבודה', expect: /כפפ/ },
  { q: 'פטישון למקיטה', expect: /פטישון/ },
  { q: 'צריך מסור לעץ', expect: /מסור/ },
];

(async () => {
  let naiveHits = 0, ladderHits = 0;

  for (const c of CASES) {
    const naive = await search(c.q);
    const naiveOk = naive.some((t) => c.expect.test(t));
    if (naiveOk) naiveHits++;

    let chosen = null;
    for (const step of ladder(c.q)) {
      const res = await search(step.q);
      if (res.length) { chosen = { ...step, res }; break; }
    }
    const ladderOk = chosen != null && chosen.res.some((t) => c.expect.test(t));
    if (ladderOk) ladderHits++;

    console.log(`"${c.q}"`);
    console.log(`   נאיבי:  ${String(naive.length).padStart(2)}  ${naiveOk ? '✓' : '✗'}  ${naive[0] ? naive[0].slice(0, 44) : '—'}`);
    if (chosen) {
      console.log(`   סולם:   ${String(chosen.res.length).padStart(2)}  ${ladderOk ? '✓' : '✗'}  [${chosen.why}]  ${chosen.q}`);
      console.log(`           ${chosen.res.slice(0, 3).map((t) => t.slice(0, 28)).join(' | ')}`);
    } else {
      console.log(`   סולם:    0  ✗  אפס בכל השלבים`);
    }
    console.log();
  }

  console.log('='.repeat(62));
  console.log(`נאיבי (מה שרץ עכשיו): ${naiveHits}/${CASES.length}      סולם: ${ladderHits}/${CASES.length}`);
})();
