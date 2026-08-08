#!/usr/bin/env node
/**
 * ממלא תיאורים ריקים מהטקסט של היבואן, לפי מספר הדגם.
 *
 * למה מספר דגם ולא דמיון שם: כל שיטה שמסתמכת על דמיון כללי נשרפה בפרויקט
 * הזה — שקע TV-FM הותאם לקופסה עגולה ותומחר ב-2 ₪, ושלט לא מואר למואר. מה
 * שכן עובד הוא מבחין יחיד וחד. אצל בלנדסטון זה מספר הדגם: "נעל בלנסטון דגם
 * 587 שחור רסטיק" מול "Blundstone 587 - נעלי בלנסטון..." — מספר תלת/ארבע
 * ספרתי שמופיע בשני הצדדים ואינו יכול להתאים לדגם אחר.
 *
 * למה לא לפי מקט: המקטים בחנות הם מונה פנימי (41122xx) ולא מקטי היבואן, אז
 * מתוך 46 התיאורים הריקים רק אחד נמצא לפי מקט — וגם הוא רק אחרי שתוקן ידנית.
 *
 * טיפול באי-בהירות: לדגם אחד יכולות להיות שתי רשומות בקטלוג, לרוב גברים
 * ונשים. ההכרעה היא לפי מילה מפורשת שמופיעה בשני הצדדים, ואם היא לא מכריעה —
 * המוצר מדולג ומדווח. ניחוש בין דגם גברים לנשים הוא בדיוק סוג הטעות שאי אפשר
 * לראות אחר כך.
 *
 * הטקסט הוא של היבואן ולא נכתב כאן. שום מפרט אינו מומצא.
 *
 *   node scripts/fill-descriptions-from-supplier.js --vendor בלאנדסטון
 *   node scripts/fill-descriptions-from-supplier.js --vendor בלאנדסטון --apply
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VENDOR = args.includes('--vendor') ? args[args.indexOf('--vendor') + 1] : null;
const CATALOGUE = args.includes('--catalogue') ? args[args.indexOf('--catalogue') + 1] : null;

if (!VENDOR) { console.error('חסר --vendor'); process.exit(1); }

/** ברירת מחדל: קובץ הקטלוג לפי היצרן. */
const VENDOR_CATALOGUE = { 'בלאנדסטון': 'blundstone-catalogue.json' };
const CATALOGUE_FILE = CATALOGUE || VENDOR_CATALOGUE[VENDOR];
if (!CATALOGUE_FILE) { console.error(`אין קטלוג ידוע ל-"${VENDOR}" — ציינו --catalogue`); process.exit(1); }

/** מילים שמכריעות בין שתי רשומות של אותו דגם. */
const DISAMBIGUATORS = ['גברים', 'נשים', 'ילדים', 'שחור', 'חום', 'אפור', 'כחול', 'זית'];

const BACKUP = path.join(__dirname, '..', 'description-fill-backup.json');

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

