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

const crypto = require('crypto');
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
const SAMPLE_COUNT = 12;
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const vendorIdx = args.indexOf('--vendor');
const VENDOR = vendorIdx >= 0 ? args[vendorIdx + 1] : null;
/*
 * --collections "handle1,handle2" — מלבין תמונות **מחלקה** ולא מוצרים.
 * ה-handles מפורשים בכוונה; ראו את ההערה על runCollections.
 */
const colIdx = args.indexOf('--collections');
const COLLECTIONS = colIdx >= 0 ? (args[colIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : null;

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

/*
 * שני מסלולים לטוקן האדמין, והשני הוא זה שרלוונטי מ-2026.
 *
 * המסלול הישן: טוקן קבוע בסטייל `shpat_` שמעתיקים פעם אחת ממסך
 * "Reveal token once" של legacy custom app. **אי אפשר ליצור יותר כאלה** —
 * שופיפיי סגרה יצירת legacy custom apps ב-1.1.2026, והמסך ההוא לא קיים
 * באפליקציות שנוצרות ב-Dev Dashboard. אם יש בסביבה טוקן כזה הוא עדיין
 * יעבוד, ולכן הוא נשאר נתמך.
 *
 * המסלול החי: client credentials grant. מחליפים client id + secret בטוקן
 * שתקף ל-24 שעות. אין שום טעם להדביק טוקן כזה ל-.env — הוא יפוג לפני
 * ההרצה הבאה — ולכן הסקריפט מנפיק אותו בעצמו בכל הרצה.
 */
const ADMIN_TOKEN_STATIC =
  process.env.SHOPIFY_ADMIN_TOKEN || readEnvValue('SHOPIFY_ADMIN_TOKEN');
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || readEnvValue('SHOPIFY_CLIENT_ID');
const CLIENT_SECRET =
  process.env.SHOPIFY_CLIENT_SECRET || readEnvValue('SHOPIFY_CLIENT_SECRET');

/** נקבע פעם אחת ב-main, לפני שנוגעים בחנות */
let ADMIN_TOKEN = ADMIN_TOKEN_STATIC;

/**
 * מנפיק טוקן אדמין מ-client id + secret.
 *
 * שימו לב לדומיין: נקודת ה-OAuth עובדת מול `*.myshopify.com` ולא מול
 * הדומיין הפומבי של החנות.
 */
async function mintAdminToken() {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`הנפקת טוקן נכשלה (${res.status}): ${body.slice(0, 200)}`);
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`הנפקת טוקן החזירה תשובה שאינה JSON: ${body.slice(0, 200)}`);
  }
  if (!json.access_token) {
    throw new Error(`הנפקת טוקן לא החזירה access_token: ${body.slice(0, 200)}`);
  }
  const hours = json.expires_in ? Math.round(json.expires_in / 3600) : null;
  console.log(`  טוקן אדמין הונפק${hours ? ` — תקף ${hours} שעות` : ''}`);
  return json.access_token;
}

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

/**
 * שיעור השטח שיושב ב"אזור העיוור" — רחוק מגוון הרקע מספיק שהעין רואה אותו,
 * וקרוב מספיק ש-FILL_TOLERANCE ימחק אותו.
 *
 * זו הבדיקה **המקדימה** שתופסת את מחלקת הכשל שהבדיקה שלאחר מעשה מפספסת:
 * מוצר לבן על רקע כמעט-לבן. סולם KRAUSS הלבן, בקבוקי BONA הלבנים ואריח
 * "גלאים ושעונים" — שעון לבן על קרם — כולם עברו את בדיקת המסגרת ואת בדיקת
 * הגוש, ובכל זאת יצאו אכולים, כי גוף המוצר עצמו נמצא בתוך הסבילות.
 *
 * למה בדיקת הגוש לא תפסה: בשעון נשארו החוגה הכהה והכפתור האדום, ולכן הגוש
 * הגדול שרד — בזמן שהגוף הלבן נמחק. גוש חי אינו מוצר שלם.
 *
 * למה גם מדידת "פיקסלי מוצר שנהרסו" לא תפסה: היא מגדירה מוצר כרחוק מעל
 * הסבילות מהרקע, וגוף לבן על קרם אינו כזה. המדד היה עיוור לאותו דבר שהוא
 * אמור למצוא. נמדד: השעון 14.7% מול 1.7%–4.9% בשלושת האריחים ששרדו.
 */
