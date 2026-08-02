#!/usr/bin/env node
/**
 * מייבא לחנות מוצרים חדשים מקטלוג ספק, **כטיוטה**.
 *
 *   node scripts/import-supplier-products.js blundstone-catalogue-match.json          # יובש
 *   node scripts/import-supplier-products.js blundstone-catalogue-match.json --apply  # כתיבה
 *   ... --limit 10                                                                    # אצווה קטנה
 *
 * הקלט הוא קובץ ההתאמה, ונלקח ממנו `fresh` בלבד — כלומר מה שהמתאם קבע
 * שאינו קיים בחנות. `duplicate` ו-`review` לא מיובאים כאן בכוונה: הראשון
 * הוא כפילות ודאית, והשני דורש עין אנושית.
 *
 * הכל נכנס כ-DRAFT. זו לא זהירות סתמית — מוצר טיוטה אינו מופיע באתר
 * ובאפליקציה, ולכן ייבוא של מאות מוצרים אינו משנה למבקר את החנות דבר עד
 * שמישהו עבר עליהם ופרסם.
 *
 * ביובש הסקריפט לא נוגע בחנות בכלל, ומדפיס בדיוק מה היה נוצר.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const FILE = args[0];
const APPLY = args.includes('--apply');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;
const typeIdx = args.indexOf('--type');
const FORCE_TYPE = typeIdx >= 0 ? args[typeIdx + 1] : null;
/*
 * קטגוריה לשיוך.
 *
 * בלי זה המוצר קיים בחנות אבל אינו שייך לשום מחלקה, ולכן גם אחרי שיפורסם
 * הוא לא יופיע בשום מקום שקונה מגיע אליו — רק בחיפוש. נעלי בלנסטון שכבר
 * בחנות יושבות ב"ביגוד והנעלה", וזה גם המקום של החדשות.
 */
const colIdx = args.indexOf('--collection');
const COLLECTION = colIdx >= 0 ? args[colIdx + 1] : null;
/*
 * שם היצרן. ספק שופיפיי מצהיר עליו בעצמו; ספק שנשלף מ-JSON-LD לא, וללא
 * יצרן המוצר אינו מסונן בשום מקום בחנות ואינו נמצא בהתאמה הבאה.
 */
const venIdx = args.indexOf('--vendor');
const FORCE_VENDOR = venIdx >= 0 ? args[venIdx + 1] : null;

if (!FILE) {
  console.error('שימוש: node scripts/import-supplier-products.js <match.json> [--type "…"] [--limit N] [--apply]');
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

/** טוקן client_credentials תקף 24 שעות, ולכן מונפק בכל הרצה מחדש */
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
  if (!res.ok) throw new Error(`הנפקת טוקן נכשלה (${res.status}): ${body.slice(0, 200)}`);
  const json = JSON.parse(body);
  if (!json.access_token) throw new Error(`הנפקת טוקן לא החזירה access_token`);
  console.log('  טוקן אדמין הונפק');
  return json.access_token;
}

/**
 * קריאת Admin עם טיפול במיתון קצב.
 *
 * שופיפיי מחזירה 429 וגם `THROTTLED` בתוך 200, ולכן שתי הבדיקות. בלי
 * הניסיון החוזר ייבוא של מאות מוצרים נופל באמצע ומשאיר את החנות במצב חלקי.
 */
