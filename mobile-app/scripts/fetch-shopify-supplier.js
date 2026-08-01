#!/usr/bin/env node
/**
 * שולף קטלוג שלם מספק שהחנות שלו רצה על שופיפיי, דרך `products.json`.
 *
 *   node scripts/fetch-shopify-supplier.js www.jacobi.co.il jacobi
 *
 * למה זה נפרד מהשולף של פתיה: שופיפיי חושפת נקודת קצה ציבורית שמחזירה
 * מוצרים כ-JSON מלא — כולל וריאנטים, מחירים, מקטים, ברקודים ותמונות —
 * 250 בבקשה. אין צורך בגרידת HTML בכלל, אין מה לפרש, ואי אפשר לפספס
 * שורה. מזהים חנות שופיפיי לפי מפת האתר: `sitemap_products_1.xml`.
 *
 * `products.json` מחזיר רק מוצרים שפורסמו לערוץ החנות המקוונת, כלומר
 * בדיוק מה שהספק מוכר בפועל באתר שלו — וזה מה שרוצים.
 *
 * קורא בלבד.
 */

const fs = require('fs');
const path = require('path');

const [DOMAIN, LABEL] = process.argv.slice(2);
if (!DOMAIN || !LABEL) {
  console.error('שימוש: node scripts/fetch-shopify-supplier.js <domain> <label>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(n) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(600 * 2 ** attempt);
    const res = await fetch(`https://${DOMAIN}/products.json?limit=250&page=${n}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; anshilo-catalogue-sync)' },
    });
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) throw new Error(`HTTP ${res.status} בעמוד ${n}`);
    return (await res.json()).products;
  }
  throw new Error(`עמוד ${n} נכשל אחרי ניסיונות חוזרים`);
}

async function main() {
  console.log(`שולף מ-${DOMAIN}…`);
  const rows = [];
  for (let n = 1; ; n++) {
    const products = await page(n);
    if (products.length === 0) break;
    for (const p of products) {
      /*
       * וריאנט ראשון הוא הבסיס למחיר ולמקט. מוצר עם כמה וריאנטים נשמר עם
       * כולם, כדי שהייבוא לא ישטח דגם עם מידות לשורה אחת.
       */
      rows.push({
        supplierId: p.id,
        handle: p.handle,
        name: p.title,
        vendor: p.vendor,
        productType: p.product_type,
        price: p.variants?.[0]?.price != null ? Number(p.variants[0].price) : null,
        currency: 'ILS',
        available: p.variants?.some((v) => v.available) ?? null,
        sku: p.variants?.[0]?.sku || null,
        barcode: p.variants?.[0]?.barcode || null,
        variants: (p.variants || []).map((v) => ({ title: v.title, price: Number(v.price), sku: v.sku || null })),
        image: p.images?.[0]?.src ?? null,
        images: (p.images || []).map((i) => i.src),
        url: `https://${DOMAIN}/products/${p.handle}`,
      });
    }
    process.stdout.write(`\r  עמוד ${n} — ${rows.length} מוצרים…`);
    if (products.length < 250) break;
    await sleep(400);
  }

  const withPrice = rows.filter((r) => r.price != null && r.price > 0);
  const withImage = rows.filter((r) => r.image);
  console.log('\n');
  console.log('='.repeat(56));
  console.log(`מוצרים          : ${rows.length}`);
  console.log(`עם מחיר         : ${withPrice.length}`);
  console.log(`עם תמונה        : ${withImage.length}`);
  console.log(`עם מקט          : ${rows.filter((r) => r.sku).length}`);
  console.log(`עם ברקוד        : ${rows.filter((r) => r.barcode).length}`);
  if (withPrice.length) {
    const ps = withPrice.map((r) => r.price).sort((a, b) => a - b);
    console.log(`טווח מחירים     : ₪${ps[0]} – ₪${ps[ps.length - 1]}  (חציון ₪${ps[Math.floor(ps.length / 2)]})`);
  }
  const vendors = rows.reduce((m, r) => ((m[r.vendor || '-'] = (m[r.vendor || '-'] || 0) + 1), m), {});
  const top = Object.entries(vendors).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`יצרנים בקטלוג   : ${Object.keys(vendors).length}`);
  for (const [v, n] of top) console.log(`   ${String(n).padStart(4)} × ${v}`);
  console.log('='.repeat(56));

  const out = path.join(__dirname, '..', `${LABEL}-catalogue.json`);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`\nנשמר: ${path.basename(out)}`);
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
