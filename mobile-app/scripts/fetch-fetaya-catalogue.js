#!/usr/bin/env node
/**
 * שולף את כל הקטלוג של פתיה מהאתר שלהם, כדי שאפשר יהיה למחוק מחירים
 * וגם לייבא מוצרים שעוד לא קיימים בחנות.
 *
 * למה כך ולא בכלי סיכום: כל עמוד מוצר של פתיה נושא בלוק
 * `application/ld+json` מסוג Product עם `name` ו-`offers.price`, ולכן
 * החילוץ מדויק ומלא. כלי ששולף עמוד ומסכם אותו במודל היה מחזיר חלק
 * מהשורות בלבד ובלי להודיע על כך — וברשימה של 900 מוצרים זה בדיוק סוג
 * הכשל שנראה כמו הצלחה.
 *
 * הרשימה עצמה נלקחת ממפת האתר של פתיה, ולא מזחילה בקטגוריות: מפת האתר
 * היא ההצהרה של האתר על מה קיים בו, וזה מונע גם השמטה וגם כפילויות.
 *
 * קורא בלבד. לא נוגע בחנות ולא דורש שום טוקן.
 *
 *   node scripts/fetch-fetaya-catalogue.js            # לכל הקטלוג
 *   node scripts/fetch-fetaya-catalogue.js --limit 40 # דגימה מהירה
 *
 * הפלט: fetaya-catalogue.json ו-fetaya-catalogue.csv בתיקיית mobile-app.
 */

const fs = require('fs');
const path = require('path');

/*
 * הדומיין הוא פרמטר, כי אותה פלטפורמה מריצה יותר מספק אחד.
 *
 * פתיה, ניסקו, ארגנטולס וטולס אונליין בנויים כולם באותה מערכת: מפת אתר
 * ממוספרת ב-`sitemap.xml?page=N`, כתובות מוצר תחת `/items/`, בלוק
 * `application/ld+json` בעמוד ומספר קטלוגי ב-div.cataloge_number. משמע
 * שולף אחד מכסה את כולם, והחלפת דומיין היא כל ההבדל.
 *
 *   node scripts/fetch-fetaya-catalogue.js --domain www.argentools.co.il --out argentools
 */
const domIdx = process.argv.indexOf('--domain');
const DOMAIN = domIdx >= 0 ? process.argv[domIdx + 1] : 'www.fetaya.com';
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx >= 0 ? process.argv[outIdx + 1] : 'fetaya';
/*
 * שתי בקשות במקביל, לא שמונה.
 *
 * בשמונה הריצה הראשונה החזירה 156 מתוך 910 — הדגימה של 30 עברה במלואה
 * ואז האתר התחיל לדחות. אתר של ספק אינו CDN, ולהציף אותו כדי לחסוך שתי
 * דקות הוא גם לא מנומס וגם מייצר בדיוק את התוצאה החלקית שנראית כמו הצלחה.
 */
const CONCURRENCY = 2;
const RETRIES = 4;
const BASE_DELAY_MS = 400;

const args = process.argv.slice(2);
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;
/* משלים רק את מה שחסר בקובץ הקיים, כדי לא לשלוף שוב 800 עמודים שכבר יש */
const ONLY_MISSING = args.includes('--only-missing');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * שליפה עם ניסיונות חוזרים והשהיה גוברת.
 *
 * `202` הוא המצב המעניין כאן: האתר של פתיה מחזיר אותו כשהוא ממתן קצב —
 * גוף ריק וקוד שאינו שגיאה, ולכן `res.ok` דווקא אמיתי והבקשה *נראית*
 * מוצלחת. בלי הבדיקה הזאת התוצאה היא עמוד בלי JSON-LD, שנספר כ"נכשל
 * לחלוטין" בלי סיבה. כל כשלון מחזיר הודעה, ולא נעלם במונה.
 */
async function text(url, minBytes = 0) {
  let last = 'unknown';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(BASE_DELAY_MS * 2 ** attempt);
    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
          'Accept-Language': 'he-IL,he;q=0.9',
        },
      });
    } catch (e) {
      last = `network: ${e.message}`;
      continue;
    }
    if (res.status === 202 || res.status === 429 || res.status >= 500) {
      last = `HTTP ${res.status}`;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (body.length < minBytes) {
      last = `גוף קצר מדי (${body.length} בתים)`;
      continue;
    }
    return body;
  }
  throw new Error(last);
}

