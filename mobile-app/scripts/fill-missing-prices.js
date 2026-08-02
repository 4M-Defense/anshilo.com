#!/usr/bin/env node
/**
 * משלים מחיר למוצרים שכבר קיימים בחנות ויושבים על 0, מתוך קטלוג הספק.
 *
 *   node scripts/fill-missing-prices.js fetaya-catalogue-match.json          # יובש
 *   node scripts/fill-missing-prices.js fetaya-catalogue-match.json --apply
 *
 * הקלט הוא קובץ ההתאמה, ונלקחות ממנו **רק** השורות מקבוצת `exact` שסומנו
 * `needsPrice` — כלומר המוצר קיים בחנות, המחיר שלו 0, ולספק יש מחיר.
 *
 * מה שהסקריפט הזה לא עושה, ובכוונה:
 *
 * אינו נוגע במוצר שכבר יש לו מחיר. בהתאמה של פתיה יש 81 מוצרים שהמחיר
 * בחנות שונה מהמחיר אצל הספק, ולדרוס אותם פירושו למחוק החלטות תמחור
 * אמיתיות של החנות בגלל מחירון של ספק. הפרש מחיר הוא מידע, לא תקלה.
 *
 * ואינו נוגע בקבוצת `review`. שם ההתאמה היא דמיון ולא זהות, ומחיר שגוי
 * גרוע ממחיר חסר: מוצר בלי מחיר נראה כמו מוצר שצריך לברר עליו, ומוצר עם
 * מחיר של דגם אחר נמכר במחיר הלא נכון.
 *
 * שינוי המחיר הוא בכל הווריאנטים של המוצר שיושבים על 0, ולא בראשון בלבד.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const FILE = args[0];
const APPLY = args.includes('--apply');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;

if (!FILE) {
  console.error('שימוש: node scripts/fill-missing-prices.js <match.json> [--limit N] [--apply]');
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
  /* הטוקן מבוטל כשמנפיקים אחד חדש במקום אחר — מנפיקים מחדש וממשיכים */
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

const BY_HANDLE = `
  query($h:String!){
    productByIdentifier(identifier:{handle:$h}){
      id title status
      variants(first:50){ nodes { id title price } }
    }
  }`;

const UPDATE = `
  mutation($pid:ID!,$vars:[ProductVariantsBulkInput!]!){
    productVariantsBulkUpdate(productId:$pid, variants:$vars){
      productVariants { id price }
      userErrors { field message }
    }
  }`;

async function main() {
  const match = JSON.parse(fs.readFileSync(path.join(__dirname, '..', FILE), 'utf8'));
  const exact = match.exact ?? [];
  let targets = exact.filter((e) => e.needsPrice && e.supplierPrice > 0 && e.handle);
  const differing = exact.filter(
    (e) => e.storePrice > 0 && e.supplierPrice > 0 && Math.abs(e.storePrice - e.supplierPrice) > 0.01
  );

  console.log(`קובץ ההתאמה: ${FILE}`);
  console.log(`  התאמות מדויקות        : ${exact.length}`);
  console.log(`  מהן ב-0 עם מחיר אצל ספק: ${targets.length}`);
  console.log(`  מחיר שונה — לא נוגעים  : ${differing.length}`);
  console.log(`  קבוצת בדיקה — לא נוגעים: ${(match.review ?? []).length}`);

  if (LIMIT) targets = targets.slice(0, LIMIT);
  if (targets.length === 0) { console.log('\nאין מה להשלים.'); return; }

  if (!APPLY) {
    console.log('\n' + '='.repeat(62));
    console.log('יובש. מה שהיה משתנה:');
    for (const t of targets.slice(0, 20)) {
      console.log(`  ₪0 → ₪${String(t.supplierPrice).padEnd(9)} ${t.storeTitle.slice(0, 44)}`);
    }
    if (targets.length > 20) console.log(`  … ועוד ${targets.length - 20}`);
    console.log('='.repeat(62));
    console.log('להרצה אמיתית: הוסיפו --apply');
    return;
  }

  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  let updated = 0;
  let untouched = 0;
  const failed = [];

  for (const [i, t] of targets.entries()) {
    try {
      const d = await admin(BY_HANDLE, { h: t.handle });
      const p = d.productByIdentifier;
      if (!p) { failed.push({ t, why: 'המוצר לא נמצא לפי handle' }); continue; }

      /*
       * רק הווריאנטים שיושבים על 0 מתעדכנים.
       *
       * מוצר יכול להיות עם וריאנט אחד מתומחר ואחד לא, ועדכון גורף לכל
       * הווריאנטים היה דורס מחיר אמיתי במחיר של הספק — בדיוק מה שהסקריפט
       * הזה מסרב לעשות ברמת המוצר.
       */
      const zero = p.variants.nodes.filter((v) => Number(v.price) === 0);
      if (zero.length === 0) { untouched++; continue; }

      const r = await admin(UPDATE, {
        pid: p.id,
        vars: zero.map((v) => ({ id: v.id, price: String(t.supplierPrice) })),
      });
      const errs = r.productVariantsBulkUpdate.userErrors;
      if (errs?.length) failed.push({ t, why: errs.map((e) => e.message).join('; ') });
      else updated++;
    } catch (e) {
      failed.push({ t, why: e.message.slice(0, 140) });
    }
    if ((i + 1) % 5 === 0 || i === targets.length - 1) {
      process.stdout.write(`\r  עודכנו ${updated} | ללא שינוי ${untouched} | נכשלו ${failed.length}  (${i + 1}/${targets.length})`);
    }
    await sleep(350);
  }

  console.log('\n\n' + '='.repeat(62));
  console.log(`עודכנו         : ${updated}`);
  console.log(`כבר לא היו ב-0 : ${untouched}`);
  console.log(`נכשלו          : ${failed.length}`);
  for (const f of failed.slice(0, 10)) console.log(`   ✗ ${f.t.storeTitle.slice(0, 38)} — ${f.why}`);
  console.log('='.repeat(62));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
