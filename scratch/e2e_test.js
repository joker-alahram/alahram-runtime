const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const networkFailures = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', request => {
    networkFailures.push({ url: request.url(), status: request.failure().errorText });
  });
  try {
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    // Simple checks – presence of key sections
    const homepageLoaded = await page.title();
    const companies = await page.$$('.company-card'); // assume class
    const products = await page.$$('.product-card');
    const searchBox = await page.$('input[placeholder="Search"]');
    const cartIcon = await page.$('.cart-icon');
    console.log(JSON.stringify({
      homepageTitle: homepageLoaded,
      companiesCount: companies.length,
      productsCount: products.length,
      searchBoxExists: !!searchBox,
      cartIconExists: !!cartIcon,
      consoleErrors,
      networkFailures,
    }));
  } catch (e) {
    console.error('E2E script error:', e);
  } finally {
    await browser.close();
  }
})();
