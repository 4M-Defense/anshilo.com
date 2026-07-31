#!/usr/bin/env node
/**
 * הופך רקעים צבעוניים בתמונות מוצרים לרקע לבן — למשל צילומי הסולמות של חגית,
 * שמצולמים על רקע כחול-נייבי ולכן בולטים בתוך הריבוע הלבן באתר ובאפליקציה.
 *
 * הרקע מזוהה לפי הגוון האחיד של המסגרת, וכל פיקסל בגוון הזה מולבן — כולל
 * רווחים שנעולים בתוך המוצר, כמו הרווחים בין שלבי הסולם. פיקסלי הקצה עוברים
 * ריכוך כדי לא להשאיר הילה כחולה. תמונה שהמוצר בה בגוון הרקע נדחית ולא
 * נהרסת; ראו את ההערה על whitenBackground.
 *
 * ברירת המחדל היא **הרצה יבשה**: לא נוגעים בחנות. הסקריפט שומר תיקיית
 * דוגמאות עם לפני/אחרי כדי שאפשר יהיה לשפוט את האיכות, ורק אחרי אישור
 * מריצים עם --apply.
 *
 *   node scripts/whiten-product-images.js                     # סריקה + דוגמאות
 *   node scripts/whiten-product-images.js --vendor "חגית"      # רק יצרן אחד
 *   node scripts/whiten-product-images.js --apply             # כתיבה לחנות
 *
 * ל---apply דרוש טוקן Admin API עם ההרשאות write_products ו-write_files,
 * במשתנה הסביבה SHOPIFY_ADMIN_TOKEN. אותה אפליקציה מותאמת שממנה הופק טוקן
 * ה-Storefront יכולה להנפיק גם אותו (Settings → Apps → Develop apps).
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

/** רוחב העיבוד. 1200 שומר איכות קטלוג ומגביל את גודל ההעלאה. */
const WORK_WIDTH = 1200;
/** רוחב הבדיקה המהירה — מספיק כדי להחליט אם הרקע לבן */
const PROBE_WIDTH = 48;
const WHITE_THRESHOLD = 250;
const WHITE_RATIO = 0.9;
/** מרחק צבע מותר מגוון הרקע (סכום ההפרשים בשלושת הערוצים) */
const FILL_TOLERANCE = 62;
/** כמה דוגמאות לפני/אחרי לשמור בהרצה יבשה */
const SAMPLE_COUNT = 8;
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const vendorIdx = args.indexOf('--vendor');
const VENDOR = vendorIdx >= 0 ? args[vendorIdx + 1] : null;

/* ---------- טוקנים ---------- */