/**
 * כל כתובות המוצר, מתוך מפות האתר.
 *
 * מספר המפות אינו קבוע בין ספקים — לפתיה יש ארבע ולארגנטולס שבע עשרה —
 * ולכן קוראים את מפת האינדקס ומגלים אותו, במקום לקבע מספר שיחתוך קטלוג
 * גדול בשקט באמצע.
 */
async function collectItemUrls() {
  const index = await text(`https://${DOMAIN}/sitemap.xml`);
  const children = [...index.matchAll(/<loc>([^<]*sitemap\.xml\?page=\d+)<\/loc>/g)].map((m) => m[1]);
  const pages = children.length > 0 ? children : [`https://${DOMAIN}/sitemap.xml`];
  console.log(`  ${pages.length} מפות אתר`);

  const urls = new Set();
  for (const sm of pages) {
    const xml = await text(sm);
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (m[1].includes('/items/')) urls.add(m[1]);
    }
  }
  return [...urls];
}

/**
 * מחלץ מוצר מעמוד.
 *
 * המחיר נלקח **רק** מה-JSON-LD ולא מחיפוש `₪` בטקסט: עמוד מוצר של פתיה
 * מכיל גם עשרות מוצרים קשורים עם מחירים משלהם, וחיפוש טקסטואלי היה תופס
 * את המחיר של השכן.
 */
