#!/usr/bin/env node
/**
 * מאתר אריחי מחלקות שהתמונה שלהם אינה מצולמת על לבן.
 *
 * למה זה נחוץ: האפליקציה מציגה כל תמונת מחלקה ב-contain על ריבוע לבן מדויק
 * (#FFFFFF). תמונה שמצולמת על לבן מתמזגת עם הריבוע ונראית נקייה; תמונה שמצולמת
 * על רקע קרם/אפור מציירת מלבן בגוון אחר בתוך הלבן, וזה מה שנראה רע — גם
 * באפליקציה וגם באתר, כי שניהם קוראים את אותה תמונה.
 *
 * הסקריפט קורא בלבד. הוא לא משנה דבר בחנות ולא צריך טוקן אדמין: הוא משתמש
 * בטוקן ה-Storefront שכבר קיים ב-.env, ומוריד את התמונות מה-CDN הציבורי.
 *
 * לכל מחלקה בעייתית הוא גם סורק את תמונות המוצרים שבתוכה ומציע חלופות שכן
 * מצולמות על לבן, כדי שאפשר יהיה להצביע את תמונת המחלקה על אחת מהן.
 *
 * הרצה:  node scripts/check-collection-tiles.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

/* ---------- הגדרות ---------- */

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

/** מתחת לזה הפיקסל אינו נחשב לבן. 250 ולא 255 — דחיסת JPEG מזיזה קצת. */
const WHITE_THRESHOLD = 250;
/** אחוז פיקסלי המסגרת שצריכים להיות לבנים כדי שהתמונה תיחשב "על לבן" */
const WHITE_RATIO = 0.9;
/** גודל ההורדה. קטן מספיק כדי להיות מהיר, גדול מספיק כדי לדגום מסגרת. */
const PROBE_SIZE = 64;
/** כמה חלופות להציע לכל מחלקה בעייתית */
const SUGGESTIONS = 3;

/* ---------- קריאת הטוקן מ-.env ---------- */

function readToken() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('לא נמצא קובץ .env בתיקיית mobile-app');
  }
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN='));
  if (!line) {
    throw new Error('לא נמצא EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ב-.env');
  }
  return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

/* ---------- Storefront API ---------- */

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

const COLLECTIONS_QUERY = `
  query Tiles($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        handle
        title
        image { url }
        products(first: 12) {
          nodes { title featuredImage { url } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/* ---------- בדיקת לבן ---------- */

/**
 * הופך כל תמונה של שופיפיי ל-PNG קטן. `format=png` הוא פרמטר של ה-CDN, וכך
 * אפשר לפענח גם JPEG בעזרת pngjs לבד, בלי להתקין מפענח נוסף.
 */
function probeUrl(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${PROBE_SIZE}&format=png`;
}

async function isOnWhite(url) {
  const res = await fetch(probeUrl(url));
  if (!res.ok) return null;
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  const { width, height, data } = png;

  const at = (x, y) => {
    const i = (width * y + x) << 2;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };

  /* דוגמים את טבעת המסגרת — שם יושב הרקע של התמונה */
  const samples = [];
  for (let x = 0; x < width; x++) {
    samples.push(at(x, 0), at(x, height - 1));
  }
  for (let y = 0; y < height; y++) {
    samples.push(at(0, y), at(width - 1, y));
  }

  let white = 0;
  for (const p of samples) {
    /* שקוף נחשב תקין: הוא מראה את הריבוע הלבן שמתחתיו */
    const clear = p.a < 16;
    const bright =
      p.r >= WHITE_THRESHOLD && p.g >= WHITE_THRESHOLD && p.b >= WHITE_THRESHOLD;
    if (clear || bright) white++;
  }
  const ratio = white / samples.length;

  /* גוון הרקע לדיווח — הפיקסל בפינה השמאלית העליונה */
  const corner = at(0, 0);
  return { ok: ratio >= WHITE_RATIO, ratio, corner };
}

