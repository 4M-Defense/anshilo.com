#!/usr/bin/env node
/**
 * מוצא מחיר מפורסם למוצר לפי מקט, אצל משווק שמפרסם מחירים.
 *
 *   node scripts/price-by-sku.js argentools-catalogue.json --limit 20
 *   node scripts/price-by-sku.js argentools-catalogue.json --out argentools-prices
 *
 * למה זה נחוץ: היבואנים אינם מפרסמים מחירים. נמדד על ארגנטולס — 4,219
 * מוצרי מקיטה, 91% עם מקט, 100% עם תמונה, ואפס מחירים — וכך גם דלקו,
 * ניסקו, טמבור ונירלט. קטלוג סוחרים נותן שם, מקט ותמונה, והמחיר נמצא
 * אצל מי שמוכר לצרכן.
 *
 * המפתח הוא המקט ולא השם. שני הצדדים נושאים את מספר החלק של היצרן —
 * HR2630X1, DUH602Z, RT0700CX2 — וזה מזהה ולא דמיון. אותה מדידה שהראתה
 * שהתאמת שם נותנת DARYA 36W מול 28W חלה כאן במלוא העוצמה: בכלי עבודה
 * ההבדל בין דגם לדגם הוא לרוב אות אחת בסוף המקט, והיא שקובעת את המחיר.
 *
 * החיפוש באתר המשווק מחזיר עמוד תוצאות, ומשם נלקחת התוצאה **הראשונה
 * בלבד** ורק אם המקט שלה זהה לזה שחיפשנו. חיפוש שמחזיר משהו דומה אינו
 * התאמה — אצל משווק כלי עבודה "דומה" הוא דגם אחר באותה סדרה.
 *
 * קורא בלבד. לא נוגע בחנות.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const FILE = args[0];
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;
const srcIdx = args.indexOf('--source');
const SOURCE = srcIdx >= 0 ? args[srcIdx + 1] : 'www.toolsonline.co.il';

if (!FILE) {
  console.error('שימוש: node scripts/price-by-sku.js <קטלוג.json> [--limit N] [--out שם]');
  process.exit(1);
}

const CONCURRENCY = 2;
const RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** אותו נרמול משני הצדדים — "PM 10E" מול "PM-10E" מול "pm10e" */
const normSku = (s) => String(s ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

async function fetchText(url) {
  let last = 'unknown';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** attempt);
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
    /* 202 עם גוף ריק הוא איך שהפלטפורמה הזאת ממתנת קצב — לא שגיאה, ולכן חוזרים */
    if (res.status === 202 || res.status === 429 || res.status >= 500) {
      last = `HTTP ${res.status}`;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error(last);
}

/**
 * המקט של המוצר בעמוד. אותו סימון כמו בשאר הפלטפורמה: div.cataloge_number.
 */
function skuOf(html) {
  const m = html.match(/class="cataloge_number"[\s\S]{0,400}?<span>([^<]{1,24})<\/span>/);
  return m ? m[1].trim() : null;
}

function productFrom(html) {
  const block = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
  if (!block) return null;
  let data;
  try { data = JSON.parse(block[1].trim()); } catch { return null; }
  const nodes = Array.isArray(data) ? data : [data];
  const p = nodes.find((n) => n['@type'] === 'Product');
  if (!p) return null;
  const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
  return {
    name: String(p.name || '').replace(/\s*\|\s*[^|]{1,30}\s*$/, '').trim(),
    price: offers?.price != null ? Number(offers.price) : null,
  };
}

/** מחפש מקט אצל המשווק ומחזיר מחיר רק בהתאמת מקט מדויקת */
async function priceFor(sku) {
  const html = await fetchText(`https://${SOURCE}/search?q=${encodeURIComponent(sku)}`);
  const first = html.match(/\/items\/(\d+)[^"']*/);
  if (!first) return { status: 'אין תוצאה' };

  const page = await fetchText(`https://${SOURCE}${first[0].startsWith('/') ? '' : '/'}${first[0]}`);
  const found = skuOf(page);
  /*
   * המקט של התוצאה חייב להיות זהה. עמוד חיפוש מחזיר גם מוצרים קרובים,
   * ואצל משווק כלי עבודה "קרוב" הוא דגם אחר באותה סדרה — כלומר מחיר אחר.
   */
  if (normSku(found) !== normSku(sku)) {
    return { status: 'מקט לא תואם', foundSku: found };
  }
  const prod = productFrom(page);
  if (!prod || prod.price == null || prod.price <= 0) return { status: 'בלי מחיר', foundSku: found };
  return { status: 'נמצא', price: prod.price, name: prod.name, foundSku: found };
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

async function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', FILE), 'utf8'))
    .filter((r) => r && r.sku && normSku(r.sku).length >= 4);
  console.log(`קטלוג: ${rows.length} מוצרים עם מקט תקין`);
  console.log(`מקור המחירים: ${SOURCE}`);

  const work = LIMIT ? rows.slice(0, LIMIT) : rows;
  if (LIMIT) console.log(`מדגם: ${work.length}`);

  let done = 0;
  const results = await mapLimit(work, CONCURRENCY, async (r) => {
    let res;
    try {
      res = await priceFor(r.sku);
    } catch (e) {
      res = { status: `שגיאה: ${e.message}`.slice(0, 40) };
    }
    done++;
    if (done % 10 === 0) process.stdout.write(`\r  נבדקו ${done}/${work.length}…`);
    return { sku: r.sku, ourName: r.name, ...res };
  });

  const by = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const found = results.filter((r) => r.status === 'נמצא');
  console.log('\n');
  console.log('='.repeat(60));
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
    console.log(`${String(v).padStart(5)}  ${k}`);
  }
  console.log('-'.repeat(60));
  console.log(`שיעור פגיעה : ${Math.round((found.length / work.length) * 100)}%`);
  if (found.length) {
    const ps = found.map((r) => r.price).sort((a, b) => a - b);
    console.log(`טווח מחירים : ₪${ps[0]} – ₪${ps[ps.length - 1]}  (חציון ₪${ps[Math.floor(ps.length / 2)]})`);
    console.log('\nדוגמאות:');
    for (const r of found.slice(0, 6)) {
      console.log(`  ${String(r.sku).padEnd(14)} ₪${String(r.price).padEnd(9)} ${String(r.ourName).slice(0, 40)}`);
    }
  }
  console.log('='.repeat(60));

  if (OUT) {
    const p = path.join(__dirname, '..', `${OUT}.json`);
    fs.writeFileSync(p, JSON.stringify(results, null, 2));
    console.log(`\nנשמר: ${path.basename(p)}`);
  }
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
