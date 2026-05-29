import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});
(async () => {
  const c = await pool.connect();
  try {
    // 1. Customer tier assignments
    console.log('=== CUSTOMER TIER ASSIGNMENTS ===');
    const ta = await c.query(`
      SELECT c.id, c.customer_name, c.phone, pt.tier_name, pt.tier_code, cta.is_active
      FROM customer_tier_assignments cta
      JOIN customers c ON c.id = cta.customer_id
      JOIN pricing_tiers pt ON pt.id = cta.tier_id
      WHERE cta.is_active = true
      ORDER BY c.customer_name
    `);
    for (const r of ta.rows) {
      console.log(`  ${r.phone} | ${r.customer_name} | ${r.tier_name} (${r.tier_code})`);
    }

    // 2. Tiers
    console.log('\n=== PRICING TIERS ===');
    const tiers = await c.query('SELECT * FROM pricing_tiers ORDER BY priority');
    for (const t of tiers.rows) {
      console.log(`  ${t.tier_name} (${t.tier_code}) priority=${t.priority} discount=${t.default_discount_percent}%`);
    }

    // 3. Sample tier pricing for a specific product across tiers
    console.log('\n=== SAMPLE TIER PRICING (same product, all tiers) ===');
    const tp = await c.query(`
      SELECT rpp.product_id, p.product_name, rpp.product_unit_id, pu.unit_name,
             rpp.base_price, rpp.final_price, rpp.discount_percent, rpp.tier_name, rpp.tier_code
      FROM runtime_product_prices rpp
      JOIN products p ON p.id = rpp.product_id
      JOIN product_units pu ON pu.id = rpp.product_unit_id
      WHERE rpp.product_id = (SELECT id FROM products ORDER BY product_name LIMIT 1)
      ORDER BY rpp.tier_code
    `);
    for (const r of tp.rows) {
      console.log(`  ${r.product_name} | ${r.unit_name} | ${r.tier_name} (${r.tier_code}): base=${r.base_price} final=${r.final_price} discount=${r.discount_percent}%`);
    }

    // 4. Daily deals
    console.log('\n=== DAILY DEALS / OFFERS ===');
    const deals = await c.query(`
      SELECT id, title, offer_type, discount_percent, start_date, end_date,
             is_active, daily_deal_date
      FROM offers
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 10
    `);
    for (const d of deals.rows) {
      console.log(`  ${d.title} | type=${d.offer_type} | discount=${d.discount_percent}% | active=${d.is_active} | from=${d.start_date} to=${d.end_date}`);
    }

    // 5. Check which customer phones we can use for testing
    console.log('\n=== CUSTOMERS WITH PHONES (for testing) ===');
    const customers = await c.query(`
      SELECT c.customer_name, c.phone, pt.tier_name
      FROM customers c
      LEFT JOIN customer_tier_assignments cta ON cta.customer_id = c.id AND cta.is_active = true
      LEFT JOIN pricing_tiers pt ON pt.id = cta.tier_id
      WHERE c.is_active = true AND c.phone IS NOT NULL
        AND c.phone ~ '^01[0-9]{9}$'
      LIMIT 10
    `);
    for (const r of customers.rows) {
      console.log(`  ${r.phone} | ${r.customer_name} | tier=${r.tier_name || 'none'}`);
    }

  } finally { c.release(); pool.end(); }
})().catch(e => { console.error(e); pool.end(); });
