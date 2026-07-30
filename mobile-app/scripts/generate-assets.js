#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * בונה את נכסי הגרפיקה של האפליקציה מהלוגו האמיתי של החנות.
 *
 * מייצר את ארבעת הקבצים שה-app.json מפנה אליהם:
 *   assets/icon.png           1024×1024  אייקון האפליקציה — **אטום**, על לבן
 *   assets/adaptive-icon.png  1024×1024  שכבת foreground לאנדרואיד (שקוף,
 *                                        התוכן בתוך 66% המרכזיים — אזור בטוח)
 *   assets/splash-icon.png     512×512   סמל מסך הפתיחה (שקוף)
 *   assets/favicon.png          48×48    favicon לגרסת הווב
 *
 * הגרסה הקודמת ציירה סמל מומצא — שלושה פסים כתומים. הבעלים ביקש את הסמל
 * האמיתי מהלוגו (הבית הכחול עם הגג האדום), שהוא גם הפאביקון של האתר.
 *
 * למה מוריד ולא מצרף קובץ לריפו: הלוגו יושב ב-CDN של שופיפיי, וכך החלפת
 * הלוגו באתר מתגלגלת לאפליקציה בהרצה חוזרת, בלי לגעת בקוד. הקובץ שמורד
 * נשמר כ-assets/brand-source.png ואינו נכנס ל-git.
 *
 * הרצה:   npm run generate-assets
 * תלות:   pngjs (devDependency)
 *
 * שתי נקודות שחשוב להבין בקוד:
 *  • **חיתוך לתוכן** — פאביקון בא לרוב עם שוליים שקופים. אייקון שבו הסמל
 *    תופס 60% מהמסגרת נראה קטן, ולכן נמצאת תיבת התוכן והיא ממורכזת מחדש.
 *  • **אטימות ל-iOS** — אפל מחליפה שקיפות באייקון ברקע שחור. לכן icon.png
 *    נבנה על לבן אטום, וערוץ האלפא שלו 255 בכל פיקסל.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { PNG } = require('pngjs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SOURCE_FILE = path.join(ASSETS_DIR, 'brand-source.png');

/** הפאביקון של האתר — 1080×1080, הסמל בלבד */
const SOURCE_URL =
  'https://cdn.shopify.com/s/files/1/0581/1024/6991/files/favicon-for-website-2.png';

/** לבן — הלוגו מעוצב לרקע לבן, כמו האתר */
const WHITE = [0xff, 0xff, 0xff];

/* ------------------------------------------------------------ helpers */

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (target, redirectsLeft) => {
      https
        .get(target, (res) => {
          if (
            res.statusCode != null &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            if (redirectsLeft === 0) return reject(new Error('יותר מדי הפניות'));
            res.resume();
            return request(new URL(res.headers.location, target).toString(), redirectsLeft - 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`ההורדה נכשלה: HTTP ${res.statusCode}`));
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            fs.writeFileSync(dest, Buffer.concat(chunks));
            resolve();
          });
        })
        .on('error', reject);
    };
    request(url, 5);
  });
}

const px = (img, x, y) => (y * img.width + x) * 4;

/**
 * תיבת התוכן: הפיקסלים שאינם שקופים ואינם לבנים.
 * בודק גם לבן, כי לוגו על רקע לבן אטום נפוץ בדיוק כמו שקוף.
 */
function contentBounds(img) {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = px(img, x, y);
      if (img.data[i + 3] < 16) continue;
      if (img.data[i] > 244 && img.data[i + 1] > 244 && img.data[i + 2] > 244) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('התמונה ריקה — לא נמצא תוכן');
  return { minX, minY, maxX, maxY };
}

/** מרחיב תיבה לריבוע סביב מרכזה, בתוך גבולות התמונה */
function toSquare(b, img) {
  const side0 = Math.max(b.maxX - b.minX + 1, b.maxY - b.minY + 1);
  const side = Math.min(side0, img.width, img.height);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  let x = Math.round(cx - side / 2);
  let y = Math.round(cy - side / 2);
  x = Math.max(0, Math.min(x, img.width - side));
  y = Math.max(0, Math.min(y, img.height - side));
  return { x, y, side };
}

