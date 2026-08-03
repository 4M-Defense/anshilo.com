#!/usr/bin/env node
/**
 * מתקן שלושה דברים במוצרים: קטגוריית טקסונומיה, כותרת ותיאור SEO, ותגיות
 * פנימיות של הספק שאין להן מה לחפש בחנות.
 *
 *   node scripts/fix-product-taxonomy.js --vendor "יעקבי"                 # יובש
 *   node scripts/fix-product-taxonomy.js --vendor "יעקבי" --apply
 *   node scripts/fix-product-taxonomy.js --vendor "יעקבי" --only-wrong    # רק קטגוריות שגויות
 *
 * למה `category` ולא `productType`: שני שדות שונים לגמרי. `productType` ריק
 * ב-95% מהחנות, כלומר זו הקונבנציה כאן ולא חוסר. `category` הוא הטקסונומיה
 * התקנית של שופיפיי, והיא מה שגוגל שופינג ומטא קוראים מהפיד.
 *
 * ולמה בכלל: נמדד ש-36 מתוך 223 מוצרי יעקבי המפורסמים ממוסמנים שגוי, וזה
 * לא רעש אקראי אלא ניחוש אוטומטי שנכשל על עברית — אקונומיקה 2 ליטר סומנה
 * `Beverages > Milk`, טבליות לאסלה סומנו `Edible Baking Decorations`, ונוזל
 * מדליק פחמים סומן כרכיב מזון. חומר ניקוי שמסומן כמשקה או כמאכל אינו רק
 * פוגע בדירוג — הוא חושף את חשבון המרצ'נט ומטעה קונה.
 *
 * המיפוי כאן הוא לפי מילות מפתח בעברית בשם המוצר, בסדר מהמפורש לכללי.
 * הוא במפורש אינו מנחש: מוצר שלא נתפס בשום כלל נשאר כמו שהוא ומדווח,
 * כי קטגוריה שגויה גרועה מקטגוריה חסרה.
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY_WRONG = args.includes('--only-wrong');
const venIdx = args.indexOf('--vendor');
const VENDOR = venIdx >= 0 ? args[venIdx + 1] : null;
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : null;

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
const gid = (slug) => `gid://shopify/TaxonomyCategory/${slug}`;

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

/*
 * הכללים מחולקים לפי תחום, ולא רשימה אחת לכל החנות.
 *
 * זו לא הפשטה לשם סדר אלא תיקון של טעות שנמדדה. הכללים למוצרי ניקוי כוללים
 * `/צבע/`, ובקטלוג של פתיה — תאורה וחשמל — יש 279 מוצרים שבשמם "בצבע לבן"
 * או "בצבע שחור". הרצת הכללים האלה על פתיה הייתה מסמנת 279 גופי תאורה
 * ופעמונים כ-Paint ועוד 60 כשפכטל, כלומר 339 שגיאות חדשות — יותר מ-36
 * השגיאות שהסקריפט הזה נכתב כדי לתקן.
 *
 * לכן הבחירה מפורשת לפי יצרן, והיא כשל-סגור: יצרן שאין לו תחום מוגדר אינו
 * רץ בכלל. מוטב לא לסמן מאשר לסמן לפי כללים של תחום אחר.
 */
