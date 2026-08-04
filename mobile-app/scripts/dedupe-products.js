#!/usr/bin/env node
/**
 * מטפל בקבוצות מוצרים בעלי כותרת זהה, לפי מה שהן באמת.
 *
 *   node scripts/dedupe-products.js              # יובש
 *   node scripts/dedupe-products.js --apply
 *
 * נמדדו 76 קבוצות עם כותרת זהה, 161 מוצרים. **הן לא אותו דבר**, ולזהות
 * ביניהן זו הטעות שהייתה עולה ביוקר: המקט מפריד אותן לשתי קבוצות שדורשות
 * טיפול הפוך.
 *
 *   38 קבוצות — אותו מקט. כפילות אמיתית, אותו מוצר נרשם פעמיים.
 *    8 קבוצות — מקטים שונים. **מוצרים שונים שחולקים כותרת**, ולכן גם
 *               המחירים השונים ביניהם לגיטימיים ולא באג.
 *   29 קבוצות — בלי מקט בשני הצדדים, מוכרעות לפי מחיר ותמונות.
 *
 * הדוגמה שמבהירה למה זה קריטי: "גוף תאורה שבילית לד מלבני 4.4W" מופיע
 * שלוש פעמים במקטים 9250, 9251 ו-9252 ובמחירים 140, 140 ו-130. אלה שלושה
 * דגמים, ופיענוח מקטי פתיה בסבב הזה הראה שהסיומת מקודדת את המוצר. למחוק
 * שניים מהם פירושו למחוק שני מוצרים אמיתיים מהקטלוג.
 *
 * מה שהסקריפט עושה: בכפילות אמיתית משאיר את השלם ביותר ומוציא את השאר
 * לטיוטה — הפיך, ובלי לאבד את הכתובת. בהתנגשות שם הוא **אינו נוגע**
 * ומדפיס אותה לתיקון כותרות, כי כותרת מבדילה היא החלטת תוכן.
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
const normSku = (s) => String(s ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
const plain = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

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
      nodes{
        id title vendor handle createdAt descriptionHtml
        media(first:12){ nodes{ ... on MediaImage { image{ width height } } } }
        variants(first:10){ nodes{ sku price inventoryQuantity } }
      }
    }
  }`;

/**
 * ניקוד שלמות. מי שמנצח נשאר מפורסם.
 *
 * הסדר לא שרירותי: תמונה שעוברת את דרישת גוגל שווה יותר מתמונה סתם, ותיאור
 * אמיתי שווה יותר ממלאי, כי מלאי אפשר לעדכן בקליק ותיאור לא.
 */
