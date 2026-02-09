const { chromium } = require('playwright');
(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR', err.message, err.stack));
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await browser.close();
})();
