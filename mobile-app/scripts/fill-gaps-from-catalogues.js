#!/usr/bin/env node
/**
 * משלים מחיר ותמונה למוצרים שחסרים להם, מתוך קטלוגי הספקים שנשלפו.
 *
 *   node scripts/fill-gaps-from-catalogues.js                 # יובש
 *   node scripts/fill-gaps-from-catalogues.js --apply
 *   node scripts/fill-gaps-from-catalogues.js --only price    # מחיר בלבד
 *
 * למה זה קיים: גוגל דוחה מוצר בלי מחיר ("Invalid price") ובלי תמונה
 * ("Missing product image"), והוא פשוט אינו מוצג ללקוחות. בחנות היו 125
 * מוצרים ב-0 ו-40 בלי תמונה, ורובם המכריע מיצרנים שהקטלוג המלא שלהם כבר
 * נשלף — כלומר המידע קיים, הוא רק לא הגיע לחנות.
 *
 * ההצלבה היא לפי מקט בלבד. זו אינה החמרה מיותרת: נמדד שהתאמה לפי שם
 * בקטלוג הזה נותנת DARYA 36W מול DARYA 28W בציון דמיון 0.89, ומחיר שגוי
 * גרוע ממחיר חסר — מוצר בלי מחיר נראה כמו מוצר שצריך לברר עליו, ומוצר עם
 * מחיר של דגם אחר נמכר במחיר הלא נכון.
 *
 * כשיותר ממקור אחד מחזיק מחיר לאותו מקט, נלקח **הגבוה מביניהם**. המחיר
 * שמופיע אצל משווק הוא מחיר לצרכן, ומחיר אצל יבואן או בקטלוג ישן עלול
 * להיות נמוך ממנו; לתמחר נמוך מדי זו מכירה בהפסד.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null; /* 'price' | 'image' */
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;

/*
 * מקורות, לפי סדר שאינו משנה — כולם נסרקים וכולם נספרים, והמחיר הנבחר הוא
 * הגבוה. קובץ חסר מדולג בהודעה ולא מפיל את הריצה: הקטלוגים נשלפים בזמנים
 * שונים, ואין סיבה שהיעדר אחד ימנע את השלמת השאר.
 */
const SOURCES = [
  'fetaya-catalogue.json',
  'jacobi-catalogue.json',
  'blundstone-catalogue.json',
  'argentools-catalogue.json',
  'nisko-catalogue.json',
  'argentools-prices.json',
];

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

const FETCH = `
  query($a:String){
    products(first:250, after:$a){
      pageInfo{ hasNextPage endCursor }
      nodes{
        id title vendor status
        featuredImage{ url }
        media(first:1){ nodes{ id } }
        variants(first:30){ nodes{ id sku price } }
      }
    }
  }`;

const SET_PRICE = `
  mutation($pid:ID!,$vars:[ProductVariantsBulkInput!]!){
    productVariantsBulkUpdate(productId:$pid, variants:$vars){
      userErrors{ field message }
    }
  }`;

const ADD_MEDIA = `
  mutation($pid:ID!,$media:[CreateMediaInput!]!){
    productCreateMedia(productId:$pid, media:$media){
      media{ ... on MediaImage { id } }
      mediaUserErrors{ field message }
    }
  }`;

/** אינדקס מקט → {price, images, name, source} מכל הקטלוגים */
function buildIndex() {
  const idx = new Map();
  const dir = path.join(__dirname, '..');
  for (const file of SOURCES) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) { console.log(`  (מדלג, אין קובץ: ${file})`); continue; }
    let rows;
    try { rows = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { console.log(`  (מדלג, JSON פגום: ${file})`); continue; }
    let n = 0;
    for (const r of rows) {
      if (!r) continue;
      const sku = normSku(r.sku);
      if (!sku) continue;
      const price = Number(r.price);
      const images = r.images?.length ? r.images : r.image ? [r.image] : [];
      const cur = idx.get(sku) ?? { price: null, images: [], name: null, sources: [] };
      /* המחיר הגבוה מבין המקורות — ראו ההערה בראש הקובץ */
      if (Number.isFinite(price) && price > 0 && (cur.price == null || price > cur.price)) {
        cur.price = price;
        cur.priceSource = file;
      }
      if (images.length && cur.images.length === 0) { cur.images = images; cur.imageSource = file; }
      if (!cur.name && r.name) cur.name = r.name;
      if (!cur.sources.includes(file)) cur.sources.push(file);
      idx.set(sku, cur);
      n++;
    }
    console.log(`  ${file}: ${n} שורות עם מקט`);
  }
  return idx;
}