const CLEANING_RULES = [
  [/אקונומיקה|מלבין|מלביןן|הלבנ|כלור/, 'hg-10-9-1', 'Laundry Supplies > Bleach'],
  [/ג.?ל כביסה|אבקת כביסה|נוזל כביסה|כביסה.*ג.?ל|תמצית כביסה/, 'hg-10-9-17', 'Laundry Detergent'],
  [/מרכך כביסה|מרכך/, 'hg-10-9-7', 'Fabric Softeners'],
  [/מסיר כתמים|כתמים/, 'hg-10-9-8', 'Fabric Stain Removers'],
  [/מבשם כביסה|פניני ריח|בישום כביסה/, 'hg-10-9-5', 'Fabric Refreshers'],
  [/מלקחי כביסה|אטבי|אטב/, 'hg-10-9-2', 'Clothespins'],

  /*
   * "נוזל מדליק פחמים" יושב היום תחת רכיבי מזון, ולכן הכלל הזה ראשון בקבוצה:
   * זה נוזל דליק, וסימונו כמזון הוא הטעות הגרועה מכל אלה שנמצאו.
   */
  [/מדליק פחמים|נוזל הצתה|מדליק אש/, 'ha-1-1-9', 'Chemicals > Lighter Fluid'],
  [/מדיח|נוזל הברקה|דואגים לכלים/, 'hg-10-6-11-5', 'Dishwasher Cleaners'],
  [/נוזל כלים|מנקה כלים|מבריק כלים|סבון כלים/, 'hg-10-6-11-4', 'Dish Detergent & Soap'],
  [/אסלה|בית שימוש|שירותים.*מנקה|ריח לאסלה/, 'hg-10-6-11-15', 'Toilet Bowl Cleaners'],
  [/תנור|גריל|כיריים|אינדוקציה/, 'hg-10-6-11-11', 'Oven & Grill Cleaners'],
  [/מכונת כביסה.*מנקה|ניקוי מכונת/, 'hg-10-6-11-17', 'Washing Machine Cleaners'],
  [/רצפ|פרקט|שיש|מרצפות/, 'hg-10-6-11-7', 'Floor Cleaning Products'],
  [/זכוכית|חלונות|מראות/, 'hg-10-6-11-9', 'Glass & Surface Cleaners'],
  [/ריפוד|שטיח|בדים.*מנקה|ספה/, 'hg-10-6-11-6', 'Fabric & Upholstery Cleaners'],
  [/רהיטים|עץ.*מבריק|פוליש|פוליטורה/, 'hg-10-6-11-8', 'Furniture Cleaners & Polish'],
  [/ספוגי|ספוגית|נצרים|סקוטש/, 'hg-10-6-17', 'Sponges & Scouring Pads'],
  [/מברשת ניקוי|מקרצפת|מברשת רצפה/, 'hg-10-6-15', 'Scrub Brushes'],
  [/מטאטא|מגב/, 'hg-10-6-2', 'Broom Heads'],
  [/כפפ/, 'hg-10-6-6', 'Cleaning Gloves'],
  [/פתיחת סתימ|סתימות|ניקוי צינורות/, 'ha-10-2-2-4', 'Drain Openers'],

  [/שפכטל|מילוי סדקים|טיח|גבס.*מילוי/, 'ha-1-11-9', 'Spackling Paste'],
  [/לכה|ורניש|שלאק/, 'ha-1-6-5', 'Varnishes & Finishes'],
  [/צבע|ספריי צבע|יסוד/, 'ha-1-6-1', 'Paint'],
  [/מברשת צבע|רולר|גליל צביעה/, 'ha-15-42-2', 'Paint Brushes'],
  [/ממס|טרפנטין|אצטון|מדלל/, 'ha-1-10-1', 'Solvents'],
  [/שמן סיכה|גריז|WD/, 'ha-1-4', 'Lubricants'],

  [/משחת נעל|נעל.*משחה|מבריק נעל|אימפרגנציה|אביזרי עור|קרם.*עור|מוצרי עור/, 'hg-10-14-10', 'Shoe Treatments & Dyes'],
  [/מטהר אוויר|מבשם אוויר|מבשם חדר|ניחוח לבית|מפיץ ריח|פרח הפלא|פרש ג.?ל/, 'hg-3-40-1', 'Air Fresheners'],
  [/עובש|פטריות|קוטל/, 'hg-10-11-3-1', 'Fungicides'],
  [/חיטוי|מחטא|אלכוג.?ל|אנטיספטי/, 'hb-1-8-1', 'Antiseptics & Cleaning Supplies'],
  [/פח אשפה|שקיות אשפה|פח /, 'hg-10-18-4-1', 'Trash Cans'],
  [/סופג לחות|קולט לחות/, 'hg-10-6', 'Household Cleaning Supplies'],

  /* רשת אחרונה: מנקה כלשהו שלא נתפס בכלל ספציפי */
  /*
   * "דה לין" נכנס לכאן בשמו: השם בחנות הוא "ג'ל דה לין 1000 מ"ל" בלבד, בלי
   * אף מילה שמעידה על ניקוי, בעוד השם בקטלוג הוא "ג'ל פלא מנקה הכל". התיאור
   * מאשר שזה מנקה רב-תכליתי על בסיס פשתן. זה גם הכלל היחיד שהוא שם מוצר ולא
   * תיאור, ולכן הוא מסומן — מיפוי לפי מותג אינו מדרון שכדאי להרחיב.
   */
  [/מנקה|ניקוי|מסיר|נוזל רב תכליתי|רב תכליתי|מנקה הכל|ג.?ל פלא|דה לין/, 'hg-10-6-11-1', 'All-Purpose Cleaners'],
];

