#!/usr/bin/env node
/**
 * מחיל רשימת מחירים מאומתת על מוצרים שיושבים על 0.
 *
 *   node scripts/apply-price-list.js zero-solved.json           # יובש
 *   node scripts/apply-price-list.js zero-solved.json --apply
 *
 * הקלט הוא מערך של {id, title, price} — כלומר מחיר שכבר הוכרע מחוץ
 * לסקריפט הזה, בין בהתאמת מקט ובין באימות ידני מול עמוד המוצר. הסקריפט
 * הזה אינו מחליט מה המחיר; הוא רק כותב אותו, ורק לווריאנטים שעל 0.
 *
 * למה זה נפרד: הכרעת מחיר דורשת ראיה לכל מוצר, וכתיבה דורשת רק זהירות.
 * לערבב את השניים באותו קוד פירושו שכל שיפור בהכרעה מסכן את הכתיבה.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const FILE = args[0];
const APPLY = args.includes('--apply');

if (!FILE) {
  console.error('שימוש: node scripts/apply-price-list.js <רשימה.json> [--apply]');
  process.exit(1);
}

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

const BY_ID = `
  query($id:ID!){
    product(id:$id){ id title variants(first:40){ nodes{ id title price } } }
  }`;

const SET = `
  mutation($pid:ID!,$vars:[ProductVariantsBulkInput!]!){
    productVariantsBulkUpdate(productId:$pid, variants:$vars){ userErrors{ field message } }
  }`;

async function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', FILE), 'utf8'))
    .filter((r) => r && r.id && Number(r.price) > 0);
  console.log(`רשימה: ${rows.length} מוצרים עם מחיר`);

  if (!APPLY) {
    console.log('\nיובש:');
    for (const r of rows.slice(0, 25)) {
      console.log(`  ₪0 → ₪${String(r.price).padEnd(9)} ${String(r.title).slice(0, 50)}${r.src ? '  [' + r.src + ']' : ''}`);
    }
    if (rows.length > 25) console.log(`  … ועוד ${rows.length - 25}`);
    console.log('\nלהרצה אמיתית: הוסיפו --apply');
    return;
  }

  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  let done = 0, skipped = 0;
  const failed = [];
  for (const [i, r] of rows.entries()) {
    try {
      /*
       * המחיר הנוכחי נקרא מחדש לפני הכתיבה, ולא נלקח מהקובץ.
       * רשימה עלולה להיות מיושנת, ומוצר שכבר תומחר בינתיים אינו אמור
       * להידרס במחיר שנאסף לפני כן.
       */
      const d = await admin(BY_ID, { id: r.id });
      const p = d.product;
      if (!p) { failed.push({ t: r.title, why: 'המוצר לא נמצא' }); continue; }
      const zeroVars = p.variants.nodes.filter((v) => Number(v.price) === 0);
      if (zeroVars.length === 0) { skipped++; continue; }

      const res = await admin(SET, {
        pid: p.id,
        vars: zeroVars.map((v) => ({ id: v.id, price: String(r.price) })),
      });
      const e = res.productVariantsBulkUpdate.userErrors;
      if (e?.length) failed.push({ t: r.title, why: e[0].message });
      else done++;
    } catch (e) {
      failed.push({ t: r.title, why: e.message.slice(0, 120) });
    }
    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      process.stdout.write(`\r  עודכנו ${done} | דולגו ${skipped} | נכשלו ${failed.length}  (${i + 1}/${rows.length})`);
    }
    await sleep(320);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`עודכנו          : ${done}`);
  console.log(`כבר לא היו ב-0  : ${skipped}`);
  console.log(`נכשלו           : ${failed.length}`);
  for (const f of failed.slice(0, 10)) console.log(`   ✗ ${String(f.t).slice(0, 34)} — ${f.why}`);
  console.log('='.repeat(60));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
