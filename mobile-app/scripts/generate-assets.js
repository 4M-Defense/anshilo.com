#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * מחולל נכסי הגרפיקה של "שילו שופ" (א.נ. שילו בע"מ).
 *
 * מייצר את ארבעת קובצי ה-PNG שהאפליקציה מפנה אליהם ב-app.json:
 *   assets/icon.png           1024×1024  אייקון האפליקציה (רקע כהה)
 *   assets/adaptive-icon.png  1024×1024  שכבת foreground לאנדרואיד (רקע שקוף,
 *                                        התוכן בתוך 66% המרכזיים — אזור בטוח)
 *   assets/splash-icon.png     512×512   סמל מסך הפתיחה (רקע שקוף)
 *   assets/favicon.png           48×48   favicon לגרסת הווב (סמל מפושט)
 *
 * הסמל: שלושה פסים כתומים "מוערמים" בהיסט קל (כמו לוחות עץ במחסן) מעל
 * פס אזהרה אלכסוני כתום/כהה — מוטיב המותג של ת'ים "Shilo Pro" באתר.
 *
 * הרצה:   node scripts/generate-assets.js   (או: npm run generate-assets)
 * תלות:   pngjs (מותקן כ-devDependency)
 *
 * הציור נעשה פיקסל-פיקסל בדגימת-יתר (supersampling) פי 4 ואז מוקטן,
 * כך שהפינות המעוגלות והאלכסונים יוצאים חלקים בלי ספריות גרפיקה.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

/* צבעי המותג — תואמים ל-src/theme.ts */
const ACCENT = [0xd8, 0x1e, 0x29]; // colors.accent  #D81E29
const INK = [0x0f, 0x17, 0x29]; // colors.ink     #0F1729

/** מקדם דגימת-היתר: מציירים בגודל פי SS ומקטינים בממוצע */
const SS = 4;

/* ---------------------------------------------------------------- canvas */

function createCanvas(size) {
  const w = size * SS;
  return { size, w, data: Buffer.alloc(w * w * 4, 0) };
}

function putPixel(c, px, py, rgb) {
  const idx = (py * c.w + px) * 4;
  c.data[idx] = rgb[0];
  c.data[idx + 1] = rgb[1];
  c.data[idx + 2] = rgb[2];
  c.data[idx + 3] = 255;
}

/** מלבן מלא. קואורדינטות בפיקסלים של קובץ היעד (לא של קנבס דגימת-היתר). */
function fillRect(c, x, y, wd, ht, rgb) {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(c.w, Math.round((x + wd) * SS));
  const y1 = Math.min(c.w, Math.round((y + ht) * SS));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) putPixel(c, px, py, rgb);
  }
}

/** מלבן עם פינות מעוגלות (בדיקת מרחק ריבועי בפינות). */
function fillRoundedRect(c, x, y, wd, ht, r, rgb) {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(c.w, Math.round((x + wd) * SS));
  const y1 = Math.min(c.w, Math.round((y + ht) * SS));
  const rr = Math.min(r * SS, (x1 - x0) / 2, (y1 - y0) / 2);
  const rr2 = rr * rr;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px < x0 + rr ? x0 + rr - px - 0.5 : px + 0.5 - (x1 - rr);
      const dy = py < y0 + rr ? y0 + rr - py - 0.5 : py + 0.5 - (y1 - rr);
      if (dx > 0 && dy > 0 && dx * dx + dy * dy > rr2) continue;
      putPixel(c, px, py, rgb);
    }
  }
}

/**
 * פס אזהרה: מלבן שממולא בפסים אלכסוניים (45°) לסירוגין כתום/כהה.
 * stripeW — רוחב כל פס (בפיקסלים של קובץ היעד). r — עיגול פינות הרצועה.
 */
function fillHazard(c, x, y, wd, ht, stripeW, r) {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(c.w, Math.round((x + wd) * SS));
  const y1 = Math.min(c.w, Math.round((y + ht) * SS));
  const rr = Math.min(r * SS, (x1 - x0) / 2, (y1 - y0) / 2);
  const rr2 = rr * rr;
  const period = Math.max(1, Math.round(stripeW * SS));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      if (rr > 0) {
        const dx = px < x0 + rr ? x0 + rr - px - 0.5 : px + 0.5 - (x1 - rr);
        const dy = py < y0 + rr ? y0 + rr - py - 0.5 : py + 0.5 - (y1 - rr);
        if (dx > 0 && dy > 0 && dx * dx + dy * dy > rr2) continue;
      }
      const band = Math.floor((px + py) / period) % 2;
      putPixel(c, px, py, band === 0 ? ACCENT : INK);
    }
  }
}

/* ------------------------------------------------------------------ mark */

/**
 * גאומטריית הסמל ב"יחידות עיצוב" (תיבה של 600×472):
 * שלושה פסים אופקיים בעובי 96 עם היסט מדורג — העליון צמוד ימינה,
 * האמצעי ברוחב מלא, התחתון צמוד שמאלה — ומתחתיהם רצועת אזהרה.
 */