/* ---------- ראשי ---------- */

async function main() {
  const token = readToken();
  console.log('קורא את המחלקות מהחנות…\n');

  const collections = [];
  let after = null;
  for (;;) {
    const data = await storefront(token, COLLECTIONS_QUERY, { first: 50, after });
    collections.push(...data.collections.nodes);
    if (!data.collections.pageInfo.hasNextPage) break;
    after = data.collections.pageInfo.endCursor;
  }
  console.log(`נמצאו ${collections.length} מחלקות. בודק את תמונת האריח של כל אחת…\n`);

  const problems = [];
  let clean = 0;
  let empty = 0;

  for (const c of collections) {
    /* אותה לוגיקה כמו באפליקציה: תמונת המחלקה, ואם אין — תמונת מוצר מתוכה */
    const own = c.image?.url ?? null;
    const fromProduct = c.products.nodes.find((n) => n.featuredImage)?.featuredImage?.url ?? null;
    const tile = own ?? fromProduct;

    if (!tile) {
      empty++;
      continue;
    }

    const verdict = await isOnWhite(tile);
    if (verdict == null) {
      console.log(`  ? ${c.title} — לא הצלחתי להוריד את התמונה`);
      continue;
    }
    if (verdict.ok) {
      clean++;
      continue;
    }

    /* מחלקה בעייתית — מחפשים חלופות על לבן מתוך מוצרי אותה מחלקה */
    const alternatives = [];
    for (const p of c.products.nodes) {
      if (alternatives.length >= SUGGESTIONS) break;
      const url = p.featuredImage?.url;
      if (!url || url === tile) continue;
      const v = await isOnWhite(url);
      if (v?.ok) alternatives.push({ title: p.title, url });
    }

    problems.push({
      handle: c.handle,
      title: c.title,
      source: own ? 'תמונת המחלקה' : 'תמונת מוצר (גיבוי)',
      corner: verdict.corner,
      ratio: verdict.ratio,
      tile,
      alternatives,
    });
    const { r, g, b } = verdict.corner;
    console.log(
      `  ✗ ${c.title}  —  רקע rgb(${r},${g},${b}), ` +
        `${Math.round(verdict.ratio * 100)}% לבן, ${alternatives.length} חלופות`
    );
  }

  console.log('\n' + '='.repeat(64));
  console.log(`נקיות (על לבן)      : ${clean}`);
  console.log(`בעייתיות            : ${problems.length}`);
  console.log(`בלי תמונה בכלל      : ${empty}`);
  console.log('='.repeat(64) + '\n');

  if (problems.length === 0) {
    console.log('אין מה לתקן — כל האריחים על לבן.');
    return;
  }

  console.log('פירוט, כולל חלופות להצבעה:\n');
  for (const p of problems) {
    const { r, g, b } = p.corner;
    console.log(`■ ${p.title}   (${p.handle})`);
    console.log(`  מקור התמונה : ${p.source}`);
    console.log(`  רקע נוכחי   : rgb(${r},${g},${b})`);
    console.log(`  התמונה      : ${p.tile}`);
    if (p.alternatives.length === 0) {
      console.log('  חלופות      : אין — כל תמונות המוצרים במחלקה אינן על לבן');
    } else {
      p.alternatives.forEach((a, i) => {
        console.log(`  חלופה ${i + 1}    : ${a.title}`);
        console.log(`               ${a.url}`);
      });
    }
    console.log('');
  }

  const outPath = path.join(__dirname, '..', 'collection-tiles-report.json');
  fs.writeFileSync(outPath, JSON.stringify(problems, null, 2), 'utf8');
  console.log(`הדוח נשמר גם כ-JSON: ${outPath}`);
  console.log('שלח את הקובץ הזה כדי שאפשר יהיה להחליף את התמונות בחנות.');
}

main().catch((err) => {
  console.error(`\nשגיאה: ${err.message}`);
  process.exitCode = 1;
});
