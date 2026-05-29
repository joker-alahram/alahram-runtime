import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw',
  password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  const customerId = '5c844258-ce66-4ff3-b663-3e1b0a1a476c';
  const bronzeTierId = 1;

  // Check if already assigned
  const existing = await client.query(
    'SELECT * FROM customer_tier_assignments WHERE customer_id = $1 AND is_active = true',
    [customerId]
  );
  console.log('Existing active assignment:', existing.rows.length ? existing.rows : 'none');

  if (!existing.rows.length) {
    // Assign BRONZE tier to test customer
    const result = await client.query(
      `INSERT INTO customer_tier_assignments (customer_id, tier_id, assigned_by_type, assigned_by_id, starts_at, is_active)
       VALUES ($1, $2, 'system', 'auto-test', NOW(), true)
       RETURNING *`,
      [customerId, bronzeTierId]
    );
    console.log('Assigned tier:', result.rows[0]);
  }

  // Verify the customer record
  const cust = await client.query('SELECT id, customer_name, customer_code FROM customers WHERE id = $1', [customerId]);
  console.log('Customer:', cust.rows[0]);

  // Verify pricing for this customer using the RPC
  const rpc = await client.query(
    `SELECT * FROM resolve_product_prices_batch($1::uuid, ARRAY['0052079a-e33f-4846-8d10-16651ffc4590'::uuid])`,
    [customerId]
  );
  console.log('RPC result:', rpc.rows);

  // Verify the runtime_product_prices view works
  const rpp = await client.query(
    `SELECT product_id, product_name, unit_name, base_price, final_price, discount_percent, tier_name, tier_code
     FROM runtime_product_prices
     WHERE product_id = '0052079a-e33f-4846-8d10-16651ffc4590' AND product_unit_id = '1d336396-6df1-4285-a25b-9ad0b7fe5af2'
     LIMIT 5`
  );
  console.log('Runtime prices for product:');
  console.table(rpp.rows);
} finally {
  client.release();
  pool.end();
}