const MARK = {
  width: 600,
  height: 472,
  barH: 96,
  gap: 36,
  barRadius: 22,
  bars: [
    { x: 140, w: 460 }, // עליון — מיושר ימינה
    { x: 0, w: 600 }, // אמצעי — רוחב מלא
    { x: 60, w: 440 }, // תחתון — מוסט שמאלה
  ],
  hazardTop: 420,
  hazardH: 52,
  stripeW: 46,
};

/**
 * מצייר את הסמל. ox/oy — פינה שמאלית-עליונה, s — קנה מידה.
 * withHazard=false מצייר את הפסים בלבד (לאייקון הראשי, שם רצועת
 * האזהרה נמתחת לכל רוחב הקנבס בנפרד).
 */
function drawMark(c, ox, oy, s, withHazard) {
  MARK.bars.forEach((bar, i) => {
    fillRoundedRect(
      c,
      ox + bar.x * s,
      oy + i * (MARK.barH + MARK.gap) * s,
      bar.w * s,
      MARK.barH * s,
      MARK.barRadius * s,
      ACCENT
    );
  });
  if (withHazard) {
    fillHazard(
      c,
      ox,
      oy + MARK.hazardTop * s,
      MARK.width * s,
      MARK.hazardH * s,
      MARK.stripeW * s,
      12 * s
    );
  }
}

/* ------------------------------------------------------------ png output */

/** הקטנה בממוצע משוקלל-אלפא (כדי ששוליים שקופים לא "יילכלכו") וכתיבה. */
function writePng(c, fileName) {
  const png = new PNG({ width: c.size, height: c.size });
  const n = SS * SS;
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let as = 0;
      for (let sy = 0; sy < SS; sy++) {
        let idx = ((y * SS + sy) * c.w + x * SS) * 4;
        for (let sx = 0; sx < SS; sx++) {
          const a = c.data[idx + 3];
          rs += c.data[idx] * a;
          gs += c.data[idx + 1] * a;
          bs += c.data[idx + 2] * a;
          as += a;
          idx += 4;
        }
      }
      const o = (y * c.size + x) * 4;
      if (as === 0) {
        png.data[o] = 0;
        png.data[o + 1] = 0;
        png.data[o + 2] = 0;
        png.data[o + 3] = 0;
      } else {
        png.data[o] = Math.round(rs / as);
        png.data[o + 1] = Math.round(gs / as);
        png.data[o + 2] = Math.round(bs / as);
        png.data[o + 3] = Math.round(as / n);
      }
    }
  }
  const filePath = path.join(ASSETS_DIR, fileName);
  fs.writeFileSync(filePath, PNG.sync.write(png));
  console.log(`  ✓ ${fileName} (${c.size}×${c.size})`);
}

/* ---------------------------------------------------------------- assets */

/** אייקון האפליקציה 1024×1024 — רקע כהה, פסים במרכז, רצועת אזהרה ברבע התחתון. */
function buildIcon() {
  const c = createCanvas(1024);
  fillRect(c, 0, 0, 1024, 1024, INK);

  const s = 1.1; // רוחב הפסים 660px
  const barsH = (MARK.barH * 3 + MARK.gap * 2) * s;
  drawMark(c, (1024 - MARK.width * s) / 2, 230, s, false);
  void barsH; // 396px — הפסים מסתיימים ב-y=626

  // רצועת אזהרה מקיר לקיר ברבע התחתון של האייקון
  fillHazard(c, 0, 796, 1024, 58, 50, 0);

  writePng(c, 'icon.png');
}

/** אייקון אדפטיבי לאנדרואיד — הסמל המלא על רקע שקוף, בתוך האזור הבטוח. */
function buildAdaptiveIcon() {
  const c = createCanvas(1024);
  // 66% המרכזיים של 1024 = 676px; בקנה מידה 1.1 הסמל 660×519 — בפנים.
  const s = 1.1;
  drawMark(c, (1024 - MARK.width * s) / 2, (1024 - MARK.height * s) / 2, s, true);
  writePng(c, 'adaptive-icon.png');
}

/** סמל מסך הפתיחה 512×512 — הסמל המלא על רקע שקוף. */
function buildSplashIcon() {
  const c = createCanvas(512);
  const s = 0.76; // 456×359
  drawMark(c, (512 - MARK.width * s) / 2, (512 - MARK.height * s) / 2, s, true);
  writePng(c, 'splash-icon.png');
}

/** favicon 48×48 — גרסה מפושטת: ריבוע כהה מעוגל עם שלושת הפסים בלבד. */
function buildFavicon() {
  const c = createCanvas(48);
  fillRoundedRect(c, 0, 0, 48, 48, 11, INK);
  fillRoundedRect(c, 16, 8, 24, 8, 4, ACCENT); // עליון — מיושר ימינה
  fillRoundedRect(c, 8, 20, 32, 8, 4, ACCENT); // אמצעי — רחב
  fillRoundedRect(c, 8, 32, 24, 8, 4, ACCENT); // תחתון — מוסט שמאלה
  writePng(c, 'favicon.png');
}

/* ------------------------------------------------------------------ main */

function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  console.log('מייצר נכסי גרפיקה אל ' + ASSETS_DIR + ' ...');
  buildIcon();
  buildAdaptiveIcon();
  buildSplashIcon();
  buildFavicon();
  console.log('הסתיים בהצלחה.');
}

main();