/*
 * תאורה וחשמל — פתיה וניסקו.
 *
 * הסדר קריטי כאן במיוחד: "גוף תאורה" מופיע בכמחצית הקטלוג, ולכן הוא נבדק
 * אחרון בקבוצת התאורה, אחרי הצורות המפורשות. וכן — "פרוז'קטור" לפני
 * "זרקור", ו"מאמ"ת" לפני "מפסק", כי מאמ"ת הוא מפסק אבל לא מפסק אור.
 */
const LIGHTING_RULES = [
  [/פעמון|דין דון|דינג דונג/, 'ha-2-2-1', 'Door Bells & Chimes'],

  /*
   * צורת הסמיכות "נורת" נבדקת במפורש ולא רק "נורה".
   *
   * בלעדיה 83 מוצרים נפלו לרשת האחרונה, ובראשם "נורת לד TUBE T8 24W" —
   * נורה שסווגה כגוף תאורה. בעברית הסמיכות משנה את האות האחרונה, ורשימת
   * מילים שנבנתה מצורת היחיד הנפרדת מפספסת בדיוק את הכתיב שמופיע בקטלוג.
   */
  [/נורת|נורה|נורות|פילמנט|E27|E14|GU10/, 'hg-13-7', 'Light Bulbs'],
  [/פרוז.?קטור|זרקור|ספוט לד|הצפה/, 'hg-13-3', 'Flood & Spot Lights'],
  [/מנורת שולחן|מנורת קיר|אהיל|מנורה נטענת|פנס/, 'hg-13-5', 'Lamps'],
  [/צמוד תקרה|שקוע.*תקרה|תקרה.*שקוע|פנל לד|שקועי לד/, 'hg-13-9-2', 'Ceiling Light Fixtures'],

  /*
   * "גוף תאורה" מוכרע לפני כל כללי החשמל, ולא אחריהם.
   *
   * שם מוצר מתאר גם את מה שמגיע איתו: "גוף תאורה שלט יציאת חירום NEPTUNE
   * 3W אור קר כבל..." הכיל "כבל" והסתיים כ-Electrical Wires & Cable. מה
   * שהמוצר *הוא* נכתב בתחילת השם; מה שיש לו נכתב אחר כך.
   */
  /*
   * ענף האב ולא "גוף תקרה". הקבוצה הזאת קולטת גם דוקרני גינה ותאורת חוץ,
   * ולסמן אותם כגופי תקרה זה לדייק יתר על המידה במחיר של להיות שגוי.
   */
  [/גוף תאורה|תאורת|תאורה/, 'hg-13-9', 'Lighting Fixtures'],

  [/מאמ.?ת|ממסר פחת|מפסק פחת|אוטומט|מפסק זרם|לוח חשמל/, 'ha-11-5', 'Circuit Breakers'],
  [/ממסר|רלה/, 'ha-11-10-2', 'Specialty Switches & Relays'],
  /* שקע לפני מפסק: "שקע כוח כפול עם מפסק רוקר" הוא שקע, והמפסק הוא תוספת */
  [/שקע/, 'ha-11-21-3', 'Wall Outlets'],
  [/מפסק|מתג|קלידים|קליד/, 'ha-11-10-1', 'Light Switches'],
  [/תקע|קופלונג/, 'ha-11-9', 'Electrical Plug Caps'],
  [/מאריך|מפצל|שלוחה/, 'ha-11-13', 'Extension Cords'],
  [/כבל|חוט חשמל|כבלים|גיד/, 'ha-11-11', 'Electrical Wires & Cable'],
  [/קופסה|קופסת|מסגרת|תעלה/, 'ha-11-8', 'Electrical Mount Boxes & Brackets'],
  [/מנוע|מאוור|מפוח|מאורר/, 'ha-11-7', 'Electrical Motors'],
];

