#!/usr/bin/env node
/**
 * מסיר markup שנשאר מהגירת WooCommerce/Elementor מתוך תיאורי המוצרים.
 *
 * 247 מוצרים פעילים נושאים עטיפות של Elementor — div-ים עם class כמו
 * elementor-widget-dyncontel-acf-repeater, data-id, data-element_type ו-
 * data-settings שמכיל JSON שלם. זה לא נראה ללקוח כטקסט אבל הוא כן משפיע: זה
 * נכנס לפיד של גוגל, זה מנפח את העמוד, וזה שובר עיצוב כשה-CSS של Elementor
 * אינו קיים בשופיפיי — כלומר תמיד.
 *
 * הגישה: רשימת מותר, לא רשימת אסור. שומרים תגיות סמנטיות ומסירים כל השאר
 * בלי לגעת בטקסט. רשימת אסור הייתה מפספסת את הווידג'ט הבא של Elementor;
 * רשימת מותר מפספסת רק תגית סמנטית שנשכחה, וזה כישלון שאפשר לראות.
 *
 * מה נשמר: p, br, ul, ol, li, h2..h6, strong, b, em, i, u, table, thead,
 * tbody, tr, th, td, a (עם href בלבד), img (עם src/alt/width/height), span.
 *
 * מה שנזרק: כל תגית אחרת — העטיפה נמחקת והתוכן שבתוכה נשאר. וכל attribute
 * שאינו ברשימה, כלומר class, id, style, data-* וכל השאר.
 *
 * למה span נשאר בכלל: הוא נפוץ בתוך פסקאות שיצאו מ-Word ומ-WooCommerce
 * ולפעמים עוטף מספר או יחידה. הוא נשאר בלי attributes, כלומר בלי השפעה.
 *
 *   node scripts/clean-description-html.js                 5 דוגמאות before/after
 *   node scripts/clean-description-html.js --samples 12
 *   node scripts/clean-description-html.js --apply
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SAMPLES = args.includes('--samples') ? Number(args[args.indexOf('--samples') + 1]) : 5;
const INCLUDE_DRAFTS = args.includes('--include-drafts');

const LEDGER = path.join(__dirname, '..', 'html-clean-ledger.json');
const BACKUP = path.join(__dirname, '..', 'html-clean-backup.json');

const KEEP_TAGS = new Set([
  'p', 'br', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img', 'span', 'sub', 'sup',
]);

/** attributes שמותר להשאיר, לפי תגית. כל השאר נמחק. */
const KEEP_ATTRS = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan']),
};

function readEnvValue(key) {
  const p = path.join(__dirname, '..', '.env');
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.split('=').slice(1).join('=').trim() : null;
}

const CLIENT_ID = readEnvValue('SHOPIFY_CLIENT_ID');
const CLIENT_SECRET = readEnvValue('SHOPIFY_CLIENT_SECRET');
let ADMIN_TOKEN = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mintAdminToken() {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`הנפקת טוקן נכשלה (${res.status})`);
  return (await res.json()).access_token;
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
  if (res.status === 401 && attempt < 3) { ADMIN_TOKEN = await mintAdminToken(); return admin(query, variables, attempt + 1); }
  if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(1500 * 2 ** attempt); return admin(query, variables, attempt + 1); }
  if (!res.ok) throw new Error(`Admin API החזיר ${res.status}`);
  const json = await res.json();
  if (json.errors?.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 6) { await sleep(2500 * 2 ** attempt); return admin(query, variables, attempt + 1); }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]).slice(0, 250));
  return json.data;
}

const PAGE = `
  query P($cursor: String, $q: String!) {
    products(first: 40, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      nodes { id title descriptionHtml }
    }
  }
`;