function score(p) {
  const imgs = p.media.nodes.filter((m) => m.image);
  const big = imgs.filter((m) => Math.min(m.image.width, m.image.height) >= 500).length;
  const desc = plain(p.descriptionHtml).length;
  return (
    big * 1000 +
    imgs.length * 100 +
    (desc >= 50 ? 300 : desc > 0 ? 50 : 0) +
    (p.variants.nodes.some((v) => Number(v.inventoryQuantity) > 0) ? 20 : 0) +
    (p.variants.nodes.some((v) => v.sku) ? 10 : 0)
  );
}

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

  const groups = new Map();
  for (const p of all) {
    const k = p.title.trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const dup = [...groups.entries()].filter(([, v]) => v.length > 1);

  const toDraft = [];
  const collisions = [];
  const priceConflictNoSku = [];

  for (const [title, items] of dup) {
    const skuOf = (p) => normSku(p.variants.nodes.map((v) => v.sku).find(Boolean) ?? '');
    const skus = items.map(skuOf);

    /*
     * הכפילות נמדדת **בתוך מקט**, לא בתוך כותרת.
     *
     * זה תיקון של באג שהיה מוחק מוצר אמיתי. בקבוצה "סט 10 כלים נטענים 18V"
     * המקטים הם 100313-026, 100313-027 ו-100313-026 — שניים זהים ואחד שונה.
     * בדיקה על "האם כל המקטים ייחודיים" מחזירה לא, נופלת לענף הכפילות,
     * ומוציאה לטיוטה גם את 027 שהוא דגם אחר. קיבוץ לפי מקט מטפל בכל
     * המקרים באותו כלל: אותו מקט הוא אותו מוצר, מקט אחר הוא מוצר אחר.
     */
    const bySku = new Map();
    for (const p of items) {
      const k = skuOf(p);
      if (!bySku.has(k)) bySku.set(k, []);
      bySku.get(k).push(p);
    }

    /* יותר ממקט אחד בקבוצה = יש כאן גם מוצרים שונים, ומדווחים על כך */
    const distinct = [...bySku.keys()].filter(Boolean);
    if (distinct.length > 1) collisions.push({ title, items, skus });

    for (const [sku, sameSku] of bySku) {
      if (sameSku.length < 2) continue;

      /*
       * בלי מקט ובמחירים שונים אין די מידע להכריע מה כפילות ומה דגם אחר,
       * ולכן מדווח ולא מוכרע.
       */
      if (!sku) {
        const prices = new Set(sameSku.map((p) => Math.max(...p.variants.nodes.map((v) => Number(v.price)))));
        if (prices.size > 1) { priceConflictNoSku.push({ title, items: sameSku }); continue; }
      }

      const ranked = [...sameSku].sort((x, y) => score(y) - score(x) || (x.createdAt < y.createdAt ? -1 : 1));
      const keep = ranked[0];
      for (const p of ranked.slice(1)) toDraft.push({ p, keep, title, sku: sku || '(אין מקט)' });
    }
  }

  console.log(`קבוצות כותרת זהה : ${dup.length}`);
  console.log(`  לטיוטה         : ${toDraft.length} מוצרים`);
  console.log(`  התנגשות שם     : ${collisions.length} קבוצות — לא נוגעים`);
  console.log(`  מחיר שונה בלי מקט: ${priceConflictNoSku.length} קבוצות — לא נוגעים`);

  if (collisions.length) {
    console.log('\n=== מוצרים שונים עם כותרת זהה. דורש כותרת מבדילה ===');
    for (const c of collisions) {
      console.log(`  ${c.title.slice(0, 56)}`);
      for (const [i, p] of c.items.entries()) {
        const pr = Math.max(...p.variants.nodes.map((v) => Number(v.price)));
        console.log(`     ${p.id.split('/').pop()}  מקט ${String(c.skus[i]).padEnd(12)} ₪${pr}`);
      }
    }
  }
  if (priceConflictNoSku.length) {
    console.log('\n=== מחיר שונה ואין מקט להכריע ===');
    for (const c of priceConflictNoSku) {
      console.log(`  ${c.title.slice(0, 54)}  →  ${c.items.map((p) => '₪' + Math.max(...p.variants.nodes.map((v) => Number(v.price)))).join(' / ')}`);
    }
  }

  if (toDraft.length) {
    console.log('\n=== לטיוטה (הנשאר מצוין בסוגריים) ===');
    for (const x of toDraft.slice(0, 14)) {
      console.log(`  ${x.p.id.split('/').pop()} → DRAFT   (נשאר ${x.keep.id.split('/').pop()})  ${x.title.slice(0, 40)}`);
    }
    if (toDraft.length > 14) console.log(`  … ועוד ${toDraft.length - 14}`);
  }

  if (!APPLY) { console.log('\nיובש. להרצה אמיתית: הוסיפו --apply'); return; }

  let done = 0;
  const failed = [];
  for (const [i, x] of toDraft.entries()) {
    try {
      const d = await admin(
        `mutation($input:ProductUpdateInput!){productUpdate(product:$input){userErrors{field message}}}`,
        { input: { id: x.p.id, status: 'DRAFT' } }
      );
      const e = d.productUpdate.userErrors;
      if (e?.length) failed.push({ t: x.title, why: e[0].message });
      else done++;
    } catch (e) {
      failed.push({ t: x.title, why: e.message.slice(0, 110) });
    }
    if ((i + 1) % 10 === 0 || i === toDraft.length - 1) {
      process.stdout.write(`\r  הוצאו לטיוטה ${done} | נכשלו ${failed.length}  (${i + 1}/${toDraft.length})`);
    }
    await sleep(300);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`הוצאו לטיוטה : ${done}`);
  console.log(`נכשלו        : ${failed.length}`);
  for (const f of failed.slice(0, 8)) console.log(`   ✗ ${f.t.slice(0, 34)} — ${f.why}`);
  console.log('='.repeat(60));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
