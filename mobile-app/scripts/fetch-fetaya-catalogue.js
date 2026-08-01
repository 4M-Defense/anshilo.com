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

const SITEMAPS = [1, 2, 3, 4].map((p) => `https://www.fetaya.com/sitemap.xml?page=${p}`);
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

/** כל כתובות המוצר, מתוך ארבע מפות האתר */
async function collectItemUrls() {
  const urls = new Set();
  for (const sm of SITEMAPS) {
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
  const skuBlock = html.match(/class="cataloge_number"[\s\S]{0,400}?<span>([^<]{1,20})<\/span>/);
  const sku = skuBlock ? skuBlock[1].trim() : null;
  /* השם ב-JSON-LD מגיע עם " | FETAYA" בסוף ובלי סימני פיסוק — מנקים */
  const name = String(product.name || '').replace(/\s*\|\s*FETAYA\s*$/i, '').trim();

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
  console.log('קורא את מפות האתר של פתיה…');
  let urls = await collectItemUrls();
  console.log(`  ${urls.length} כתובות מוצר`);
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

  const dir = path.join(__dirname, '..');
  fs.writeFileSync(path.join(dir, 'fetaya-catalogue.json'), JSON.stringify(ok, null, 2));
  fs.writeFileSync(path.join(dir, 'fetaya-catalogue.csv'), toCsv(ok));
  console.log('\nנשמר: fetaya-catalogue.json ו-fetaya-catalogue.csv');
}

main().catch((err) => {
  console.error(`\nשגיאה: ${err.message}`);
  process.exitCode = 1;
});
