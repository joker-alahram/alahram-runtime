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
  // runtime_actors columns
  const raCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='runtime_actors' ORDER BY ordinal_position");
  console.log('=== runtime_actors columns ===');
  console.table(raCols.rows);

  // Find our test user's actor
  const ru = await client.query("SELECT id FROM runtime_users WHERE phone = '01066197099'");
  const userId = ru.rows[0].id;
  console.log('User ID:', userId);

  const ra = await client.query("SELECT * FROM runtime_actors WHERE user_id = $1", [userId]);
  console.log('=== Runtime actors for user ===');
  console.table(ra.rows);

  // If actor has reference_id, find the customer
  if (ra.rows.length && ra.rows[0].reference_id) {
    const cust = await client.query("SELECT * FROM customers WHERE id = $1", [ra.rows[0].reference_id]);
    console.log('=== Customer from reference_id ===');
    console.table(cust.rows);
  }
} finally {
  client.release();
  pool.end();
}
