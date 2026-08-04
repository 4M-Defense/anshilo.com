#!/usr/bin/env node
/**
 * משלים תיאור למוצרים שאין להם, מעמוד המוצר אצל הספק.
 *
 *   node scripts/fill-descriptions.js              # יובש
 *   node scripts/fill-descriptions.js --apply
 *   node scripts/fill-descriptions.js --limit 20 --apply
 *
 * למה דווקא אלה: Merchant Center מתריע "Update descriptions", ומדידה מראה
 * שהמספר האמיתי קטן ממה שנראה. מ-418 מוצרים מפורסמים עם תיאור מתחת ל-80
 * תווים, **222 הם תיאורי מפרט אמיתיים** שפשוט קצרים — "מתח עבודה 2X18V
 * כושר חיתוך 650 מ״מ מהירות 2000-3600 תל״ד" — ואין מה לתקן בהם. הבעיה היא
 * 48 ריקים ועוד 148 שבהם התיאור הוא **הכותרת המועתקת מילה במילה**, וזה
 * גרוע מריק: גוגל מתייחסת לתיאור שזהה לשם כאל היעדר תיאור.
 *
 * הכתובת אצל הספק נלקחת מהקטלוגים שכבר נשלפו, לפי מקט, ואז נשלף עמוד אחד
 * לכל מוצר. זה במקום לזחול קטלוג שלם מחדש — וזה גם מה שמתאפשר עכשיו,
 * אחרי שפתיה התחילה לחסום זחילות מלאות.
 *
 * מה שלא נכתב כאן: תיאור מומצא. אם אין תיאור אצל הספק, המוצר מדווח
 * ונשאר. תיאור שנבנה מהכותרת הוא בדיוק אותה כפילות שהסקריפט בא לתקן.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;

const SOURCES = ['fetaya', 'chen', 'netanel', 'argentools', 'nisko', 'aspaka', 'nisani'];

/** תיאור קצר מזה אינו תיאור, והוא גם הסף שמעליו לא נוגעים */
const MIN_USEFUL = 50;

function readEnvValue(key) {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return null;
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.split('=').slice(1).join('=').trim() : null;
}

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || readEnvValue('SHOPIFY_CLIENT_ID');
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || readEnvValue('SHOPIFY_CLIENT_SECRET');
let ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || readEnvValue('SHOPIFY_ADMIN_TOKEN');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normSku = (s) => {
  const v = String(s ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  return v.length >= 3 ? v : null;
};
const plain = (s) =>
  String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

async function mintAdminToken() {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`הנפקת טוקן נכשלה (${res.status}): ${body.slice(0, 200)}`);
  const json = JSON.parse(body);
  if (!json.access_token) throw new Error('הנפקת טוקן לא החזירה access_token');
  return json.access_token;
}

async function admin(query, variables, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ADMIN_TOKEN },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    if (attempt < 5) { await sleep(2000 * 2 ** attempt); return admin(query, variables, attempt + 1); }
    throw new Error(`רשת: ${e.message}`);
  }
  if (res.status === 401 && attempt < 3 && CLIENT_ID && CLIENT_SECRET) {
    ADMIN_TOKEN = await mintAdminToken();
    return admin(query, variables, attempt + 1);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await sleep(1500 * 2 ** attempt);
    return admin(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`Admin API החזיר ${res.status}`);
  const json = await res.json();
  if (json.errors?.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 5) {
    await sleep(2000 * 2 ** attempt);
    return admin(query, variables, attempt + 1);
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]).slice(0, 250));
  return json.data;
}

/** עמוד ספק. חסימה מוחזרת כשגיאה ולא כתיאור ריק. */
async function fetchPage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1200 * 2 ** attempt);
    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
          'Accept-Language': 'he-IL,he;q=0.9',
        },
      });
    } catch (e) { continue; }
    if (res.status === 202 || res.status === 429 || res.status >= 500) continue;
    if (!res.ok) return null;
    const body = await res.text();
    /*
     * אותה חסימת פלטפורמה שמתועדת בשולף: 200 עם גוף של ~1,622 בתים ובלי
     * JSON-LD. מוחזרת כחסימה ולא כ"אין תיאור", אחרת 196 מוצרים מדווחים
     * כחסרי תיאור אצל הספק כשבפועל לא הצלחנו לשאול.
     */
    if (body.length > 1400 && body.length < 1900 && !body.includes('application/ld+json')) {
      return { blocked: true };
    }
    return body;
  }
  return null;
}

/**
 * התיאור מהעמוד: קודם JSON-LD, ואחריו meta description.
 *
 * שני המקורות נחתכים מסיומת "| שם האתר", כי היא שם החנות של הספק ואין לה
 * מקום בעמוד מוצר אצלנו.
 */
function descriptionFrom(html) {
  if (!html) return null;
  /* חסימה אינה היעדר תיאור — מוחזרת כדגל נפרד ונספרת בנפרד */
  if (html.blocked) return { blocked: true };
  const block = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
  if (block) {
    try {
      const data = JSON.parse(block[1].trim());
      const nodes = Array.isArray(data) ? data : [data];
      const p = nodes.find((n) => n['@type'] === 'Product');
      const d = plain(p?.description);
      if (d.length >= MIN_USEFUL) return d;
    } catch { /* ממשיכים ל-meta */ }
  }
  const meta = html.match(/<meta\s+name="description"\s+content="([^"]{20,900})"/i);
  if (meta) {
    const d = plain(meta[1]).replace(/\s*\|\s*[^|]{1,40}\s*$/, '').trim();
    if (d.length >= MIN_USEFUL) return d;
  }
  return null;
}

