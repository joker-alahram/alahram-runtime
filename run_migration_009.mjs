import pg from 'pg';
import fs from 'fs';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  const sql = fs.readFileSync('sql_new/migrations/009_product_code_snapshot.sql', 'utf8');
  await client.query(sql);
  console.log('Migration 009 applied successfully');
  // Verify
  const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='order_items' ORDER BY ordinal_position");
  console.log('order_items now has:', cols.rows.map(r => r.column_name).join(', '));
} finally {
  client.release();
  pool.end();
}