async function admin(query, variables, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ADMIN_TOKEN },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    /*
     * נפילת רשת, ולא תשובה עם קוד שגיאה.
     *
     * הריצה הראשונה על 492 מוצרים מתה ב-15 בדיוק כאן: `fetch` נכשל,
     * הזריקה עברה מעל כל לוגיקת הניסיון החוזר שמסתכלת רק על `res.status`,
     * ו-477 מוצרים לא נוצרו. ריצה ארוכה מול API חיצוני *תיתקל* בזה.
     */
    if (attempt < 5) {
      await sleep(2000 * 2 ** attempt);
      return admin(query, variables, attempt + 1);
    }
    throw new Error(`רשת: ${e.message}`);
  }
  /*
   * 401 באמצע ריצה — הטוקן חדל להיות תקף, ומנפיקים אחד חדש וממשיכים.
   *
   * זה מה שקטע את הייבוא של פתיה: 139 מוצרים נוצרו ואז כל 355 הנותרים
   * נכשלו על 401 בזה אחר זה, כי הקוד התייחס לזה ככשלון של מוצר. אורך
   * החיים המוצהר של הטוקן הוא 86399 שניות, כלומר לא פקיעה — הנפקה חדשה
   * במקום אחר מבטלת את הקודם. בכל מקרה, הנפקה מחדש היא התגובה הנכונה,
   * ובלעדיה ריצה ארוכה נעצרת באמצע ומשאירה ייבוא חלקי.
   */
  if (res.status === 401 && attempt < 3 && CLIENT_ID && CLIENT_SECRET) {
    console.log('\n  הטוקן חדל להיות תקף — מנפיק מחדש וממשיך');
    ADMIN_TOKEN = await mintAdminToken();
    return admin(query, variables, attempt + 1);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await sleep(1500 * 2 ** attempt);
    return admin(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`Admin API החזיר ${res.status}`);
  const json = await res.json();
  const throttled = json.errors?.some((e) => e.extensions?.code === 'THROTTLED');
  if (throttled && attempt < 5) {
    await sleep(2000 * 2 ** attempt);
    return admin(query, variables, attempt + 1);
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]).slice(0, 300));
  return json.data;
}

/*
 * שמות האפשרויות אצל הספק הם מזהים טכניים באנגלית — `color_description`,
 * `size` — והם מוצגים לקונה בעמוד המוצר. בחנות בעברית זה נראה כמו תקלה,
 * ולכן מתורגמים. מה שאינו ברשימה עובר כמו שהוא ולא מומצא לו שם.
 */
const OPTION_NAMES = {
  size: 'מידה',
  color: 'צבע',
  colour: 'צבע',
  color_description: 'צבע',
  material: 'חומר',
  style: 'דגם',
  volume: 'נפח',
  weight: 'משקל',
  length: 'אורך',
  quantity: 'כמות',
};
/*
 * `Title` נשאר `Title` במפורש.
 *
 * זו האפשרות שהתקן של שופיפיי נותן למוצר בלי אפשרויות אמיתיות, והחנות
 * מסתירה אותה בעמוד המוצר רק כשהיא נקראת בשם הזה ועם הערך `Default Title`.
 * תרגומה ל"סוג" הופך אותה לתיבת בחירה גלויה שכתוב בה "סוג: Default Title",
 * ובייבוא של מאות מוצרים חד-וריאנטיים זה מופיע בכל עמוד ועמוד.
 */
const optionName = (n) => {
  const k = String(n || '').trim();
  if (k.toLowerCase() === 'title') return 'Title';
  return OPTION_NAMES[k.toLowerCase()] ?? (k || 'סוג');
};

