const { Client } = require('pg');
const fs = require('fs');

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
  console.log('Connected. Running migration 007...');
  const sql = fs.readFileSync('D:/new/alahram-runtime/sql_new/migrations/007_runtime_user_system.sql', 'utf8');
  await client.query(sql);
  console.log('Migration 007 completed!');
  const tables = ['runtime_users','runtime_user_profiles','runtime_user_locations','runtime_sessions'];
  for (const t of tables) {
    const cnt = await client.query('SELECT count(1) AS c FROM ' + t);
    console.log('  ' + t + ': ' + cnt.rows[0].c + ' rows');
  }
  await client.end();
}
main().catch(e => {
  console.log('ERROR:', e.message.substring(0, 600));
  if (e.position) {
    const sql = fs.readFileSync('D:/new/alahram-runtime/sql_new/migrations/007_runtime_user_system.sql', 'utf8');
    const pos = parseInt(e.position);
    console.log('Context:', sql.substring(Math.max(0, pos-200), Math.min(sql.length, pos+200)));
  }
  process.exit(1);
});