/* הנעלה — בלנסטון. כל הקטלוג שלהם מגפיים ונעליים, ולכן כלל אחד מספיק */
const FOOTWEAR_RULES = [
  [/נעל|מגף|סנדל|בלנסטון|blundstone/i, 'aa-8-3', 'Shoes > Boots'],
];

/*
 * יצרן → תחום. השם נבדק בהכלה כדי שווריאציות כתיב לא יפילו את ההתאמה —
 * בחנות כתוב "בלאנדסטון" ובקטלוג "Blundstone".
 */
const DOMAINS = [
  { rules: CLEANING_RULES, name: 'ניקוי ותחזוקה', vendors: ['יעקבי', 'jacobi'] },
  { rules: LIGHTING_RULES, name: 'תאורה וחשמל', vendors: ['פתיה', 'fetaya', 'ניסקו', 'nisko'] },
  { rules: FOOTWEAR_RULES, name: 'הנעלה', vendors: ['בלאנדסטון', 'בלנסטון', 'blundstone'] },
];

const domainFor = (vendor) =>
  DOMAINS.find((d) => d.vendors.some((v) => String(vendor || '').toLowerCase().includes(v.toLowerCase()))) ?? null;

let RULES = [];

function categoryFor(title) {
  for (const [re, slug, label] of RULES) {
    if (re.test(title)) return { slug, label };
  }
  return null;
}

/*
 * תגיות שהן מטא-נתונים של הספק ולא מידע ללקוח.
 *
 * `Asaf_upload` יושבת על 406 מתוך 612 מוצרי יעקבי — כמעט בוודאות שם של מי
 * שהעלה אותם אצלם בכמות. היא נכנסה לחנות כאן פשוט מפני שהעברתי תגיות
 * כמו שהן, ותגיות נראות ללקוח בחלק מהתבניות ומשמשות בסינון ובחיפוש.
 */
const TAG_JUNK = [/_upload$/i, /^upload/i, /^(test|temp|tmp)[-_ ]/i, /^import[-_]/i, /^sku[-_]/i];
const isJunkTag = (t) => TAG_JUNK.some((re) => re.test(String(t).trim()));

/** כותרת SEO — עד 70 תווים, כי גוגל חותכת בסביבות שם */
function seoTitle(title) {
  const suffix = ' | א.נ. שילו';
  const room = 70 - suffix.length;
  const base = title.length > room ? title.slice(0, room - 1).trimEnd() + '…' : title;
  return base + suffix;
}

/**
 * תיאור SEO — עד 155 תווים מהתיאור עצמו.
 *
 * כשאין תיאור בונים משפט מהשם ומהיצרן, ולא משאירים ריק: תיאור ריק גורם
 * לגוגל להמציא קטע מהעמוד, ובעמוד מוצר הקטע הזה יוצא לרוב תפריט או מחיר.
 */
function seoDescription(title, descriptionHtml, vendor) {
  const plain = String(descriptionHtml || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length >= 40) {
    return plain.length > 155 ? plain.slice(0, 154).trimEnd() + '…' : plain;
  }
  const v = vendor ? ` מ${vendor}` : '';
  const built = `${title}${v}. זמין בא.נ. שילו, חומרי בניין ואספקה טכנית. משלוחים והזמנה אונליין.`;
  return built.length > 155 ? built.slice(0, 154).trimEnd() + '…' : built;
}

