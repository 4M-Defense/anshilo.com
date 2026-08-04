#!/usr/bin/env node
/**
 * ממלא את שדה product type מקטגוריית הטקסונומיה שכבר מוגדרת.
 *
 *   node scripts/fill-product-type.js              # יובש
 *   node scripts/fill-product-type.js --apply
 *
 * למה: השדה ריק ב-1,786 מוצרים מפורסמים. גוגל משתמשת בו כסיווג של הסוחר,
 * בנפרד מהטקסונומיה שלה, והוא מסייע בארגון ובהצעות מחיר.
 *
 * למה דווקא מהטקסונומיה: היא **כבר מוגדרת בכל 1,791 המוצרים** — זו עבודה
 * שנעשתה בסבב הזה, כולל תיקון 36 סיווגים שגרמו לגוגל לחסום מוצרים. גזירה
 * ממנה היא לכן אפס ניחוש: הערך תמיד נכון בדיוק כמו הקטגוריה שממנה בא.
 *
 * הערך הוא המסלול המלא ולא רק העלה, כי גוגל מצפה להיררכיה ב-product_type
 * ומסלול נותן לה גם את ההקשר. הוא נשאר באנגלית: הטקסונומיה של שופיפיי
 * אנגלית, תרגום שלה היה המצאה שלי, וגוגל מקבלת product_type בכל שפה.
 *
 * מוצר בלי קטגוריה אינו מקבל product_type. אין מאיפה.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

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

const FETCH = `
  query($a:String){
    products(first:250, after:$a, query:"status:active"){
      pageInfo{ hasNextPage endCursor }
      nodes{ id title productType category{ fullName } }
    }
  }`;

async function main() {
  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  const all = [];
  let a = null;
  for (;;) {
    const d = await admin(FETCH, { a });
    all.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    a = d.products.pageInfo.endCursor;
  }

  const plan = all.filter((p) => !p.productType && p.category?.fullName);
  const noCat = all.filter((p) => !p.productType && !p.category?.fullName);

  console.log(`מפורסמים          : ${all.length}`);
  console.log(`בלי product type  : ${all.filter((p) => !p.productType).length}`);
  console.log(`ניתן למלא מקטגוריה: ${plan.length}`);
  console.log(`בלי קטגוריה       : ${noCat.length}  ← אין מאיפה`);

  const dist = {};
  for (const p of plan) dist[p.category.fullName] = (dist[p.category.fullName] || 0) + 1;
  console.log('\nהערכים הנפוצים:');
  for (const [k, n] of Object.entries(dist).sort((x, y) => y[1] - x[1]).slice(0, 10)) {
    console.log(`  ${String(n).padStart(4)}  ${k}`);
  }

  if (!APPLY) { console.log('\nיובש. להרצה אמיתית: הוסיפו --apply'); return; }

  let done = 0;
  const failed = [];
  for (const [i, p] of plan.entries()) {
    try {
      const d = await admin(
        `mutation($input:ProductUpdateInput!){productUpdate(product:$input){userErrors{field message}}}`,
        { input: { id: p.id, productType: p.category.fullName } }
      );
      const e = d.productUpdate.userErrors;
      if (e?.length) failed.push({ t: p.title, why: e[0].message });
      else done++;
    } catch (e) {
      failed.push({ t: p.title, why: e.message.slice(0, 110) });
    }
    if ((i + 1) % 25 === 0 || i === plan.length - 1) {
      process.stdout.write(`\r  עודכנו ${done} | נכשלו ${failed.length}  (${i + 1}/${plan.length})`);
    }
    await sleep(280);
  }

  console.log('\n\n' + '='.repeat(58));
  console.log(`עודכנו : ${done}`);
  console.log(`נכשלו  : ${failed.length}`);
  for (const f of failed.slice(0, 8)) console.log(`   ✗ ${f.t.slice(0, 34)} — ${f.why}`);
  console.log('='.repeat(58));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
