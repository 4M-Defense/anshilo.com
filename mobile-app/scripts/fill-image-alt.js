#!/usr/bin/env node
/**
 * ממלא alt text בעברית לתמונות המוצרים.
 *
 * למה זה חשוב פעמיים: קורא מסך מקריא alt, והחנות מפרסמת הצהרת נגישות — כלומר
 * זו לא רק החמצת תנועה מחיפוש תמונות אלא גם פער מול מה שהחנות מבטיחה.
 *
 * הנוסח:
 *   התמונה הראשונה  → שם המוצר
 *   כל תמונה אחרת   → "שם המוצר - תמונה N"
 *
 * מה שלא נעשה כאן, בכוונה: הבריף ביקש לזהות שרטוטי מידות ולתת להם
 * "שם המוצר - שרטוט מידות". זיהוי כזה דורש להסתכל בפיקסלים, ואין דרך אמינה
 * לעשות אותו ממטא-דאטה. נבדק: שמות הקבצים אינם מרמזים כלום (0 מתוך 80 נראו
 * כשרטוט), ורק 70 מתוך 2,357 התמונות רחבות ביחס 1.7 ומעלה — ובאנר נראה בדיוק
 * אותו דבר. "תמונה 2" פחות מתאר משרטוט, אבל הוא נכון תמיד; לקרוא לבאנר
 * "שרטוט מידות" הוא פשוט שקר לקורא מסך. מי שעובר על 70 התמונות בעין יכול
 * לשדרג אותן, והרשימה נכתבת לקובץ.
 *
 * הכתיבה היא fileUpdate ולא productUpdateMedia — הראשון הוא הדרך הנתמכת
 * לעדכן alt של MediaImage ב-2025-07.
 *
 *   node scripts/fill-image-alt.js              בדיקה בלבד
 *   node scripts/fill-image-alt.js --apply
 *   node scripts/fill-image-alt.js --apply --include-drafts
 *   node scripts/fill-image-alt.js --apply --overwrite    גם על מה שיש לו alt
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const INCLUDE_DRAFTS = args.includes('--include-drafts');
const OVERWRITE = args.includes('--overwrite');

const LEDGER = path.join(__dirname, '..', 'alt-text-ledger.json');
const WIDE_LIST = path.join(__dirname, '..', 'alt-wide-images.json');

/** שופיפיי חוסמת alt מעל 512 תווים. הכותרות כאן מגיעות ל-90 ומעלה. */
const ALT_MAX = 500;

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
      nodes {
        title status
        media(first: 40) {
          nodes { ... on MediaImage { id alt image { width height } } }
        }
      }
    }
  }
`;

const FILE_UPDATE = `
  mutation U($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { ... on MediaImage { id alt } }
      userErrors { field message }
    }
  }
`;

/* כותרת נקייה: רווחים כפולים ורווח בקצוות הופכים alt מרושל */
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function altFor(title, position) {
  const base = clean(title);
  const text = position === 0 ? base : `${base} - תמונה ${position + 1}`;
  return text.length > ALT_MAX ? text.slice(0, ALT_MAX - 1).trimEnd() + '…' : text;
}

(async () => {
  ADMIN_TOKEN = await mintAdminToken();

  const done = fs.existsSync(LEDGER) ? new Set(JSON.parse(fs.readFileSync(LEDGER, 'utf8'))) : new Set();
  if (done.size) console.log(`בפנקס: ${done.size} תמונות שכבר עודכנו בריצה קודמת\n`);

  const plan = [];
  const wide = [];
  let scanned = 0, skippedHasAlt = 0;

  let cursor = null;
  const q = INCLUDE_DRAFTS ? '' : 'status:active';
  process.stdout.write('סורק');
  do {
    const d = await admin(PAGE, { cursor, q });
    for (const p of d.products.nodes) {
      const media = p.media.nodes.filter((m) => m && m.id);
      media.forEach((m, i) => {
        scanned++;
        if (done.has(m.id)) return;
        const has = typeof m.alt === 'string' && m.alt.trim() !== '';
        if (has && !OVERWRITE) { skippedHasAlt++; return; }
        const alt = altFor(p.title, i);
        if (has && m.alt.trim() === alt) { skippedHasAlt++; return; }
        plan.push({ id: m.id, alt, title: p.title, position: i });
        const img = m.image;
        if (img?.width && img?.height && img.width / img.height >= 1.7 && i > 0) {
          wide.push({ id: m.id, title: p.title, position: i, px: `${img.width}x${img.height}` });
        }
      });
    }
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    process.stdout.write('.');
  } while (cursor);
  process.stdout.write('\n\n');

  console.log(`נסרקו ${scanned} תמונות${INCLUDE_DRAFTS ? '' : ' (מוצרים פעילים בלבד)'}`);
  console.log(`  כבר יש alt תקין, מדלג:   ${skippedHasAlt}`);
  console.log(`  יעודכנו:                 ${plan.length}`);
  console.log();
  console.log('דוגמאות:');
  for (const s of plan.slice(0, 6)) console.log(`   [${s.position}] "${s.alt.slice(0, 76)}"`);
  console.log();
  console.log(`תמונות רחבות (יחס 1.7+, לא ראשונות) — מועמדות לשרטוט, לעין אנושית: ${wide.length}`);
  fs.writeFileSync(WIDE_LIST, JSON.stringify(wide, null, 1));

  if (!APPLY) { console.log('\nלהרצה אמיתית: הוסיפו --apply'); return; }
  if (!plan.length) { console.log('\nאין מה לעדכן.'); return; }

  /* 25 בקבוצה — מתחת למגבלת העלות של השאילתה, ומספיק גדול כדי לא לבזבז סבבים */
  const BATCH = 25;
  let written = 0, failed = 0;
  for (let i = 0; i < plan.length; i += BATCH) {
    const chunk = plan.slice(i, i + BATCH);
    try {
      const res = await admin(FILE_UPDATE, { files: chunk.map((c) => ({ id: c.id, alt: c.alt })) });
      const errs = res.fileUpdate.userErrors;
      if (errs.length) {
        failed += chunk.length;
        console.log(`  ✗ קבוצה ${i / BATCH + 1}: ${errs.slice(0, 2).map((e) => e.message).join('; ')}`);
      } else {
        written += res.fileUpdate.files.length;
        for (const c of chunk) done.add(c.id);
        /* הפנקס נשמר אחרי כל קבוצה — ריצה שנקטעת נמשכת ולא מתחילה מאפס */
        fs.writeFileSync(LEDGER, JSON.stringify([...done]));
      }
    } catch (e) {
      failed += chunk.length;
      console.log(`  ✗ קבוצה ${i / BATCH + 1}: ${e.message.slice(0, 120)}`);
    }
    if ((i / BATCH) % 10 === 0) process.stdout.write(`${written}/${plan.length}\r`);
  }
  console.log(`\n✓ עודכנו ${written} תמונות${failed ? `, נכשלו ${failed}` : ''}`);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