const modelOf = (s) => {
  const m = String(s || '').match(/\b(\d{3,4})\b/);
  return m ? m[1] : null;
};
const plain = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  ADMIN_TOKEN = await mintAdminToken();

  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', CATALOGUE_FILE), 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.products || [];
  const byModel = new Map();
  for (const r of rows) {
    const model = modelOf(r.name || r.title);
    const html = r.descriptionHtml || r.description || '';
    if (!model || plain(html).length < 40) continue;
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model).push({ name: String(r.name || r.title).trim(), html });
  }
  console.log(`קטלוג ${CATALOGUE_FILE}: ${byModel.size} דגמים עם תיאור\n`);

  const d = await admin(
    `query V($q: String!) { products(first: 100, query: $q) { nodes { id title descriptionHtml } } }`,
    { q: `vendor:${VENDOR} AND status:active` }
  );

  const plan = [], skipped = [];
  for (const p of d.products.nodes) {
    if (plain(p.descriptionHtml) !== '') continue;
    const model = modelOf(p.title);
    const candidates = model ? byModel.get(model) : null;
    if (!candidates?.length) { skipped.push({ title: p.title, why: model ? `דגם ${model} אינו בקטלוג` : 'אין מספר דגם בכותרת' }); continue; }

    let chosen = candidates[0];
    if (candidates.length > 1) {
      const texts = candidates.map((c) => plain(c.html));

      /* אם כל הרשומות אומרות בדיוק אותו דבר, אין מה להכריע */
      const allSame = texts.every((t) => t === texts[0]);

      /* מילה שמופיעה בכותרת בחנות ומבדילה בין המועמדים */
      const decisive = DISAMBIGUATORS.filter((w) => {
        if (!p.title.includes(w)) return false;
        return candidates.filter((c) => c.name.includes(w)).length === 1;
      });

      /*
       * ואם הכותרת בחנות אינה אומרת מגדר — נמדד שהיא באמת לא, כי המוצרים
       * האלה מוכרים מידות 36 עד 48, כלומר מאחדים את טווח הנשים (35.5–40)
       * ואת טווח הגברים (41–48) בפריט אחד. במצב כזה תיאור מגדרי הוא שגוי
       * לחצי מהקונים, ולכן נבחר רק תיאור שאינו טוען מגדר בטקסט שלו.
       */
      /*
       * בלי \b. ב-JavaScript \w הוא [A-Za-z0-9_] בלבד, ולכן אות עברית היא
       * תו שאינו-מילה ו-\b מתנהג הפוך מהצפוי — הגרסה הראשונה של הביטוי הזה
       * לא זיהתה "לנשים" בכלל, ושני תיאורים מגדריים דווחו כניטרליים.
       */
      const GENDERED = /לנשים|לגברים|נשים|גברים/;
      const neutral = candidates.filter((c, i) => !GENDERED.test(texts[i]));

      if (allSame) {
        chosen = candidates[0];
      } else if (decisive.length) {
        chosen = candidates.find((c) => c.name.includes(decisive[0]));
      } else if (neutral.length === 1) {
        chosen = neutral[0];
      } else {
        skipped.push({
          title: p.title,
          why: `${candidates.length} רשומות לדגם ${model}, הכותרת אינה אומרת מגדר, ו${neutral.length === 0 ? 'שני התיאורים מגדריים' : 'שניהם ניטרליים'}`,
        });
        continue;
      }
    }
    plan.push({ id: p.id, title: p.title, model, from: chosen.name, html: chosen.html });
  }

  console.log(`ימולאו: ${plan.length}`);
  console.log(`מדולגים: ${skipped.length}`);
  for (const s of skipped) console.log(`   ${s.title.slice(0, 46)}  —  ${s.why}`);
  console.log();
  for (const s of plan.slice(0, APPLY ? 0 : 4)) {
    console.log('─'.repeat(72));
    console.log(`${s.title.slice(0, 66)}   [דגם ${s.model}]`);
    console.log(`  מקור: ${s.from.slice(0, 62)}`);
    console.log(`  ${plain(s.html).slice(0, 260)}`);
  }

  if (!APPLY) { console.log('\nלהרצה אמיתית: הוסיפו --apply'); return; }

  const backup = fs.existsSync(BACKUP) ? JSON.parse(fs.readFileSync(BACKUP, 'utf8')) : {};
  let written = 0;
  for (const item of plan) {
    const res = await admin(
      `mutation U($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id } userErrors { message } } }`,
      { p: { id: item.id, descriptionHtml: item.html } }
    );
    const errs = res.productUpdate.userErrors;
    if (errs.length) { console.log(`  ✗ ${item.title.slice(0, 40)}: ${errs[0].message}`); continue; }
    backup[item.id] = '';
    written++;
  }
  fs.writeFileSync(BACKUP, JSON.stringify(backup, null, 1));
  console.log(`\n✓ מולאו ${written} תיאורים מהטקסט של היבואן`);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