const FETCH = `
  query($a:String){
    products(first:250, after:$a, query:"status:active"){
      pageInfo{ hasNextPage endCursor }
      nodes{
        id title vendor descriptionHtml
        variants(first:20){ nodes{ sku } }
      }
    }
  }`;

const UPDATE = `
  mutation($input:ProductUpdateInput!){
    productUpdate(product:$input){ userErrors{ field message } }
  }`;

async function main() {
  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  /* כתובת לפי מקט, מכל הקטלוגים שנשלפו */
  const byUrl = new Map();
  for (const f of SOURCES) {
    const p = path.join(__dirname, '..', `${f}-catalogue.json`);
    if (!fs.existsSync(p)) continue;
    let rows;
    try { rows = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    let n = 0;
    for (const r of rows) {
      const k = normSku(r?.sku);
      if (!k || !r.url) continue;
      if (!byUrl.has(k)) { byUrl.set(k, { url: r.url, src: f }); n++; }
      /* תיאור שכבר נשלף בקטלוג — חוסך בקשה */
      if (r.description && plain(r.description).length >= MIN_USEFUL) {
        byUrl.get(k).description = plain(r.description);
      }
    }
    console.log(`  ${f}: ${n} מקטים עם כתובת`);
  }
  console.log(`  סה"כ ${byUrl.size} מקטים\n`);

  const all = [];
  let a = null;
  for (;;) {
    const d = await admin(FETCH, { a });
    all.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    a = d.products.pageInfo.endCursor;
  }

  /*
   * היעד: ריק, או תיאור שזהה לכותרת. תיאור קצר אבל שונה מהכותרת הוא מפרט
   * אמיתי — 222 כאלה בחנות — ולא נוגעים בו.
   */
  const norm = (s) => plain(s).replace(/[^֐-׿a-zA-Z0-9]/g, '').toLowerCase();
  const targets = all.filter((p) => {
    const d = plain(p.descriptionHtml);
    if (d.length === 0) return true;
    if (d.length >= MIN_USEFUL) return false;
    return norm(d) === norm(p.title) || norm(p.title).includes(norm(d));
  });

  console.log(`מפורסמים            : ${all.length}`);
  console.log(`ריק או כותרת מועתקת : ${targets.length}`);

  const plan = [];
  const noSource = [];
  for (const p of targets) {
    const sk = p.variants.nodes.map((v) => normSku(v.sku)).find(Boolean);
    const hit = sk ? byUrl.get(sk) : null;
    if (hit) plan.push({ p, sku: sk, ...hit });
    else noSource.push({ title: p.title, sku: sk ?? '(אין מקט)' });
  }
  console.log(`יש כתובת ספק        : ${plan.length}`);
  console.log(`אין מקור            : ${noSource.length}`);

  const work = LIMIT ? plan.slice(0, LIMIT) : plan;
  if (work.length === 0) {
    if (noSource.length) {
      console.log('\nבלי מקור:');
      for (const m of noSource.slice(0, 12)) console.log(`  ${String(m.sku).padEnd(12)} ${m.title.slice(0, 50)}`);
      if (noSource.length > 12) console.log(`  … ועוד ${noSource.length - 12}`);
    }
    return;
  }

  console.log(`\nשולף ${work.length} עמודי ספק…`);
  let got = 0, empty = 0, done = 0, blocked = 0;
  const failed = [];
  for (const [i, x] of work.entries()) {
    let desc = x.description ?? null;
    if (!desc) {
      const html = await fetchPage(x.url);
      const got2 = descriptionFrom(html);
      if (got2 && got2.blocked) { blocked++; await sleep(1500); continue; }
      desc = got2;
      await sleep(500);
    }
    if (!desc) { empty++; continue; }
    got++;

    if (!APPLY) {
      if (got <= 6) {
        console.log(`\n  ${x.p.title.slice(0, 54)}  [${x.src}]`);
        console.log(`     ${desc.slice(0, 150)}`);
      }
      continue;
    }
    try {
      const d = await admin(UPDATE, {
        input: { id: x.p.id, descriptionHtml: `<p>${desc}</p>` },
      });
      const e = d.productUpdate.userErrors;
      if (e?.length) failed.push({ t: x.p.title, why: e[0].message });
      else done++;
    } catch (e) {
      failed.push({ t: x.p.title, why: e.message.slice(0, 110) });
    }
    if ((i + 1) % 10 === 0 || i === work.length - 1) {
      process.stdout.write(`\r  נשלפו ${got} | בלי תיאור ${empty} | נכתבו ${done} | נכשלו ${failed.length}  (${i + 1}/${work.length})`);
    }
  }

  console.log('\n\n' + '='.repeat(62));
  console.log(`נמצא תיאור אצל הספק : ${got}`);
  console.log(`אין תיאור בעמוד     : ${empty}`);
  if (blocked) console.log(`נחסמו על ידי הספק   : ${blocked}  ← המתינו ונסו שוב`);
  if (APPLY) {
    console.log(`נכתבו לחנות         : ${done}`);
    console.log(`נכשלו               : ${failed.length}`);
    for (const f of failed.slice(0, 8)) console.log(`   ✗ ${f.t.slice(0, 34)} — ${f.why}`);
  } else {
    console.log('\nיובש. להרצה אמיתית: הוסיפו --apply');
  }
  console.log('='.repeat(62));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
