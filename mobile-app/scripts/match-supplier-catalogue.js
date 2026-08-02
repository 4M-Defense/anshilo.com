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

/**
 * נרמול מקט.
 *
 * אותו מקט נכתב אחרת בשני הצדדים — "PM 10E" מול "PM-10E" מול "pm10e" —
 * ולכן משאירים אותיות וספרות בלבד. מקט קצר מדי נזרק: "1" או "AB" מופיעים
 * בעשרות מוצרים ואינם מזהים, והתאמה עליהם גרועה מאי-התאמה.
 */
function normSku(s) {
  const v = String(s ?? '').replace(/[^0-9a-zA-Z֐-׿]/g, '').toUpperCase();
  return v.length >= 3 ? v : null;
}

/**
 * מפתחות חיבור לפי ספק, למקרים שבהם המקטים של שני הצדדים אינם מאותה מערכת.
 *
 * בלנסטון היא הדוגמה: בחנות המקט הוא מספר פנימי לכל מידה (4112286) או
 * ברקוד (9315891452762), ואצל הספק קוד מובנה — BLM1940-B74-070, כלומר
 * BL, M לגברים, דגם 1940, גוון B74, מידה 070. שתי מערכות שאינן נפגשות,
 * ולכן התאמה לפי מקט החזירה אפס מתוך 73.
 *
 * מה שכן משותף הוא מספר הדגם, והוא גם מזהה אמיתי — בלנסטון 585 ו-587 הם
 * נעליים שונות. בחנות הוא כתוב "דגם 585" ואצל הספק בתוך המקט. עם המפתח
 * הזה נמצאו שבעה דגמים חופפים, כלומר 12 שורות ספק שכבר קיימות: בלעדיו
 * הן היו מיובאות ככפילות.
 */
const KEYS = [
  {
    vendors: ['בלאנדסטון', 'בלנסטון', 'blundstone'],
    name: 'דגם',
    store: (t) => (t.match(/דגם\s+([0-9]{3,4})/) || [])[1] ?? null,
    supplier: (s) =>
      (String(s.sku || '').match(/^BL[A-Z]([0-9]{3,4})/) || [])[1] ??
      (String(s.name || '').match(/Blundstone\s+([0-9]{3,4})/i) || [])[1] ??
      null,
  },
];

