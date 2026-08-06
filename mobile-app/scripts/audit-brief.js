#!/usr/bin/env node
/**
 * מודד את ההנחות של בריף הבאגים, משימה-משימה, לפני שנוגעים במשהו.
 *
 * למה זה קודם לכל תיקון: כמה מההנחות בבריף כבר לא נכונות — קטגוריות ו-product
 * type תוקנו בסבב קודם, וכפילויות מקט וכותרת תוקנו חלקית. תיקון לפי בריף
 * מיושן עושה עבודה כפולה במקרה הטוב, ומחזיר מצב שתוקן במקרה הרע.
 *
 * הכול במעבר אחד, כי הנפקת טוקן ב-client_credentials מבטלת את הקודם ושני
 * סקריפטים במקביל מפילים אחד את השני ב-401 באמצע. זה כבר הרג ריצה של 355
 * מוצרים כאן.
 *
 * קורא בלבד. לא כותב כלום.
 *
 *   node scripts/audit-brief.js
 *   node scripts/audit-brief.js --json out.json
 */

const fs = require('fs');
const path = require('path');

const STORE_DOMAIN = '3007b3-4.myshopify.com';
const API_VERSION = '2025-07';
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

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
  if (json.errors?.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 5) { await sleep(2000 * 2 ** attempt); return admin(query, variables, attempt + 1); }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors[0]).slice(0, 250));
  return json.data;
}

const PAGE = `
  query P($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle status vendor productType descriptionHtml tags
        category { id fullName }
        media(first: 30) {
          nodes { ... on MediaImage { id alt image { width height } } }
        }
        variants(first: 40) { nodes { sku } }
      }
    }
  }
`;

/*
 * ענפי טקסונומיה שאינם יכולים להיות נכונים למוצרי חשמל, תאורה, כלים ומנעולים.
 * הבריף נוקב בשמות האלה במפורש, והם נבדקים כאן כמו שהם ולא לפי ניחוש.
 */
const WRONG_BRANCH = [
  /Vacuum Accessories/i,
  /Fire Alarm Control Panels/i,
  /Hedge Trimmer/i,
  /Household Appliance Accessories/i,
  /Flood, Fire & Gas Safety/i,
];

const MARKUP = {
  elementor: /elementor/i,
  woocommerce: /woocommerce/i,
  'data-settings': /data-settings/i,
  'dce-acf-repeater': /dce-acf-repeater/i,
};

