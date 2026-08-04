#!/usr/bin/env node
/**
 * תופס עריכות שנעשו בממשק של שופיפיי, לפני שדחיפה מהריפו דורסת אותן.
 *
 * למה זה קיים: זה בדיוק מה שקרה כאן. התבנית החיה החזיקה שבעה קבצים שהריפו
 * מעולם לא ראה — legal-nav.liquid, templates/policy.liquid, page.about.json
 * ועוד — ושמונה מפתחות תרגום שכל עמודי המדיניות מציגים. מישהו ערך אותם
 * בממשק, הריפו לא ידע, ודחיפה כמות שהיא הייתה מגישה "translation missing"
 * בכל עמוד מדיניות. זה נתפס במקרה, על ידי theme check, ולא על ידי שמירה.
 *
 * ההיגיון: משווים את התבנית החיה לא לריפו של עכשיו אלא **למה שנדחף לאחרונה**.
 *
 * ההשוואה לריפו של עכשיו נראתה נכונה ונבדקה ונפלה: היא סימנה את
 * nav-thumb.liquid כעריכה בממשק, בזמן שההבדל היה שינוי שלנו בריפו שטרם נדחף.
 * שני המצבים נראים זהים מנקודת המבט של "החי שונה מהריפו", ולכן ההשוואה חייבת
 * להיות לקו בסיס: אם החי שונה ממה שדחפנו, מישהו ערך בממשק — כי אנחנו לא.
 *
 * ב-CI קו הבסיס הוא התג theme-deployed, שמוזז אחרי כל דחיפה מוצלחת. בריצה
 * הראשונה אין תג, ואז ההשוואה היא לריפו והשמירה מזהירה בלבד — כי בלי קו בסיס
 * אין דרך לדעת מי שינה מה, וכשלון על ניחוש הוא שמירה שמושבתת ביום הראשון.
 *
 * מה נחשב שונה: השוואת תוכן אחרי נרמול שורות. הבדלי CRLF מול LF אינם שינוי
 * תוכן, ובריפו הזה גיט ממיר אותם, כך שבלי הנרמול כל קובץ היה נראה שונה
 * והשמירה הייתה נכשלת תמיד — כלומר מושבתת בפועל.
 *
 * מה לא נבדק: config/settings_data.json, templates/*.json ו-sections/*-group.json
 * מוחרגים כאן מאותה סיבה שהם מוחרגים מהדחיפה — עורך התבניות כותב אותם,
 * הם משתנים כל הזמן, וזה מצב תקין ולא סחיפה.
 *
 *   node theme/tools/check-live-drift.mjs --live <משיכה של החי> --repo <קו הבסיס>
 *
 * יוצא 1 אם נמצאה סחיפה. --warn-only יוצא 0 ומדפיס בלבד.
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const LIVE = flag('live');
const BASELINE = flag('repo', 'theme');
const WARN_ONLY = args.includes('--warn-only');

if (!LIVE) {
  console.error('חסר --live <תיקייה שאליה נמשכה התבנית החיה>');
  process.exit(2);
}

/** הקבצים שהממשק כותב. שינוי בהם אינו סחיפה אלא עבודה רגילה של בעל החנות. */
const ADMIN_OWNED = [
  /^config\/settings_data\.json$/,
  /^templates\/.*\.json$/,
  /^sections\/.*-group\.json$/,
];

/** קבצים שלנו, שאינם קבצי תבנית ולעולם אינם בחנות. */
const OURS_ONLY = [/^tools\//, /\.md$/];

function walk(root, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, rel));
    else out.push(rel);
  }
  return out;
}

const normalise = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

const read = (root, rel) => {
  try { return normalise(fs.readFileSync(path.join(root, rel), 'utf8')); }
  catch { return null; }
};

const liveFiles = walk(LIVE).filter((f) => !ADMIN_OWNED.some((re) => re.test(f)));
const baselineFiles = walk(BASELINE).filter(
  (f) => !ADMIN_OWNED.some((re) => re.test(f)) && !OURS_ONLY.some((re) => re.test(f))
);

const edited = [];
const addedLive = [];

for (const rel of liveFiles) {
  const liveText = read(LIVE, rel);
  const baseText = read(BASELINE, rel);
  if (baseText === null) { addedLive.push(rel); continue; }
  if (liveText !== baseText) edited.push(rel);
}

const missingLive = baselineFiles.filter((f) => !liveFiles.includes(f));

console.log(`התבנית החיה: ${liveFiles.length} קבצים. קו הבסיס (${BASELINE}): ${baselineFiles.length}.`);
console.log();

if (!edited.length && !addedLive.length && !missingLive.length) {
  console.log('✓ התבנית החיה זהה למה שנדחף. אין עריכות בממשק, אפשר לדחוף.');
  process.exit(0);
}

if (addedLive.length) {
  console.log(`✗ ${addedLive.length} קבצים נוספו לתבנית החיה ואינם בקו הבסיס:`);
  for (const f of addedLive) console.log(`      ${f}`);
  console.log('   דחיפה עם --nodelete לא תמחק אותם, אבל הריפו אינו מקור אמת לגביהם,');
  console.log('   ואם קובץ אחר שכן נדחף מסתמך עליהם — הם ישתנו מתחתיו.');
  console.log();
}

if (edited.length) {
  console.log(`✗ ${edited.length} קבצים שונים בין החי לקו הבסיס — כלומר נערכו בממשק`);
  console.log('   אחרי הדחיפה האחרונה, והדחיפה הבאה תדרוס את העריכה:');
  for (const f of edited) {
    console.log(`      ${f}   חי ${read(LIVE, f)?.length ?? 0} תווים / קו בסיס ${read(BASELINE, f)?.length ?? 0}`);
  }
  console.log();
}

if (missingLive.length) {
  console.log(`✗ ${missingLive.length} קבצים היו בקו הבסיס ואינם בתבנית החיה — נמחקו בממשק:`);
  for (const f of missingLive) console.log(`      ${f}`);
  console.log();
}

console.log('מה לעשות: `shopify theme pull --theme <id>` לתיקייה נפרדת, למזג את מה');
console.log('שנערך בממשק לתוך theme/, ואז לדחוף. בלי המיזוג הדחיפה מוחקת עבודה.');

process.exit(WARN_ONLY ? 0 : 1);
