#!/usr/bin/env node
/**
 * מתקן שגיאות כתיב בשמות מוצרים, מרשימה מפורשת ומאומתת.
 *
 *   node scripts/fix-product-titles.js            # יובש
 *   node scripts/fix-product-titles.js --apply
 *
 * למה רשימה ידנית ולא זיהוי אוטומטי: ניסיתי. בניתי טבלת תדירות מ-2,714
 * הכותרות וסימנתי מילה נדירה שנמצאת במרחק עריכה אחד ממילה שכיחה — התבנית
 * הקלאסית של שגיאת הקלדה. זה החזיר 131 מועמדות, ורובן עברית תקינה: גרם
 * מול זרם, מלח מול מתח, ברזל מול ברז, שקד מול שקע. בעברית, בלי מילון,
 * מרחק עריכה אחד הוא פשוט לא סימן מספיק. לתקן 131 כותרות על סמך זה היה
 * מכניס שגיאות במקום להוציא.
 *
 * מה שכן — הסריקה חשפה את האמיתיות, וכל אחת כאן נבדקה בעיניים מול המוצר.
 *
 * למה זה חשוב מעבר לאסתטיקה: המסווג של גוגל קורא את הכותרת. "מיסגרת
 * הרכבים" במקום "מסגרת הרכבה" גרם לו לסווג מסגרת חשמל כחלק לרכב, והמוצר
 * נחסם. מילה חסרת פשר בכותרת היא אותה בעיה בדיוק.
 *
 * כותרת שמשתנה גוררת גם עדכון של כותרת ה-SEO, שנגזרת ממנה — אחרת נשארת
 * בפיד הכותרת הישנה עם השגיאה.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

/*
 * כל שורה כאן נבדקה מול המוצר עצמו. הסדר משנה: החלפות ארוכות לפני קצרות,
 * כדי שכפילות שלמה לא תתוקן חלקית.
 */
const FIXES = [
  /* "מתח זרם" שנדבקו למילה אחת. 72 מוצרים — השגיאה השיטתית היחידה שנמצאה */
  ['מתחזרם', 'מתח זרם'],
  /* כפילויות מהזנה — הביטוי הודבק פעמיים */
  ['אופן התקנה אופן התקנה', 'אופן התקנה'],
  ['פעמון משוריין פעמון משוריין', 'פעמון משוריין'],
  /* שגיאות הקלדה בודדות */
  ['מפסר זרם', 'מפסק זרם'],
  ['LS תשחור', 'LS שחור'],
  ['בצבע לשחור', 'בצבע שחור'],
  ['כולל תאור MAKITA', 'כולל תאורה MAKITA'],
  /* "הרכבים" במקום "הרכבה" — זו שגרמה לגוגל לסווג כחלקי רכב */
  ['מיסגרת הרכבים', 'מסגרת הרכבה'],
  ['מסגרת הרכבים', 'מסגרת הרכבה'],
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
      nodes{ id title seo{ title } }
    }
  }`;

const UPDATE = `
  mutation($input:ProductUpdateInput!){
    productUpdate(product:$input){ userErrors{ field message } }
  }`;

/** אותה נוסחה כמו בסקריפט ה-SEO, כדי שהכותרות לא יסתרו זו את זו */
function seoTitle(title) {
  const suffix = ' | א.נ. שילו';
  const room = 70 - suffix.length;
  const base = title.length > room ? title.slice(0, room - 1).trimEnd() + '…' : title;
  return base + suffix;
}

/** מנקה גם רווחים כפולים שנוצרים אחרי הסרת כפילות */
function applyFixes(title) {
  let out = title;
  for (const [bad, good] of FIXES) out = out.split(bad).join(good);
  return out.replace(/\s{2,}/g, ' ').trim();
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
  console.log(`בחנות: ${all.length} מוצרים`);

  const plan = [];
  for (const p of all) {
    const fixed = applyFixes(p.title);
    if (fixed !== p.title) plan.push({ p, fixed });
  }

  const perFix = {};
  for (const [bad] of FIXES) perFix[bad] = all.filter((p) => p.title.includes(bad)).length;

  console.log('\n' + '='.repeat(64));
  for (const [bad, good] of FIXES) {
    if (perFix[bad] > 0) console.log(`${String(perFix[bad]).padStart(4)}  "${bad}" → "${good}"`);
  }
  console.log('-'.repeat(64));
  console.log(`מוצרים לעדכון: ${plan.length}`);
  console.log('='.repeat(64));

  if (plan.length) {
    console.log('\nדוגמאות:');
    for (const x of plan.slice(0, 5)) {
      console.log(`  לפני : ${x.p.title.slice(0, 62)}`);
      console.log(`  אחרי : ${x.fixed.slice(0, 62)}`);
      console.log('');
    }
  }

  if (!APPLY) { console.log('להרצה אמיתית: הוסיפו --apply'); return; }

  let done = 0;
  const failed = [];
  for (const [i, x] of plan.entries()) {
    try {
      const d = await admin(UPDATE, {
        input: { id: x.p.id, title: x.fixed, seo: { title: seoTitle(x.fixed) } },
      });
      const e = d.productUpdate.userErrors;
      if (e?.length) failed.push({ t: x.p.title, why: e[0].message });
      else done++;
    } catch (e) {
      failed.push({ t: x.p.title, why: e.message.slice(0, 120) });
    }
    if ((i + 1) % 10 === 0 || i === plan.length - 1) {
      process.stdout.write(`\r  עודכנו ${done} | נכשלו ${failed.length}  (${i + 1}/${plan.length})`);
    }
    await sleep(300);
  }

  console.log('\n\n' + '='.repeat(64));
  console.log(`עודכנו : ${done}`);
  console.log(`נכשלו  : ${failed.length}`);
  for (const f of failed.slice(0, 8)) console.log(`   ✗ ${f.t.slice(0, 36)} — ${f.why}`);
  console.log('='.repeat(64));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