function extract(html, url) {
  const block = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
  if (block == null) return null;
  let data;
  try {
    data = JSON.parse(block[1].trim());
  } catch {
    return null;
  }
  const nodes = Array.isArray(data) ? data : [data];
  const product = nodes.find((n) => n['@type'] === 'Product');
  if (product == null) return null;

  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const image = html.match(/<meta property="og:image" content="([^"]+)"/);

  /*
   * המקט — וזה החלק שהופך את כל השליפה לשימושית.
   *
   * התאמה לפי שם בין הקטלוג של פתיה לחנות **אינה עובדת**, ולא במעט:
   * נמדד שציון דמיון 0.89 מצביע על "אותה סדרה, דגם אחר" ולא על אותו מוצר.
   * DARYA 36W בחנות התאים ל-DARYA 28W אצל הספק, ושבילית 4.4W התאימה
   * לשבילית 44W — פי עשרה בהספק. ההבדל בין שני דגמים הוא ספרה אחת, והיא
   * בדיוק מה שקובע את המחיר, ולכן שם הוא מפתח גרוע.
   *
   * המקט אינו ב-JSON-LD אלא בגוף העמוד, בתוך div.cataloge_number.
   * למוצרי פתיה בחנות יש מקט מספרי, כך שזה מפתח מדויק לשני הכיוונים.
   */
  /*
   * שתי תבניות, לא אחת.
   *
   * `cataloge_number` נתן מקט ב-279 עמודים מתוך 910, ונראה כאילו לשאר פשוט
   * אין מספר קטלוגי. אין — הם פשוט משתמשים בתבנית אחרת, `code_item`, שבה
   * המספר יושב ישירות בתוך ה-div ובלי span עוטף:
   *   <div class="code_item col-xs-4"> 6101 </div>
   * בלי הצורה השנייה 631 מוצרים נספרו כחסרי מקט, וזה בדיוק המידע שנדרש
   * כדי להצליב מול המקטים שבחנות.
   */
  const skuBlock =
    html.match(/class="cataloge_number"[\s\S]{0,400}?<span>([^<]{1,20})<\/span>/) ||
    html.match(/class="[^"]*\bcode_item\b[^"]*"[^>]*>\s*([^<\s][^<]{0,22}?)\s*<\/div>/);
  const sku = skuBlock ? skuBlock[1].trim() : null;
  /*
   * השם ב-JSON-LD נגמר בשם האתר — " | FETAYA" אצל פתיה, וכיוצא בזה אצל
   * האחרים. זה שם החנות של הספק ואין לו מקום בכותרת מוצר אצלנו, ולכן
   * נחתכת סיומת אחת של "| משהו" ולא יותר: שמות מוצר לגיטימיים מכילים
   * לוכסן אנכי באמצע, וחיתוך גורף היה קוטע אותם.
   */
  const name = String(product.name || '').replace(/\s*\|\s*[^|]{1,30}\s*$/, '').trim()
    || String(product.name || '').trim();

  return {
    url,
    itemId: (url.match(/\/items\/(\d+)/) || [])[1] ?? null,
    sku,
    name,
    price: offers?.price != null ? Number(offers.price) : null,
    currency: offers?.priceCurrency ?? null,
    availability: offers?.availability ?? null,
    image: image ? image[1] : null,
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

function toCsv(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = ['itemId', 'sku', 'name', 'price', 'currency', 'availability', 'image', 'url'];
  /* BOM כדי שאקסל בעברית לא יציג ג'יבריש */
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

async function main() {
  console.log(`קורא את מפות האתר של ${DOMAIN}…`);
  let urls = await collectItemUrls();
  console.log(`  ${urls.length} כתובות מוצר`);

  /*
   * השלמה בלבד.
   *
   * הריצה המלאה מחזירה 807 מתוך 910, וההפרש אינו שגיאה בקוד אלא מיתון קצב
   * של האתר — 78 מהכשלונות היו HTTP 202. אין טעם לשלוף שוב 807 עמודים
   * שכבר יש, ויש טעם לנסות שוב את מה שנחסם, בהרצה נפרדת ומרווחת בזמן.
   */
  let existing = [];
  if (ONLY_MISSING) {
    const p = path.join(__dirname, '..', `${OUT}-catalogue.json`);
    if (!fs.existsSync(p)) throw new Error(`אין ${OUT}-catalogue.json — הריצו קודם ריצה מלאה`);
    existing = JSON.parse(fs.readFileSync(p, 'utf8')).filter((r) => r && r.url);
    const have = new Set(existing.map((r) => r.url));
    const before = urls.length;
    urls = urls.filter((u) => !have.has(u));
    console.log(`  יש כבר ${existing.length} | חסרים ${urls.length} מתוך ${before}`);
    if (urls.length === 0) {
      console.log('\nהקטלוג שלם, אין מה להשלים.');
      return;
    }
  }

  if (LIMIT) {
    urls = urls.slice(0, LIMIT);
    console.log(`  מוגבל ל-${urls.length} לצורך דגימה`);
  }

  let done = 0;
  const failures = [];
  const rows = await mapLimit(urls, CONCURRENCY, async (url) => {
    try {
      const row = extract(await text(url, 5000), url);
      if (row == null) failures.push({ url, why: 'אין Product ב-JSON-LD' });
      return row;
    } catch (e) {
      failures.push({ url, why: e.message });
      return null;
    } finally {
      done++;
      if (done % 25 === 0) process.stdout.write(`\r  נשלפו ${done}/${urls.length}…`);
    }
  });

  const ok = rows.filter(Boolean);
  const withPrice = ok.filter((r) => r.price != null && r.price > 0);
  console.log(`\n`);
  console.log('='.repeat(56));
  console.log(`נשלפו בהצלחה   : ${ok.length} מתוך ${urls.length}`);
  console.log(`עם מחיר        : ${withPrice.length}`);
  console.log(`בלי מחיר       : ${ok.length - withPrice.length}`);
  console.log(`כשלו לגמרי     : ${failures.length}`);
  if (failures.length > 0) {
    /* למה נכשל, ולא רק כמה — אחרת אי אפשר לדעת אם זו חסימת קצב או שינוי באתר */
    const byReason = failures.reduce((m, f) => ((m[f.why] = (m[f.why] || 0) + 1), m), {});
    for (const [why, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(n).padStart(4)} × ${why}`);
    }
  }
  if (withPrice.length > 0) {
    const prices = withPrice.map((r) => r.price).sort((a, b) => a - b);
    const med = prices[Math.floor(prices.length / 2)];
    console.log(`טווח מחירים    : ₪${prices[0]} – ₪${prices[prices.length - 1]}  (חציון ₪${med})`);
  }
  console.log('='.repeat(56));

  /* בהשלמה מצרפים למה שכבר יש, אחרת הקובץ נדרס ב-103 שורות במקום 910 */
  const merged = ONLY_MISSING ? [...existing, ...ok] : ok;
  if (ONLY_MISSING) console.log(`סה"כ בקטלוג    : ${merged.length}`);

  const dir = path.join(__dirname, '..');
  fs.writeFileSync(path.join(dir, `${OUT}-catalogue.json`), JSON.stringify(merged, null, 2));
  fs.writeFileSync(path.join(dir, `${OUT}-catalogue.csv`), toCsv(merged));
  console.log(`\nנשמר: ${OUT}-catalogue.json ו-${OUT}-catalogue.csv`);
}

main().catch((err) => {
  console.error(`\nשגיאה: ${err.message}`);
  process.exitCode = 1;
});