/** בונה קלט productSet ממוצר ספק אחד */
function buildInput(s) {
  /*
   * שני סוגי ספקים מגיעים לכאן, וזה לא פרט מימוש.
   *
   * ספק שופיפיי נשלף דרך products.json ומגיע עם מערך וריאנטים ואפשרויות
   * מלא — נעל עם אחת עשרה מידות. ספק שנשלף מ-JSON-LD בעמוד מוצר מגיע עם
   * שם, מחיר, מקט ותמונה בלבד, בלי מערך וריאנטים כלל, ולכן בונים לו כאן
   * וריאנט אחד. בלי זה כל 493 מוצרי פתיה נדחים בשקט כ"בלי וריאנט תקין",
   * שזה בדיוק סוג הכשל שנראה כמו החלטה.
   */
  const variantsIn = (s.variants ?? []).length
    ? s.variants
    : s.price > 0
      ? [{ price: s.price, sku: s.sku ?? null, optionValues: ['Default Title'] }]
      : [];
  s = { ...s, variants: variantsIn };

  const rawOpts = (s.options ?? []).length
    ? s.options
    : [{ name: 'Title', position: 1 }];

  /*
   * וריאנט חייב ערך לכל אפשרות. אצל הספק יש שורות שבהן חסר ערך באפשרות
   * שנייה, ווריאנט חסר-ערך נדחה על ידי שופיפיי ומפיל את כל המוצר — ולכן
   * מסתמכים על מספר האפשרויות שהווריאנטים בפועל מספקים, ולא על ההצהרה.
   */
  const depth = Math.min(
    rawOpts.length,
    Math.min(...(s.variants ?? []).map((v) => (v.optionValues ?? []).length).filter((n) => n > 0)) || 1
  );
  const opts = rawOpts.slice(0, depth);

  const variants = (s.variants ?? [])
    .filter((v) => (v.optionValues ?? []).length >= depth && v.price > 0)
    .map((v) => ({
      optionValues: opts.map((o, i) => ({
        optionName: optionName(o.name),
        name: String(v.optionValues[i]),
      })),
      price: String(v.price),
      ...(v.compareAtPrice ? { compareAtPrice: String(v.compareAtPrice) } : {}),
      inventoryItem: {
        ...(v.sku ? { sku: v.sku } : {}),
        /*
         * ללא מעקב מלאי. מוצר מיובא שאין לנו עליו נתון מלאי אמיתי יקבל 0
         * במעקב, כלומר "אזל" — וזה גרוע ממוצר שפשוט זמין. מי שיפרסם אותו
         * יקבע מלאי אמיתי אם ירצה.
         */
        tracked: false,
      },
    }));

  if (variants.length === 0) return null;

  /* ערכי אפשרות ייחודיים, בסדר ההופעה — שופיפיי דורשת הצהרה מראש */
  const productOptions = opts.map((o, i) => {
    const seen = new Set();
    const values = [];
    for (const v of variants) {
      const val = v.optionValues[i].name;
      if (!seen.has(val)) { seen.add(val); values.push({ name: val }); }
    }
    return { name: optionName(o.name), values };
  });

  return {
    title: s.name,
    vendor: FORCE_VENDOR || s.vendor || null,
    productType: FORCE_TYPE || s.productType || null,
    status: 'DRAFT',
    descriptionHtml: s.descriptionHtml || null,
    ...(s.tags ? { tags: String(s.tags).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 40) } : {}),
    /* עד שמונה תמונות למוצר — מעבר לזה זה עומס העלאה בלי תועלת לקונה */
    files: (s.images ?? (s.image ? [s.image] : [])).slice(0, 8).map((src) => ({
      originalSource: src,
      contentType: 'IMAGE',
    })),
    productOptions,
    variants,
  };
}

const PRODUCT_SET = `
  mutation Import($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product { id handle title status variants(first: 1) { nodes { id sku } } }
      userErrors { field message }
    }
  }`;

/** האם מקט כלשהו של המוצר כבר קיים בחנות — הגנה אחרונה מפני כפילות */
async function skuExists(sku) {
  const d = await admin(
    `query($q:String!){productVariants(first:1,query:$q){nodes{id product{title}}}}`,
    { q: `sku:"${String(sku).replace(/"/g, '')}"` }
  );
  return d.productVariants.nodes[0] ?? null;
}

