#!/usr/bin/env node
/**
 * מחליף את תמונת המוצר בקובץ מקומי, ומסיר את הקודמת.
 *
 *   node scripts/replace-product-image.js <productId> <קובץ> [--apply]
 *
 * למה זה נחוץ: גוגל דחתה מוצר על "Promotional overlay on image" — בראש
 * התמונה היה פס עם לוגו FETAYA LIGHTING, גרפיקת נורות ותגי IP44 ו-2 YEARS.
 * הוספת תמונה נקייה לבדה אינה מספיקה, כי גוגל קוראת את הראשונה; הפוגמת
 * חייבת לצאת.
 *
 * הסדר כאן חשוב: קודם מעלים ומאמתים שהחדשה נקלטה, ורק אז מוחקים את
 * הישנה. ההפוך משאיר מוצר בלי תמונה בכלל אם ההעלאה נכשלת, וזו דחייה
 * אחרת של גוגל ("Missing product image") במקום זו שתיקנו.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const PRODUCT_ID = args[0];
const FILE = args[1];
const APPLY = args.includes('--apply');

if (!PRODUCT_ID || !FILE) {
  console.error('שימוש: node scripts/replace-product-image.js <productId> <קובץ> [--apply]');
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
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]).slice(0, 250));
  return json.data;
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function stageUpload(filename, buffer, mimeType) {
  const staged = await admin(
    `mutation Stage($input:[StagedUploadInput!]!){
      stagedUploadsCreate(input:$input){
        stagedTargets{ url resourceUrl parameters{ name value } }
        userErrors{ field message }
      }
    }`,
    { input: [{ filename, mimeType, httpMethod: 'POST', resource: 'IMAGE' }] }
  );
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error('לא התקבל יעד העלאה');
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  const up = await fetch(target.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`העלאה נכשלה: ${up.status}`);
  return target.resourceUrl;
}

async function main() {
  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  const abs = path.isAbsolute(FILE) ? FILE : path.join(process.cwd(), FILE);
  if (!fs.existsSync(abs)) throw new Error(`הקובץ לא נמצא: ${abs}`);
  const buffer = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const mimeType = MIME[ext];
  if (!mimeType) throw new Error(`סוג קובץ לא נתמך: ${ext}`);

  const d = await admin(
    `query($id:ID!){ product(id:$id){ id title handle
       media(first:20){ nodes{ id ... on MediaImage { image{ url } } } } } }`,
    { id: PRODUCT_ID }
  );
  const p = d.product;
  if (!p) throw new Error('המוצר לא נמצא');

  console.log(`מוצר : ${p.title.slice(0, 60)}`);
  console.log(`קובץ : ${path.basename(abs)}  ${Math.round(buffer.length / 1024)}KB`);
  console.log(`תמונות קיימות: ${p.media.nodes.length}`);
  for (const m of p.media.nodes) console.log(`   ${m.id}  ${(m.image?.url ?? '—').slice(0, 70)}`);

  if (!APPLY) { console.log('\nיובש. להרצה אמיתית: הוסיפו --apply'); return; }

  const resourceUrl = await stageUpload(path.basename(abs), buffer, mimeType);
  const created = await admin(
    `mutation Add($productId:ID!,$media:[CreateMediaInput!]!){
      productCreateMedia(productId:$productId, media:$media){
        media{ id ... on MediaImage { image{ url } } }
        mediaUserErrors{ field message }
      }
    }`,
    { productId: p.id, media: [{ originalSource: resourceUrl, mediaContentType: 'IMAGE' }] }
  );
  const errs = created.productCreateMedia.mediaUserErrors;
  if (errs?.length) throw new Error(`הוספת תמונה נכשלה: ${errs[0].message}`);
  const newId = created.productCreateMedia.media[0]?.id;
  if (!newId) throw new Error('התמונה נוספה אבל לא הוחזר מזהה');
  console.log(`\nנוספה: ${newId}`);

  /*
   * שופיפיי מעבדת מדיה אסינכרונית. מוחקים את הישנה רק אחרי שהחדשה READY,
   * אחרת המוצר עלול להישאר בלי תמונה בכלל.
   */
  let ready = false;
  for (let i = 0; i < 12 && !ready; i++) {
    await sleep(2000);
    const st = await admin(
      `query($id:ID!){ node(id:$id){ ... on MediaImage { status image{ url } } } }`,
      { id: newId }
    );
    const s = st.node?.status;
    process.stdout.write(`\r  מצב עיבוד: ${s ?? '—'}`);
    if (s === 'READY') ready = true;
    if (s === 'FAILED') throw new Error('עיבוד התמונה נכשל — הישנה לא נמחקה');
  }
  console.log('');
  if (!ready) throw new Error('התמונה לא הגיעה ל-READY בזמן — הישנה לא נמחקה');

  const old = p.media.nodes.map((m) => m.id).filter((id) => id !== newId);
  if (old.length) {
    const del = await admin(
      `mutation Del($productId:ID!,$mediaIds:[ID!]!){
        productDeleteMedia(productId:$productId, mediaIds:$mediaIds){
          deletedMediaIds
          mediaUserErrors{ field message }
        }
      }`,
      { productId: p.id, mediaIds: old }
    );
    const de = del.productDeleteMedia.mediaUserErrors;
    if (de?.length) console.log(`⚠ מחיקת הישנה: ${de[0].message}`);
    else console.log(`נמחקו ${del.productDeleteMedia.deletedMediaIds.length} תמונות קודמות`);
  }
  console.log('\nהוחלף.');
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
