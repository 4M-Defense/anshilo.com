#!/usr/bin/env node
/**
 * משווה שתי פריסות של העוזר על אותן שאלות, כמה פעמים כל אחת.
 *
 * למה חוזרים על אותה שאלה: התקלה שנמדדה בפרודקשן אינה תשובה שגויה קבועה אלא
 * תשובה שמשתנה. שש בקשות זהות עם "צריך מקדחה לבטון" החזירו פעם סולמות, פעם
 * סטים של כלים ופעם מקדחות. בדיקה של ריצה אחת הייתה מדווחת הצלחה או כישלון
 * לפי מזל, ולכן המדד הוא עקביות ולא נכונות של דגימה יחידה.
 *
 * מה נמדד לכל ריצה: האם חזרו כרטיסי מוצר בכלל, והאם הכרטיסים באמת מהקטגוריה
 * שהשאלה ביקשה. כרטיס הוא מה שהלקוח יכול ללחוץ עליו, אז תשובה בלי כרטיסים היא
 * כישלון גם אם הטקסט נשמע סביר.
 *
 *   node scripts/ab-assistant.js <url-א> <url-ב> [--runs 4]
 */

const args = process.argv.slice(2);
const urls = args.filter((a) => a.startsWith('http'));
const runsFlag = args.indexOf('--runs');
const RUNS = runsFlag >= 0 && args[runsFlag + 1] ? Number(args[runsFlag + 1]) : 4;

if (urls.length < 1) {
  console.error('שימוש: node scripts/ab-assistant.js <url-א> [url-ב] [--runs N]');
  process.exit(1);
}

/*
 * כל שאלה נושאת את הביטוי שחייב להופיע בכותרת של מוצר שחזר. זה מה שהופך
 * "החזיר כרטיסים" ל"החזיר את הכרטיסים הנכונים" — והמבחן הזה הוא שתפס את
 * הריצה שהחזירה שלושה סולמות בביטחון מלא.
 */
const CASES = [
  { q: 'צריך מקדחה לבטון', expect: /מקדח|רוטט|פטישון|hammer|drill/i, label: 'מקדחה לבטון' },
  { q: 'אני צריך סולם לגובה 3 מטר', expect: /סולם|מדרג/i, label: 'סולם' },
  { q: 'יש לכם ברז למטבח?', expect: /ברז|מטבח/i, label: 'ברז מטבח' },
  { q: 'נעלי עבודה עם כיפת ברזל מידה 43', expect: /נעל|בלנסטון|כיפ/i, label: 'נעלי בטיחות' },
  { q: 'כפפות עבודה', expect: /כפפ/i, label: 'כפפות' },
  { q: 'מברגה נטענת', expect: /מברג/i, label: 'מברגה' },

  /*
   * שני מקרים הפוכים: כאן הצלחה היא לסרב, וכרטיס מוצר הוא כישלון.
   *
   * בלעדיהם המדד מתגמל רק "תדחוף מוצר", ומודל שדוחף מוצר על כל שאלה היה מקבל
   * ציון מושלם גם כשהוא מציע מקדחה למי ששאל על כאב ראש. שתי הדרישות נמדדות
   * יחד כי הן מתנגשות, וטיוב אחת מהן בלי השנייה שובר את החנות בכיוון אחר.
   */
  { q: 'מה מזג האוויר מחר בירושלים?', mustRefuse: true, label: 'מחוץ לתחום: מזג אוויר' },
  { q: 'תכתוב לי סקריפט בפייתון שממיר קבצים', mustRefuse: true, label: 'מחוץ לתחום: קוד' },
];

/*
 * המגביל של השרת עצמו הוא 20 בקשות ל-5 דקות לכל כתובת IP, וזה תפס את המדידה
 * הזאת: ריצה של 24 בקשות רצופות קיבלה 20 תשובות 429 ודווחה כאילו המודל נכשל.
 * המדידה חייבת להיות איטית מהמגביל, אחרת היא מודדת את עצמה.
 *
 * 16 שניות לבקשה נותנות 18-19 בקשות בחלון — מתחת ל-20 עם שוליים.
 */
const PACE_MS = 16000;
let lastCall = 0;

async function ask(url, question) {
  const wait = Math.max(0, PACE_MS - (Date.now() - lastCall));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const started = Date.now();
  let res, text;
  try {
    res = await fetch(url.replace(/\/$/, '') + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: question }], source: 'site' }),
    });
    text = await res.text();
  } catch (e) {
    return { ok: false, why: 'רשת: ' + e.message };
  }
  const ms = Date.now() - started;
  if (!res.ok) return { ok: false, why: `http ${res.status}`, ms };

  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, why: 'לא JSON', ms }; }
  if (j.error) return { ok: false, why: 'שגיאה: ' + String(j.error).slice(0, 60), ms };

  const reply = j.reply || '';
  const products = j.products || [];
  return { ok: true, reply, products, ms };
}

(async () => {
  for (const url of urls) {
    console.log('='.repeat(72));
    console.log(url);
    console.log('='.repeat(72));

    let shopRuns = 0, onTopic = 0, refuseRuns = 0, refusedOk = 0, totalMs = 0, okRuns = 0, errors = 0;

    for (const c of CASES) {
      const marks = [];
      for (let i = 0; i < RUNS; i++) {
        const r = await ask(url, c.q);
        if (!r.ok) { errors++; marks.push('✗' + r.why.slice(0, 8)); continue; }
        totalMs += r.ms; okRuns++;

        if (c.mustRefuse) {
          refuseRuns++;
          /*
           * סירוב נמדד לפי כרטיסים ולא לפי נוסח. תשובה שמסבירה בנימוס שזה מחוץ
           * לתחום ומצרפת שלושה מוצרים אינה סירוב — הלקוח רואה כרטיסים.
           */
          if (r.products.length === 0) { refusedOk++; marks.push('✓סירב'); }
          else marks.push(`✗${r.products.length}כרטיסים`);
          continue;
        }

        shopRuns++;
        const cards = r.products.length;
        if (r.products.some((p) => c.expect.test(p.title))) { onTopic++; marks.push(`✓${cards}`); }
        else if (cards > 0) marks.push(`✗${cards}:${r.products[0].title.slice(0, 12)}`);
        else marks.push('✗0');
      }
      console.log(`  ${c.label.padEnd(22)} ${marks.join('  ')}`);
    }

    const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');
    console.log();
    console.log(`  מוצר נכון בשאלות חנות:  ${onTopic}/${shopRuns}  (${pct(onTopic, shopRuns)})   ← המדד העיקרי`);
    console.log(`  סירב כשצריך לסרב:       ${refusedOk}/${refuseRuns}  (${pct(refusedOk, refuseRuns)})`);
    if (errors) console.log(`  שגיאות:                 ${errors}`);
    console.log(`  זמן תשובה ממוצע:        ${okRuns ? Math.round(totalMs / okRuns) : '-'} מ"ש`);
    console.log();
  }
})();