async function main() {
  const match = JSON.parse(fs.readFileSync(path.join(__dirname, '..', FILE), 'utf8'));
  let fresh = match.fresh ?? [];
  console.log(`קובץ ההתאמה: ${FILE}`);
  console.log(`  חדשים לייבוא : ${fresh.length}`);
  console.log(`  כפילות (מדולג): ${(match.duplicate ?? []).length}`);
  console.log(`  לבדיקה (מדולג): ${(match.review ?? []).length}`);
  if (LIMIT) {
    fresh = fresh.slice(0, LIMIT);
    console.log(`  מוגבל ל-${fresh.length} באצווה הזאת`);
  }

  const built = fresh.map((s) => ({ s, input: buildInput(s) }));
  const skipped = built.filter((b) => b.input == null);
  const ready = built.filter((b) => b.input != null);

  console.log('');
  console.log(`ניתן לייבא     : ${ready.length}`);
  if (skipped.length) console.log(`נדחו (בלי מחיר או וריאנט תקין): ${skipped.length}`);
  const totalVariants = ready.reduce((n, b) => n + b.input.variants.length, 0);
  const totalImages = ready.reduce((n, b) => n + b.input.files.length, 0);
  console.log(`וריאנטים       : ${totalVariants}`);
  console.log(`תמונות         : ${totalImages}`);

  if (!APPLY) {
    console.log('\n' + '='.repeat(62));
    console.log('יובש. שלוש דוגמאות ממה שהיה נוצר:');
    for (const b of ready.slice(0, 3)) {
      console.log(`\n  ${b.input.title.slice(0, 56)}`);
      console.log(`    יצרן: ${b.input.vendor} | סוג: ${b.input.productType || '—'} | מצב: ${b.input.status}`);
      console.log(`    אפשרויות: ${b.input.productOptions.map((o) => `${o.name}(${o.values.length})`).join(' , ')}`);
      console.log(`    וריאנטים: ${b.input.variants.length} | תמונות: ${b.input.files.length}`);
      console.log(`    ראשון: ₪${b.input.variants[0].price} מקט ${b.input.variants[0].inventoryItem.sku ?? '—'}`);
    }
    console.log('\n' + '='.repeat(62));
    console.log('להרצה אמיתית: הוסיפו --apply');
    return;
  }

  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  /*
   * הקטגוריה נפתרת *לפני* שיוצרים מוצר אחד.
   *
   * אם השם שגוי, עדיף לדעת עכשיו ולא אחרי שנוצרו שישים מוצרים ששייכים
   * לשום מקום. השוואה על שם מדויק, ואם אין — נופלים עם רשימת המועמדות,
   * כי לנחש קטגוריה זה להכניס מוצרים למחלקה הלא נכונה.
   */
  let collectionId = null;
  if (COLLECTION) {
    const d = await admin(
      `query($q:String!){collections(first:20,query:$q){nodes{id title}}}`,
      { q: `title:'${COLLECTION.replace(/'/g, '')}'` }
    );
    const hit = d.collections.nodes.find((c) => c.title === COLLECTION);
    if (!hit) {
      const near = d.collections.nodes.map((c) => c.title).join(' | ') || 'אין';
      throw new Error(`לא נמצאה קטגוריה בשם "${COLLECTION}". קרובות: ${near}`);
    }
    collectionId = hit.id;
    console.log(`  קטגוריה: ${hit.title}`);
  }

  /* יומן, כדי שהרצה חוזרת לא תיצור שוב את מה שנוצר */
  const ledgerPath = path.join(__dirname, '..', 'import-ledger.json');
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};

  let created = 0;
  let already = 0;
  const failed = [];
  const createdIds = [];

  for (const [i, b] of ready.entries()) {
    const key = b.s.url || b.s.name;
    if (ledger[key]) {
      /*
       * מוצר שכבר נוצר בריצה קודמת עדיין נכנס לרשימת השיוך לקטגוריה.
       *
       * הריצה שנקטעה יצרה 139 מוצרים ואז מתה לפני שלב השיוך, כך שכולם
       * נחתו בחנות בלי מחלקה. בלי השורה הזאת ריצה חוזרת מדלגת עליהם
       * לגמרי והם נשארים יתומים לתמיד. collectionAddProducts אדיש
       * לכפילות, ולכן אין נזק בהוספה חוזרת.
       */
      if (ledger[key].id) createdIds.push(ledger[key].id);
      already++;
      continue;
    }

    /*
     * בדיקת המקט נמצאת בתוך ה-try יחד עם היצירה, ולא לפניו.
     *
     * כשהיא הייתה מחוצה לו, כשלון רשת בבדיקה של מוצר אחד הפיל את הלולאה
     * כולה — נוצרו 14 מתוך 492 והשאר פשוט לא רצו. כשלון של מוצר בודד צריך
     * להיספר ככשלון של מוצר בודד.
     */
    try {
      const sku = b.input.variants[0].inventoryItem.sku;
      if (sku) {
        const hit = await skuExists(sku);
        if (hit) {
          console.log(`\n  ⊙ מדולג — מקט ${sku} כבר קיים ב"${hit.product.title.slice(0, 34)}"`);
          ledger[key] = { skipped: 'מקט קיים', at: hit.id };
          already++;
          continue;
        }
      }

      const d = await admin(PRODUCT_SET, { input: b.input });
      const errs = d.productSet.userErrors;
      if (errs?.length) {
        failed.push({ name: b.s.name, why: errs.map((e) => `${e.field}: ${e.message}`).join('; ') });
      } else {
        const p = d.productSet.product;
        ledger[key] = { id: p.id, handle: p.handle, at: null };
        createdIds.push(p.id);
        created++;
      }
    } catch (e) {
      failed.push({ name: b.s.name, why: e.message.slice(0, 160) });
    }

    if ((i + 1) % 5 === 0 || i === ready.length - 1) {
      process.stdout.write(`\r  נוצרו ${created} | דולגו ${already} | נכשלו ${failed.length}  (${i + 1}/${ready.length})`);
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    }
    await sleep(350);
  }

  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

  /* שיוך לקטגוריה במקבצים — collectionAddProducts מקבל רשימה, לא מוצר בודד */
  let addedToCollection = 0;
  if (collectionId && createdIds.length) {
    for (let i = 0; i < createdIds.length; i += 50) {
      const batch = createdIds.slice(i, i + 50);
      /*
       * כשלון כאן לא מפיל את הריצה. המוצרים כבר קיימים בחנות, והסיכום
       * שמגיע אחרי זה הוא מה שאומר מה נוצר ומה לא — לאבד אותו בגלל
       * תקלה בשיוך פירושו לסיים בלי לדעת מה קרה.
       */
      try {
        const d = await admin(
          `mutation($id:ID!,$ids:[ID!]!){collectionAddProducts(id:$id,productIds:$ids){
             userErrors{field message}}}`,
          { id: collectionId, ids: batch }
        );
        const errs = d.collectionAddProducts.userErrors;
        if (errs?.length) console.log(`\n  ⚠ שיוך לקטגוריה: ${errs[0].message}`);
        else addedToCollection += batch.length;
      } catch (e) {
        console.log(`\n  ⚠ שיוך לקטגוריה נכשל: ${e.message.slice(0, 120)}`);
      }
      await sleep(400);
    }
  }

  console.log('\n\n' + '='.repeat(62));
  console.log(`נוצרו כטיוטה   : ${created}`);
  console.log(`דולגו          : ${already}`);
  console.log(`נכשלו          : ${failed.length}`);
  if (COLLECTION) console.log(`שויכו לקטגוריה : ${addedToCollection}`);
  for (const f of failed.slice(0, 12)) console.log(`   ✗ ${f.name.slice(0, 40)} — ${f.why}`);
  if (failed.length > 12) console.log(`   … ועוד ${failed.length - 12}`);
  console.log('='.repeat(62));
  console.log('\nכל המוצרים במצב טיוטה ואינם מופיעים באתר ובאפליקציה.');
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
