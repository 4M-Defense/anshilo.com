#!/usr/bin/env node
/**
 * מחליף תמונת מוצר קטנה מדי בגרסה הגדולה שקיימת אצל הספק.
 *
 *   node scripts/upgrade-small-images.js              # יובש
 *   node scripts/upgrade-small-images.js --apply
 *   node scripts/upgrade-small-images.js --limit 10 --apply
 *
 * למה: Merchant Center מתריע "Image too small for upcoming enforcement" על
 * 587 מוצרים, ודורש 500 פיקסלים לפחות בצד הקצר. נמדד בחנות: 455 מוצרים
 * מפורסמים שהתמונה הראשית שלהם קטנה מזה.
 *
 * **הגדלה מלאכותית אינה פתרון** — היא מייצרת תמונה מטושטשת שנראית גרוע
 * יותר מהמקור, וגוגל בודקת פיקסלים ולא איכות. מה שכן קיים: הפלטפורמה של
 * הספקים מגישה כל תמונה בכמה גדלים, והכתובת שנשמרה בקטלוגים היא `/large/`.
 * נמדד ש-`/original/` הוא באמת גדול יותר, ולא רק כבד יותר:
 *
 *     בחנות 500x415  →  large 424x500   →  original 848x1000
 *     בחנות 400x400  →  large 500x500   →  original 800x800
 *     בחנות 500x458  →  large 500x500   →  original 1000x1000
 *
 * אלה פיקסלים אמיתיים. `xlarge`, `xl`, `huge` ו-`full` מחזירים 403.
 *
 * ההיקף כאן הוא 75 מ-455, כי רק להם יש תמונת ספק לפי מקט. ל-103 מוצרי
 * חגית — הקבוצה הגדולה — אין קטלוג ספק כלל, ולשאר אין יותר פיקסלים בשום
 * מקום. הסקריפט מדווח את זה ואינו מנסה להשלים בהגדלה.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';
const MIN_SIDE = 500;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;

const Jimp = require('jimp-compact');

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
const normSku = (s) => {
  const v = String(s ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  return v.length >= 3 ? v : null;
};

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

async function stageUpload(filename, buffer) {
  const staged = await admin(
    `mutation Stage($input:[StagedUploadInput!]!){
      stagedUploadsCreate(input:$input){
        stagedTargets{ url resourceUrl parameters{ name value } }
        userErrors{ field message }
      }
    }`,
    { input: [{ filename, mimeType: 'image/jpeg', httpMethod: 'POST', resource: 'IMAGE' }] }
  );
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error('לא התקבל יעד העלאה');
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), filename);
  const up = await fetch(target.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`העלאה נכשלה: ${up.status}`);
  return target.resourceUrl;
}

const FETCH = `
  query($a:String){
    products(first:250, after:$a, query:"status:active"){
      pageInfo{ hasNextPage endCursor }
      nodes{
        id title vendor handle
        variants(first:10){ nodes{ sku } }
        media(first:10){ nodes{ id ... on MediaImage { image{ url width height } } } }
      }
    }
  }`;

async function main() {
  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  /* תמונת ספק לפי מקט */
  const idx = new Map();
  for (const f of ['fetaya', 'chen', 'netanel', 'argentools', 'nisko', 'aspaka', 'nisani']) {
    const p = path.join(__dirname, '..', `${f}-catalogue.json`);
    if (!fs.existsSync(p)) continue;
    let rows;
    try { rows = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    for (const r of rows) {
      const k = normSku(r?.sku);
      const img = r.images?.[0] ?? r.image;
      if (k && img && !idx.has(k)) idx.set(k, { img, src: f });
    }
  }
  console.log(`תמונות ספק לפי מקט: ${idx.size}`);

  const all = [];
  let a = null;
  for (;;) {
    const d = await admin(FETCH, { a });
    all.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    a = d.products.pageInfo.endCursor;
  }

  const firstImage = (p) => p.media.nodes.find((m) => m.image);
  const small = all.filter((p) => {
    const m = firstImage(p);
    return m && Math.min(m.image.width, m.image.height) < MIN_SIDE;
  });

  const plan = [];
  const noSource = [];
  for (const p of small) {
    const sk = p.variants.nodes.map((v) => normSku(v.sku)).find(Boolean);
    const hit = sk ? idx.get(sk) : null;
    if (hit) plan.push({ p, sku: sk, ...hit, media: firstImage(p) });
    else noSource.push(p);
  }

  console.log(`מפורסמים                 : ${all.length}`);
  console.log(`תמונה ראשית מתחת ל-${MIN_SIDE}   : ${small.length}`);
  console.log(`יש תמונת ספק             : ${plan.length}`);
  console.log(`אין מקור                 : ${noSource.length}`);
  const nv = {};
  for (const p of noSource) nv[p.vendor] = (nv[p.vendor] || 0) + 1;
  console.log(`   ${Object.entries(nv).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => `${k.slice(0, 12)} ${n}`).join(' | ')}`);

  const work = LIMIT ? plan.slice(0, LIMIT) : plan;
  console.log(`\nבודק ${work.length} תמונות מקור…`);

  let better = 0, notBetter = 0, failed = 0, replaced = 0;
  for (const [i, x] of work.entries()) {
    /*
     * `/original/` במקום `/large/`. אם הכתובת אינה בתבנית הזאת מנסים אותה
     * כמו שהיא — יש ספקים שהתמונה שלהם כבר במקור.
     */
    const candidates = x.img.includes('/large/')
      ? [x.img.replace('/large/', '/original/'), x.img]
      : [x.img];

    let best = null;
    for (const url of candidates) {
      try {
        const img = await Jimp.read(url);
        const side = Math.min(img.bitmap.width, img.bitmap.height);
        if (!best || side > best.side) best = { img, side, url };
      } catch { /* מנסים את הבא */ }
    }

    const cur = Math.min(x.media.image.width, x.media.image.height);
    if (!best) { failed++; continue; }
    if (best.side < MIN_SIDE || best.side <= cur) {
      notBetter++;
      continue;
    }
    better++;

    if (!APPLY) {
      if (better <= 8) {
        console.log(`  ${String(x.sku).padEnd(12)} ${cur} → ${best.side}   ${x.p.title.slice(0, 40)}`);
      }
      continue;
    }

    try {
      const buffer = await best.img.quality(92).getBufferAsync(Jimp.MIME_JPEG);
      const resourceUrl = await stageUpload(`${x.p.handle.slice(0, 50)}-hi.jpg`, buffer);
      const created = await admin(
        `mutation Add($productId:ID!,$media:[CreateMediaInput!]!){
          productCreateMedia(productId:$productId, media:$media){
            media{ id }
            mediaUserErrors{ field message }
          }
        }`,
        { productId: x.p.id, media: [{ originalSource: resourceUrl, mediaContentType: 'IMAGE' }] }
      );
      const errs = created.productCreateMedia.mediaUserErrors;
      if (errs?.length) { failed++; continue; }
      const newId = created.productCreateMedia.media[0]?.id;
      if (!newId) { failed++; continue; }

      /* ממתינים ל-READY לפני מחיקה, כמו ב-replace-product-image */
      let ready = false;
      for (let k = 0; k < 10 && !ready; k++) {
        await sleep(1800);
        const st = await admin(
          `query($id:ID!){ node(id:$id){ ... on MediaImage { status } } }`, { id: newId }
        );
        if (st.node?.status === 'READY') ready = true;
        if (st.node?.status === 'FAILED') break;
      }
      if (!ready) { failed++; continue; }

      await admin(
        `mutation Del($productId:ID!,$mediaIds:[ID!]!){
          productDeleteMedia(productId:$productId, mediaIds:$mediaIds){ deletedMediaIds mediaUserErrors{ message } }
        }`,
        { productId: x.p.id, mediaIds: [x.media.id] }
      );
      replaced++;
    } catch { failed++; }

    if ((i + 1) % 5 === 0 || i === work.length - 1) {
      process.stdout.write(`\r  גדול יותר ${better} | הוחלפו ${replaced} | לא שיפר ${notBetter} | נכשלו ${failed}  (${i + 1}/${work.length})`);
    }
  }

  console.log('\n\n' + '='.repeat(62));
  console.log(`מקור גדול מ-${MIN_SIDE}      : ${better}`);
  console.log(`המקור לא גדול יותר     : ${notBetter}`);
  console.log(`נכשלו                  : ${failed}`);
  if (APPLY) console.log(`הוחלפו בחנות           : ${replaced}`);
  else console.log('\nיובש. להרצה אמיתית: הוסיפו --apply');
  console.log('='.repeat(62));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