const FETCH = `
  query($after:String,$q:String){
    products(first:100, after:$after, query:$q){
      pageInfo{ hasNextPage endCursor }
      nodes{
        id title vendor status descriptionHtml tags
        category { id fullName }
        seo { title description }
      }
    }
  }`;

/* ProductUpdateInput ולא ProductInput — הטיפוס התפצל ב-2025-07 */
const UPDATE = `
  mutation($input:ProductUpdateInput!){
    productUpdate(product:$input){
      product { id }
      userErrors { field message }
    }
  }`;

/*
 * קטגוריות שהן בוודאות שגויות למוצרי ניקוי, צבע וטיפוח.
 *
 * לא ניחוש: אלה הענפים שאליהם הניחוש האוטומטי שלח בפועל חומרי ניקוי —
 * מזון, משקאות, חצץ לאקווריום, מאפרות, אמצעי ספיגה. מוצר שיושב בענף כזה
 * מסומן לתיקון גם כשיש לו קטגוריה, בעוד מוצר בענף סביר לא נוגעים בו.
 */
const WRONG_BRANCH =
  /Food, Beverages|Cooking & Baking|Dairy|Fruits & Vegetables|Beverages >|Aquarium|Ashtray|Incontinence|Dehydrator|Plants >|Artwork|Molasses/;

