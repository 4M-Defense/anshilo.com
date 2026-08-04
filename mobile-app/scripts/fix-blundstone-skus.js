#!/usr/bin/env node
/**
 * מפריד את המקטים המתנגשים בין שתי נעלי בלנדסטון, לפי מה שהיבואן מפרסם.
 *
 * הבעיה, כפי שנמדדה: שני מוצרים מפורסמים חולקים עשרה מקטים, וגוגל רואה עשר
 * כפילויות. זה לא העתקה בטעות אלא מונה רץ שהוקצה פעמיים —
 *
 *   נעל 1320 הורס קרייזי   4112279 → 4112295   מידות 36 עד 47
 *   נעל גברים 910 שחור     4112286 → 4112298   מידות 39 עד 47
 *
 * הטווחים חופפים, ולכן מקט 4112286 יושב על מידה 41 באחת ועל מידה 39 בשנייה.
 *
 * למה נוגעים רק ב-910: החפיפה היא 4112286–4112295, כלומר מידות 39 עד 45 של
 * ה-910 בלבד. מידות 46, 46.5 ו-47 שלה נושאות 4112296–4112298 ומעולם לא
 * התנגשו, אז אין סיבה לגעת בהן. וב-1320 לא נוגעים בכלל: די לשנות צד אחד כדי
 * שהכפילות תיעלם, וב-1320 גם אין דרך להכריע — הקטלוג מפריד בין דגם נשים לדגם
 * גברים, והכותרת בחנות אינה אומרת מי מהם.
 *
 * למה מקטי הספק ולא מספרים חדשים: BLM910-0B1-070 מקודד דגם, צבע ומידה (המספר
 * הוא מידת UK כפול עשר, השיטה של בלנדסטון עצמה), כלומר הוא גם ייחודי וגם
 * יאפשר התאמה לספק בעתיד. מספר סתמי חדש היה פותר את הכפילות ומשאיר את
 * ההתאמה שבורה.
 *
 * המצב הקודם נשמר ל-blundstone-sku-rollback.json לפני כל כתיבה.
 *
 *   node scripts/fix-blundstone-skus.js            בדיקה בלבד
 *   node scripts/fix-blundstone-skus.js --apply
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';
const APPLY = process.argv.includes('--apply');

/** המוצר בחנות שאותו מתקנים — מזוהה בכותרת, לא במזהה, כדי שזה יהיה קריא. */
const TARGET_TITLE = 'נעל בלנסטון גברים דגם 910 שחור BLUNDSTONE יבואן רשמי';
/** ובקטלוג — הדגם המקביל, גברים 910 שחור. */
const CATALOGUE_NAME = /גברים 910 בצבע שחור/;

/** רק המידות שבאמת התנגשו. השאר נשארות כמו שהן. */
const COLLIDING_SIZES = ['39', '40', '41', '41.5', '42', '42.5', '43', '43.5', '44', '45'];

const ROLLBACK = path.join(__dirname, '..', 'blundstone-sku-rollback.json');

function readEnvValue(key) {
  const p = path.join(__dirname, '..', '.env');
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.split('=').slice(1).join('=').trim() : null;
}

const CLIENT_ID = readEnvValue('SHOPIFY_CLIENT_ID');
const CLIENT_SECRET = readEnvValue('SHOPIFY_CLIENT_SECRET');
let ADMIN_TOKEN = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mintAdminToken() {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`הנפקת טוקן נכשלה (${res.status})`);
  return (await res.json()).access_token;
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
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]).slice(0, 250));
  return json.data;
}

const FIND = `
  query F($q: String!) {
    products(first: 10, query: $q) {
      nodes { id title status variants(first: 40) { nodes { id title sku } } }
    }
  }
`;

const UPDATE = `
  mutation U($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku }
      userErrors { field message }
    }
  }
`;

(async () => {
  ADMIN_TOKEN = await mintAdminToken();

  // מקטי הספק, לפי מידה
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'blundstone-catalogue.json'), 'utf8'));
  const arr = Array.isArray(cat) ? cat : cat.products || [];
  const model = arr.find((p) => CATALOGUE_NAME.test(p.name || ''));
  if (!model) throw new Error('לא מצאתי בקטלוג את דגם גברים 910 שחור');

  const supplierBySize = new Map();
  for (const v of model.variants || []) {
    const size = String(v.title || '').split('/').pop().trim();
    if (size && v.sku) supplierBySize.set(size, v.sku);
  }
  console.log(`הספק: ${supplierBySize.size} מידות לדגם "${model.name.trim()}"\n`);

  const data = await admin(FIND, { q: `title:"${TARGET_TITLE}"` });
  const product = data.products.nodes.find((p) => p.title.trim() === TARGET_TITLE);
  if (!product) throw new Error(`לא מצאתי בחנות את "${TARGET_TITLE}"`);
  console.log(`בחנות: ${product.title}  [${product.status}]  ${product.variants.nodes.length} מידות\n`);

  const plan = [];
  const skipped = [];
  for (const v of product.variants.nodes) {
    const size = String(v.title || '').trim();
    if (!COLLIDING_SIZES.includes(size)) { skipped.push(`${size} (לא התנגשה)`); continue; }
    const newSku = supplierBySize.get(size);
    if (!newSku) { skipped.push(`${size} (אין מקט אצל הספק)`); continue; }
    if ((v.sku || '').trim() === newSku) { skipped.push(`${size} (כבר מתוקן)`); continue; }
    plan.push({ id: v.id, size, from: (v.sku || '').trim(), to: newSku });
  }

  console.log('מה ישתנה:');
  for (const p of plan) console.log(`   מידה ${p.size.padEnd(5)} ${p.from}  →  ${p.to}`);
  console.log(`\nלא נוגעים ב-${skipped.length}: ${skipped.join(', ')}\n`);

  if (plan.length !== COLLIDING_SIZES.length) {
    console.log(`⚠ ${plan.length} שינויים במקום ${COLLIDING_SIZES.length} מידות מתנגשות — בדוק את הפער לפני שמריצים עם --apply.`);
  }

  if (!APPLY) { console.log('(בדיקה בלבד — הרץ עם --apply כדי לכתוב)'); return; }
  if (!plan.length) { console.log('אין מה לשנות.'); return; }

  fs.writeFileSync(ROLLBACK, JSON.stringify({ productId: product.id, title: product.title, changes: plan }, null, 2));
  console.log(`המצב הקודם נשמר ל-${path.basename(ROLLBACK)}`);

  const res = await admin(UPDATE, {
    productId: product.id,
    variants: plan.map((p) => ({ id: p.id, inventoryItem: { sku: p.to } })),
  });
  const errs = res.productVariantsBulkUpdate.userErrors;
  if (errs.length) { console.log('✗ ' + errs.map((e) => `${e.field}: ${e.message}`).join('; ')); process.exit(1); }
  console.log(`✓ ${res.productVariantsBulkUpdate.productVariants.length} מידות עודכנו`);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