/** דגימה דו-קווית מריבוע במקור אל קנבס בגודל היעד */
function resampleSquare(img, src, size) {
  const out = new PNG({ width: size, height: size });
  for (let oy = 0; oy < size; oy++) {
    const sy = src.y + ((oy + 0.5) * src.side) / size - 0.5;
    const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(sy)));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let ox = 0; ox < size; ox++) {
      const sx = src.x + ((ox + 0.5) * src.side) / size - 0.5;
      const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(sx)));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const o = px(out, ox, oy);
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[px(img, x0, y0) + c];
        const p10 = img.data[px(img, x1, y0) + c];
        const p01 = img.data[px(img, x0, y1) + c];
        const p11 = img.data[px(img, x1, y1) + c];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out.data[o + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return out;
}

/**
 * ממרכז את הסמל על קנבס בגודל `size`, כשהוא תופס `fill` מהרוחב.
 * `background = null` משאיר שקוף; אחרת מרכיב על הצבע ומחזיר אטום לגמרי.
 */
function compose(source, size, fill, background) {
  const canvas = new PNG({ width: size, height: size });
  const opaque = background != null;
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = opaque ? background[0] : 0;
    canvas.data[i + 1] = opaque ? background[1] : 0;
    canvas.data[i + 2] = opaque ? background[2] : 0;
    canvas.data[i + 3] = opaque ? 255 : 0;
  }
  const inner = Math.max(1, Math.round(size * fill));
  const art = resampleSquare(source, toSquare(contentBounds(source), source), inner);
  const offset = Math.round((size - inner) / 2);

  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const s = px(art, x, y);
      const alpha = art.data[s + 3] / 255;
      if (alpha === 0) continue;
      const d = px(canvas, x + offset, y + offset);
      if (opaque) {
        for (let c = 0; c < 3; c++) {
          canvas.data[d + c] = Math.round(
            art.data[s + c] * alpha + canvas.data[d + c] * (1 - alpha)
          );
        }
        canvas.data[d + 3] = 255;
      } else {
        const dstA = canvas.data[d + 3] / 255;
        const outA = alpha + dstA * (1 - alpha);
        for (let c = 0; c < 3; c++) {
          canvas.data[d + c] = Math.round(
            (art.data[s + c] * alpha + canvas.data[d + c] * dstA * (1 - alpha)) / (outA || 1)
          );
        }
        canvas.data[d + 3] = Math.round(outA * 255);
      }
    }
  }
  return canvas;
}

function write(name, png) {
  const file = path.join(ASSETS_DIR, name);
  fs.writeFileSync(file, PNG.sync.write(png));
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  ✓ ${name.padEnd(20)} ${png.width}×${png.height}  ${kb} KB`);
}

/* ------------------------------------------------------------ main */

async function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  // --keep-source מדלג על ההורדה ומשתמש בקובץ קיים (בדיקות, או לוגו שהונח
  // ידנית במקום להוריד מהחנות)
  const keepSource = process.argv.includes('--keep-source');
  if (keepSource && fs.existsSync(SOURCE_FILE)) {
    console.log(`משתמש בקובץ הקיים: ${path.relative(process.cwd(), SOURCE_FILE)}`);
  } else {
    console.log(`מוריד את הלוגו:\n  ${SOURCE_URL}`);
    await download(SOURCE_URL, SOURCE_FILE);
  }

  const source = PNG.sync.read(fs.readFileSync(SOURCE_FILE));
  const b = contentBounds(source);
  console.log(`מקור: ${source.width}×${source.height}`);
  console.log(
    `תיבת התוכן: ${b.maxX - b.minX + 1}×${b.maxY - b.minY + 1} — השוליים הריקים מוסרים`
  );

  console.log('\nמייצר:');
  // 0.86 — הסמל כמעט ממלא את המסגרת. iOS מעגל פינות בעצמו, והרקע הלבן האטום
  // מונע את הרקע השחור שאפל שמה במקום שקיפות.
  write('icon.png', compose(source, 1024, 0.86, WHITE));
  // 0.62 — בתוך 66% אזור הבטיחות של אנדרואיד, שחותך את הפינות למסכה עגולה
  write('adaptive-icon.png', compose(source, 1024, 0.62, null));
  write('splash-icon.png', compose(source, 512, 0.84, null));
  write('favicon.png', compose(source, 48, 0.92, WHITE));

  console.log('\nסיום. app.json כבר מפנה לארבעת הקבצים.');
}

main().catch((err) => {
  console.error(`\nשגיאה: ${err.message}`);
  process.exit(1);
});