async function main() {
  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  console.log('בונה אינדקס מקטים מהקטלוגים:');
  const idx = buildIndex();
  console.log(`  סה"כ ${idx.size} מקטים ייחודיים\n`);

  const all = [];
  let a = null;
  for (;;) {
    const d = await admin(FETCH, { a });
    all.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    a = d.products.pageInfo.endCursor;
  }
  console.log(`בחנות: ${all.length} מוצרים`);

  const needImage = all.filter((p) => !p.featuredImage && p.media.nodes.length === 0);
  const needPrice = all.filter((p) => p.variants.nodes.some((v) => Number(v.price) === 0));
  console.log(`  בלי תמונה : ${needImage.length}`);
  console.log(`  עם וריאנט ב-0 : ${needPrice.length}`);

  const plan = [];
  const missImage = [];
  const missPrice = [];

  if (ONLY !== 'image') {
    for (const p of needPrice) {
      const zeroVars = p.variants.nodes.filter((v) => Number(v.price) === 0);
      /* מקט של וריאנט אפס — ואם אין, של המוצר בכללותו */
      const sku = zeroVars.map((v) => normSku(v.sku)).find(Boolean)
        ?? p.variants.nodes.map((v) => normSku(v.sku)).find(Boolean);
      const hit = sku ? idx.get(sku) : null;
      if (hit?.price) {
        plan.push({ p, price: hit.price, priceSource: hit.priceSource, vars: zeroVars });
      } else {
        missPrice.push({ title: p.title, sku: sku ?? '(אין מקט)' });
      }
    }
  }

  if (ONLY !== 'price') {
    for (const p of needImage) {
      const sku = p.variants.nodes.map((v) => normSku(v.sku)).find(Boolean);
      const hit = sku ? idx.get(sku) : null;
      if (hit?.images?.length) {
        const existing = plan.find((x) => x.p.id === p.id);
        if (existing) { existing.images = hit.images.slice(0, 5); existing.imageSource = hit.imageSource; }
        else plan.push({ p, images: hit.images.slice(0, 5), imageSource: hit.imageSource });
      } else {
        missImage.push({ title: p.title, vendor: p.vendor, sku: sku ?? '(אין מקט)' });
      }
    }
  }

  const withPrice = plan.filter((x) => x.price);
  const withImage = plan.filter((x) => x.images);
  console.log('\n' + '='.repeat(64));
  console.log(`מחיר יושלם   : ${withPrice.length}   (לא נמצא מקור ל-${missPrice.length})`);
  console.log(`תמונה תושלם  : ${withImage.length}   (לא נמצא מקור ל-${missImage.length})`);
  console.log('='.repeat(64));

  if (withPrice.length) {
    console.log('\nדוגמאות מחיר:');
    for (const x of withPrice.slice(0, 8)) {
      console.log(`  ₪0 → ₪${String(x.price).padEnd(9)} ${x.p.title.slice(0, 42)}  [${x.priceSource.replace('-catalogue.json', '')}]`);
    }
  }
  if (missPrice.length) {
    console.log('\nבלי מקור למחיר:');
    for (const m of missPrice.slice(0, 10)) console.log(`  ${String(m.sku).padEnd(14)} ${m.title.slice(0, 48)}`);
    if (missPrice.length > 10) console.log(`  … ועוד ${missPrice.length - 10}`);
  }
  if (missImage.length) {
    console.log('\nבלי מקור לתמונה:');
    for (const m of missImage.slice(0, 10)) console.log(`  [${m.vendor?.slice(0, 10)}] ${String(m.sku).padEnd(12)} ${m.title.slice(0, 42)}`);
    if (missImage.length > 10) console.log(`  … ועוד ${missImage.length - 10}`);
  }

  if (!APPLY) { console.log('\nלהרצה אמיתית: הוסיפו --apply'); return; }

  let pDone = 0, iDone = 0;
  const failed = [];
  const work = LIMIT ? plan.slice(0, LIMIT) : plan;
  for (const [i, x] of work.entries()) {
    if (x.price) {
      try {
        const d = await admin(SET_PRICE, {
          pid: x.p.id,
          vars: x.vars.map((v) => ({ id: v.id, price: String(x.price) })),
        });
        const e = d.productVariantsBulkUpdate.userErrors;
        if (e?.length) failed.push({ t: x.p.title, why: 'מחיר: ' + e[0].message });
        else pDone++;
      } catch (e) { failed.push({ t: x.p.title, why: 'מחיר: ' + e.message.slice(0, 90) }); }
    }
    if (x.images) {
      try {
        const d = await admin(ADD_MEDIA, {
          pid: x.p.id,
          media: x.images.map((src) => ({ originalSource: src, mediaContentType: 'IMAGE' })),
        });
        const e = d.productCreateMedia.mediaUserErrors;
        if (e?.length) failed.push({ t: x.p.title, why: 'תמונה: ' + e[0].message });
        else iDone++;
      } catch (e) { failed.push({ t: x.p.title, why: 'תמונה: ' + e.message.slice(0, 90) }); }
    }
    if ((i + 1) % 5 === 0 || i === work.length - 1) {
      process.stdout.write(`\r  מחירים ${pDone} | תמונות ${iDone} | כשלונות ${failed.length}  (${i + 1}/${work.length})`);
    }
    await sleep(350);
  }

  console.log('\n\n' + '='.repeat(64));
  console.log(`מחירים הושלמו : ${pDone}`);
  console.log(`תמונות הושלמו : ${iDone}`);
  console.log(`נכשלו         : ${failed.length}`);
  for (const f of failed.slice(0, 10)) console.log(`   ✗ ${f.t.slice(0, 34)} — ${f.why}`);
  console.log('='.repeat(64));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
