#!/usr/bin/env node
/**
 * מקדם לראש הגלריה את התמונה הגדולה ביותר, כשהראשית קטנה מ-500 פיקסלים.
 *
 *   node scripts/promote-largest-image.js              # יובש
 *   node scripts/promote-largest-image.js --apply
 *
 * למה: גוגל בודקת את התמונה הראשית, ודורשת 500 פיקסלים בצד הקצר. נמדדו 36
 * מוצרים שבהם הראשית קטנה מזה **ובגלריה שלהם כבר יש תמונה גדולה מספיק**.
 * כלומר אין כאן חוסר מידע ולא צורך בהעלאה — רק סדר.
 *
 * זה הפריט הזול ביותר בכל העבודה על התמונות: 36 מוצרים בלי שום תלות חיצונית,
 * בזמן ש-380 מוצרים אחרים תקועים כי אין להם תמונה גדולה בשום מקום.
 *
 * הסידור נעשה ב-productReorderMedia, שמקבל את המזהה והמקום החדש. מקדמים את
 * הגדולה למקום 0 ומשאירים את השאר בסדרן — לא ממיינים את כל הגלריה לפי גודל,
 * כי סדר התמונות הוא גם החלטה ויזואלית ולא רק טכנית.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';
const MIN_SIDE = 500;

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
      nodes{
        id title vendor
        media(first:25){ nodes{ id ... on MediaImage { image{ width height } } } }
      }
    }
  }`;

const REORDER = `
  mutation($id:ID!,$moves:[MoveInput!]!){
    productReorderMedia(id:$id, moves:$moves){
      userErrors{ field message }
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

  const side = (m) => (m.image ? Math.min(m.image.width, m.image.height) : 0);
  const plan = [];
  for (const p of all) {
    const imgs = p.media.nodes.filter((m) => m.image);
    if (imgs.length < 2) continue;
    const cur = imgs[0];
    if (side(cur) >= MIN_SIDE) continue;
    /* הגדולה ביותר בגלריה, ורק אם היא באמת עוברת את הסף */
    const best = imgs.reduce((m, x) => (side(x) > side(m) ? x : m), imgs[0]);
    if (best.id === cur.id || side(best) < MIN_SIDE) continue;
    plan.push({ p, from: side(cur), to: side(best), id: best.id });
  }

  console.log(`מפורסמים                        : ${all.length}`);
  console.log(`ראשית קטנה + קיימת גדולה בגלריה : ${plan.length}   (הדוח: 36)`);
  if (plan.length) {
    console.log('');
    for (const x of plan.slice(0, 12)) {
      console.log(`  ${String(x.from).padStart(4)} → ${String(x.to).padEnd(5)} ${x.p.title.slice(0, 46)}`);
    }
    if (plan.length > 12) console.log(`  … ועוד ${plan.length - 12}`);
  }

  if (!APPLY) { console.log('\nיובש. להרצה אמיתית: הוסיפו --apply'); return; }

  let done = 0;
  const failed = [];
  for (const [i, x] of plan.entries()) {
    try {
      const d = await admin(REORDER, { id: x.p.id, moves: [{ id: x.id, newPosition: '0' }] });
      const e = d.productReorderMedia.userErrors;
      if (e?.length) failed.push({ t: x.p.title, why: e[0].message });
      else done++;
    } catch (e) {
      failed.push({ t: x.p.title, why: e.message.slice(0, 110) });
    }
    if ((i + 1) % 10 === 0 || i === plan.length - 1) {
      process.stdout.write(`\r  סודרו ${done} | נכשלו ${failed.length}  (${i + 1}/${plan.length})`);
    }
    await sleep(320);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`סודרו : ${done}`);
  console.log(`נכשלו : ${failed.length}`);
  for (const f of failed.slice(0, 8)) console.log(`   ✗ ${f.t.slice(0, 34)} — ${f.why}`);
  console.log('='.repeat(60));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
