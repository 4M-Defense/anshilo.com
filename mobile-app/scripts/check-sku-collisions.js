#!/usr/bin/env node
/**
 * שלוש בדיקות שהדוח הכללי העלה ולא יכול היה לענות עליהן.
 *
 * 1. תיאורים: "בלי תיאור שימושי" מערבב ריק לגמרי עם קצר מדי, ואלה שתי בעיות
 *    שונות — ריק דורש מקור חדש, קצר דורש הרחבה. מפריד ביניהם.
 *
 * 2. תמונה ראשית: הדוח סופר רק מוצרים שיש להם featuredMedia שהוא MediaImage.
 *    מוצר עם מדיה שאינה תמונה, או בלי מדיה ראשית מוגדרת, נפל בין הכיסאות ולא
 *    נספר לא כאן ולא שם. סופר אותם במפורש.
 *
 * 3. התנגשות מקטים בין ספקים — הבדיקה החשובה כאן.
 *
 *    מקטי פתיה הם מספרים פשוטים (6952, 9403), ומספרי דגם של מקיטה נראים
 *    בדיוק אותו דבר. בחנות יש כבר מקט 6952 גם על מברגת אימפקט מקיטה ב-1499
 *    וגם על מפסק פתיה ב-15.50, וזאת אינה כפילות אלא שני מוצרים שונים לגמרי
 *    שנושאים אותו מזהה.
 *
 *    זה מסוכן מעבר לדוח: fill-gaps-from-catalogues.js משלים מחיר לפי מקט על כל
 *    הקטלוגים יחד. מוצר מקיטה במחיר 0 שמספר הדגם שלו מתנגש במקט פתיה היה מקבל
 *    את מחיר פתיה — קרי מברגה ב-15 שקל. הסקריפט נוגע רק בווריאנטים באפס, אז
 *    מוצר שכבר יש לו מחיר מוגן, אבל בדיוק המקרים שהוא בא לתקן הם החשופים.
 *
 *    לכן הבדיקה היא: לכל מוצר בחנות שהמחיר שלו זהה למחיר בקטלוג של ספק אחר
 *    מהספק שלו, על אותו מקט — זה חשוד, וצריך עין.
 *
 *   node scripts/check-sku-collisions.js
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

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

async function mintAdminToken() {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`הנפקת טוקן נכשלה (${res.status}): ${body.slice(0, 200)}`);
  return JSON.parse(body).access_token;
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
  if (res.status === 401 && attempt < 3) { ADMIN_TOKEN = await mintAdminToken(); return admin(query, variables, attempt + 1); }
  if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(1500 * 2 ** attempt); return admin(query, variables, attempt + 1); }
  if (!res.ok) throw new Error(`Admin API החזיר ${res.status}`);
  const json = await res.json();
  if (json.errors?.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 5) { await sleep(2000 * 2 ** attempt); return admin(query, variables, attempt + 1); }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]).slice(0, 250));
  return json.data;
}

const PAGE = `
  query P($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title status vendor descriptionHtml
        featuredMedia { __typename ... on MediaImage { image { width height } } }
        media(first: 1) { nodes { __typename } }
        variants(first: 50) { nodes { sku price } }
      }
    }
  }
`;

const textOf = (h) => (h || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const money = (x) => Number(x).toFixed(2);

(async () => {
  if (!ADMIN_TOKEN) ADMIN_TOKEN = await mintAdminToken();

  // הקטלוגים של הספקים, כדי לדעת איזה מקט שייך למי ובאיזה מחיר
  const catDir = path.join(__dirname, '..');
  const catFiles = fs.readdirSync(catDir).filter((f) => /catalogue.*\.json$/i.test(f));
  const skuToSuppliers = new Map(); // sku -> [{file, price, name}]
  for (const f of catFiles) {
    let items;
    try { items = JSON.parse(fs.readFileSync(path.join(catDir, f), 'utf8')); } catch { continue; }
    const list = Array.isArray(items) ? items : items.products || [];
    for (const it of list) {
      const sku = String(it.sku || it.SKU || '').trim();
      if (!sku) continue;
      if (!skuToSuppliers.has(sku)) skuToSuppliers.set(sku, []);
      skuToSuppliers.get(sku).push({ file: f, price: it.price != null ? money(it.price) : null, name: it.title || it.name || '' });
    }
  }
  console.log(`קטלוגי ספקים: ${catFiles.length} קבצים, ${skuToSuppliers.size} מקטים\n`);

  const stats = {
    descEmpty: 0, descShort: 0,
    featuredNotImage: 0, featuredNull: 0, noMediaAtAll: 0,
  };
  const suspects = [];
  const crossVendor = [];

  let cursor = null;
  do {
    const d = await admin(PAGE, { cursor });
    for (const p of d.products.nodes) {
      if (p.status !== 'ACTIVE') { cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; continue; }

      const t = textOf(p.descriptionHtml);
      if (!t) stats.descEmpty++;
      else if (t.length < 50 || t === p.title.trim()) stats.descShort++;

      if (!p.media.nodes.length) stats.noMediaAtAll++;
      else if (!p.featuredMedia) stats.featuredNull++;
      else if (p.featuredMedia.__typename !== 'MediaImage') stats.featuredNotImage++;

      for (const v of p.variants.nodes) {
        const sku = (v.sku || '').trim();
        if (!sku) continue;
        const sup = skuToSuppliers.get(sku);
        if (!sup || sup.length === 0) continue;

        // אותו מקט אצל יותר מספק אחד — מזהה מתנגש מעצם קיומו
        const files = [...new Set(sup.map((s) => s.file))];
        if (files.length > 1) {
          suspects.push({ sku, title: p.title, vendor: p.vendor, price: money(v.price), files, names: sup.map((s) => s.name.slice(0, 45)) });
        }

        // המחיר בחנות זהה בדיוק למחיר של ספק שאינו הספק של המוצר, ולשמות אין
        // שום מילה משותפת. זו החתימה של מחיר שנשאב מהמקור הלא נכון.
        for (const s of sup) {
          if (s.price == null || s.price !== money(v.price)) continue;
          const supWords = new Set(s.name.split(/\s+/).filter((w) => w.length > 2));
          const shared = p.title.split(/\s+/).filter((w) => w.length > 2 && supWords.has(w));
          if (supWords.size >= 2 && shared.length === 0) {
            crossVendor.push({ sku, storeTitle: p.title.slice(0, 60), vendor: p.vendor, price: money(v.price), supFile: s.file, supName: s.name.slice(0, 60) });
          }
        }
      }
    }
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cursor);

  console.log('--- תיאורים על מפורסמים, מופרד ---');
  console.log(`  ריק לגמרי:            ${stats.descEmpty}`);
  console.log(`  קצר מ-50 תווים או כותרת מועתקת: ${stats.descShort}`);
  console.log();
  console.log('--- מדיה ראשית ---');
  console.log(`  בלי מדיה בכלל:                  ${stats.noMediaAtAll}`);
  console.log(`  יש מדיה אבל אין featuredMedia:  ${stats.featuredNull}`);
  console.log(`  featuredMedia שאינו תמונה:      ${stats.featuredNotImage}`);
  console.log();

  console.log(`--- מקטים שמופיעים ביותר מקטלוג ספק אחד: ${suspects.length} ---`);
  for (const s of suspects.slice(0, 15)) {
    console.log(`  ${s.sku}  "${s.title.slice(0, 50)}" (${s.vendor}) ${s.price}₪`);
    console.log(`      בקטלוגים: ${s.files.join(', ')}`);
    console.log(`      שמות אצל הספקים: ${s.names.join(' | ')}`);
  }
  console.log();

  console.log(`--- מחיר בחנות שזהה למחיר ספק ששמו אינו קשור למוצר: ${crossVendor.length} ---`);
  if (!crossVendor.length) console.log('  אין. אף מחיר לא נראה כאילו נשאב מהמקור הלא נכון.');
  for (const c of crossVendor.slice(0, 20)) {
    console.log(`  ${c.sku}  ${c.price}₪`);
    console.log(`      בחנות:  "${c.storeTitle}" (${c.vendor})`);
    console.log(`      בקטלוג: "${c.supName}"  [${c.supFile}]`);
  }
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