const UPDATE = `
  mutation U($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

/**
 * מנקה HTML לפי רשימת המותר.
 *
 * זה לא parser אמיתי, וזה מכוון: התיאורים כאן הם HTML של מערכת תוכן, בלי
 * script ובלי style (נבדק על כל 247), ולכן החלפה ברמת התגית מספיקה ובטוחה.
 * לו היו script או style, מחיקת התגית לבד הייתה משאירה את הגוף שלה כטקסט
 * גלוי — ולכן שניהם נמחקים עם התוכן שלהם, ולא רק העטיפה.
 */
function cleanHtml(html) {
  let s = String(html || '');

  // אלה נמחקים יחד עם הגוף שלהם, ולא רק העטיפה
  s = s.replace(/<(script|style|noscript|iframe)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  s = s.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!KEEP_TAGS.has(tag)) return '';
    const allowed = KEEP_ATTRS[tag];
    if (!allowed) return `<${tag}>`;
    const kept = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
    let m;
    while ((m = attrRe.exec(rawAttrs)) !== null) {
      const name = m[1].toLowerCase();
      if (!allowed.has(name)) continue;
      let value = m[2];
      if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
      kept.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
    }
    return kept.length ? `<${tag} ${kept.join(' ')}>` : `<${tag}>`;
  });

  s = s.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g, (full, rawTag) =>
    KEEP_TAGS.has(rawTag.toLowerCase()) ? `</${rawTag.toLowerCase()}>` : ''
  );

  // פסקאות ופריטי רשימה שנשארו ריקים אחרי שהעטיפה נעלמה
  s = s.replace(/<p>\s*(<br>\s*)*<\/p>/gi, '');
  s = s.replace(/<li>\s*<\/li>/gi, '');
  s = s.replace(/<(ul|ol)>\s*<\/\1>/gi, '');
  s = s.replace(/(\s*<br>\s*){3,}/gi, '<br><br>');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return s;
}

/** הטקסט הנקי, להשוואה. אם הוא זז — הניקוי נגע בתוכן וזה באג. */
const textOf = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  ADMIN_TOKEN = await mintAdminToken();

  const done = fs.existsSync(LEDGER) ? new Set(JSON.parse(fs.readFileSync(LEDGER, 'utf8'))) : new Set();
  const backup = fs.existsSync(BACKUP) ? JSON.parse(fs.readFileSync(BACKUP, 'utf8')) : {};

  const DIRTY = /elementor|woocommerce|data-settings|dce-acf-repeater|<div|class=|data-id=/i;
  const plan = [];
  const textChanged = [];

  let cursor = null;
  const q = INCLUDE_DRAFTS ? '' : 'status:active';
  process.stdout.write('סורק');
  do {
    const d = await admin(PAGE, { cursor, q });
    for (const p of d.products.nodes) {
      const before = p.descriptionHtml || '';
      if (!DIRTY.test(before)) continue;
      if (done.has(p.id)) continue;
      const after = cleanHtml(before);
      if (after === before) continue;

      /* השמירה החשובה: הטקסט אסור שיזוז. אם הוא זז — לא נוגעים במוצר הזה. */
      if (textOf(before) !== textOf(after)) {
        textChanged.push({ id: p.id, title: p.title, beforeLen: textOf(before).length, afterLen: textOf(after).length });
        continue;
      }
      plan.push({ id: p.id, title: p.title, before, after });
    }
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    process.stdout.write('.');
  } while (cursor);
  process.stdout.write('\n\n');

  const saved = plan.reduce((s, p) => s + (p.before.length - p.after.length), 0);
  console.log(`מוצרים לניקוי: ${plan.length}`);
  console.log(`תווי markup שיוסרו: ${saved.toLocaleString('en-US')}`);
  console.log(`נדחו כי הטקסט היה זז: ${textChanged.length}`);
  for (const t of textChanged.slice(0, 5)) console.log(`   ${t.title.slice(0, 46)}  ${t.beforeLen} → ${t.afterLen} תווי טקסט`);
  console.log();

  if (!APPLY) {
    console.log(`=== ${Math.min(SAMPLES, plan.length)} דוגמאות before/after ===\n`);
    for (const s of plan.slice(0, SAMPLES)) {
      console.log('─'.repeat(74));
      console.log(s.title.slice(0, 70));
      console.log(`  לפני (${s.before.length} תווים):`);
      console.log('    ' + s.before.replace(/\s+/g, ' ').slice(0, 330));
      console.log(`  אחרי (${s.after.length} תווים):`);
      console.log('    ' + s.after.replace(/\s+/g, ' ').slice(0, 330));
      console.log(`  הטקסט זהה: ${textOf(s.before) === textOf(s.after) ? 'כן ✓' : 'לא ✗'}`);
    }
    console.log('\nלהרצה אמיתית: הוסיפו --apply');
    return;
  }

  let written = 0, failed = 0;
  for (const item of plan) {
    try {
      const res = await admin(UPDATE, { product: { id: item.id, descriptionHtml: item.after } });
      const errs = res.productUpdate.userErrors;
      if (errs.length) { failed++; console.log(`  ✗ ${item.title.slice(0, 40)}: ${errs[0].message}`); continue; }
      written++;
      /* הגרסה הקודמת נשמרת לפני שנחשב את הכתיבה כהצליחה */
      backup[item.id] = item.before;
      done.add(item.id);
      if (written % 20 === 0) {
        fs.writeFileSync(LEDGER, JSON.stringify([...done]));
        fs.writeFileSync(BACKUP, JSON.stringify(backup));
        process.stdout.write(`${written}/${plan.length}\r`);
      }
    } catch (e) { failed++; console.log(`  ✗ ${item.title.slice(0, 40)}: ${e.message.slice(0, 90)}`); }
  }
  fs.writeFileSync(LEDGER, JSON.stringify([...done]));
  fs.writeFileSync(BACKUP, JSON.stringify(backup));
  console.log(`\n✓ נוקו ${written}${failed ? `, נכשלו ${failed}` : ''}. הגרסאות הקודמות ב-${path.basename(BACKUP)}`);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
