const { Client } = require('pg');

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw',
  password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function main() {
  await client.connect();
  console.log('Connected. Running runtime_backfill_users()...');
  const res = await client.query('SELECT runtime_backfill_users()');
  console.log('Result:', JSON.stringify(res.rows[0].runtime_backfill_users, null, 2));
  await client.end();
}
main().catch(e => {
  console.log('ERROR:', e.message.substring(0, 600));
  process.exit(1);
});
