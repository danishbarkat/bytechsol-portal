const { chromium } = require('playwright');
(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR', err.message));
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const bodyHtml = await page.$eval('body', el => el.innerHTML);
  console.log('BODY LENGTH', bodyHtml.length);
  console.log('BODY HTML snippet', bodyHtml.slice(0,500));
  await browser.close();
})();
