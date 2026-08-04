#!/usr/bin/env node
/**
 * דוח פערים על החנות — קורא הכול, כותב כלום.
 *
 * הסקריפטים האחרים כאן מתקנים דבר אחד כל אחד, וכל אחד מהם מודד את הפער שלו בדרך.
 * זה מודד את כולם יחד בסריקה אחת, כדי שהתשובה ל"מה נשאר" תהיה מספר ולא זיכרון.
 *
 * למה סריקה אחת ולא כמה: הנפקת טוקן ב-client_credentials מבטלת את הטוקן הקודם.
 * שני סקריפטים שרצים במקביל מפילים אחד את השני ב-401 באמצע, וזה כבר קרה כאן
 * והרג ריצה של 355 מוצרים. סריקה אחת שמודדת הכול היא גם התשובה המדויקת וגם
 * ההגנה מפני זה.
 *
 * הפערים נמדדים בנפרד לפוסטים שפורסמו ולטיוטות, כי Merchant Center רואה רק
 * את המפורסמים — פער בטיוטה אינו תקלה בפיד, ולערבב אותם הופך את הדוח לחסר
 * שימוש בדיוק בשאלה שבשבילה הוא נכתב.
 *
 *   node scripts/store-gap-report.js
 *   node scripts/store-gap-report.js --json out.json
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

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

const PAGE = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        status
        vendor
        productType
        descriptionHtml
        category { id fullName }
        featuredMedia {
          ... on MediaImage { image { width height } }
        }
        media(first: 1) { nodes { id } }
        variants(first: 100) {
          nodes { id sku price }
        }
      }
    }
  }
`;

// כותרת שמועתקת לתיאור נחשבת חסרת תיאור. זה נמדד לפי טקסט נקי, לא לפי HTML,
// כי <p>כותרת</p> ו-כותרת הם אותו כלום מבחינת קונה ומבחינת גוגל.
const textOf = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const MIN_USEFUL_DESC = 50;

(async () => {
  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('אין טוקן ואין client credentials ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  const buckets = {
    ACTIVE: { label: 'מפורסמים', n: 0 },
    DRAFT: { label: 'טיוטות', n: 0 },
    ARCHIVED: { label: 'בארכיון', n: 0 },
  };
  for (const b of Object.values(buckets)) {
    Object.assign(b, {
      zeroPrice: [], noImage: [], smallImage: [], noDesc: [],
      noCategory: [], noProductType: [], noSku: [],
    });
  }

  const bySku = new Map();
  let cursor = null, pages = 0;

  process.stdout.write('סורק');
  do {
    const data = await admin(PAGE, { cursor });
    const conn = data.products;
    for (const p of conn.nodes) {
      const b = buckets[p.status] || buckets.ACTIVE;
      b.n++;

      const variants = p.variants.nodes;
      const prices = variants.map((v) => Number(v.price));
      if (prices.length && prices.every((x) => !(x > 0))) b.zeroPrice.push({ id: p.id, title: p.title, vendor: p.vendor });

      const img = p.featuredMedia?.image;
      if (!p.media.nodes.length) b.noImage.push({ id: p.id, title: p.title, vendor: p.vendor });
      else if (img && Math.min(img.width || 0, img.height || 0) > 0 && Math.max(img.width, img.height) < 500) {
        b.smallImage.push({ id: p.id, title: p.title, vendor: p.vendor, px: `${img.width}x${img.height}` });
      }

      const text = textOf(p.descriptionHtml);
      const titleNorm = p.title.replace(/\s+/g, ' ').trim();
      if (text.length < MIN_USEFUL_DESC || text === titleNorm) {
        b.noDesc.push({ id: p.id, title: p.title, vendor: p.vendor, chars: text.length });
      }

      if (!p.category) b.noCategory.push({ id: p.id, title: p.title, vendor: p.vendor });
      if (!p.productType || !p.productType.trim()) b.noProductType.push({ id: p.id, title: p.title });

      for (const v of variants) {
        const sku = (v.sku || '').trim();
        if (!sku) { b.noSku.push({ id: p.id, title: p.title }); continue; }
        if (!bySku.has(sku)) bySku.set(sku, []);
        bySku.get(sku).push({ id: p.id, title: p.title, status: p.status, price: v.price });
      }
    }
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    if (++pages % 5 === 0) process.stdout.write('.');
  } while (cursor);
  process.stdout.write('\n\n');

  // כפילות אמיתית היא אותו מקט על שני מוצרים שונים. אותו מקט על שני וריאנטים
  // של אותו מוצר אינו כפילות, ולכן ההשוואה היא על מזהה המוצר.
  const dupes = [...bySku.entries()]
    .map(([sku, rows]) => {
      const ids = [...new Set(rows.map((r) => r.id))];
      return { sku, ids, rows };
    })
    .filter((d) => d.ids.length > 1);
  const dupesLive = dupes.filter((d) => d.rows.filter((r) => r.status === 'ACTIVE').length > 1);

  const total = Object.values(buckets).reduce((s, b) => s + b.n, 0);
  console.log(`סך המוצרים בחנות: ${total}`);
  for (const [k, b] of Object.entries(buckets)) console.log(`  ${b.label}: ${b.n}`);
  console.log();

  const ROWS = [
    ['מחיר 0', 'zeroPrice'],
    ['בלי תמונה בכלל', 'noImage'],
    ['תמונה ראשית מתחת ל-500px', 'smallImage'],
    ['בלי תיאור שימושי', 'noDesc'],
    ['בלי קטגוריה (מה שגוגל קורא)', 'noCategory'],
    ['בלי product type', 'noProductType'],
    ['וריאנט בלי מקט', 'noSku'],
  ];
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
  console.log(pad('פער', 34) + pad('מפורסמים', 12) + 'טיוטות');
  console.log('-'.repeat(58));
  for (const [label, key] of ROWS) {
    console.log(pad(label, 34) + pad(String(buckets.ACTIVE[key].length), 12) + String(buckets.DRAFT[key].length));
  }
  console.log();
  console.log(`מקטים שמופיעים על יותר ממוצר אחד: ${dupes.length}`);
  console.log(`  מתוכם שני מפורסמים או יותר (מה שגוגל רואה ככפילות): ${dupesLive.length}`);
  if (dupesLive.length) {
    for (const d of dupesLive.slice(0, 12)) {
      const live = d.rows.filter((r) => r.status === 'ACTIVE');
      const prices = [...new Set(live.map((r) => r.price))];
      console.log(`   ${d.sku}  ${live.length} מפורסמים${prices.length > 1 ? `  מחירים שונים: ${prices.join(' / ')}` : ''}`);
      for (const r of live.slice(0, 3)) console.log(`      ${r.title.slice(0, 70)}`);
    }
  }

  console.log();
  console.log('--- הפערים על המפורסמים לפי ספק, כי כל ספק הוא מקור אחר ---');
  const byVendor = new Map();
  for (const key of ['zeroPrice', 'noImage', 'smallImage', 'noDesc']) {
    for (const r of buckets.ACTIVE[key]) {
      const v = r.vendor || '(בלי ספק)';
      if (!byVendor.has(v)) byVendor.set(v, {});
      byVendor.get(v)[key] = (byVendor.get(v)[key] || 0) + 1;
    }
  }
  const vendors = [...byVendor.entries()].sort((a, b) =>
    Object.values(b[1]).reduce((s, x) => s + x, 0) - Object.values(a[1]).reduce((s, x) => s + x, 0));
  console.log(pad('ספק', 26) + pad('מחיר 0', 9) + pad('בלי תמונה', 11) + pad('תמונה קטנה', 12) + 'בלי תיאור');
  for (const [v, c] of vendors.slice(0, 14)) {
    console.log(pad(v.slice(0, 24), 26) + pad(String(c.zeroPrice || 0), 9) + pad(String(c.noImage || 0), 11)
      + pad(String(c.smallImage || 0), 12) + String(c.noDesc || 0));
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ total, buckets, dupes, dupesLive }, null, 2));
    console.log(`\nנכתב ${JSON_OUT}`);
  }
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
