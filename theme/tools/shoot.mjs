/**
 * Visual review harness.
 *
 * Screenshots the deployed preview theme at desktop and mobile widths so the
 * design can be judged by looking at it, not by reading CSS.
 *
 *   node theme/tools/shoot.mjs [themeId] [outDir]
 *
 * Requires Playwright with the preinstalled Chromium
 * (PLAYWRIGHT_BROWSERS_PATH is already configured in this environment).
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const THEME_ID = process.argv[2] || '148357644367';
const OUT = process.argv[3] || '/tmp/shilo-shots';
const ORIGIN = 'https://anshilo.com';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'collection', path: '/collections/' + encodeURIComponent('כלי-עבודה') },
  { name: 'collection-big', path: '/collections/makita' },
  { name: 'product', path: '/products/' + encodeURIComponent('סט-אימפקט-פטישון-2-מקיטה-סוללות-5ah-ומטען') },
  { name: 'product-variants', path: '/products/' + encodeURIComponent('נעל-בלנסטון-דגם-585-חום-רסטיק-blundstone-יבואן-רשמי') },
  { name: 'search', path: '/search?q=' + encodeURIComponent('מקיטה') },
  { name: 'collections-index', path: '/collections' },
  { name: 'quick-order', path: '/pages/quick-order' },
  { name: 'contact', path: '/pages/contact' },
  { name: 'cart', path: '/cart' },
  { name: 'faq', path: '/pages/pushdaddy-faq-1' },
  { name: 'four-oh-four', path: '/pages/this-page-does-not-exist-404-check' },
];

const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 1000, isMobile: false },
  { key: 'mobile', width: 390, height: 844, isMobile: true },
];

function withPreview(p) {
  const joiner = p.includes('?') ? '&' : '?';
  return `${ORIGIN}${p}${joiner}preview_theme_id=${THEME_ID}`;
}

const problems = [];

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    locale: 'he-IL',
    userAgent: vp.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });

  const dir = path.join(OUT, vp.key);
  await mkdir(dir, { recursive: true });

  for (const target of PAGES) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 220));
    });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 220)));

    const url = withPreview(target.path);
    let status = 0;
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      status = res ? res.status() : 0;
    } catch (e) {
      problems.push(`${vp.key}/${target.name}: navigation failed — ${String(e).slice(0, 160)}`);
      await page.close();
      continue;
    }

    // Let fonts settle and lazy images in the first fold resolve.
    await page.waitForTimeout(900);

    const audit = await page.evaluate(() => {
      const doc = document.documentElement;
      const bodyText = document.body ? document.body.innerText : '';
      const horizontalOverflow = doc.scrollWidth - doc.clientWidth;

      // Elements wider than the viewport are the classic mobile layout bug.
      const offenders = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > doc.clientWidth + 2 && r.height > 4) {
          const id = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : '');
          if (offenders.length < 8 && !offenders.includes(id)) offenders.push(id);
        }
      });

      // Tap targets that are too small.
      let smallTargets = 0;
      document.querySelectorAll('a, button, [role="button"], input, select').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 40 || r.width < 24) smallTargets += 1;
      });

      return {
        dir: doc.getAttribute('dir'),
        title: document.title,
        liquidError: /Liquid error|Liquid syntax error/i.test(bodyText),
        translationMissing: /translation missing/i.test(document.body.innerHTML),
        horizontalOverflow,
        offenders,
        smallTargets,
        imageCount: document.images.length,
        brokenImages: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
        h1Count: document.querySelectorAll('h1').length,
        loadsEmpireAssets: /empire|pagefly|ecom-preview/i.test(document.head.innerHTML),
        loadsBaseCss: /base\.css/i.test(document.head.innerHTML),
      };
    });

    await page.screenshot({ path: path.join(dir, `${target.name}.png`), fullPage: false });
    await page.screenshot({ path: path.join(dir, `${target.name}-full.png`), fullPage: true });

    const flags = [];
    if (status !== 200 && target.name !== 'four-oh-four') flags.push(`HTTP ${status}`);
    if (audit.liquidError) flags.push('LIQUID ERROR');
    if (audit.translationMissing) flags.push('translation missing');
    if (audit.horizontalOverflow > 2) flags.push(`h-overflow ${audit.horizontalOverflow}px [${audit.offenders.join(', ')}]`);
    if (audit.brokenImages > 0) flags.push(`${audit.brokenImages} broken images`);
    if (!audit.loadsBaseCss) flags.push('base.css NOT loaded');
    if (audit.loadsEmpireAssets) flags.push('still loading Empire/PageFly assets');
    if (audit.dir !== 'rtl') flags.push(`dir=${audit.dir}`);
    if (audit.h1Count !== 1) flags.push(`${audit.h1Count} h1 elements`);
    if (consoleErrors.length) flags.push(`console: ${consoleErrors.slice(0, 3).join(' | ')}`);

    const line = `${vp.key.padEnd(7)} ${target.name.padEnd(18)} ${String(status).padEnd(4)} ${flags.length ? '⚠ ' + flags.join('; ') : 'ok'}`;
    console.log(line);
    if (flags.length) problems.push(line);

    await page.close();
  }

  await context.close();
}

await browser.close();

console.log('\n--- summary ---');
console.log(problems.length ? problems.length + ' page(s) with findings' : 'all pages clean');
console.log('screenshots: ' + OUT);
