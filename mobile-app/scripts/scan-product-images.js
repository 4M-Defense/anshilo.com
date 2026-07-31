#!/usr/bin/env node
/**
 * סורק את התמונות הראשיות של כל המוצרים בחנות ומאתר את אלה שאינן מצולמות
 * על רקע לבן — כמו הסולמות על הרקע הכחול-נייבי.
 *
 * קריאה בלבד: לא משנה דבר בחנות. משתמש בטוקן ה-Storefront שכבר קיים ב-.env
 * ומוריד תמונות מוקטנות מה-CDN הציבורי. אותה שיטת בדיקה כמו
 * check-collection-tiles.js — דגימת טבעת המסגרת של התמונה.
 *
 * הפלט: product-images-report.json — רשימת המוצרים הבעייתיים עם צבע הרקע
 * שנמדד, מקובצים לפי צבע כדי שאפשר יהיה להחליט על טיפול קבוצתי.
 *
 * הרצה:  node scripts/scan-product-images.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';
const WHITE_THRESHOLD = 250;
const WHITE_RATIO = 0.9;
const PROBE_SIZE = 48;
/** כמה הורדות במקביל — עדין ל-CDN ועדיין מהיר לאלפי תמונות */
const CONCURRENCY = 12;

function readToken() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) throw new Error('לא נמצא קובץ .env בתיקיית mobile-app');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN='));
  if (!line) throw new Error('לא נמצא הטוקן ב-.env');
  return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function storefront(token, query, variables) {
  const res = await fetch(`https://${STORE_DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Storefront API החזיר ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

const PRODUCTS_QUERY = `
  query AllProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      nodes {
        handle
        title
        vendor
        featuredImage { url }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function probeUrl(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${PROBE_SIZE}&format=png`;
}

async function checkImage(url) {
  try {
    const res = await fetch(probeUrl(url));
    if (!res.ok) return null;
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    const { width, height, data } = png;
    const at = (x, y) => {
      const i = (width * y + x) << 2;
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
    };
    const samples = [];
    for (let x = 0; x < width; x++) samples.push(at(x, 0), at(x, height - 1));
    for (let y = 0; y < height; y++) samples.push(at(0, y), at(width - 1, y));
    let white = 0;
    for (const p of samples) {
      const clear = p.a < 16;
      const bright =
        p.r >= WHITE_THRESHOLD && p.g >= WHITE_THRESHOLD && p.b >= WHITE_THRESHOLD;
      if (clear || bright) white++;
    }
    const corner = at(0, 0);
    return { ok: white / samples.length >= WHITE_RATIO, corner };
  } catch {
    return null;
  }
}

/** מריץ בדיקות במקביל בקבוצות, בלי תלות חיצונית */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** מפתח קיבוץ — צבע מעוגל לעשרות, כדי שגוונים קרובים יתאחדו לקבוצה אחת */
function colorKey({ r, g, b }) {
  const round = (v) => Math.round(v / 24) * 24;
  return `rgb(${round(r)},${round(g)},${round(b)})`;
}

async function main() {
  const token = readToken();
  console.log('קורא את כל המוצרים מהחנות…');

  const products = [];
  let after = null;
  for (;;) {
    const data = await storefront(token, PRODUCTS_QUERY, { first: 100, after });
    products.push(...data.products.nodes);
    process.stdout.write(`\r  ${products.length} מוצרים…`);
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  console.log(`\nנטענו ${products.length} מוצרים. בודק תמונות (זה ייקח כמה דקות)…\n`);

  const withImage = products.filter((p) => p.featuredImage?.url);
  let done = 0;
  const results = await mapLimit(withImage, CONCURRENCY, async (p) => {
    const verdict = await checkImage(p.featuredImage.url);
    done++;
    if (done % 100 === 0) process.stdout.write(`\r  נבדקו ${done}/${withImage.length}`);
    return { p, verdict };
  });
  console.log(`\r  נבדקו ${done}/${withImage.length}\n`);

  const problems = [];
  let clean = 0;
  let failed = 0;
  for (const { p, verdict } of results) {
    if (verdict == null) {
      failed++;
      continue;
    }
    if (verdict.ok) {
      clean++;
      continue;
    }
    problems.push({
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      image: p.featuredImage.url,
      background: verdict.corner,
    });
  }

  /* קיבוץ לפי גוון רקע — רקע אחיד לקבוצת מוצרים ⇒ טיפול אחד לכולם */
  const groups = new Map();
  for (const prob of problems) {
    const key = colorKey(prob.background);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(prob);
  }

  console.log('='.repeat(64));
  console.log(`תמונות על לבן        : ${clean}`);
  console.log(`תמונות בעייתיות      : ${problems.length}`);
  console.log(`בלי תמונה / שגיאה    : ${products.length - withImage.length + failed}`);
  console.log('='.repeat(64) + '\n');

  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log('קבוצות לפי צבע רקע (הגדולות ראשונות):\n');
  for (const [key, list] of sorted) {
    const vendors = [...new Set(list.map((x) => x.vendor))].slice(0, 4).join(', ');
    console.log(`  ${key.padEnd(20)} ${String(list.length).padStart(4)} מוצרים   (${vendors})`);
    for (const x of list.slice(0, 3)) console.log(`      · ${x.title.slice(0, 60)}`);
  }

  const outPath = path.join(__dirname, '..', 'product-images-report.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({ total: products.length, clean, problems }, null, 2),
    'utf8'
  );
  console.log(`\nהדוח נשמר: ${outPath}`);
  console.log('שלחו את הקובץ הזה בצ׳אט כדי להחליט על הטיפול.');
}

main().catch((err) => {
  console.error(`\nשגיאה: ${err.message}`);
  process.exitCode = 1;
});