function readEnvValue(key) {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  if (!line) return null;
  return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

const STOREFRONT_TOKEN =
  process.env.EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ||
  readEnvValue('EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN');
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || readEnvValue('SHOPIFY_ADMIN_TOKEN');

/* ---------- API ---------- */

async function storefront(query, variables) {
  const res = await fetch(`https://${STORE_DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Storefront API החזיר ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function admin(query, variables) {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Admin API החזיר ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]));
  return json.data;
}

const PRODUCTS_QUERY = `
  query Products($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      nodes {
        id
        handle
        title
        vendor
        featuredImage { url altText }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/* ---------- תמונה ---------- */

function cdnUrl(url, width) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${width}&format=png`;
}

async function loadPng(url, width) {
  const res = await fetch(cdnUrl(url, width));
  if (!res.ok) return null;
  return PNG.sync.read(Buffer.from(await res.arrayBuffer()));
}

function pixel(png, x, y) {
  const i = (png.width * y + x) << 2;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3], i };
}

/** האם הרקע (טבעת המסגרת) לבן או שקוף */
function borderIsWhite(png) {
  const pts = [];
  for (let x = 0; x < png.width; x++) pts.push([x, 0], [x, png.height - 1]);
  for (let y = 0; y < png.height; y++) pts.push([0, y], [png.width - 1, y]);
  let white = 0;
  for (const [x, y] of pts) {
    const p = pixel(png, x, y);
    if (p.a < 16 || (p.r >= WHITE_THRESHOLD && p.g >= WHITE_THRESHOLD && p.b >= WHITE_THRESHOLD)) {
      white++;
    }
  }
  return { ok: white / pts.length >= WHITE_RATIO, corner: pixel(png, 0, 0) };
}

/**
 * מלבין את רקע הסטודיו.
 *
 * ההחלפה גלובלית ולא מילוי-שיטפון מהמסגרת, וזה תיקון של גרסה קודמת שנכשלה
 * בדיוק על המוצרים שבשבילם נכתב הסקריפט: בצילום סולם, הרווחים בין השלבים
 * מוקפים לגמרי במסגרת הסולם, ולכן זחילה מהמסגרת פנימה **לא מגיעה אליהם** —
 * והתוצאה הייתה מלבן כחול בכל רווח. בצילום קטלוג על רקע אחיד, כל פיקסל
 * בגוון הרקע הוא רקע, גם אם הוא מוקף במוצר.
 *
 * מה שמחליף את מילוי-השיטפון כהגנה: אחרי ההחלפה נמדד גוש המוצר הגדול ביותר
 * שנשאר. מוצר שצבעו כצבע הרקע (כלי כחול על רקע כחול) מתפורר לרסיסים, הגוש
 * הגדול מתכנס לאפס — ואז התמונה נדחית במקום להיהרס. מוחזר גם `extraRatio`,
 * שיעור מה שנמחק מעבר לרקע הרציף, כדי לסמן תמונות שכדאי לבחון בעין.
 */
function whitenBackground(png) {
  const { width, height, data } = png;
  const total = width * height;

  const seeds = [];
  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));
  for (let x = 0; x < width; x += stepX) seeds.push(pixel(png, x, 0), pixel(png, x, height - 1));
  for (let y = 0; y < height; y += stepY) seeds.push(pixel(png, 0, y), pixel(png, width - 1, y));

  const sum = seeds.reduce((a, p) => ({ r: a.r + p.r, g: a.g + p.g, b: a.b + p.b }), { r: 0, g: 0, b: 0 });
  const bg = {
    r: Math.round(sum.r / seeds.length),
    g: Math.round(sum.g / seeds.length),
    b: Math.round(sum.b / seeds.length),
  };

  const dist = (p) => Math.abs(p.r - bg.r) + Math.abs(p.g - bg.g) + Math.abs(p.b - bg.b);

  /* רקע לא אחיד (צילום סביבה, גרדיאנט חזק) — לא נוגעים */
  const spread = seeds.reduce((m, p) => Math.max(m, dist(p)), 0) / 3;
  if (spread > 40) return null;

  /* מסמנים כל פיקסל בגוון הרקע — כולל רווחים נעולים בתוך המוצר */
  const isBg = new Uint8Array(total);
  let bgCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = pixel(png, x, y);
      if (p.a < 16 || dist(p) <= FILL_TOLERANCE) {
        isBg[width * y + x] = 1;
        bgCount++;
      }
    }
  }
  if (bgCount === 0) return null;

  /* הגוש הרציף מהמסגרת — לצורך extraRatio בלבד, לא להחלטה מה למחוק */
  const reached = new Uint8Array(total);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(width * 0 + x, width * (height - 1) + x);
  for (let y = 0; y < height; y++) stack.push(width * y, width * y + width - 1);
  let reachedCount = 0;
  while (stack.length > 0) {
    const key = stack.pop();
    if (reached[key] || !isBg[key]) continue;
    reached[key] = 1;
    reachedCount++;
    const x = key % width;
    const y = (key - x) / width;
    if (x + 1 < width) stack.push(key + 1);
    if (x > 0) stack.push(key - 1);
    if (y + 1 < height) stack.push(key + width);
    if (y > 0) stack.push(key - width);
  }

  /* הגוש הגדול ביותר שנשאר — המוצר. אם הוא זעיר, המוצר עצמו בצבע הרקע. */
  const seen = new Uint8Array(total);
  let largestSubject = 0;
  for (let start = 0; start < total; start++) {
    if (isBg[start] || seen[start]) continue;
    let size = 0;
    const q = [start];
    seen[start] = 1;
    while (q.length > 0) {
      const key = q.pop();
      size++;
      const x = key % width;
      const y = (key - x) / width;
      const push = (k) => {
        if (k >= 0 && k < total && !seen[k] && !isBg[k]) {
          seen[k] = 1;
          q.push(k);
        }
      };
      if (x + 1 < width) push(key + 1);
      if (x > 0) push(key - 1);
      if (y + 1 < height) push(key + width);
      if (y > 0) push(key - width);
    }
    if (size > largestSubject) largestSubject = size;
  }
  /* פחות מ-3% — לא נשאר מוצר של ממש. עדיף לדחות מלהרוס. */
  if (largestSubject < total * 0.03) return null;

  for (let key = 0; key < total; key++) {
    if (!isBg[key]) continue;
    const i = key << 2;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }

  /*
   * ריכוך הילה: פיקסל שלא סומן כרקע אבל רוב שכניו כן, ועדיין נוטה לגוון
   * הרקע, הוא שארית אנטי-אליאסינג של הקצה. בלי זה נשאר קו כחול דק סביב המוצר.
   */
  let softened = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const key = width * y + x;
      if (isBg[key]) continue;
      const p = pixel(png, x, y);
      if (dist(p) > FILL_TOLERANCE * 2) continue;
      const neighbours =
        isBg[key + 1] + isBg[key - 1] + isBg[key + width] + isBg[key - width];
      if (neighbours >= 3) {
        data[p.i] = 255;
        data[p.i + 1] = 255;
        data[p.i + 2] = 255;
        data[p.i + 3] = 255;
        softened++;
      }
    }
  }

  return {
    replaced: bgCount + softened,
    bg,
    /* שיעור הרקע שהיה נעול בתוך המוצר — גבוה מסמן תמונה ששווה לבחון בעין */
    extraRatio: (bgCount - reachedCount) / total,
  };
}

/* ---------- העלאה ---------- */

async function uploadAndAttach(product, buffer) {
  const filename = `${product.handle.slice(0, 60)}-white.png`;
  const staged = await admin(
    `mutation Stage($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        { filename, mimeType: 'image/png', httpMethod: 'POST', resource: 'IMAGE' },
      ],
    }
  );
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error('לא התקבל יעד העלאה');

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buffer], { type: 'image/png' }), filename);
  const up = await fetch(target.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`העלאה נכשלה: ${up.status}`);

  const created = await admin(
    `mutation AddMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id } }
        mediaUserErrors { field message }
      }
    }`,
    {
      productId: product.id,
      media: [
        { originalSource: target.resourceUrl, alt: product.featuredImage.altText || product.title, mediaContentType: 'IMAGE' },
      ],
    }
  );
  const errs = created.productCreateMedia.mediaUserErrors;
  if (errs?.length) throw new Error(errs[0].message);

  /*
   * המדיה החדשה נוספת בסוף. כדי שהיא תהיה התמונה הראשית מזיזים אותה לראש
   * הרשימה — ולא מוחקים את המקורית, כדי שתמיד תהיה דרך חזרה.
   */
  const newId = created.productCreateMedia.media[0].id;
  await admin(
    `mutation Reorder($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        userErrors { field message }
      }
    }`,
    { id: product.id, moves: [{ id: newId, newPosition: '0' }] }
  );
}