const keyFor = (vendor) =>
  KEYS.find((k) => k.vendors.some((v) => String(vendor || '').toLowerCase().includes(v.toLowerCase()))) ?? null;

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
  /* המקטים נלקחים מהווריאנטים, כי בשופיפיי המקט יושב על הווריאנט ולא על המוצר */
  const Q = `query($after:String,$q:String){products(first:250,after:$after,query:$q){
    pageInfo{hasNextPage endCursor}
    nodes{ title handle vendor priceRange{maxVariantPrice{amount}} featuredImage{url}
           variants(first:20){nodes{sku}} }}}`;
  for (;;) {
    const d = await storefront(Q, { after, q: VENDOR ? `vendor:${VENDOR}` : null });
    store.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  console.log(`  ${store.length} מוצרים בחנות${VENDOR ? ` מהיצרן "${VENDOR}"` : ''}`);

  /*
   * סינון לפי יצרן שמחזיר אפס הוא כמעט תמיד שם שגוי, לא ספק חדש — ואם
   * ממשיכים ממנו, *כל* מוצרי הספק נראים חדשים והייבוא מייצר כפילויות.
   * זה קרה: בקשה ל"בלנסטון" החזירה אפס כי בחנות כתוב "בלאנדסטון", ואחת
   * עשרה נעליים שכבר קיימות סומנו לייבוא. לכן נופלים חזרה לכל החנות —
   * איטי יותר, אבל יותר מועמדים משמעו פחות "חדש" שגוי.
   */
  if (VENDOR && store.length === 0) {
    console.log(`\n  ⚠ אין בחנות אף מוצר מהיצרן "${VENDOR}" — כנראה שם שונה בחנות.`);
    console.log('    משווה מול כל החנות במקום, כדי לא לייבא כפילויות.\n');
    let a2 = null;
    for (;;) {
      const d = await storefront(Q, { after: a2, q: null });
      store.push(...d.products.nodes);
      if (!d.products.pageInfo.hasNextPage) break;
      a2 = d.products.pageInfo.endCursor;
    }
    console.log(`  ${store.length} מוצרים בחנות (כל היצרנים)`);
  }

  /* אינדקס לפי שם מנורמל — התאמה מדויקת היא היחידה שנחתכת אוטומטית */
  const byNorm = new Map();
  const bySku = new Map();
  const byKey = new Map();
  const KEY = keyFor(VENDOR) ?? keyFor(store[0]?.vendor);
  for (const p of store) {
    const k = norm(p.title);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(p);
    for (const v of p.variants?.nodes ?? []) {
      const sk = normSku(v.sku);
      if (sk && !bySku.has(sk)) bySku.set(sk, p);
    }
    if (KEY) {
      const kk = KEY.store(p.title);
      if (kk && !byKey.has(kk)) byKey.set(kk, p);
    }
  }
  if (KEY) console.log(`  מפתח נוסף לספק הזה: ${KEY.name} — ${byKey.size} ערכים בחנות`);
  /*
   * כמה מהצדדים בכלל נושאים מקט — בלי המספר הזה אי אפשר לדעת אם התאמה
   * לפי מקט אפשרית כאן או שכל העבודה נופלת בחזרה על שמות.
   */
  const supWithSku = supplier.filter((s) => normSku(s.sku)).length;
  console.log(`  מקטים: ${bySku.size} בחנות | ${supWithSku} מתוך ${supplier.length} אצל הספק`);

  /*
   * סף הדמיון שמעליו מוצר יוצא לבדיקה אנושית במקום להיחשב חדש.
   *
   * 0.6 כשיש מקטים בחנות, ו-0.5 כשאין אף אחד. ההיגיון: כשקיים מפתח מדויק
   * הוא תופס את רוב הזהויות, והשם משמש רק כרשת ביטחון. כשאין מקט בכלל —
   * וזה המצב אצל יעקבי, אפס מתוך 223 — השם הוא הסימן היחיד, ו-25 מוצרים
   * יושבים שם בדיוק בין 0.50 ל-0.59. לייבא אותם כחדשים פירושו להמר עליהם.
   */
  const THRESHOLD = bySku.size === 0 ? 0.5 : 0.6;
  if (THRESHOLD !== 0.6) console.log(`  אין מקטים בחנות — סף הבדיקה מוקשח ל-${THRESHOLD}`);

  const exact = [];
  const duplicate = [];
  const review = [];
  const fresh = [];
  let bySkuCount = 0;

  for (const s of supplier) {
    /*
     * מקט קודם לשם, תמיד.
     *
     * זה לא ייעול אלא תיקון של טעות מדודה: התאמה לפי שם נתנה DARYA 36W
     * מול DARYA 28W בציון 0.89, ושבילית 4.4W מול 44W. שם הוא ניחוש, מקט
     * הוא מפתח. ובלנסטון הראתה את הצד השני של אותה בעיה — שם היצרן בחנות
     * הוא "בלאנדסטון" ואצל הספק "בלנסטון", ודי בהבדל הזה כדי שהשוואה לפי
     * שם תחזיר אפס התאמות ותייבא 73 מוצרים שאחד עשר מהם כבר קיימים.
     */
    const sSku = normSku(s.sku);
    const skuHit = sSku ? bySku.get(sSku) : null;
    if (skuHit) {
      const storePrice = Number(skuHit.priceRange.maxVariantPrice.amount);
      bySkuCount++;
      exact.push({
        matchedBy: 'מקט',
        sku: s.sku,
        supplierName: s.name,
        storeTitle: skuHit.title,
        handle: skuHit.handle,
        storePrice,
        supplierPrice: s.price,
        needsPrice: storePrice === 0 && s.price > 0,
        ambiguous: false,
        url: s.url,
      });
      continue;
    }

    /* מפתח הספק, למי שיש לו — נחתך כמו מקט, כי הוא מזהה ולא דמיון */
    if (KEY) {
      const kk = KEY.supplier(s);
      const keyHit = kk ? byKey.get(kk) : null;
      if (keyHit) {
        duplicate.push({
          matchedBy: KEY.name,
          key: kk,
          supplierName: s.name,
          storeTitle: keyHit.title,
          handle: keyHit.handle,
          storePrice: Number(keyHit.priceRange.maxVariantPrice.amount),
          supplierPrice: s.price,
          why: `אותו ${KEY.name} (${kk}) כבר קיים בחנות`,
        });
        continue;
      }
    }

    const k = norm(s.name);
    const hit = byNorm.get(k);
    if (hit) {
      const storePrice = Number(hit[0].priceRange.maxVariantPrice.amount);
      exact.push({
        matchedBy: 'שם',
        sku: s.sku ?? null,
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
    if (bestScore >= THRESHOLD) {
      review.push({ supplierName: s.name, candidate: best.title, score: Number(bestScore.toFixed(2)), supplierPrice: s.price, url: s.url });
    } else {
      /*
       * הציון נשמר גם על מה שנקבע כחדש, כדי שאפשר יהיה לבדוק את הסף עצמו
       * ולא רק לסמוך עליו. אם רבים מה"חדשים" יושבים ב-0.5 עד 0.59, הסף
       * דולף כפילויות והמספר הזה הוא הדרך היחידה לראות את זה מראש.
       */
      fresh.push({ ...s, _bestScore: Number(bestScore.toFixed(2)), _bestCandidate: best?.title ?? null });
    }
  }

  const fillable = exact.filter((e) => e.needsPrice);
  console.log('\n' + '='.repeat(60));
  console.log(`התאמה מדויקת            : ${exact.length}`);
  console.log(`  מהם לפי מקט           : ${bySkuCount}`);
  console.log(`  מהם לפי שם            : ${exact.length - bySkuCount}`);
  console.log(`  מהם ב-0 שאפשר להשלים  : ${fillable.length}`);
  console.log(`  מהם עם מחיר שונה      : ${exact.filter((e) => e.storePrice > 0 && e.supplierPrice > 0 && Math.abs(e.storePrice - e.supplierPrice) > 0.01).length}`);
  console.log(`כפילות ודאית (הכלה)     : ${duplicate.length}`);
  console.log(`דומה, דורש עין (≥${THRESHOLD})  : ${review.length}`);
  console.log(`חדש לגמרי, לייבוא       : ${fresh.length}`);
  /* התפלגות הציונים של ה"חדשים" — כדי לראות אם הסף דולף */
  const band = (lo, hi) => fresh.filter((f) => f._bestScore >= lo && f._bestScore < hi).length;
  console.log(`   0.50–0.59 (גבולי)    : ${band(0.5, 0.6)}`);
  console.log(`   0.40–0.49            : ${band(0.4, 0.5)}`);
  console.log(`   מתחת ל-0.40          : ${band(0, 0.4)}`);
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
