#!/usr/bin/env node
/**
 * משווה קטלוג ספק מול מה שכבר קיים בחנות, ומחלק לשלוש קבוצות:
 * מה שקיים ואפשר להשלים לו מחיר, מה שחדש ואפשר לייבא, ומה שמצריך עין.
 *
 *   node scripts/match-supplier-catalogue.js fetaya-catalogue.json --vendor "פתיה"
 *
 * למה זה קיים: בלי זה ייבוא קטלוג ספק מייצר כפילויות. לחנות יש כבר 625
 * מוצרי פתיה, ולקטלוג של פתיה יש 910 — ההפרש אינו 285 מוצרים חדשים, כי
 * חלק מהשמות שונים במקצת בין השניים.
 *
 * ההשוואה היא על שם מנורמל, ובמפורש **בלי למחוק מספרים**: אצל פתיה השמות
 * נבדלים ביניהם בהספק ובמידות בלבד — DARYA 18W מול 28W מול 36W — ולכן
 * נרמול שמסיר ספרות היה ממזג מוצרים שונים לאותו מפתח ומייצר גם כפילויות
 * וגם מחירים שגויים.
 *
 * מה שלא נחתך אוטומטית: כל דמיון שאינו זהות מדויקת יוצא לקבוצת "לבדיקה"
 * עם הציון והמועמד, ולא מוכרע כאן. בקטלוג של גופי תאורה, ההבדל בין התאמה
 * נכונה לשגויה הוא לרוב ספרה אחת.
 *
 * קורא בלבד. לא כותב לחנות.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const file = args[0];
const venIdx = args.indexOf('--vendor');
const VENDOR = venIdx >= 0 ? args[venIdx + 1] : null;

if (!file) {
  console.error('שימוש: node scripts/match-supplier-catalogue.js <קטלוג.json> [--vendor "שם"]');
  process.exit(1);
}

function readEnvValue(key) {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.split('=').slice(1).join('=').trim() : null;
}

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const TOKEN = readEnvValue('EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN');

async function storefront(query, variables) {
  const res = await fetch(`https://${STORE_DOMAIN}/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

/**
 * נרמול שם לצורך השוואה.
 *
 * מסיר שמות יצרן, מרכאות בכל הווריאנטים שלהן, וסימני פיסוק — ומשאיר
 * ספרות ואותיות לטיניות, שהן מה שמבדיל דגם מדגם.
 */
function norm(s) {
  return String(s)
    .replace(/FETAYA|פתיה|NISKO|ניסקו|יעקבי|טמבור|נירלט/gi, ' ')
    .replace(/["'׳״“”‘’]/g, ' ')
    .replace(/[()\[\]{}.,;:!?\/\\|+*–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1));

/** Jaccard על אסימונים — פשוט, ומספיק כדי להציע מועמד לבדיקה */
function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function main() {
  const supplier = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => r && r.name);
  console.log(`קטלוג הספק: ${supplier.length} מוצרים`);

  console.log('קורא את מוצרי החנות…');
  const store = [];
  let after = null;
  const Q = `query($after:String,$q:String){products(first:250,after:$after,query:$q){
    pageInfo{hasNextPage endCursor}
    nodes{ title handle vendor priceRange{maxVariantPrice{amount}} featuredImage{url} }}}`;
  for (;;) {
    const d = await storefront(Q, { after, q: VENDOR ? `vendor:${VENDOR}` : null });
    store.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  console.log(`  ${store.length} מוצרים בחנות${VENDOR ? ` מהיצרן "${VENDOR}"` : ''}`);

  /* אינדקס לפי שם מנורמל — התאמה מדויקת היא היחידה שנחתכת אוטומטית */
  const byNorm = new Map();
  for (const p of store) {
    const k = norm(p.title);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(p);
  }

  const exact = [];
  const duplicate = [];
  const review = [];
  const fresh = [];

  for (const s of supplier) {
    const k = norm(s.name);
    const hit = byNorm.get(k);
    if (hit) {
      const storePrice = Number(hit[0].priceRange.maxVariantPrice.amount);
      exact.push({
        supplierName: s.name,
        storeTitle: hit[0].title,
        handle: hit[0].handle,
        storePrice,
        supplierPrice: s.price,
        needsPrice: storePrice === 0 && s.price > 0,
        ambiguous: hit.length > 1,
        url: s.url,
      });
      continue;
    }
    /*
     * הכלה: כל אסימוני שם הספק נמצאים בשם שבחנות.
     *
     * זו התבנית השכיחה בפועל, ולא במקרה — השמות בחנות נושאים את הנפח או
     * המידה והשמות אצל הספק לא: "סבון דה מארסיי בתוספת ניחוח לבנדר" אצלם,
     * ואותו שם ועוד "1500 מל" אצלנו. התאמה מדויקת מפספסת את זה, ובלי הכלל
     * הזה 99 מוצרים היו מיובאים ככפילות.
     *
     * דורש לפחות שלושה אסימונים, אחרת שם קצר כמו "מקרצפת" היה נכלל בתוך
     * כל שם ארוך שמכיל את המילה.
     */
    let contained = null;
    const sTok = tokens(s.name);
    if (sTok.size >= 3) {
      for (const p of store) {
        const pTok = tokens(p.title);
        let all = true;
        for (const t of sTok) if (!pTok.has(t)) { all = false; break; }
        if (all) { contained = p; break; }
      }
    }
    if (contained) {
      duplicate.push({
        supplierName: s.name,
        storeTitle: contained.title,
        handle: contained.handle,
        storePrice: Number(contained.priceRange.maxVariantPrice.amount),
        supplierPrice: s.price,
        why: 'שם הספק מוכל בשם שבחנות',
      });
      continue;
    }

    /* מועמד הדומה ביותר בחנות; מעל 0.6 זה כנראה אותו מוצר בשם אחר */
    let best = null;
    let bestScore = 0;
    for (const p of store) {
      const sc = similarity(s.name, p.title);
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    if (bestScore >= 0.6) {
      review.push({ supplierName: s.name, candidate: best.title, score: Number(bestScore.toFixed(2)), supplierPrice: s.price, url: s.url });
    } else {
      fresh.push(s);
    }
  }

  const fillable = exact.filter((e) => e.needsPrice);
  console.log('\n' + '='.repeat(60));
  console.log(`התאמה מדויקת            : ${exact.length}`);
  console.log(`  מהם ב-0 שאפשר להשלים  : ${fillable.length}`);
  console.log(`  מהם עם מחיר שונה      : ${exact.filter((e) => e.storePrice > 0 && e.supplierPrice > 0 && Math.abs(e.storePrice - e.supplierPrice) > 0.01).length}`);
  console.log(`כפילות ודאית (הכלה)     : ${duplicate.length}`);
  console.log(`דומה, דורש עין (≥0.6)   : ${review.length}`);
  console.log(`חדש לגמרי, לייבוא       : ${fresh.length}`);
  console.log('='.repeat(60));
  const total = exact.length + duplicate.length + review.length + fresh.length;
  console.log(`
סכימה: ${total} מתוך ${supplier.length}` + (total === supplier.length ? " ✓" : "  ← לא מסתכם, יש באג"));

  const dir = path.join(__dirname, '..');
  const base = path.basename(file).replace(/\.json$/, '');
  fs.writeFileSync(path.join(dir, `${base}-match.json`), JSON.stringify({ exact, duplicate, review, fresh }, null, 2));
  console.log(`\nנשמר: ${base}-match.json`);
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