const textOf = (h) => (h || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  ADMIN_TOKEN = await mintAdminToken();

  const state = {
    total: 0, active: 0, draft: 0,
    images: { total: 0, withAlt: 0, withoutAlt: 0, activeTotal: 0, activeWithAlt: 0 },
    wrongCategory: [], noCategory: [], noProductType: [],
    markup: { elementor: [], woocommerce: [], 'data-settings': [], 'dce-acf-repeater': [] },
    noImage: [], emptyDesc: [], noTags: [],
    plumbingCheck: { total: 0, stillPlumbing: 0, lost: [] },
  };
  const bySku = new Map();
  const byTitle = new Map();

  let cursor = null, pages = 0;
  process.stdout.write('סורק');
  do {
    const d = await admin(PAGE, { cursor });
    for (const p of d.products.nodes) {
      state.total++;
      if (p.status === 'ACTIVE') state.active++;
      else if (p.status === 'DRAFT') state.draft++;

      const media = p.media.nodes.filter((m) => m && m.id);
      for (const m of media) {
        state.images.total++;
        const has = typeof m.alt === 'string' && m.alt.trim() !== '';
        if (has) state.images.withAlt++; else state.images.withoutAlt++;
        if (p.status === 'ACTIVE') {
          state.images.activeTotal++;
          if (has) state.images.activeWithAlt++;
        }
      }

      if (p.status !== 'ACTIVE') { cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; continue; }

      const cat = p.category?.fullName || '';
      if (!cat) state.noCategory.push({ title: p.title, handle: p.handle });
      else if (WRONG_BRANCH.some((re) => re.test(cat))) state.wrongCategory.push({ title: p.title, handle: p.handle, cat, vendor: p.vendor });
      if (!p.productType?.trim()) state.noProductType.push(p.title);

      /* האינסטלציה תוקנה בסבב קודם — הבריף מבקש לוודא שהיא עוד שם */
      if (/ברז|אינטרפוץ|מזלף|צינור|אסלה|כיור/.test(p.title)) {
        state.plumbingCheck.total++;
        if (/Plumbing/i.test(cat)) state.plumbingCheck.stillPlumbing++;
        else state.plumbingCheck.lost.push({ title: p.title.slice(0, 50), cat: cat || '(אין)' });
      }

      for (const [name, re] of Object.entries(MARKUP)) {
        if (re.test(p.descriptionHtml || '')) state.markup[name].push({ title: p.title, handle: p.handle, id: p.id });
      }

      if (media.length === 0) state.noImage.push({ title: p.title, handle: p.handle, id: p.id });
      if (textOf(p.descriptionHtml) === '') state.emptyDesc.push({ title: p.title, handle: p.handle, vendor: p.vendor });
      if (!p.tags?.length) state.noTags.push(p.title);

      for (const v of p.variants.nodes) {
        const s = (v.sku || '').trim();
        if (!s) continue;
        if (!bySku.has(s)) bySku.set(s, new Set());
        bySku.get(s).add(p.id);
      }
      const t = p.title.trim();
      if (!byTitle.has(t)) byTitle.set(t, []);
      byTitle.get(t).push({ handle: p.handle, id: p.id });
    }
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    if (++pages % 10 === 0) process.stdout.write('.');
  } while (cursor);
  process.stdout.write('\n\n');

  const dupSku = [...bySku.entries()].filter(([, ids]) => ids.size > 1).map(([s, ids]) => ({ sku: s, n: ids.size }));
  const dupTitle = [...byTitle.entries()].filter(([, rows]) => rows.length > 1).map(([t, rows]) => ({ title: t, n: rows.length, handles: rows.map((r) => r.handle) }));

  const say = (label, actual, claimed) => {
    const verdict = claimed == null ? '' : actual === claimed ? '  ✓ תואם לבריף' : `  ✗ הבריף אומר ${claimed}`;
    console.log(`  ${String(label).padEnd(42)} ${String(actual).padStart(6)}${verdict}`);
  };

  console.log(`מוצרים: ${state.total}  (פעילים ${state.active}, טיוטות ${state.draft})`);
  console.log();
  console.log('משימה 1 — alt text');
  say('תמונות בסך הכול', state.images.total, 2357);
  say('מתוכן עם alt', state.images.withAlt);
  say('בלי alt', state.images.withoutAlt);
  say('תמונות על מוצרים פעילים', state.images.activeTotal);
  say('מהן עם alt', state.images.activeWithAlt);
  console.log(`  כיסוי: ${state.images.total ? Math.round((100 * state.images.withAlt) / state.images.total) : 0}%   (הבריף אומר 0%)`);

  console.log('\nמשימה 2 — קטגוריות');
  say('בענף שגוי מהרשימה בבריף', state.wrongCategory.length);
  say('בלי קטגוריה בכלל', state.noCategory.length);
  say('בלי product type', state.noProductType.length);
  for (const w of state.wrongCategory.slice(0, 12)) console.log(`     ${w.title.slice(0, 44)}  →  ${w.cat}`);
  console.log(`  אינסטלציה: ${state.plumbingCheck.stillPlumbing}/${state.plumbingCheck.total} עוד תחת Plumbing`);
  for (const l of state.plumbingCheck.lost.slice(0, 6)) console.log(`     יצא מ-Plumbing: ${l.title}  →  ${l.cat}`);

  console.log('\nמשימה 3 — markup מ-WooCommerce/Elementor');
  say('elementor', state.markup.elementor.length, 233);
  say('woocommerce', state.markup.woocommerce.length, 247);
  say('data-settings', state.markup['data-settings'].length, 100);
  say('dce-acf-repeater', state.markup['dce-acf-repeater'].length, 16);

  console.log('\nמשימה 4 — מקטים כפולים');
  say('מקטים על יותר ממוצר פעיל אחד', dupSku.length, 14);
  console.log('     ' + dupSku.map((d) => d.sku).join(', '));

  console.log('\nמשימה 5 — כותרות כפולות');
  say('כותרות על יותר ממוצר פעיל אחד', dupTitle.length, 9);
  for (const d of dupTitle) console.log(`     ${d.n}×  ${d.title.slice(0, 52)}`);

  console.log('\nמשימה 6 — תוכן חסר');
  say('בלי אף תמונה', state.noImage.length, 11);
  say('תיאור ריק לגמרי', state.emptyDesc.length, 48);
  say('בלי אף תג', state.noTags.length, 1619);

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ state, dupSku, dupTitle }, null, 2));
    console.log(`\nנכתב ${JSON_OUT}`);
  }
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