/* ---------- ראשי ---------- */

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

async function main() {
  if (!STOREFRONT_TOKEN) throw new Error('חסר EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN');
  if (APPLY && !ADMIN_TOKEN) {
    throw new Error(
      'ל---apply דרוש SHOPIFY_ADMIN_TOKEN (הרשאות write_products ו-write_files).'
    );
  }

  console.log(APPLY ? '⚠  מצב כתיבה — התמונות בחנות ישונו\n' : 'הרצה יבשה — לא נוגעים בחנות\n');

  const products = [];
  let after = null;
  for (;;) {
    const data = await storefront(PRODUCTS_QUERY, {
      first: 100,
      after,
      query: VENDOR ? `vendor:${VENDOR}` : null,
    });
    products.push(...data.products.nodes.filter((p) => p.featuredImage?.url));
    process.stdout.write(`\r  נטענו ${products.length} מוצרים…`);
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  console.log(`\n  ${products.length} מוצרים עם תמונה. בודק רקעים…\n`);

  const sampleDir = path.join(__dirname, '..', 'whiten-samples');
  if (!APPLY) fs.mkdirSync(sampleDir, { recursive: true });

  let clean = 0;
  let skipped = 0;
  let samples = 0;
  const fixed = [];
  const unsafe = [];
  const risky = [];

  await mapLimit(products, CONCURRENCY, async (product) => {
    const probe = await loadPng(product.featuredImage.url, PROBE_WIDTH);
    if (probe == null) return;
    if (borderIsWhite(probe).ok) {
      clean++;
      return;
    }

    const full = await loadPng(product.featuredImage.url, WORK_WIDTH);
    if (full == null) return;
    const before = APPLY ? null : PNG.sync.write(full);
    const result = whitenBackground(full);
    if (result == null) {
      unsafe.push(product.title);
      skipped++;
      return;
    }
    const buffer = PNG.sync.write(full);

    /* רקע נעול נרחב — התמונה שווה בחינה בעין לפני שמחליפים בחנות */
    if (result.extraRatio > 0.2) risky.push({ title: product.title, ratio: result.extraRatio });

    if (APPLY) {
      try {
        await uploadAndAttach(product, buffer);
        fixed.push(product.title);
        process.stdout.write(`\r  הולבנו ${fixed.length}`);
      } catch (err) {
        console.error(`\n  ✗ ${product.title.slice(0, 40)} — ${err.message}`);
      }
    } else {
      fixed.push(product.title);
      if (samples < SAMPLE_COUNT) {
        const n = ++samples;
        fs.writeFileSync(path.join(sampleDir, `${n}-before.png`), before);
        fs.writeFileSync(path.join(sampleDir, `${n}-after.png`), buffer);
      }
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`רקע לבן כבר             : ${clean}`);
  console.log(APPLY ? `הולבנו בחנות            : ${fixed.length}` : `מתאימים להלבנה          : ${fixed.length}`);
  console.log(`רקע לא אחיד — לא נגעתי  : ${skipped}`);
  console.log('='.repeat(60));

  if (risky.length > 0) {
    console.log('\nרקע נעול נרחב — כדאי להציץ בדוגמאות של אלה:');
    for (const r of risky.slice(0, 10)) {
      console.log(`  · ${(r.ratio * 100).toFixed(0)}% — ${r.title.slice(0, 52)}`);
    }
  }

  if (unsafe.length > 0) {
    console.log('\nרקע לא אחיד (צריך טיפול ידני אם חשוב):');
    for (const t of unsafe.slice(0, 10)) console.log(`  · ${t.slice(0, 58)}`);
  }

  if (!APPLY) {
    console.log(`\nדוגמאות לפני/אחרי נשמרו: ${sampleDir}`);
    console.log('תפתחו אותן, ואם האיכות טובה — הריצו שוב עם --apply');
  }
}

main().catch((err) => {
  console.error(`\nשגיאה: ${err.message}`);
  process.exitCode = 1;
});
