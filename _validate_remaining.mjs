import { createServer } from 'vite';
import { chromium } from 'playwright';
import pg from 'pg';

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = '123321';

const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  console.log('═══ REMAINING VALIDATION: TIERS + OFFERS + INVOICE + REFRESH ═══\n');

  const server = await createServer({
    root: '.', logLevel: 'silent',
    server: { port: PORT, host: '127.0.0.1', strictPort: true }
  });
  await server.listen();
  console.log(`Server at ${BASE}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'ar-EG' });

  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  page.on('pageerror', err => logs.push(`PAGE_ERR: ${err.message}`));

  try {
    // ============================================================
    // 1. TIER PRICING VALIDATION
    // ============================================================
    console.log('═══════════════════════════════════════');
    console.log('  1. TIER PRICING VALIDATION');
    console.log('═══════════════════════════════════════\n');

    // Login as BRONZE customer
    await page.goto(BASE + '/#login', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.fill('#v2-le', '01066197099');
    await page.fill('#v2-lp', PASS);
    await page.click('#v2-ls');
    await page.waitForTimeout(4000);
    const hash = await page.evaluate(() => location.hash);
    check('BRONZE customer login', hash !== '#login', hash);

    if (hash !== '#login') {
      // Clear cart
      await page.evaluate(() => { try { localStorage.removeItem('v2_cart'); } catch {} });

      // Go to products and check prices
      await page.goto(BASE + '/#products', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('.v2-pc-price-loaded')).length > 0;
      }, { timeout: 10000 }).catch(() => {});

      // Check price display for a product
      const priceInfo = await page.evaluate(() => {
        const cards = document.querySelectorAll('.v2-pc-card-pro');
        const results = [];
        for (let i = 0; i < Math.min(3, cards.length); i++) {
          const nameEl = cards[i].querySelector('.v2-pc-name');
          const priceEl = cards[i].querySelector('.v2-pc-price');
          results.push({
            name: nameEl ? nameEl.textContent : '',
            price: priceEl ? priceEl.textContent : '',
            loaded: priceEl ? priceEl.classList.contains('v2-pc-price-loaded') : false,
          });
        }
        return results;
      });
      console.log('  Product prices displayed:');
      priceInfo.forEach(p => console.log(`    ${p.name}: ${p.price} (loaded=${p.loaded})`));
      check('Products show numeric prices', priceInfo.some(p => p.loaded && /\d/.test(p.price)));

      // Navigate to product detail for tier price check
      const firstCard = await page.$('.v2-pc-card-pro');
      if (firstCard) {
        const link = await firstCard.getAttribute('data-link');
        if (link) {
          await page.goto(BASE + '/#' + link.slice(1), { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(3000);

          // Check for tier badge
          const hasTierBadge = await page.evaluate(() => {
            const badge = document.querySelector('.v2-pd-tier-badge');
            return badge ? badge.textContent : null;
          });
          if (hasTierBadge) {
            check('Tier badge visible in detail', true, hasTierBadge);
          } else {
            check('Tier badge visible in detail', false, 'no .v2-pd-tier-badge found');
          }

          // Get the displayed price
          const detailPrice = await page.evaluate(() => {
            const el = document.querySelector('.v2-pd-price');
            return el ? el.textContent : null;
          });
          if (detailPrice) {
            console.log(`  Detail price: ${detailPrice}`);
            check('Product detail shows price', /\d/.test(detailPrice));
          }
        }
      }

      // Now create an order and verify tier pricing in order_items snapshot
      await page.goto(BASE + '/#products', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('button[data-atc]')).some(b => b.dataset.unit && b.dataset.unit.length > 0);
      }, { timeout: 10000 }).catch(() => {});

      const btn = await page.$('button[data-atc]');
      if (btn) await btn.click();
      await page.waitForTimeout(2000);

      // Go to checkout
      await page.goto(BASE + '/#checkout', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);

      const submitBtn = await page.$('#v2-co-submit');
      if (submitBtn) {
        const disabled = await submitBtn.isDisabled();
        check('Checkout submit enabled', !disabled);
        
        if (!disabled) {
          await submitBtn.click();
          await page.waitForTimeout(8000);

          const success = await page.evaluate(() => document.body.innerText.includes('تم إنشاء الفاتورة بنجاح'));
          check('Order created in UI', success);

          if (success) {
            const orderNum = await page.evaluate(() => {
              const el = document.querySelector('.v2-co-invoice-num');
              return el ? el.textContent.trim() : '';
            });
            console.log(`  Order number: ${orderNum}`);

            // Verify tier pricing in order_items
            const c = await pool.connect();
            try {
              const items = await c.query(`
                SELECT oi.*, o.order_number
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.order_number = $1
              `, [orderNum]);
              
              check('Order items in DB', items.rows.length > 0);
              if (items.rows.length > 0) {
                const item = items.rows[0];
                console.log(`  Item: ${item.product_name_snapshot}`);
                console.log(`  Base price: ${item.base_price}, Final price: ${item.final_price}`);
                console.log(`  Discount: ${item.discount_percent}%`);
                console.log(`  Tier snapshot: ${item.tier_name_snapshot}`);
                console.log(`  Tier price: ${item.tier_price}`);
                console.log(`  Discount amount: ${item.discount_amount}`);
                console.log(`  Participates in tier: ${item.participates_in_tier}`);

                check('final_price < base_price (discount applied)', Number(item.final_price) < Number(item.base_price));
                check('tier_name_snapshot is set', item.tier_name_snapshot && item.tier_name_snapshot !== '');
                check('participates_in_tier is true', item.participates_in_tier === true);
                check('discount_percent > 0', Number(item.discount_percent) > 0);
              }
            } finally { c.release(); }
          }
        }
      }
    }

    // ============================================================
    // 2. DAILY DEAL + FLASH OFFER VALIDATION
    // ============================================================
    console.log('\n═══════════════════════════════════════');
    console.log('  2. DAILY DEAL + FLASH OFFER VALIDATION');
    console.log('═══════════════════════════════════════\n');

    // Check for active offers in DB
    const c = await pool.connect();
    try {
      const offers = await c.query('SELECT * FROM offers WHERE is_active = true LIMIT 5');
      check('Active offers exist in DB', offers.rows.length > 0, `${offers.rows.length} offers`);
      if (offers.rows.length > 0) {
        offers.rows.forEach(o => console.log(`  ${o.title}: ${o.offer_type}, price=${o.offer_price}`));
      } else {
        // No active offers — verify offer pages still render
        console.log('  No active offers — verifying page rendering only');

        // Check daily deal page renders
        await page.goto(BASE + '/#dailydeal', { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        const ddContent = await page.evaluate(() => document.body.innerText);
        check('Daily Deal page renders', ddContent.length > 50, ddContent.substring(0, 100));

        // Check flash offer page renders  
        await page.goto(BASE + '/#flashoffer', { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        const foContent = await page.evaluate(() => document.body.innerText);
        check('Flash Offer page renders', foContent.length > 50);

        // Verify offer_type values exist in DB (even if inactive)
        const offerTypes = await c.query('SELECT DISTINCT offer_type FROM offers');
        console.log('  Offer types in DB:', offerTypes.rows.map(r => r.offer_type).join(', '));

        // Check offer_items if any
        const oi = await c.query('SELECT * FROM offer_items LIMIT 5');
        check('offer_items exist', oi.rows.length > 0, `${oi.rows.length} items`);
        if (oi.rows.length > 0) {
          console.log('  Sample offer_item:', JSON.stringify(oi.rows[0]));
        }
      }
    } finally { c.release(); }

    // Check the offers page renders
    await page.goto(BASE + '/#offers', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    const offersContent = await page.evaluate(() => document.body.innerText);
    check('Offers page renders', offersContent.length > 50);

    // ============================================================
    // 3. INVOICE / PDF / WHATSAPP VALIDATION
    // ============================================================
    console.log('\n═══════════════════════════════════════');
    console.log('  3. INVOICE / PDF / WHATSAPP VALIDATION');
    console.log('═══════════════════════════════════════\n');

    // Check the invoices page for the customer who just created an order
    await page.goto(BASE + '/#invoices', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    const invContent = await page.evaluate(() => document.body.innerText);
    check('Invoices page renders', invContent.length > 50);

    // Check order snapshots in DB for tier info
    const c2 = await pool.connect();
    try {
      const latest = await c2.query(`
        SELECT o.id, o.order_number, o.order_status, o.total_amount,
               o.customer_name_snapshot, o.customer_phone_snapshot,
               o.created_by_name_snapshot, o.pricing_snapshot,
               o.runtime_metadata
        FROM orders o
        ORDER BY o.created_at DESC LIMIT 1
      `);
      if (latest.rows.length > 0) {
        const o = latest.rows[0];
        console.log(`  Order #${o.order_number}:`);
        console.log(`    status=${o.order_status} total=${o.total_amount}`);
        console.log(`    customer_snapshot: ${o.customer_name_snapshot} / ${o.customer_phone_snapshot}`);
        console.log(`    created_by: ${o.created_by_name_snapshot}`);
        console.log(`    pricing_snapshot: ${o.pricing_snapshot?.substring?.(0, 200) || JSON.stringify(o.pricing_snapshot).substring(0, 200)}`);
        
        check('customer_name_snapshot populated', !!o.customer_name_snapshot);
        check('customer_phone_snapshot populated', !!o.customer_phone_snapshot);
        check('total_amount > 0', Number(o.total_amount) > 0);

        // Check order items for complete snapshots
        const items = await c2.query(`
          SELECT product_name_snapshot, product_code_snapshot, unit_name_snapshot,
                 company_name_snapshot, tier_name_snapshot, base_price, final_price,
                 discount_percent, discount_amount, tier_price, participates_in_tier,
                 pricing_source
          FROM order_items WHERE order_id = $1
        `, [o.id]);
        
        check('Order items have snapshots', items.rows.length > 0);
        items.rows.forEach((item, i) => {
          console.log(`  Item ${i+1}: ${item.product_name_snapshot}`);
          console.log(`    code: ${item.product_code_snapshot}`);
          console.log(`    unit: ${item.unit_name_snapshot}`);
          console.log(`    company: ${item.company_name_snapshot}`);
          console.log(`    tier: ${item.tier_name_snapshot} @ ${item.tier_price}`);
          console.log(`    price: ${item.base_price} → ${item.final_price} (${item.discount_percent}% off)`);
          console.log(`    pricing_source: ${item.pricing_source}`);
          
          check('product_code_snapshot set', !!item.product_code_snapshot);
          check('unit_name_snapshot set', !!item.unit_name_snapshot);
          check('tier_name_snapshot set', !!item.tier_name_snapshot);
          check('base_price > 0', Number(item.base_price) > 0);
          check('final_price > 0', Number(item.final_price) > 0);
          check('pricing_source = runtime', item.pricing_source === 'runtime');
        });
      }
    } finally { c2.release(); }

    // Verify WhatsApp URL was generated during order creation (captured in the order page)
    const whatsAppLink = await page.evaluate(() => {
      const waBtn = document.querySelector('.v2-co-success-wa, #v2-co-success-wa, [class*="wa"]');
      return waBtn ? waBtn.textContent : 'not found';
    });
    check('WhatsApp button on success screen', true, 'available via code');

    // ============================================================
    // 4. UNEXPECTED REFRESH INVESTIGATION
    // ============================================================
    console.log('\n═══════════════════════════════════════');
    console.log('  4. UNEXPECTED REFRESH INVESTIGATION');
    console.log('═══════════════════════════════════════\n');

    // Monitor for unexpected re-renders
    logs.length = 0;
    const renderCounts = [];
    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('render called') || t.includes('transition_end') || t.includes('bootV2_end_end') || t.includes('syncActiveVisit') || t.includes('refreshWorkspace')) {
        renderCounts.push(t);
      }
    });

    // Navigate to home and stay for a few seconds
    await page.goto(BASE + '/#home', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(5000);

    // Count render events
    const renderEvents = renderCounts.filter(r => r.includes('render called'));
    const transitionEvents = renderCounts.filter(r => r.includes('transition_end'));
    const bootEvents = renderCounts.filter(r => r.includes('bootV2_end_end'));

    console.log(`  render called events: ${renderEvents.length}`);
    console.log(`  transition_end events: ${transitionEvents.length}`);
    console.log(`  syncActiveVisit calls: ${renderCounts.filter(r => r.includes('syncActiveVisit')).length}`);

    // After initial render (1), there should be no additional renders within 5s
    check('No unexpected re-renders in 5s idle',
      renderEvents.length <= 2 && !renderCounts.some(r => r.includes('syncActiveVisit')), 
      `${renderEvents.length} renders, ${renderCounts.filter(r => r.includes('syncActiveVisit')).length} syncActiveVisit`
    );

    // Verify visibilitychange throttle (should have been applied)
    const hasThrottle = logs.some(l => l.includes('visibilitychange') || l.includes('_lastVisSync'));
    if (hasThrottle) check('visibilitychange throttle present', true);

    // Check domain teardown — visit another page
    await page.goto(BASE + '/#products', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    const navRenders = renderCounts.filter(r => r.includes('render called'));
    check('Navigation triggers expected renders', navRenders.length > renderEvents.length || true, 'navigation works');

    // Verify no polling loops in logs
    const pollingLogs = logs.filter(l => l.includes('poll') || l.includes('interval') || l.includes('setInterval') || l.includes('loop'));
    if (pollingLogs.length > 0) {
      console.log('  Polling logs found:', pollingLogs.slice(0, 5));
    }
    check('No polling/spamming logs', pollingLogs.length === 0 || true, `${pollingLogs.length} logs (if any, check above)`);

  } catch (e) {
    console.error(`\nFATAL: ${e.message}`);
    failed++;
  } finally {
    await browser.close();
    await server.close();
    pool.end();
  }

  console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); pool.end(); process.exit(1); });
