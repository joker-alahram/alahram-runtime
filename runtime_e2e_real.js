import { test, expect } from '@playwright/test';

/**
 * Real runtime investigation E2E test.
 * This script exercises the full order flow on the live application at http://localhost:3000/.
 * It intentionally performs actions that previously caused duplicate invoices:
 *   - double‑click submit
 *   - page refresh during request
 *   - navigation back/forward
 *   - offline/online toggling
 *   - draft continuation after reload
 *   - session restore after full browser restart
 *
 * The application is expected to expose routes via hash routing, e.g. `#ops/orders`.
 * Selectors are based on visible text and role attributes to avoid reliance on data‑test attributes.
 */

test('real runtime duplicate‑invoice investigation', async ({ page }) => {
  // Enable Playwright tracing for debugging
  await page.tracing.start({ screenshots: true, snapshots: true, sources: true });

  // 1. Open homepage
  await page.goto('http://localhost:3000/');
  await expect(page).toHaveURL(/localhost:3000/);

  // 2. Perform login (assumes a simple login form with username/password fields and a button)
  // Adjust selectors if the UI differs.
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'testpass');
  await page.click('button:has-text("Login")');
  // Wait for navigation to dashboard
  await page.waitForURL('**/#/dashboard');

  // 3. Navigate to orders page via hash routing
  await page.goto('http://localhost:3000/#ops/orders');
  await expect(page).toHaveURL(/#ops\/orders/);

  // 4. Add a product to the cart (click first "Add to Cart" button)
  const addToCartButton = page.locator('button:has-text("Add to Cart"):first-child');
  await addToCartButton.click();

  // 5. Open cart
  await page.goto('http://localhost:3000/#ops/cart');
  await expect(page).toHaveURL(/#ops\/cart/);

  // 6. Fill checkout form (if present)
  const emailField = page.locator('input[name="email"]');
  if (await emailField.count()) {
    await emailField.fill('test@example.com');
  }

  // 7. Submit order – double click to simulate duplicate request
  const submitBtn = page.locator('button:has-text("Submit Order")');
  await submitBtn.dblclick();

  // 8. Immediately refresh the page during the request
  await page.reload();

  // 9. Navigate back and forward to ensure history handling is stable
  await page.goBack();
  await page.goForward();

  // 10. Simulate offline then online (requires Chromium DevTools protocol)
  await page.context().setOffline(true);
  await page.waitForTimeout(2000); // short offline period
  await page.context().setOffline(false);

  // 11. Verify that only a single order/invoice was created.
  // The UI should display an invoice list; we check that only one entry exists.
  const invoiceRows = page.locator('.invoice-row');
  await expect(invoiceRows).toHaveCount(1);

  // 12. Close and reopen browser to test session restore
  await page.context().close();
  const newContext = await page.browser().newContext();
  const newPage = await newContext.newPage();
  await newPage.goto('http://localhost:3000/');
  // Assuming session is persisted via cookies / localStorage
  await newPage.waitForURL('**/#/dashboard');
  // Verify order still present
  await newPage.goto('http://localhost:3000/#ops/orders');
  const restoredInvoiceRows = newPage.locator('.invoice-row');
  await expect(restoredInvoiceRows).toHaveCount(1);

  // Stop tracing and save the trace file for analysis.
  await page.tracing.stop({ path: 'runtime_playwright_trace.zip' });
});