async function main() {
  if (!ADMIN_TOKEN) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('חסר SHOPIFY_CLIENT_ID / SECRET ב-.env');
    ADMIN_TOKEN = await mintAdminToken();
  }

  /*
   * בלי יצרן אין תחום, ובלי תחום אין כללים — ולכן עוצרים.
   *
   * ריצה על כל החנות עם מערך כללים אחד היא בדיוק התקלה שהמבנה הזה מונע.
   */
  if (!VENDOR) throw new Error('חובה --vendor: הכללים נבחרים לפי תחום היצרן');
  const domain = domainFor(VENDOR);
  if (!domain) {
    throw new Error(
      `אין מערך כללים ליצרן "${VENDOR}". התחומים המוגדרים: ` +
        DOMAINS.map((d) => `${d.name} (${d.vendors[0]})`).join(', ')
    );
  }
  RULES = domain.rules;
  console.log(`תחום: ${domain.name} — ${RULES.length} כללים`);

  const q = `vendor:${VENDOR}`;
  const all = [];
  let after = null;
  for (;;) {
    const d = await admin(FETCH, { after, q });
    all.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  console.log(`נמצאו ${all.length} מוצרים${VENDOR ? ` מהיצרן "${VENDOR}"` : ''}`);

  const plan = [];
  const unmatched = [];
  for (const p of all) {
    const wrongNow = p.category != null && WRONG_BRANCH.test(p.category.fullName);
    const missing = p.category == null || p.category.fullName === 'Uncategorized';
    const wanted = categoryFor(p.title);

    const changes = {};
    if ((wrongNow || missing) && wanted) {
      changes.category = gid(wanted.slug);
      changes._categoryLabel = wanted.label;
      changes._was = p.category?.fullName ?? '(ריק)';
      changes._wrongNow = wrongNow;
    } else if ((wrongNow || missing) && !wanted) {
      unmatched.push({ title: p.title, was: p.category?.fullName ?? '(ריק)', wrongNow });
    }

    if (ONLY_WRONG) {
      if (changes.category) plan.push({ p, changes });
      continue;
    }

    const junk = (p.tags ?? []).filter(isJunkTag);
    if (junk.length > 0) {
      changes.tags = (p.tags ?? []).filter((t) => !isJunkTag(t));
      changes._droppedTags = junk;
    }
    if (!p.seo?.title) changes.seo = { ...(changes.seo ?? {}), title: seoTitle(p.title) };
    if (!p.seo?.description) {
      changes.seo = {
        ...(changes.seo ?? {}),
        title: changes.seo?.title ?? p.seo?.title ?? seoTitle(p.title),
        description: seoDescription(p.title, p.descriptionHtml, p.vendor),
      };
    }

    if (Object.keys(changes).some((k) => !k.startsWith('_'))) plan.push({ p, changes });
  }

  const nCat = plan.filter((x) => x.changes.category).length;
  const nWrong = plan.filter((x) => x.changes._wrongNow).length;
  const nTags = plan.filter((x) => x.changes._droppedTags).length;
  const nSeo = plan.filter((x) => x.changes.seo).length;

  console.log('');
  console.log('='.repeat(64));
  console.log(`מוצרים לעדכון           : ${plan.length}`);
  console.log(`  קטגוריה תיקבע         : ${nCat}   (מהם ${nWrong} שגויים כרגע)`);
  console.log(`  תגיות פנימיות יוסרו   : ${nTags}`);
  console.log(`  SEO ייכתב             : ${nSeo}`);
  console.log(`לא נתפסו בשום כלל       : ${unmatched.length}  ← נשארים כמו שהם`);
  console.log('='.repeat(64));

  if (nWrong > 0) {
    console.log('\nתיקוני קטגוריה שגויה:');
    for (const x of plan.filter((y) => y.changes._wrongNow).slice(0, 14)) {
      console.log(`  ${x.p.title.slice(0, 40).padEnd(42)}`);
      console.log(`      ${x.changes._was.split(' > ').slice(-2).join(' > ')}  →  ${x.changes._categoryLabel}`);
    }
  }
  if (unmatched.length > 0) {
    console.log('\nבלי קטגוריה ובלי כלל מתאים (דורש עין):');
    for (const u of unmatched.slice(0, 10)) console.log(`  ${u.title.slice(0, 56)}`);
    if (unmatched.length > 10) console.log(`  … ועוד ${unmatched.length - 10}`);
  }

  if (!APPLY) {
    const s = plan.find((x) => x.changes.seo);
    if (s) {
      console.log('\nדוגמת SEO:');
      console.log(`  כותרת : ${s.changes.seo.title}`);
      console.log(`  תיאור : ${s.changes.seo.description}`);
    }
    const t = plan.find((x) => x.changes._droppedTags);
    if (t) console.log(`\nתגיות שיוסרו, לדוגמה: ${t.changes._droppedTags.join(', ')}`);
    console.log('\nלהרצה אמיתית: הוסיפו --apply');
    return;
  }

  let done = 0;
  const failed = [];
  const work = LIMIT ? plan.slice(0, LIMIT) : plan;
  for (const [i, x] of work.entries()) {
    const input = { id: x.p.id };
    if (x.changes.category) input.category = x.changes.category;
    if (x.changes.tags) input.tags = x.changes.tags;
    if (x.changes.seo) input.seo = x.changes.seo;
    try {
      const d = await admin(UPDATE, { input });
      const errs = d.productUpdate.userErrors;
      if (errs?.length) failed.push({ title: x.p.title, why: errs.map((e) => e.message).join('; ') });
      else done++;
    } catch (e) {
      failed.push({ title: x.p.title, why: e.message.slice(0, 130) });
    }
    if ((i + 1) % 10 === 0 || i === work.length - 1) {
      process.stdout.write(`\r  עודכנו ${done} | נכשלו ${failed.length}  (${i + 1}/${work.length})`);
    }
    await sleep(300);
  }

  console.log('\n\n' + '='.repeat(64));
  console.log(`עודכנו : ${done}`);
  console.log(`נכשלו  : ${failed.length}`);
  for (const f of failed.slice(0, 10)) console.log(`   ✗ ${f.title.slice(0, 36)} — ${f.why}`);
  console.log('='.repeat(64));
}

main().catch((e) => { console.error(`\nשגיאה: ${e.message}`); process.exitCode = 1; });
