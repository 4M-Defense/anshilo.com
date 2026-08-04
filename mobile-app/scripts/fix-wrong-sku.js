#!/usr/bin/env node
/**
 * מתקן מקט שגוי, כשהעדות לכך שהוא שגוי נמצאת בכותרת של המוצר עצמו.
 *
 * המקרה שאיתו זה נכתב: שני מוצרים מפורסמים נשאו שניהם את המקט A-83967, וגוגל
 * ראה כפילות. אחד מהם נקרא "להב וידיה למתכת Makita A-86723" — כלומר הכותרת
 * אומרת מקט אחר מזה שבשדה. אצל היבואן ארגנטולס שניהם קיימים ושונים:
 *   A-83967  להב TCT למסור 185X48 מתכת
 *   A-86723  להב TCT שקט למסור 305X60 מתכת
 * ופער המחיר בחנות תומך בזה — 569 ל-185 מ"מ ו-889 ל-305 מ"מ.
 *
 * למה זה סקריפט ולא תיקון ידני: התיקון חייב לאמת לפני שהוא כותב. הוא דורש
 * שהמקט המבוקש יופיע בכותרת, שהמקט הנוכחי יהיה זה שמצפים לו, ושהמקט החדש לא
 * יהיה תפוס על ידי מוצר אחר — אחרת התיקון של כפילות אחת יוצר כפילות אחרת.
 *
 *   node scripts/fix-wrong-sku.js                 בדיקה בלבד
 *   node scripts/fix-wrong-sku.js --apply
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const APPLY = process.argv.includes('--apply');

/**
 * כל תיקון מצהיר על כל מה שצריך להתקיים. אם משהו לא מתקיים — לא כותבים.
 * זה נכתב כטבלה ולא כלוגיקה כדי שכל שורה תהיה החלטה שאפשר לקרוא ולבדוק.
 */
const FIXES = [
  {
    titleContains: 'A-86723',
    currentSku: 'A-83967',
    newSku: 'A-86723',
    why: 'הכותרת אומרת A-86723; אצל ארגנטולס זה להב 305X60 נפרד מ-A-83967 שהוא 185X48',
  },
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
  query Find($q: String!) {
    products(first: 20, query: $q) {
      nodes {
        id
        title
        status
        variants(first: 30) { nodes { id sku } }
      }
    }
  }
`;

const UPDATE = `
  mutation SetSku($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku }
      userErrors { field message }
    }
  }
`;

(async () => {
  if (!ADMIN_TOKEN) ADMIN_TOKEN = await mintAdminToken();

  for (const fix of FIXES) {
    console.log(`\n${fix.currentSku} → ${fix.newSku}`);
    console.log(`  הנימוק: ${fix.why}`);

    // מי כבר מחזיק את המקט החדש — התיקון אסור ליצור כפילות חדשה
    const takenData = await admin(FIND, { q: `sku:${fix.newSku}` });
    const taken = takenData.products.nodes.filter((p) =>
      p.variants.nodes.some((v) => (v.sku || '').trim() === fix.newSku)
    );
    if (taken.length) {
      console.log(`  ✗ המקט ${fix.newSku} תפוס כבר על ${taken.length} מוצרים — לא נוגע:`);
      for (const p of taken) console.log(`      ${p.title.slice(0, 62)}`);
      continue;
    }

    // המוצר לתיקון: כותרת שמכילה את המקט החדש, ושדה מקט שמחזיק את הישן
    const data = await admin(FIND, { q: `sku:${fix.currentSku}` });
    const candidates = data.products.nodes.filter(
      (p) =>
        p.title.includes(fix.titleContains) &&
        p.variants.nodes.some((v) => (v.sku || '').trim() === fix.currentSku)
    );

    if (candidates.length === 0) { console.log('  ✗ לא נמצא מוצר שעונה על התנאים — ייתכן שזה כבר תוקן'); continue; }
    if (candidates.length > 1) {
      console.log(`  ✗ ${candidates.length} מוצרים עונים על התנאים. תיקון עיוור כאן היה מנחש — לא נוגע:`);
      for (const p of candidates) console.log(`      ${p.title.slice(0, 62)}`);
      continue;
    }

    const product = candidates[0];
    const variants = product.variants.nodes.filter((v) => (v.sku || '').trim() === fix.currentSku);
    console.log(`  המוצר:  ${product.title.slice(0, 66)}  [${product.status}]`);
    console.log(`  ווריאנטים לעדכון: ${variants.length}`);

    if (!APPLY) { console.log('  (בדיקה בלבד — הרץ עם --apply כדי לכתוב)'); continue; }

    const res = await admin(UPDATE, {
      productId: product.id,
      variants: variants.map((v) => ({ id: v.id, inventoryItem: { sku: fix.newSku } })),
    });
    const errs = res.productVariantsBulkUpdate.userErrors;
    if (errs.length) { console.log('  ✗ ' + errs.map((e) => e.message).join('; ')); continue; }
    console.log(`  ✓ עודכן ל-${fix.newSku}`);
  }
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
