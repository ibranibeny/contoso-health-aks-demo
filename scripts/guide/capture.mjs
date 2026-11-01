// Screenshots for the guide, taken on a GitHub-hosted runner (no sign-in: public pages only).
// Input: CAPTURE_PAYLOAD = {"targets":[{"name","url","waitFor","steps":[{"click"|"scroll"|"scrollY"|"wait"|"shot"|"select"}]}]}
// Output: OUT_DIR/<name>.png.b64 (base64 PNG, 1024x728) and <name>.url.txt
import fs from 'node:fs';
import { chromium } from 'playwright';

const payload = JSON.parse(process.env.CAPTURE_PAYLOAD || '{}');
const out = process.env.OUT_DIR;
const allowed = [
  /^https:\/\/ibranibeny\.github\.io\/contoso-health-aks-demo\//,
  /^https:\/\/github\.com\/ibranibeny\/contoso-health-aks-demo(\/|$)/,
  /^https:\/\/api\.github\.com\/repos\/ibranibeny\/contoso-health-aks-demo$/,
  /^http:\/\/contoso-health-ibranibeny\.indonesiacentral\.cloudapp\.azure\.com(\/|$)/,
];
const safeName = (s) => String(s).replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'shot';

// PW_CHANNEL=chrome uses the runner's preinstalled Google Chrome when the Playwright browser download is unavailable.
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const context = await browser.newContext({ viewport: { width: 1024, height: 728 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'en-US' });

async function shoot(page, name) {
  const buf = await page.screenshot({ fullPage: false });
  fs.writeFileSync(`${out}/${name}.png.b64`, buf.toString('base64'));
  fs.writeFileSync(`${out}/${name}.url.txt`, page.url());
  console.log('captured', name);
}

for (const t of payload.targets || []) {
  const name = safeName(t.name);
  if (!allowed.some((r) => r.test(t.url || ''))) { console.log('skipped (not allowed):', t.url); continue; }
  const page = await context.newPage();
  try {
    await page.goto(t.url, { waitUntil: 'networkidle', timeout: 90000 });
    if (t.waitFor) await page.waitForSelector(t.waitFor, { timeout: 30000 });
    await page.waitForTimeout(t.wait || 1500);
    for (const s of t.steps || []) {
      if (s.click) await page.click(s.click, { timeout: 15000 });
      if (s.select) await page.selectOption(s.select.selector, s.select.value);
      if (s.scroll) await page.locator(s.scroll).first().scrollIntoViewIfNeeded();
      if (s.scrollY !== undefined) await page.evaluate((y) => window.scrollTo(0, y), s.scrollY);
      await page.waitForTimeout(s.wait || 900);
      if (s.shot) await shoot(page, `${name}-${safeName(s.shot)}`);
    }
    if (!t.noFinal) await shoot(page, name);
  } catch (e) {
    fs.writeFileSync(`${out}/${name}.error.txt`, String(e).slice(0, 4000));
    console.log('error', name, String(e).slice(0, 300));
  }
  await page.close();
}
await browser.close();