function blindZoneRatio(png, tone) {
  let blind = 0;
  const total = png.width * png.height;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const p = pixel(png, x, y);
      if (p.a < 16) continue;
      const d = Math.abs(p.r - tone.r) + Math.abs(p.g - tone.g) + Math.abs(p.b - tone.b);
      if (d > 8 && d <= FILL_TOLERANCE) blind++;
    }
  }
  return blind / total;
}

/** מעליו התמונה נדחית: יותר מדי ממנה בלתי ניתן להבחנה מהרקע */
const BLIND_ZONE_LIMIT = 0.08;

/** האם הרקע (טבעת המסגרת) לבן או שקוף */
function borderIsWhite(png) {
  const pts = [];
  for (let x = 0; x < png.width; x++) pts.push([x, 0], [x, png.height - 1]);
  for (let y = 0; y < png.height; y++) pts.push([0, y], [png.width - 1, y]);
  let white = 0;
  let sr = 0, sg = 0, sb = 0;
  for (const [x, y] of pts) {
    const p = pixel(png, x, y);
    if (p.a < 16 || (p.r >= WHITE_THRESHOLD && p.g >= WHITE_THRESHOLD && p.b >= WHITE_THRESHOLD)) {
      white++;
    }
    sr += p.r; sg += p.g; sb += p.b;
  }
  /* הגוון הממוצע נדרש כדי להבחין בין רקע צבעוני לרקע לבן שהמוצר נוגע בקצהו */
  const tone = { r: sr / pts.length, g: sg / pts.length, b: sb / pts.length };
  return { ok: white / pts.length >= WHITE_RATIO, corner: pixel(png, 0, 0), tone };
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

/**
 * מעלה קובץ ל-staged upload ומחזיר את ה-resourceUrl.
 *
 * מופרד מ-uploadAndAttach כי גם תמונות מחלקה צריכות אותו — ראו runCollections.
 */
async function stageUpload(filename, buffer) {
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
  return target.resourceUrl;
}

async function uploadAndAttach(product, buffer) {
  const filename = `${product.handle.slice(0, 60)}-white.png`;
  const resourceUrl = await stageUpload(filename, buffer);

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
        { originalSource: resourceUrl, alt: product.featuredImage.altText || product.title, mediaContentType: 'IMAGE' },
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

/* ---------- מחלקות ---------- */

/**
 * מלבין את **תמונת המחלקה** עצמה, ולא תמונת מוצר.
 *
 * למה זה נדרש בנפרד: האפליקציה מציגה אריח מחלקה על ריבוע לבן מדויק, ואם
 * תמונת המחלקה צולמה על קרם היא מציירת מלבן בגוון אחר בתוך הלבן. ל-
 * `check-collection-tiles.js` יש פתרון לרוב המקרים — להצביע את תמונת המחלקה
 * על תמונת מוצר שכן צולמה על לבן — אבל הוא לא עובד כשהמחלקה **ריקה**, ואז
 * אין מוצר לקחת ממנו. שם הדרך היחידה היא להלבין את התמונה הקיימת.
 *
 * מקבל handles במפורש ולא סורק את כל החנות, בכוונה: אריחים רבים הם **לוגו על
 * צבע מותג** — נירלט על שחור, קראוס על אדום — והלבנה שלהם מוחקת את הלוגו.
 * בדיקת גוש-המוצר-הגדול תדחה את הגרועים שבהם, אבל אין סיבה להסתמך עליה
 * כשאפשר פשוט לבחור.
 */
async function runCollections(handles) {
  console.log(APPLY ? '⚠  מצב כתיבה — תמונות המחלקות ישונו\n' : 'הרצה יבשה — לא נוגעים בחנות\n');
  const sampleDir = path.join(__dirname, '..', 'whiten-samples');
  if (!APPLY) fs.mkdirSync(sampleDir, { recursive: true });

  for (const handle of handles) {
    const data = await admin(
      `query($h: String!) { collectionByHandle(handle: $h) { id title handle image { url } } }`,
      { h: handle }
    );
    const col = data.collectionByHandle;
    if (col == null) { console.log(`  ✗ ${handle} — לא נמצאה`); continue; }
    if (col.image == null) { console.log(`  ✗ ${col.title} — אין תמונת מחלקה`); continue; }

    const full = await loadPng(col.image.url, WORK_WIDTH);
    if (full == null) { console.log(`  ✗ ${col.title} — התמונה לא נטענה`); continue; }

    const before = borderIsWhite(full);
    if (before.ok) { console.log(`  · ${col.title} — כבר על לבן, מדלג`); continue; }
    const tone = [before.tone.r, before.tone.g, before.tone.b].map(Math.round).join(',');

    const blind = blindZoneRatio(full, before.tone);
    if (blind > BLIND_ZONE_LIMIT) {
      console.log(`  ✗ ${col.title} — נדחתה: ${(blind * 100).toFixed(1)}% מהתמונה בלתי ניתן להבחנה מהרקע`);
      continue;
    }

    const original = PNG.sync.write(full);
    const result = whitenBackground(full);
    if (result == null) { console.log(`  ✗ ${col.title} — נדחתה: המוצר בגוון הרקע`); continue; }
    if (!borderIsWhite(full).ok) { console.log(`  ✗ ${col.title} — נדחתה: המסגרת נשארה צבועה`); continue; }

    const buffer = PNG.sync.write(full);
    if (!APPLY) {
      const label = col.title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40);
      fs.writeFileSync(path.join(sampleDir, `col-${label}-before.png`), original);
      fs.writeFileSync(path.join(sampleDir, `col-${label}-after.png`), buffer);
      console.log(`  ✓ ${col.title} — ${tone} → לבן  (דוגמה נשמרה)`);
      continue;
    }

    const resourceUrl = await stageUpload(`${handle.slice(0, 50)}-white.png`, buffer);
    const upd = await admin(
      `mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) { collection { id } userErrors { field message } }
      }`,
      { input: { id: col.id, image: { src: resourceUrl, altText: col.title } } }
    );
    const errs = upd.collectionUpdate.userErrors;
    if (errs?.length) { console.log(`  ✗ ${col.title} — ${errs[0].message}`); continue; }
    console.log(`  ✓ ${col.title} — ${tone} → לבן`);
  }
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
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error(
        'ל---apply דרושות הרשאות כתיבה. שימו ב-.env:\n' +
          '  SHOPIFY_CLIENT_ID=…\n' +
          '  SHOPIFY_CLIENT_SECRET=…\n' +
          'מ-Dev Dashboard → Shilo Image Tools → Settings → Credentials.\n' +
          '(טוקן `shpat_` קבוע ב-SHOPIFY_ADMIN_TOKEN עדיין נתמך, אבל אי אפשר ' +
          'ליצור אפליקציות שמנפיקות אותו מאז 1.1.2026.)'
      );
    }
    /* לפני שנוגעים בחנות, לא באמצע — כישלון הרשאות ייפול כאן ולא אחרי 90 תמונות */
    ADMIN_TOKEN = await mintAdminToken();
  }

  /* מצב מחלקות עוצר כאן — הוא לא נוגע במוצרים בכלל */
  if (COLLECTIONS != null) {
    if (!APPLY && !ADMIN_TOKEN) ADMIN_TOKEN = await mintAdminToken();
    return runCollections(COLLECTIONS);
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
  /*
   * טביעות אצבע של תמונות שכבר נדגמו.
   *
   * הרבה מוצרים בקטלוג חולקים צילום אחד — סדרת סולמות שלמה על אותה תמונה —
   * ובלי הסינון הזה שמונה ה"דוגמאות" יצאו שישה עותקים של תמונה אחת ועוד
   * שניים של אחרת. מי שמאשר את האיכות חשב שבדק שמונה מוצרים וראה שניים.
   *
   * הסינון הוא לפי תוכן ולא לפי כתובת: אותו צילום הועלה לחנות כמה פעמים
   * תחת שמות שונים, כך שכתובות שונות מחזירות בתים זהים.
   */
  const sampledHashes = new Set();

  await mapLimit(products, CONCURRENCY, async (product) => {
    const probe = await loadPng(product.featuredImage.url, PROBE_WIDTH);
    if (probe == null) return;
    if (borderIsWhite(probe).ok) {
      clean++;
      return;
    }

    const full = await loadPng(product.featuredImage.url, WORK_WIDTH);
    if (full == null) return;

    /*
     * המסגרת נבדקת שוב ברזולוציה המלאה, והפעם היא הקובעת.
     *
     * ה-probe הוא ברוחב 48. בהקטנה כזאת כל פיקסל מסגרת הוא ממוצע של עשרות
     * פיקסלים, ולכן מוצר שנוגע בקצה הפריים מרטיב את המסגרת בגוון ביניים
     * שנופל מתחת ל-250. התוצאה: תמונות עם רקע לבן לגמרי נכשלות במבחן
     * היחס ונכנסות לרשימת המועמדים. נמדד על שתים-עשרה דוגמאות מהקטלוג —
     * גוון המסגרת שלהן 254–255 והיחס המלא 96%–100%, ובכל זאת כולן נבחרו.
     *
     * להלבין אותן זה לא שיפור אלא נזק קטן: אין רקע צבעוני להסיר, אז מה
     * שנמחק הוא ההצללה הרכה על מוצרים לבנים — סולם KRAUSS לבן ובקבוקי BONA
     * לבנים איבדו כך 0.24%–0.34% מפיקסלי המוצר, שנדחפו ללבן מלא.
     *
     * הבדיקה עולה כלום: `full` כבר נטען, ו-borderIsWhite כבר רץ עליו
     * ממילא אחרי ההלבנה. זו אותה בדיקה, רק מוקדם מספיק כדי למנוע.
     */
    const border = borderIsWhite(full);
    if (border.ok) {
      clean++;
      return;
    }

    const before = APPLY ? null : PNG.sync.write(full);
    const result = whitenBackground(full);
    if (result == null) {
      unsafe.push(product.title);
      skipped++;
      return;
    }

    /*
     * בדיקה שלאחר מעשה: אחרי ההלבנה המסגרת חייבת להיות לבנה.
     *
     * whitenBackground מחליט מהו גוון הרקע לפי ממוצע המסגרת, ומחליף כל מה
     * שקרוב אליו. כשהתמונה אינה צילום מוצר על רקע אחיד — למשל טבלת מפרט
     * עם קווים דקים וטקסט — הממוצע חסר משמעות, ההחלפה מפספסת, והמסגרת
     * נשארת צבועה. זה בדיוק מה שקרה ל"סולם עץ רב מקצועי 105606", שיצא עם
     * פינה בגוון 195,207,221 ועם 886 פיקסלים צבועים על הקצה.
     *
     * הבדיקה הזאת עולה כלום ותופסת את כל המשפחה הזאת של כשלים לפני
     * שהתמונה נכתבת לחנות, במקום לקוות שמישהו יבחין בזה בדוגמאות.
     */
    if (!borderIsWhite(full).ok) {
      unsafe.push(`${product.title} — המסגרת נשארה צבועה אחרי ההלבנה`);
      skipped++;
      return;
    }

    const buffer = PNG.sync.write(full);

    /* רקע נעול נרחב — התמונה שווה בחינה בעין לפני שמחליפים בחנות */
    const isRisky = result.extraRatio > 0.2;
    if (isRisky) risky.push({ title: product.title, ratio: result.extraRatio });

    /*
     * גוון הרקע שהוחלף. מי שמאשר צריך להבחין בין שני דברים שונים לגמרי
     * שנספרים כאן יחד: החלפת רקע צבעוני אמיתי — הסולמות של חגית על נייבי
     * 51,62,118 — לעומת תמונה שרקעה כבר לבן והמוצר רק נוגע בקצה הפריים,
     * שבה כל מה שההלבנה עושה הוא למחוק הצללה רכה. הראשון שיפור, השני
     * החלטה על מראה הקטלוג. הדוח מפריד ביניהם.
     */
    const entry = { title: product.title, tone: border.tone };

    if (APPLY) {
      try {
        await uploadAndAttach(product, buffer);
        fixed.push(entry);
        process.stdout.write(`\r  הולבנו ${fixed.length}`);
      } catch (err) {
        console.error(`\n  ✗ ${product.title.slice(0, 40)} — ${err.message}`);
      }
    } else {
      fixed.push(entry);
      /* בדיקה והוספה באותה פעימה סינכרונית — mapLimit רץ במקביל */
      const imageHash = crypto.createHash('md5').update(before).digest('hex');
      /*
       * תמונה עם רקע נעול נרחב נדגמת תמיד, מחוץ למכסה.
       *
       * הדוח מדפיס "רקע נעול נרחב — כדאי להציץ בדוגמאות של אלה" והפנה עד
       * עכשיו לדוגמאות שלא נכתבו: המכסה מתמלאת לפי סדר ההגעה מ-mapLimit,
       * והמסוכנות כמעט לעולם אינן שתים-עשרה הראשונות. כלומר מי שאישר
       * איכות אישר בדיוק את התמונות המשעממות, ולא ראה אף אחת מאלה שבגללן
       * הודפסה האזהרה. זה אותו כשל שהדה-דופליקציה כבר תיקנה פעם אחת —
       * דוגמה שנראית מייצגת ואינה.
       */
      if (!sampledHashes.has(imageHash) && (isRisky || samples < SAMPLE_COUNT)) {
        sampledHashes.add(imageHash);
        /* קידומת לטינית, כדי שאפשר יהיה למיין ולזהות בלי לנתח עברית */
        const n = isRisky ? `locked${Math.round(result.extraRatio * 100)}` : ++samples;
        /* השם נושא את המוצר, אחרת אי אפשר לדעת על מה מסתכלים */
        const label = product.title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 45);
        fs.writeFileSync(path.join(sampleDir, `${n}-${label}-before.png`), before);
        fs.writeFileSync(path.join(sampleDir, `${n}-${label}-after.png`), buffer);
      }
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`רקע לבן כבר             : ${clean}`);
  console.log(APPLY ? `הולבנו בחנות            : ${fixed.length}` : `מתאימים להלבנה          : ${fixed.length}`);
  console.log(`רקע לא אחיד — לא נגעתי  : ${skipped}`);
  console.log('='.repeat(60));

  /* רשימה שנחתכת בשקט נקראת כמו רשימה מלאה — תמיד אומרים כמה הושמטו */
  const listTail = (n) => (n > 10 ? `  … ועוד ${n - 10}\n` : '');

  /* רקע שכל ערוציו ≥250 הוא לבן בפועל; מה שיימחק שם הוא הצללה, לא רקע */
  const isNearWhite = (t) => t.r >= 250 && t.g >= 250 && t.b >= 250;
  const coloured = fixed.filter((f) => !isNearWhite(f.tone));
  const shadowOnly = fixed.filter((f) => isNearWhite(f.tone));

  if (fixed.length > 0) {
    console.log(`\nרקע צבעוני שיוחלף בלבן   : ${coloured.length}`);
    for (const f of coloured.slice(0, 10)) {
      const t = f.tone;
      console.log(`  · ${[t.r, t.g, t.b].map((v) => Math.round(v)).join(',')} — ${f.title.slice(0, 46)}`);
    }
    process.stdout.write(listTail(coloured.length));

    console.log(`\nרקע לבן כבר, תימחק רק הצללה : ${shadowOnly.length}`);
    for (const f of shadowOnly.slice(0, 10)) console.log(`  · ${f.title.slice(0, 54)}`);
    process.stdout.write(listTail(shadowOnly.length));
  }

  if (risky.length > 0) {
    console.log(`\nרקע נעול נרחב (${risky.length}) — כל אחת מאלה נדגמה, בדקו אותן:`);
    for (const r of risky.slice(0, 10)) {
      console.log(`  · ${(r.ratio * 100).toFixed(0)}% — ${r.title.slice(0, 52)}`);
    }
    process.stdout.write(listTail(risky.length));
  }

  if (unsafe.length > 0) {
    console.log(`\nרקע לא אחיד (${unsafe.length}) — צריך טיפול ידני אם חשוב:`);
    for (const t of unsafe.slice(0, 10)) console.log(`  · ${t.slice(0, 58)}`);
    process.stdout.write(listTail(unsafe.length));
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
